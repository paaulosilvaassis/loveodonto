/**
 * Wizard operacional de geração de contrato (Phase 10.16 / C2 + C5).
 * Persistência local de progresso — sem side-effects financeiros novos.
 */

import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { getContractStatusForQuote } from './contractModuleService.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { resolveBudgetContractCta, deriveContractPendency } from '../contracts/operationalContractUi.js';
import { LINKED_DOCUMENTS } from '../components/clinical/contract/professionalContractClauses.js';
import { resolveAttachedTcleIdsFromClinicalDocuments } from './clinicalTcleAttachmentService.js';

export const WIZARD_STEPS = [
  { id: 'dados', label: 'Dados' },
  { id: 'tratamento', label: 'Tratamento' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'signatarios', label: 'Signatários' },
  { id: 'revisao', label: 'Revisão' },
  { id: 'assinatura', label: 'Assinatura' },
];

function clinicId() {
  const db = loadDb();
  return db.clinicProfile?.id || 'default-clinic';
}

/**
 * Valida elegibilidade e impede duplicação silenciosa.
 */
export function validateBudgetContractGeneration({
  patientId,
  budgetId,
  appointmentId,
  allowExisting = false,
} = {}) {
  const errors = [];
  if (!patientId) errors.push('Paciente não identificado.');
  if (!budgetId) errors.push('Orçamento não identificado.');
  if (!appointmentId) errors.push('Atendimento/tratamento não identificado.');

  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId) || null;
  const budget = (() => {
    if (!clinical || !budgetId) return null;
    if (clinical.budget?.id === budgetId) return clinical.budget;
    return (clinical.budgetHistory || []).find((b) => b.id === budgetId) || null;
  })();

  if (!budget) {
    errors.push('Orçamento não encontrado no tratamento.');
  } else if (![BUDGET_STATUS.APROVADO, BUDGET_STATUS.CONTRATO_GERADO].includes(budget.status)) {
    if (budget.status !== BUDGET_STATUS.APROVADO && !budget.contractId) {
      errors.push('Orçamento precisa estar aprovado para gerar contrato.');
    }
  }

  const existing = getContractStatusForQuote(appointmentId, 'clinical_budget', budgetId, patientId);
  if (existing && !allowExisting) {
    return {
      ok: false,
      errors: ['Já existe contrato para este orçamento.'],
      existingContract: existing,
      duplicateBlocked: true,
    };
  }

  const financialOk = Number(budget?.totalValue) >= 0 || (budget?.procedures || []).length > 0;
  if (budget && !financialOk) {
    errors.push('Dados financeiros do orçamento estão incompletos.');
  }

  return {
    ok: errors.length === 0,
    errors,
    existingContract: existing || null,
    duplicateBlocked: false,
    budget,
  };
}

export function buildDocumentPackageForBudget({
  appointmentId,
  budgetId,
  patientId,
} = {}) {
  const db = loadDb();
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId) || null;
  const budget = (() => {
    if (!clinical) return null;
    if (budgetId && clinical.budget?.id === budgetId) return clinical.budget;
    if (budgetId) {
      const fromHistory = (clinical.budgetHistory || []).find((b) => b.id === budgetId);
      if (fromHistory) return fromHistory;
    }
    return clinical.budget || null;
  })();

  const attachedTcleIds = resolveAttachedTcleIdsFromClinicalDocuments({
    patientId,
    appointmentId,
  }) || [];
  const contract = getContractStatusForQuote(appointmentId, 'clinical_budget', budgetId, patientId);
  const pendency = deriveContractPendency(contract);

  const items = [
    {
      id: 'contract_services',
      documentType: 'CONTRACT_SERVICES',
      label: 'Contrato de prestação de serviços',
      required: true,
      ready: Boolean(contract?.renderedHtml || contract?.status),
      version: contract?.templateVersion || contract?.version || '1',
      hash: contract?.documentHash || null,
    },
    {
      id: 'tcle',
      documentType: 'TCLE',
      label: attachedTcleIds.length > 1 ? `TCLE(s) (${attachedTcleIds.length})` : 'TCLE',
      required: true,
      ready: attachedTcleIds.length > 0 || Boolean(clinical?.documents?.length),
      version: '1',
      hash: null,
      detail: attachedTcleIds.length ? `${attachedTcleIds.length} anexo(s)` : 'Pendente de anexação clínica',
    },
    {
      id: 'lgpd',
      documentType: 'LGPD',
      label: 'LGPD / Privacidade',
      required: true,
      ready: true,
      version: '1',
      hash: null,
    },
    {
      id: 'image_optional',
      documentType: 'IMAGE_USE',
      label: 'Termo de imagem (opcional)',
      required: false,
      ready: false,
      version: '1',
      hash: null,
    },
  ];

  // Anexos obrigatórios tipados do contrato profissional
  for (const label of LINKED_DOCUMENTS || []) {
    if (/tcle|consentimento|lgpd|imagem/i.test(label)) continue;
    items.push({
      id: `annex_${label.slice(0, 24)}`,
      documentType: 'ANNEX',
      label,
      required: false,
      ready: Boolean(contract),
      version: '1',
      hash: null,
    });
  }

  return {
    packageId: `pkg_${budgetId || appointmentId}`,
    title: 'Pacote documental do tratamento',
    treatmentName: budget?.planName || 'Tratamento',
    items,
    hasPendency: pendency.hasPendency || items.some((i) => i.required && !i.ready),
    contractId: contract?.id || null,
    contractStatus: contract?.status || null,
  };
}

export function getWizardProgress(budgetId) {
  if (!budgetId) return null;
  const db = loadDb();
  const cid = clinicId();
  return (db.operationalContractWizardProgress || []).find(
    (p) => p.clinicId === cid && p.budgetId === budgetId,
  ) || null;
}

export function saveWizardProgress({
  budgetId,
  appointmentId,
  patientId,
  stepId,
  data = {},
} = {}) {
  if (!budgetId) throw new Error('budgetId obrigatório para salvar progresso.');
  const now = new Date().toISOString();
  return withDb((db) => {
    if (!Array.isArray(db.operationalContractWizardProgress)) {
      db.operationalContractWizardProgress = [];
    }
    const cid = clinicId();
    const idx = db.operationalContractWizardProgress.findIndex(
      (p) => p.clinicId === cid && p.budgetId === budgetId,
    );
    const base = idx >= 0
      ? db.operationalContractWizardProgress[idx]
      : {
          id: createId('ocwz'),
          clinicId: cid,
          budgetId,
          appointmentId,
          patientId,
          createdAt: now,
        };
    const next = {
      ...base,
      appointmentId: appointmentId || base.appointmentId,
      patientId: patientId || base.patientId,
      stepId: stepId || base.stepId || 'dados',
      data: { ...(base.data || {}), ...data },
      updatedAt: now,
    };
    if (idx >= 0) db.operationalContractWizardProgress[idx] = next;
    else db.operationalContractWizardProgress.push(next);
    return next;
  });
}

export function clearWizardProgress(budgetId) {
  if (!budgetId) return;
  withDb((db) => {
    db.operationalContractWizardProgress = (db.operationalContractWizardProgress || []).filter(
      (p) => p.budgetId !== budgetId,
    );
    return db;
  });
}

export function getStepReadiness(stepId, context = {}) {
  const {
    patientId,
    budget,
    documentPackage,
    signers = [],
  } = context;

  switch (stepId) {
    case 'dados':
      return { ready: Boolean(patientId), missing: patientId ? [] : ['Paciente'] };
    case 'tratamento':
      return {
        ready: Boolean(budget?.planName || (budget?.procedures || []).length),
        missing: (budget?.procedures || []).length ? [] : ['Procedimentos do tratamento'],
      };
    case 'financeiro': {
      const total = Number(budget?.totalValue);
      const ok = Number.isFinite(total);
      return { ready: ok, missing: ok ? [] : ['Valor total'] };
    }
    case 'documentos': {
      const missing = (documentPackage?.items || [])
        .filter((i) => i.required && !i.ready)
        .map((i) => i.label);
      return { ready: missing.length === 0, missing };
    }
    case 'signatarios':
      return {
        ready: signers.length > 0 || Boolean(patientId),
        missing: signers.length || patientId ? [] : ['Signatário paciente'],
      };
    case 'revisao':
      return { ready: true, missing: [] };
    case 'assinatura':
      return { ready: true, missing: [] };
    default:
      return { ready: false, missing: ['Etapa inválida'] };
  }
}

export function resolveHubContractAction(row) {
  const pendency = deriveContractPendency(
    row.contractId
      ? { id: row.contractId, status: row.contractStatus, financialSnapshotJson: { valorTotal: row.totalValue }, totalValueSnapshot: row.totalValue, clinicalSnapshotJson: { procedimentos: row.planName } }
      : null,
  );
  return resolveBudgetContractCta({
    contractId: row.contractId,
    contractStatus: row.contractStatus,
    budgetStatus: row.status,
    hasPendency: pendency.hasPendency && Boolean(row.contractId),
  });
}
