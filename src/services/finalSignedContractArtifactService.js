/**
 * Artefato PDF final da cerimônia — PHASE_10.21BU.
 * Deriva do HTML/versão/hash assinados. Falha não invalida strokes.
 * Nunca gera retroativo para o piloto CTR-2026-00003.
 */
import { jsPDF } from 'jspdf';
import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { addFile } from './patientFilesService.js';
import { isImmutablePilotContract, readEvidenceDocumentHash } from '../contracts/remoteSignatureEvidence.js';

function stripTags(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapLines(pdf, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (pdf.getTextWidth(next) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function writeBlock(pdf, lines, startY, maxY) {
  let y = startY;
  for (const line of lines) {
    if (y > maxY) {
      pdf.addPage();
      y = 16;
    }
    pdf.text(line, 16, y);
    y += 5;
  }
  return y;
}

export function generateFinalSignedPdfDataUrl({ contract, signatures = [], ceremony = null }) {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const maxWidth = 178;
  const maxY = 280;
  const documentHash = contract.documentHash
    || readEvidenceDocumentHash(signatures[0]?.evidenceJson)
    || '';
  const version = contract.version || 1;

  pdf.setFontSize(14);
  pdf.text('Contrato assinado', 16, 18);
  pdf.setFontSize(10);
  const header = [
    `Contrato: ${contract.contractNumber || contract.id}`,
    `Versão do documento: ${version}`,
    `Hash do documento assinado: ${documentHash}`,
    `Estado da cerimônia: ${ceremony?.status || contract.status || ''}`,
  ];
  let y = writeBlock(pdf, header, 28, maxY);

  y += 4;
  pdf.setFontSize(12);
  pdf.text('Assinaturas', 16, y);
  y += 8;
  pdf.setFontSize(9);
  for (const sig of signatures) {
    const method = sig.evidenceJson?.signatureMethod || sig.signatureType || '';
    const role = sig.signerRole || '';
    const when = sig.signedAt || '';
    const lines = wrapLines(
      pdf,
      `${role}: ${sig.signerName || sig.evidenceJson?.registeredSignerName || ''} · ${when} · ${method}`,
      maxWidth,
    );
    y = writeBlock(pdf, lines, y, maxY);
    if (sig.id) {
      y = writeBlock(pdf, wrapLines(pdf, `ID da assinatura: ${sig.id}`, maxWidth), y, maxY);
    }
  }

  y += 6;
  pdf.setFontSize(12);
  pdf.text('Documento (versão assinada)', 16, y);
  y += 8;
  pdf.setFontSize(8);
  const frozen = stripTags(contract.renderedHtml || contract.finalContent || '');
  const bodyLines = wrapLines(pdf, frozen.slice(0, 6000), maxWidth);
  writeBlock(pdf, bodyLines, y, maxY);

  return pdf.output('datauristring');
}

function persistArtifactRecord({ contract, dataUrl, documentHash, version, now }) {
  return withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((row) => row.id === contract.id);
    if (idx < 0) throw new Error('Contrato não encontrado.');
    const current = arr[idx];
    if (current.metadata?.finalArtifactStatus === 'generated' && current.pdfUrl) {
      return { contract: current, alreadyGenerated: true };
    }

    if (!Array.isArray(db.contractAttachments)) db.contractAttachments = [];
    const att = {
      id: createId('catt'),
      tenant_id: current.tenant_id || null,
      clinicId: current.clinicId,
      contractId: current.id,
      fileUrl: dataUrl,
      fileName: `contrato-assinado-${current.contractNumber || current.id}.pdf`,
      fileType: 'application/pdf',
      uploadedBy: 'system',
      createdAt: now,
      source: 'final_signed_artifact',
      documentHash,
      contractVersion: version,
      immutable: true,
    };
    db.contractAttachments.push(att);

    arr[idx] = {
      ...current,
      pdfUrl: dataUrl,
      signedPdfUrl: dataUrl,
      metadata: {
        ...(current.metadata || {}),
        finalArtifactStatus: 'generated',
        finalArtifactAt: now,
        finalArtifactDocumentHash: documentHash,
        finalArtifactVersion: version,
        finalArtifactAttachmentId: att.id,
      },
    };

    const requests = db.contractSignatureRequests || [];
    const reqIdx = requests.findIndex((row) => row.contractId === current.id && row.status === 'completed');
    if (reqIdx >= 0) {
      requests[reqIdx] = { ...requests[reqIdx], signedPdfUrl: dataUrl };
    } else {
      const pendingIdx = requests.findIndex((row) => row.contractId === current.id);
      if (pendingIdx >= 0) {
        requests[pendingIdx] = { ...requests[pendingIdx], signedPdfUrl: dataUrl };
      }
    }

    return { contract: arr[idx], attachment: att, alreadyGenerated: false };
  });
}

function markArtifactFailed(contractId, error) {
  withDb((db) => {
    const arr = db.generatedContracts || [];
    const idx = arr.findIndex((row) => row.id === contractId);
    if (idx < 0) return db;
    const current = arr[idx];
    if (current.metadata?.finalArtifactStatus === 'generated') return db;
    arr[idx] = {
      ...current,
      metadata: {
        ...(current.metadata || {}),
        finalArtifactStatus: 'failed',
        finalArtifactError: String(error?.message || error || 'pdf_failed').slice(0, 240),
        finalArtifactAt: new Date().toISOString(),
      },
    };
    return db;
  });
}

export function maybeGenerateFinalSignedArtifact({ contract, signatures, ceremony }) {
  if (!contract) return { skipped: true, reason: 'missing_contract' };
  if (isImmutablePilotContract(contract)) {
    return { skipped: true, reason: 'immutable_pilot' };
  }
  if (String(contract.status || '').toLowerCase() !== 'signed'
    && String(contract.status || '').toLowerCase() !== 'completed') {
    return { skipped: true, reason: 'ceremony_incomplete' };
  }
  if (contract.metadata?.finalArtifactStatus === 'generated' && contract.pdfUrl) {
    return { skipped: true, reason: 'already_generated', contract };
  }

  const live = (loadDb().generatedContracts || []).find((row) => row.id === contract.id) || contract;
  const frozenHtml = live.renderedHtml || live.finalContent || '';
  const documentHash = live.documentHash || '';
  const version = live.version || 1;

  try {
    const dataUrl = generateFinalSignedPdfDataUrl({
      contract: { ...live, renderedHtml: frozenHtml, documentHash, version },
      signatures,
      ceremony,
    });
    if (!dataUrl || !String(dataUrl).startsWith('data:application/pdf')) {
      throw new Error('PDF inválido.');
    }
    const persisted = persistArtifactRecord({
      contract: live,
      dataUrl,
      documentHash,
      version,
      now: new Date().toISOString(),
    });
    let chartFile = null;
    if (persisted.contract?.patientId && !persisted.alreadyGenerated) {
      chartFile = addFile(
        persisted.contract.patientId,
        {
          category: 'Contratos',
          file_name: `Contrato assinado ${persisted.contract.contractNumber || persisted.contract.id}.pdf`,
          mime_type: 'application/pdf',
          file_url: dataUrl,
          metadata: {
            contractId: persisted.contract.id,
            documentHash,
            contractVersion: version,
            source: 'final_signed_artifact',
          },
        },
        'system',
      );
    }
    return {
      ok: true,
      artifactGenerated: true,
      alreadyGenerated: Boolean(persisted.alreadyGenerated),
      contract: persisted.contract,
      attachment: persisted.attachment,
      chartFile,
      documentHash,
    };
  } catch (error) {
    markArtifactFailed(contract.id, error);
    return {
      ok: false,
      artifactGenerated: false,
      strokesPreserved: true,
      error: String(error?.message || error),
    };
  }
}
