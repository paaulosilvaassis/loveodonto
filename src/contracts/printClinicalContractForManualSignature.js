/**
 * Impressão para assinatura manuscrita.
 * PRINT != SIGNATURE_EVIDENCE / SIGNED / PARTIALLY_SIGNED / ROLE_SATISFIED.
 */
import { loadDb } from '../db/index.js';
import { loadContractForEdit } from './contractEditContext.js';
import { contractHtmlWithSignatures, printContractElement } from '../services/contractPdfService.js';

export function printClinicalContractForManualSignature({
  user,
  contractId,
  appointmentId = null,
  budgetId = null,
  patientId = null,
} = {}) {
  if (!contractId) return { ok: false, error: 'Contrato não encontrado.' };
  let contract;
  try {
    contract = loadContractForEdit({
      contractId,
      appointmentId,
      budgetId,
      patientId,
      tenantId: user?.tenantId || user?.tenant_id || null,
    });
  } catch (error) {
    return { ok: false, error: error.message || 'Contrato não corresponde a este atendimento.' };
  }

  const beforeSigs = (loadDb().contractSignatures || []).filter((s) => s.contractId === contractId).length;
  const beforeStatus = contract.status;
  const html = contractHtmlWithSignatures(contract.renderedHtml || contract.finalContent || '');

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const root = document.createElement('div');
    root.className = 'contract-print-root';
    root.setAttribute('data-testid', 'clinical-manual-signature-print-root');
    root.innerHTML = html;
    document.body.appendChild(root);
    try {
      if (typeof printContractElement === 'function') printContractElement(root);
    } finally {
      root.remove();
    }
  }

  const after = loadDb();
  const afterSigs = (after.contractSignatures || []).filter((s) => s.contractId === contractId).length;
  const persisted = (after.generatedContracts || []).find((c) => c.id === contractId);
  return {
    ok: true,
    printed: true,
    signatureEvidenceCreated: afterSigs !== beforeSigs,
    statusChanged: persisted?.status !== beforeStatus,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
  };
}
