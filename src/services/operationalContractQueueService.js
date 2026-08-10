/**
 * Fila única operacional de contratos — busca, filtros e atalhos (Phase 10.16 / C4).
 */

import { loadDb } from '../db/index.js';
import { normalizeContract } from './contractModuleService.js';
import {
  deriveContractPendency,
  resolveOperationalUxStatus,
  labelOperationalUxStatus,
  resolveOperationalContractCta,
  OPERATIONAL_UX_STATUS,
} from '../contracts/operationalContractUi.js';
import { formatFriendlyContractNumber } from '../utils/friendlyNumbers.js';

function clinicId() {
  const db = loadDb();
  return db.clinicProfile?.id || 'default-clinic';
}

function resolvePatientPhone(patientId, db) {
  if (!patientId) return '';
  const phones = (db.patientPhones || []).filter((p) => p.patient_id === patientId);
  const primary = phones.find((p) => p.is_primary) || phones[0];
  if (!primary) return '';
  const ddd = primary.ddd || '';
  const number = primary.number || '';
  return ddd ? `(${ddd}) ${number}` : number || '';
}

function resolveProfessionalName(contract, db) {
  const fromSnap = contract.professionalSnapshotJson?.name;
  if (fromSnap) return fromSnap;
  const id = contract.professionalSnapshotJson?.userId || contract.createdBy;
  const pro = (db.collaborators || []).find((c) => c.id === id || c.userId === id);
  return pro?.nomeCompleto || pro?.name || '—';
}

export const QUEUE_SHORTCUTS = [
  { id: 'all', label: 'Todos' },
  { id: 'drafts', label: 'Rascunhos' },
  { id: 'awaiting', label: 'Aguardando assinatura' },
  { id: 'partial', label: 'Parcialmente assinados' },
  { id: 'signed', label: 'Assinados' },
  { id: 'problems', label: 'Com problema' },
];

/**
 * Lista contratos da clínica enriquecidos para a fila operacional.
 */
export function listOperationalContractQueue(filters = {}) {
  const db = loadDb();
  const cid = clinicId();
  const signatures = db.contractSignatures || [];
  const signLinks = db.contractSignLinks || [];

  let rows = (db.generatedContracts || [])
    .filter((c) => c.clinicId === cid && c.status !== 'replaced')
    .map((raw, index) => {
      const contract = normalizeContract(raw);
      const sigs = signatures.filter((s) => s.contractId === contract.id);
      const links = signLinks.filter((l) => l.contractId === contract.id);
      const pendency = deriveContractPendency(contract, { signatures: sigs, signLinks: links });
      const partiallySigned =
        sigs.length > 0
        && !['signed', 'completed', 'vigente'].includes(String(contract.status || '').toLowerCase());
      const uxStatus = resolveOperationalUxStatus({
        status: contract.status,
        hasPendency: pendency.hasPendency,
        partiallySigned,
      });
      const patientName = contract.patientSnapshotJson?.full_name || contract.patientId || 'Paciente';
      const phone = resolvePatientPhone(contract.patientId, db);
      const treatmentSummary =
        contract.clinicalSnapshotJson?.procedimentos
        || contract.title
        || 'Tratamento';
      const cta = resolveOperationalContractCta({ uxStatus, contract });

      return {
        id: contract.id,
        contractNumber: formatFriendlyContractNumber(contract.contractNumber, index + 1),
        rawContractNumber: contract.contractNumber,
        patientId: contract.patientId,
        patientName,
        patientPhone: phone,
        budgetId: contract.financialSnapshotJson?.budgetId || contract.budgetId || null,
        quoteId: contract.quoteId || null,
        quoteSource: contract.quoteSource || null,
        treatmentSummary: Array.isArray(treatmentSummary)
          ? treatmentSummary.slice(0, 3).join(', ')
          : String(treatmentSummary).slice(0, 120),
        totalValue: contract.totalValueSnapshot ?? contract.financialSnapshotJson?.valorTotal ?? null,
        status: contract.status,
        uxStatus,
        uxStatusLabel: labelOperationalUxStatus(uxStatus),
        updatedAt: contract.updatedAt || contract.generatedAt || contract.createdAt || null,
        professionalName: resolveProfessionalName(contract, db),
        unitName: contract.clinicSnapshotJson?.razaoSocial || db.clinicProfile?.nomeFantasia || '—',
        documentType: contract.category || 'servicos',
        origin: contract.quoteSource || 'manual',
        pendingSignature: ['sent', 'viewed', 'signed_by_patient', 'signed_by_clinic', 'ready_to_send'].includes(
          String(contract.status || '').toLowerCase(),
        ),
        pendencyReasons: pendency.reasons,
        nextAction: cta.label,
        cta,
      };
    });

  rows = applyQueueFilters(rows, filters);
  rows.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return rows;
}

export function applyQueueFilters(rows, filters = {}) {
  const {
    query = '',
    status = '',
    shortcut = 'all',
    professional = '',
    unit = '',
    documentType = '',
    origin = '',
    pendingSignature = '',
    dateFrom = '',
    dateTo = '',
  } = filters;

  let list = [...rows];

  if (shortcut && shortcut !== 'all') {
    list = list.filter((r) => {
      switch (shortcut) {
        case 'drafts':
          return r.uxStatus === OPERATIONAL_UX_STATUS.DRAFT;
        case 'awaiting':
          return r.uxStatus === OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE;
        case 'partial':
          return r.uxStatus === OPERATIONAL_UX_STATUS.PARTIALLY_SIGNED;
        case 'signed':
          return r.uxStatus === OPERATIONAL_UX_STATUS.SIGNED;
        case 'problems':
          return r.uxStatus === OPERATIONAL_UX_STATUS.WITH_PENDING;
        default:
          return true;
      }
    });
  }

  const q = String(query || '').trim().toLowerCase();
  if (q) {
    list = list.filter((r) => {
      const hay = [
        r.patientName,
        r.contractNumber,
        r.rawContractNumber,
        r.budgetId,
        r.patientPhone,
        r.professionalName,
        r.treatmentSummary,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }

  if (status) {
    list = list.filter((r) => r.uxStatus === status || r.status === status);
  }
  if (professional) {
    list = list.filter((r) => String(r.professionalName).toLowerCase().includes(String(professional).toLowerCase()));
  }
  if (unit) {
    list = list.filter((r) => String(r.unitName).toLowerCase().includes(String(unit).toLowerCase()));
  }
  if (documentType) {
    list = list.filter((r) => String(r.documentType) === String(documentType));
  }
  if (origin) {
    list = list.filter((r) => String(r.origin) === String(origin));
  }
  if (pendingSignature === 'yes') {
    list = list.filter((r) => r.pendingSignature);
  } else if (pendingSignature === 'no') {
    list = list.filter((r) => !r.pendingSignature);
  }

  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    list = list.filter((r) => new Date(r.updatedAt || 0).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime() + 86400000 - 1;
    list = list.filter((r) => new Date(r.updatedAt || 0).getTime() <= to);
  }

  return list;
}

export function listQueueProfessionals() {
  const rows = listOperationalContractQueue({});
  const set = new Set(rows.map((r) => r.professionalName).filter((n) => n && n !== '—'));
  return [...set].sort();
}
