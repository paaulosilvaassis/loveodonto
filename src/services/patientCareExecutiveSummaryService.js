import { loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { getClinicalAnamnesis } from './patientAnamnesisService.js';
import { listFiles } from './patientFilesService.js';
import { getPatientBudgetOverview } from './clinicalBudgetHubService.js';
import { listPatientContracts } from './contractModuleService.js';
import { getPatientFinancialSummary, getPatientDelinquencyInfo } from './patientFinancialSummaryService.js';
import { formatFriendlyBudgetNumber } from './patientCareTimelineService.js';
import { listPatientBudgetHistory } from './clinicalBudgetLockService.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { formatBudgetStatusLabel } from './patientCareTimelineService.js';
import { formatCurrencyBRL } from '../utils/currency.js';

function formatDateBR(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function formatFriendlyContractNumber(raw, sequence) {
  const value = String(raw || '').trim();
  if (value && value.length <= 20 && !value.startsWith('budget-')) return value;
  return `CTR-${String(sequence).padStart(3, '0')}`;
}

function getBudgetLabel(patientId, budget) {
  const history = [...listPatientBudgetHistory(patientId)].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const index = history.findIndex((b) => b.id === budget?.id);
  return formatFriendlyBudgetNumber(budget?.budgetNumber, index >= 0 ? index + 1 : 1);
}

export function buildIntelligenceAlerts(patientId) {
  const alerts = [];
  const delinquency = getPatientDelinquencyInfo(patientId);

  if (delinquency.isDelinquent) {
    alerts.push({ id: 'overdue', tone: 'danger', text: 'Possui parcelas vencidas' });
  }

  const contracts = listPatientContracts(patientId);
  const pendingContract = contracts.find(
    (c) => c.status && ![CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.CANCELED, CONTRACT_STATUS.REPLACED].includes(c.status),
  );
  if (pendingContract) {
    alerts.push({ id: 'contract', tone: 'warning', text: 'Possui contrato pendente de assinatura' });
  }

  const files = listFiles(patientId);
  const exams = files.filter((f) => /exame|radio|panor|tomograf|foto/i.test(String(f.category || f.file_name || '')));
  if (exams.length > 0) {
    alerts.push({ id: 'exam', tone: 'info', text: 'Possui exames anexados para revisão' });
  }

  const anamnesis = getClinicalAnamnesis(patientId, []);
  const unanswered = (anamnesis.answers || []).filter((a) => a.answer === 'nao_respondido').length;
  if (unanswered > 3) {
    alerts.push({ id: 'anamnesis', tone: 'warning', text: 'Possui anamnese incompleta' });
  }

  const db = loadDb();
  const hasReturn = (db.appointments || []).some(
    (a) => a.patientId === patientId && a.status === APPOINTMENT_STATUS.AGENDADO && a.date >= new Date().toISOString().slice(0, 10),
  );
  if (hasReturn) {
    alerts.push({ id: 'return', tone: 'info', text: 'Possui retorno agendado' });
  }

  return alerts;
}

export function buildPatientExecutiveSummary(patientId, header = {}) {
  if (!patientId) return null;

  const db = loadDb();
  const appointments = (db.appointments || [])
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const firstAppt = appointments[0];
  const lastFinished = [...appointments]
    .filter((a) => [APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO, APPOINTMENT_STATUS.EM_ATENDIMENTO].includes(a.status))
    .sort((a, b) => new Date(b.finishedAt || b.date || 0) - new Date(a.finishedAt || a.date || 0))[0];

  const overview = getPatientBudgetOverview(patientId);
  const financial = getPatientFinancialSummary(patientId);
  const delinquency = getPatientDelinquencyInfo(patientId);
  const contracts = listPatientContracts(patientId);

  const activeBudget = overview.currentBudget
    || overview.history.find((b) => !b.isHistorical && b.status !== BUDGET_STATUS.HISTORICO)
    || overview.history[0]
    || null;

  const activeContract = contracts.find((c) => c.status !== CONTRACT_STATUS.CANCELED && c.status !== CONTRACT_STATUS.REPLACED)
    || contracts[0]
    || null;

  const contractIndex = contracts.findIndex((c) => c.id === activeContract?.id);

  let treatmentName = activeBudget?.planName || '—';
  if (treatmentName === '—') {
    const clinicalAppt = (db.clinicalAppointments || []).find((c) => c.patientId === patientId);
    treatmentName = clinicalAppt?.planName || '—';
  }

  const plannedCount = (db.clinicalAppointments || [])
    .filter((c) => c.patientId === patientId)
    .reduce((sum, c) => sum + (c.plannedProcedures?.length || 0), 0);

  let situation = 'Sem tratamento ativo';
  if (lastFinished?.status === APPOINTMENT_STATUS.EM_ATENDIMENTO) situation = 'Em atendimento';
  else if (plannedCount > 0 || activeBudget) situation = 'Em tratamento';
  else if (lastFinished) situation = 'Acompanhamento';

  const totalContracted = activeBudget?.totalValue
    || contracts.reduce((s, c) => s + Number(c.totalValue || c.value || 0), 0)
    || financial.summary.totalOpen + financial.summary.totalPaid;

  return {
    patientName: header.patientName || 'Paciente',
    firstConsultationDate: firstAppt?.date || null,
    lastAppointmentDate: lastFinished?.finishedAt || lastFinished?.date || null,
    responsibleDentist: header.professionalName || '—',
    treatmentName,
    situation,
    activeBudget: activeBudget ? {
      label: getBudgetLabel(patientId, activeBudget),
      value: activeBudget.totalValue || 0,
      status: formatBudgetStatusLabel(activeBudget.status),
      appointmentId: activeBudget.appointmentId,
    } : null,
    activeContract: activeContract ? {
      label: formatFriendlyContractNumber(activeContract.contractNumber, contractIndex + 1),
      status: activeContract.status === CONTRACT_STATUS.SIGNED ? 'Assinado' : 'Pendente',
      isSigned: activeContract.status === CONTRACT_STATUS.SIGNED,
      appointmentId: activeContract.quoteId,
    } : null,
    financial: {
      totalContracted,
      totalPaid: financial.summary.totalPaid,
      totalOpen: financial.summary.totalOpen,
      overdueCount: delinquency.overdueCount,
      isDelinquent: delinquency.isDelinquent,
      statusLabel: delinquency.isDelinquent ? 'INADIMPLENTE' : 'ADIMPLENTE',
    },
  };
}

export function formatExecutiveDate(iso) {
  return formatDateBR(iso);
}

export function formatExecutiveCurrency(value) {
  return formatCurrencyBRL(value || 0);
}
