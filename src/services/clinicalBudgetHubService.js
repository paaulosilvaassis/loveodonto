import { loadDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { getClinicalData } from './clinicalService.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import {
  createNewBudgetForAppointment,
  getBudgetLockContext,
  importProceduresFromPreviousBudget,
  listPatientBudgetHistory,
  getPreviousBudgetImportContext,
} from './clinicalBudgetLockService.js';
import { getContractStatusForQuote } from './contractModuleService.js';
import { listPatientContracts } from './contractModuleService.js';
import { calcPlannedValue, getAcceptedOption, formatPaymentOptionLabel } from '../components/clinical/budget/budgetUtils.js';
import { formatFriendlyBudgetNumber } from './patientCareTimelineService.js';
import { createId } from './helpers.js';

export class InactiveClinicalSessionError extends Error {
  constructor(message = 'Paciente sem atendimento clínico ativo.') {
    super(message);
    this.name = 'InactiveClinicalSessionError';
    this.code = 'INACTIVE_SESSION';
  }
}

function resolvePatientId(clinicalRow, db) {
  if (clinicalRow.patientId) return clinicalRow.patientId;
  const apt = (db.appointments || []).find((a) => a.id === clinicalRow.appointmentId);
  return apt?.patientId || null;
}

function resolvePatientName(patientId, db) {
  if (!patientId) return 'Paciente';
  const p = (db.patients || []).find((row) => row.id === patientId);
  return p?.full_name || p?.nickname || p?.social_name || 'Paciente';
}

function resolveProfessionalName(professionalId, db) {
  if (!professionalId) return '—';
  const pro = (db.collaborators || []).find((c) => c.id === professionalId);
  return pro?.nomeCompleto || pro?.name || pro?.apelido || '—';
}

function resolveBudgetTotal(budget) {
  if (!budget) return 0;
  if (budget.totalValue != null) return Number(budget.totalValue);
  return calcPlannedValue(budget.procedures || []);
}

function resolvePatientPhone(patientId, db) {
  if (!patientId) return '—';
  const phones = (db.patientPhones || []).filter((p) => p.patient_id === patientId);
  const primary = phones.find((p) => p.is_primary) || phones[0];
  if (!primary) return '—';
  const ddd = primary.ddd || '';
  const number = primary.number || '';
  return ddd ? `(${ddd}) ${number}` : number || '—';
}

function hasFinanceGenerated(db, patientId, appointmentId, budgetId, financingId) {
  if (financingId) return true;
  const originIds = new Set([appointmentId, budgetId].filter(Boolean).map(String));
  return (db.accountsReceivable || []).some(
    (r) => r.patient_id === patientId && originIds.has(String(r.origin_id || '')),
  );
}

function resolveNextAction(row) {
  if (row.isHistorical || row.status === BUDGET_STATUS.HISTORICO) {
    return 'Consultar histórico';
  }
  if (row.isLocked) return 'Criar novo orçamento';
  if (row.status === BUDGET_STATUS.RASCUNHO) return 'Apresentar condições ao paciente';
  if ([BUDGET_STATUS.ENVIADO, BUDGET_STATUS.NEGOCIACAO].includes(row.status)) {
    return 'Registrar escolha do paciente';
  }
  if (row.status === BUDGET_STATUS.APROVADO && !row.contractId) return 'Gerar contrato';
  if (row.status === BUDGET_STATUS.APROVADO && row.contractId && !row.hasFinance) {
    return 'Gerar financeiro';
  }
  if (row.status === BUDGET_STATUS.CONTRATO_GERADO) return 'Acompanhar contrato';
  if (row.status === BUDGET_STATUS.REPROVADO) return 'Criar nova proposta';
  if (row.status === BUDGET_STATUS.CANCELADO) return 'Reabrir negociação';
  return 'Abrir orçamento';
}

function enrichBudgetRow(baseRow, budget, db) {
  const accepted = getAcceptedOption(budget);
  const installmentLabel = accepted ? formatPaymentOptionLabel(accepted) : null;
  const patientHistory = baseRow.patientId
    ? listPatientBudgetHistory(baseRow.patientId)
    : [];
  const budgetIndex = patientHistory.findIndex((b) => b.id === budget.id);
  const friendlyNumber = formatFriendlyBudgetNumber(
    budget.budgetNumber,
    budgetIndex >= 0 ? budgetIndex + 1 : 1,
  );

  return {
    ...baseRow,
    budgetNumber: friendlyNumber,
    patientPhone: resolvePatientPhone(baseRow.patientId, db),
    validityDate: budget.validityDate || null,
    hasFinance: hasFinanceGenerated(
      db,
      baseRow.patientId,
      baseRow.appointmentId,
      budget.id,
      baseRow.financingId,
    ),
    hasContract: Boolean(baseRow.contractId),
    installmentLabel,
    nextAction: resolveNextAction({
      ...baseRow,
      hasFinance: hasFinanceGenerated(
        db,
        baseRow.patientId,
        baseRow.appointmentId,
        budget.id,
        baseRow.financingId,
      ),
    }),
    displayDate: baseRow.archivedAt || baseRow.createdAt,
  };
}

function mapBudgetRow({
  budget,
  appointmentId,
  patientId,
  db,
  isHistorical,
  archivedAt,
}) {
  const contract = getContractStatusForQuote(appointmentId, 'clinical_budget', budget.id);
  const lockCtx = getBudgetLockContext(appointmentId);
  const apt = (db.appointments || []).find((a) => a.id === appointmentId);

  return {
    id: budget.id,
    appointmentId,
    patientId,
    patientName: resolvePatientName(patientId, db),
    planName: budget.planName || '—',
    budgetNumber: budget.budgetNumber || budget.id,
    status: budget.status,
    totalValue: resolveBudgetTotal(budget),
    createdAt: budget.createdAt,
    archivedAt: archivedAt || null,
    professionalId: budget.professionalId || apt?.professionalId || null,
    professionalName: resolveProfessionalName(budget.professionalId || apt?.professionalId, db),
    contractId: contract?.id || null,
    contractStatus: contract?.status || null,
    contractNumber: contract?.contractNumber || null,
    isHistorical: Boolean(isHistorical),
    isLocked: lockCtx.isLocked && !isHistorical && budget.id === lockCtx.budget?.id,
    financingId: budget.financingId || null,
  };
}

export function resolveRowPatientId(row) {
  if (!row) return null;
  return row.patientId || row.patient_id || row.patient?.id || null;
}

export function resolveRowPatientName(row) {
  if (!row) return 'Paciente não identificado';
  const name = row.patientName || row.patient?.name || row.patient?.full_name;
  if (name) return name;
  return resolveRowPatientId(row) ? 'Paciente' : 'Paciente não identificado';
}

export function findActiveClinicalAppointmentId(patientId) {
  if (!patientId) return null;
  const db = loadDb();
  const active = (db.appointments || []).find(
    (apt) => apt.patientId === patientId && apt.status === APPOINTMENT_STATUS.EM_ATENDIMENTO,
  );
  return active?.id || null;
}

function ensureClinicalRecord(db, appointmentId, patientId) {
  if (!db.clinicalAppointments) db.clinicalAppointments = [];
  const idx = db.clinicalAppointments.findIndex((c) => c.appointmentId === appointmentId);
  if (idx < 0) {
    db.clinicalAppointments.push({
      id: createId('clinical'),
      appointmentId,
      patientId,
      plannedProcedures: [],
      budgetHistory: [],
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (!db.clinicalAppointments[idx].patientId && patientId) {
    db.clinicalAppointments[idx].patientId = patientId;
  }
}

export function listAllClinicalBudgetRows(filters = {}) {
  const allRows = listAllClinicalBudgetRowsRaw();
  const filtered = applyBudgetHubFilters(allRows, filters);
  const sorted = sortBudgetHubRows(filtered, filters.sortBy || 'recent');
  return sorted;
}

function listAllClinicalBudgetRowsRaw() {
  const db = loadDb();
  const rows = [];

  for (const ca of db.clinicalAppointments || []) {
    const patientId = resolvePatientId(ca, db);
    for (const archived of ca.budgetHistory || []) {
      const base = mapBudgetRow({
        budget: archived,
        appointmentId: ca.appointmentId,
        patientId,
        db,
        isHistorical: true,
        archivedAt: archived.archivedAt,
      });
      rows.push(enrichBudgetRow(base, archived, db));
    }
    if (ca.budget) {
      const base = mapBudgetRow({
        budget: ca.budget,
        appointmentId: ca.appointmentId,
        patientId,
        db,
        isHistorical: ca.budget.status === BUDGET_STATUS.HISTORICO,
        archivedAt: null,
      });
      rows.push(enrichBudgetRow(base, ca.budget, db));
    }
  }

  return rows;
}

export function getPatientBudgetOverview(patientId) {
  if (!patientId) {
    return {
      currentBudget: null,
      history: [],
      contracts: [],
      importContext: { hasPrevious: false, canImport: false, procedureCount: 0 },
      activeAppointmentId: null,
    };
  }

  const history = listAllClinicalBudgetRowsRaw().filter((row) => row.patientId === patientId);
  const contracts = listPatientContracts(patientId);
  const activeAppointmentId = findActiveClinicalAppointmentId(patientId);
  const importContext = activeAppointmentId
    ? getPreviousBudgetImportContext(activeAppointmentId)
    : { hasPrevious: history.length > 0, canImport: false, procedureCount: 0 };

  const currentBudget = history.find(
    (row) => !row.isHistorical && row.status === BUDGET_STATUS.RASCUNHO,
  ) || history.find(
    (row) => !row.isHistorical && !getBudgetLockContext(row.appointmentId).isLocked,
  ) || null;

  return {
    currentBudget,
    history,
    contracts,
    importContext,
    activeAppointmentId,
  };
}

export function sortBudgetHubRows(rows, sortBy = 'recent') {
  const list = [...rows];
  switch (sortBy) {
    case 'oldest':
      return list.sort(
        (a, b) => new Date(a.displayDate || 0) - new Date(b.displayDate || 0),
      );
    case 'highest_value':
      return list.sort((a, b) => b.totalValue - a.totalValue);
    case 'lowest_value':
      return list.sort((a, b) => a.totalValue - b.totalValue);
    case 'recent':
    default:
      return list.sort(
        (a, b) => new Date(b.displayDate || 0) - new Date(a.displayDate || 0),
      );
  }
}

export function computeBudgetHubKpis(rows = []) {
  const pendingStatuses = new Set([
    BUDGET_STATUS.RASCUNHO,
    BUDGET_STATUS.ENVIADO,
    BUDGET_STATUS.NEGOCIACAO,
  ]);
  const approvedStatuses = new Set([
    BUDGET_STATUS.APROVADO,
    BUDGET_STATUS.CONTRATO_GERADO,
  ]);

  let draftCount = 0;
  let presentedCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let convertedCount = 0;
  let negotiationValue = 0;
  let approvedValue = 0;

  for (const row of rows) {
    if (row.status === BUDGET_STATUS.RASCUNHO) draftCount += 1;
    if ([BUDGET_STATUS.ENVIADO, BUDGET_STATUS.NEGOCIACAO].includes(row.status)) {
      presentedCount += 1;
    }
    if (approvedStatuses.has(row.status)) approvedCount += 1;
    if (row.status === BUDGET_STATUS.REPROVADO) rejectedCount += 1;
    if (row.hasContract || row.status === BUDGET_STATUS.CONTRATO_GERADO) convertedCount += 1;
    if (pendingStatuses.has(row.status)) negotiationValue += row.totalValue || 0;
    if (approvedStatuses.has(row.status)) approvedValue += row.totalValue || 0;
  }

  return {
    total: rows.length,
    draftCount,
    presentedCount,
    approvedCount,
    rejectedCount,
    convertedCount,
    negotiationValue,
    approvedValue,
  };
}

export function listBudgetHubProfessionals() {
  const db = loadDb();
  const ids = new Set();
  for (const row of listAllClinicalBudgetRowsRaw()) {
    if (row.professionalId) ids.add(row.professionalId);
  }
  return [...ids].map((id) => {
    const pro = (db.collaborators || []).find((c) => c.id === id);
    return {
      id,
      name: pro?.nomeCompleto || pro?.name || pro?.apelido || 'Profissional',
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function applyBudgetHubFilters(rows, filters = {}) {
  let result = [...rows];

  if (filters.status) {
    result = result.filter((row) => row.status === filters.status);
  }
  if (filters.patientId) {
    result = result.filter((row) => row.patientId === filters.patientId);
  }
  if (filters.professionalId) {
    result = result.filter((row) => row.professionalId === filters.professionalId);
  }
  if (filters.query) {
    const q = String(filters.query).trim().toLowerCase();
    result = result.filter((row) =>
      row.patientName.toLowerCase().includes(q)
      || String(row.planName).toLowerCase().includes(q)
      || String(row.budgetNumber).toLowerCase().includes(q)
      || String(row.patientPhone).toLowerCase().includes(q),
    );
  }
  if (filters.budgetQuery) {
    const q = String(filters.budgetQuery).trim().toLowerCase();
    result = result.filter((row) => String(row.budgetNumber).toLowerCase().includes(q));
  }
  if (filters.dateFrom) {
    result = result.filter((row) => String(row.displayDate || '').slice(0, 10) >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter((row) => String(row.displayDate || '').slice(0, 10) <= filters.dateTo);
  }
  if (filters.minValue != null && filters.minValue !== '') {
    const min = Number(filters.minValue);
    if (!Number.isNaN(min)) result = result.filter((row) => row.totalValue >= min);
  }
  if (filters.maxValue != null && filters.maxValue !== '') {
    const max = Number(filters.maxValue);
    if (!Number.isNaN(max)) result = result.filter((row) => row.totalValue <= max);
  }

  return result;
}

export function startNewBudgetForPatient(user, patientId, { importProcedures = false } = {}) {
  const appointmentId = findActiveClinicalAppointmentId(patientId);
  if (!appointmentId) {
    throw new InactiveClinicalSessionError(
      'Inicie o atendimento clínico do paciente na Jornada do Paciente antes de criar um novo orçamento.',
    );
  }

  withDb((db) => {
    ensureClinicalRecord(db, appointmentId, patientId);
    return db;
  });

  const clinical = getClinicalData(appointmentId);
  if (clinical?.budget) {
    createNewBudgetForAppointment(user, appointmentId);
  } else {
    createNewBudgetForAppointment(user, appointmentId);
  }

  if (importProcedures) {
    const ctx = getPreviousBudgetImportContext(appointmentId);
    if (ctx.canImport || ctx.procedureCount > 0) {
      importProceduresFromPreviousBudget(user, appointmentId);
    }
  }

  return { appointmentId, section: 'planejamento' };
}

export const BUDGET_HUB_STATUS_FILTERS = [
  { value: '', label: 'Todos os status' },
  { value: BUDGET_STATUS.RASCUNHO, label: 'Em elaboração' },
  { value: BUDGET_STATUS.ENVIADO, label: 'Apresentado' },
  { value: BUDGET_STATUS.NEGOCIACAO, label: 'Em negociação' },
  { value: BUDGET_STATUS.APROVADO, label: 'Aprovado' },
  { value: BUDGET_STATUS.CONTRATO_GERADO, label: 'Contrato gerado' },
  { value: BUDGET_STATUS.REPROVADO, label: 'Reprovado' },
  { value: BUDGET_STATUS.HISTORICO, label: 'Histórico' },
  { value: BUDGET_STATUS.CANCELADO, label: 'Cancelado' },
];

export const BUDGET_HUB_SORT_OPTIONS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'highest_value', label: 'Maior valor' },
  { value: 'lowest_value', label: 'Menor valor' },
];
