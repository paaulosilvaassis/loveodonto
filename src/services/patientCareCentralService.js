import { loadDb } from '../db/index.js';
import { getPatient } from './patientService.js';
import { getAppointmentDetails, APPOINTMENT_STATUS } from './appointmentService.js';
import { getClinicalAnamnesis } from './patientAnamnesisService.js';
import { listFiles } from './patientFilesService.js';
import { getClinicalData } from './clinicalService.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import {
  getBudgetLockContext,
} from './clinicalBudgetLockService.js';
import { getPatientBudgetOverview } from './clinicalBudgetHubService.js';
import { getPatientDelinquencyInfo } from './patientFinancialSummaryService.js';
import { formatCurrencyBRL } from '../utils/currency.js';
import { buildHumanPatientTimeline } from './patientCareTimelineService.js';
import {
  buildPatientExecutiveSummary,
  buildIntelligenceAlerts,
} from './patientCareExecutiveSummaryService.js';
import {
  getLatestApprovedBudget,
  buildApprovedBudgetQuickSummaryText,
} from './clinicalBudgetApprovedService.js';
import { findPendingDecisionBudget, shouldPreferPendingBudgetOverApproved } from './clinicalAppointmentCloseService.js';
import { listPatientBudgetHistory } from './clinicalBudgetLockService.js';
import { formatFriendlyBudgetNumber } from '../utils/friendlyNumbers.js';
import { formatBudgetStatusLabel } from './patientCareTimelineService.js';

const ANAMNESIS_LABELS = {
  alergias: 'Alergias',
  medicamentos: 'Medicamentos em uso',
  diabetes: 'Diabetes',
  pressao_alta: 'Pressão alta',
  cardiopatia: 'Cardiopatia',
  asma_bronquite: 'Asma/Bronquite',
  hepatite: 'Hepatite',
  doencas_infecciosas: 'Doenças infecciosas',
};

function calcAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function formatPhone(phone) {
  if (!phone) return '—';
  return `(${phone.ddd || ''}) ${phone.number || ''}`.trim();
}

function formatTime(time) {
  if (!time) return '—';
  return String(time).slice(0, 5);
}

function extractAnamnesisAlerts(patientId) {
  const record = getClinicalAnamnesis(patientId, []);
  const alerts = [];
  for (const answer of record.answers || []) {
    if (!answer || answer.answer !== 'sim') continue;
    const label = ANAMNESIS_LABELS[answer.code] || answer.code;
    alerts.push({
      type: 'clinical',
      tone: answer.code === 'alergias' ? 'danger' : 'warning',
      text: answer.details
        ? `${label}: ${answer.details}`
        : `${label} informado(a) na anamnese.`,
    });
  }
  const hasAllergyAnswer = (record.answers || []).some((a) => a.code === 'alergias');
  if (!hasAllergyAnswer) {
    alerts.push({ type: 'info', tone: 'muted', text: 'Sem alergias cadastradas na anamnese.' });
  }
  return alerts;
}

function buildFinancialAlerts(patientId) {
  const delinquency = getPatientDelinquencyInfo(patientId);
  const alerts = [];

  if (delinquency.isDelinquent) {
    alerts.push({
      type: 'financial',
      tone: 'danger',
      text: delinquency.message,
    });
  } else if (delinquency.hasPending) {
    alerts.push({
      type: 'financial',
      tone: 'warning',
      text: `${delinquency.openCount} parcela(s)/boleto(s) em aberto (${formatCurrencyBRL(delinquency.openTotal)}).`,
    });
  }

  const db = loadDb();
  const financings = (db.financings || []).filter(
    (f) => f.patient_id === patientId && !['canceled', 'cancelado', 'quitado'].includes(String(f.status || '').toLowerCase()),
  );
  if (financings.length) {
    alerts.push({
      type: 'financial',
      tone: 'info',
      text: 'Existe financiamento ativo vinculado ao paciente.',
    });
  }

  return alerts;
}

function buildBudgetAlerts(patientId, appointmentId) {
  const latestApproved = getLatestApprovedBudget(patientId);
  const lockCtx = appointmentId ? getBudgetLockContext(appointmentId) : null;
  const alerts = [];

  const pendingDecision = findPendingDecisionBudget(patientId);
  if (pendingDecision) {
    const history = listPatientBudgetHistory(patientId);
    const index = history.findIndex((b) => b.id === pendingDecision.id);
    const label = formatFriendlyBudgetNumber(pendingDecision.budgetNumber, index >= 0 ? index + 1 : 1);
    alerts.push({
      type: 'budget',
      tone: 'warning',
      id: 'pending-budget-decision',
      text: 'Existe orçamento pendente de decisão.',
      detail: `${label} · Status: ${formatBudgetStatusLabel(pendingDecision.status)}`,
      budgetId: pendingDecision.id,
      appointmentId: pendingDecision.appointmentId,
      actionLabel: 'Abrir orçamento',
    });
  }

  if (latestApproved) {
    alerts.push({
      type: 'budget',
      tone: 'success',
      id: 'approved-budget',
      text: buildApprovedBudgetQuickSummaryText(latestApproved),
      budgetId: latestApproved.id,
      appointmentId: latestApproved.appointmentId,
    });
  } else {
    alerts.push({
      type: 'budget',
      tone: 'muted',
      id: 'approved-budget-none',
      text: 'Nenhum orçamento aprovado',
    });
  }

  if (lockCtx?.isLocked) {
    alerts.push({
      type: 'budget',
      tone: 'warning',
      text: 'Orçamento atual bloqueado por contrato gerado. Use "Criar novo orçamento" para nova negociação.',
    });
  }

  return alerts;
}

function buildTimeline(patientId, appointmentId) {
  return buildHumanPatientTimeline(patientId, appointmentId);
}

function resolveActions(patientId, appointmentId) {
  const overview = getPatientBudgetOverview(patientId);
  const lockCtx = getBudgetLockContext(appointmentId);
  const clinical = getClinicalData(appointmentId);
  const currentBudget = clinical?.budget;
  const hasDraft = currentBudget?.status === BUDGET_STATUS.RASCUNHO;
  const hasLocked = lockCtx.isLocked;
  const latestApproved = getLatestApprovedBudget(patientId);
  const hasApprovedOrContract = Boolean(latestApproved);
  const pendingDecision = findPendingDecisionBudget(patientId);

  const primaryBudget = shouldPreferPendingBudgetOverApproved(pendingDecision)
    ? { id: pendingDecision.id, appointmentId: pendingDecision.appointmentId }
    : latestApproved
      ? { id: latestApproved.id, appointmentId: latestApproved.appointmentId }
      : pendingDecision
        ? { id: pendingDecision.id, appointmentId: pendingDecision.appointmentId }
        : null;

  return {
    showOpenClinical: true,
    showOpenExistingBudget: hasLocked || hasApprovedOrContract || Boolean(pendingDecision),
    showCreateNewBudget: hasLocked || !hasDraft,
    showViewContract: Boolean(lockCtx.contract || overview.contracts.length || latestApproved?.hasContract),
    showFullChart: true,
    showExams: true,
    primaryBudgetId: primaryBudget?.id || null,
    primaryBudgetAppointmentId: primaryBudget?.appointmentId || null,
    latestApprovedBudget: latestApproved,
    pendingDecisionBudget: pendingDecision,
    lockCtx,
    currentBudget,
    overview,
  };
}

function getLastVisit(patientId) {
  const db = loadDb();
  const finished = (db.appointments || [])
    .filter((a) => a.patientId === patientId && [APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(a.status))
    .sort((a, b) => new Date(b.finishedAt || b.date) - new Date(a.finishedAt || a.date));
  return finished[0] || null;
}

export function buildPatientCareContext(appointmentId) {
  const details = getAppointmentDetails(appointmentId);
  if (!details?.appointment) return null;

  const { appointment, patient, professional, room, phone } = details;
  const patientId = appointment.patientId;
  if (!patientId) return null;

  const profile = patient?.profile || patient || {};
  const patientName = profile.full_name || patient?.full_name || patient?.nickname || 'Paciente';
  const files = listFiles(patientId);
  const examCount = files.filter((f) => /exame|radio|panor|tomograf|foto/i.test(String(f.category || f.file_name || ''))).length;

  const alerts = [
    ...buildBudgetAlerts(patientId, appointmentId),
    ...buildFinancialAlerts(patientId),
    ...extractAnamnesisAlerts(patientId),
  ];
  if (examCount > 0) {
    alerts.push({ type: 'files', tone: 'info', text: `Possui ${examCount} exame(s) anexado(s).` });
  }

  const lastVisit = getLastVisit(patientId);
  if (lastVisit) {
    alerts.unshift({
      type: 'visit',
      tone: 'muted',
      text: `Última consulta finalizada em ${new Date(lastVisit.finishedAt || lastVisit.date).toLocaleDateString('pt-BR')}.`,
    });
  }

  const clinical = getClinicalData(appointmentId);
  const plannedCount = clinical?.plannedProcedures?.length || 0;
  if (plannedCount > 0) {
    alerts.push({
      type: 'planning',
      tone: 'info',
      text: `Tratamento em andamento: ${plannedCount} procedimento(s) planejado(s).`,
    });
  }

  const actions = resolveActions(patientId, appointmentId);
  const sideSummary = {
    budgetsCount: actions.overview.history.length,
    contractsCount: actions.overview.contracts.length,
    filesCount: files.length,
    pendingFinancial: getPatientDelinquencyInfo(patientId).openCount,
    financialStatus: getPatientDelinquencyInfo(patientId).statusLabel,
    currentBudgetStatus: actions.currentBudget?.status || null,
    plannedCount,
  };

  const header = {
    patientName,
    photoUrl: profile.photo_url || patient?.photo_url || '',
    age: calcAge(profile.birth_date || patient?.birth_date),
    phone: formatPhone(phone),
    professionalName: professional?.nomeCompleto || professional?.name || '—',
    roomName: room?.name || appointment.consultorioId || '—',
    scheduledDate: appointment.date,
    scheduledTime: `${formatTime(appointment.startTime)} – ${formatTime(appointment.endTime)}`,
    statusLabel: 'Em atendimento',
  };

  return {
    appointmentId,
    patientId,
    hasActiveSession: true,
    readOnly: false,
    header,
    alerts,
    actions,
    timeline: buildTimeline(patientId, appointmentId),
    intelligenceAlerts: buildIntelligenceAlerts(patientId),
    executiveSummary: buildPatientExecutiveSummary(patientId, header),
    files,
    sideSummary,
  };
}

export { CARE_INTELLIGENCE_FILTERS as CARE_CENTRAL_TIMELINE_FILTERS } from './patientCareTimelineService.js';

export function buildPatientCareContextByPatient(patientId) {
  const db = loadDb();
  const active = (db.appointments || []).find(
    (a) => a.patientId === patientId && a.status === APPOINTMENT_STATUS.EM_ATENDIMENTO,
  );
  if (active) {
    return { ...buildPatientCareContext(active.id), hasActiveSession: true, readOnly: false };
  }

  const latest = (db.appointments || [])
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];

  if (latest) {
    const ctx = buildPatientCareContext(latest.id);
    if (!ctx) return null;
    const statusLabels = {
      [APPOINTMENT_STATUS.FINALIZADO]: 'Atendimento finalizado',
      [APPOINTMENT_STATUS.ATENDIDO]: 'Atendido',
      [APPOINTMENT_STATUS.CANCELADO]: 'Cancelado',
      [APPOINTMENT_STATUS.AGENDADO]: 'Agendado',
    };
    const updatedHeader = {
      ...ctx.header,
      statusLabel: statusLabels[latest.status] || 'Sem atendimento ativo',
    };
    return {
      ...ctx,
      hasActiveSession: false,
      readOnly: true,
      header: updatedHeader,
      executiveSummary: buildPatientExecutiveSummary(patientId, updatedHeader),
      actions: {
        ...ctx.actions,
        showOpenClinical: false,
        showCreateNewBudget: false,
      },
    };
  }

  return buildPatientCareContextFromPatientOnly(patientId);
}

function buildPatientCareContextFromPatientOnly(patientId) {
  const bundle = getPatient(patientId);
  if (!bundle?.patient) return null;

  const { patient, phone } = bundle;
  const profile = patient.profile || patient;
  const patientName = profile.full_name || patient.full_name || patient.nickname || 'Paciente';
  const files = listFiles(patientId);
  const examCount = files.filter((f) => /exame|radio|panor|tomograf|foto/i.test(String(f.category || f.file_name || ''))).length;
  const overview = getPatientBudgetOverview(patientId);

  const alerts = [
    ...buildBudgetAlerts(patientId, null),
    ...buildFinancialAlerts(patientId),
    ...extractAnamnesisAlerts(patientId),
  ];
  if (examCount > 0) {
    alerts.push({ type: 'files', tone: 'info', text: `Possui ${examCount} exame(s) anexado(s).` });
  }

  const lastVisit = getLastVisit(patientId);
  if (lastVisit) {
    alerts.unshift({
      type: 'visit',
      tone: 'muted',
      text: `Última consulta finalizada em ${new Date(lastVisit.finishedAt || lastVisit.date).toLocaleDateString('pt-BR')}.`,
    });
  }

  const header = {
    patientName,
    photoUrl: profile.photo_url || patient.photo_url || '',
    age: calcAge(profile.birth_date || patient.birth_date),
    phone: formatPhone(phone),
    professionalName: '—',
    roomName: '—',
    scheduledDate: null,
    scheduledTime: '—',
    statusLabel: 'Sem atendimento ativo',
  };

  const latestApproved = getLatestApprovedBudget(patientId);
  const pendingDecision = findPendingDecisionBudget(patientId);
  const primaryBudget = shouldPreferPendingBudgetOverApproved(pendingDecision)
    ? pendingDecision
    : (latestApproved || pendingDecision || null);

  return {
    appointmentId: null,
    patientId,
    hasActiveSession: false,
    readOnly: true,
    header,
    alerts,
    actions: {
      showOpenClinical: false,
      showOpenExistingBudget: Boolean(primaryBudget),
      showCreateNewBudget: false,
      showViewContract: overview.contracts.length > 0 || Boolean(latestApproved?.hasContract),
      showFullChart: true,
      showExams: true,
      primaryBudgetId: primaryBudget?.id || null,
      primaryBudgetAppointmentId: primaryBudget?.appointmentId || null,
      latestApprovedBudget: latestApproved,
      pendingDecisionBudget: pendingDecision,
      currentBudget: null,
      overview,
    },
    timeline: buildTimeline(patientId, null),
    intelligenceAlerts: buildIntelligenceAlerts(patientId),
    executiveSummary: buildPatientExecutiveSummary(patientId, header),
    files,
    sideSummary: {
      budgetsCount: overview.history.length,
      contractsCount: overview.contracts.length,
      filesCount: files.length,
      pendingFinancial: getPatientDelinquencyInfo(patientId).openCount,
      financialStatus: getPatientDelinquencyInfo(patientId).statusLabel,
      currentBudgetStatus: null,
      plannedCount: 0,
    },
  };
}
