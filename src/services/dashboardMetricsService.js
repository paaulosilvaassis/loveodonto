import { loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { BUDGET_STATUS as CRM_BUDGET_STATUS } from './crmBudgetService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';

const PENDING_CLINICAL_BUDGET_STATUSES = new Set([
  BUDGET_STATUS.RASCUNHO,
  BUDGET_STATUS.ENVIADO,
  BUDGET_STATUS.NEGOCIACAO,
]);

const EXCLUDED_APPOINTMENT_STATUSES = new Set([
  APPOINTMENT_STATUS.CANCELADO,
  APPOINTMENT_STATUS.REAGENDAR,
]);

const TODAY_APPOINTMENT_STATUSES = new Set([
  APPOINTMENT_STATUS.AGENDADO,
  APPOINTMENT_STATUS.EM_CONFIRMACAO,
  APPOINTMENT_STATUS.CONFIRMADO,
  APPOINTMENT_STATUS.CHEGOU,
  APPOINTMENT_STATUS.EM_ESPERA,
  APPOINTMENT_STATUS.CHAMADO,
  APPOINTMENT_STATUS.EM_ATENDIMENTO,
  APPOINTMENT_STATUS.FINALIZADO,
  APPOINTMENT_STATUS.ATENDIDO,
  APPOINTMENT_STATUS.ATRASADO,
]);

const SCHEDULED_STATUSES = new Set([
  APPOINTMENT_STATUS.AGENDADO,
  APPOINTMENT_STATUS.EM_CONFIRMACAO,
  APPOINTMENT_STATUS.CONFIRMADO,
  APPOINTMENT_STATUS.ATRASADO,
]);

const IN_PROGRESS_STATUSES = new Set([
  APPOINTMENT_STATUS.CHEGOU,
  APPOINTMENT_STATUS.EM_ESPERA,
  APPOINTMENT_STATUS.CHAMADO,
  APPOINTMENT_STATUS.EM_ATENDIMENTO,
]);

const FINISHED_STATUSES = new Set([
  APPOINTMENT_STATUS.FINALIZADO,
  APPOINTMENT_STATUS.ATENDIDO,
]);

const ATTENDED_STATUS_ALIASES = new Set([
  'concluido',
  'concluído',
]);

const PAID_TRANSACTION_STATUSES = new Set([
  'pago',
  'recebido',
  'paid',
  'received',
  'quitado',
]);

const ACTIVE_CONTRACT_STATUSES = new Set([
  CONTRACT_STATUS.DRAFT,
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED,
]);

const ACTIVE_BUDGET_STATUSES = new Set([
  BUDGET_STATUS.APROVADO,
  BUDGET_STATUS.CONTRATO_GERADO,
  BUDGET_STATUS.NEGOCIACAO,
]);

/** Data local YYYY-MM-DD (fuso do navegador / Brasil). */
export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthRange(referenceDate = new Date()) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  return {
    start: getLocalDateKey(start),
    end: getLocalDateKey(end),
  };
}

function normalizeDateKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return getLocalDateKey(parsed);
}

function isDateInRange(dateKey, start, end) {
  if (!dateKey) return false;
  return dateKey >= start && dateKey <= end;
}

function resolvePaymentDateKey(payment) {
  return normalizeDateKey(
    payment.payment_date
    || payment.paymentDate
    || payment.received_at
    || payment.paid_at
    || payment.paidDate
    || payment.created_at,
  );
}

function isAttendedStatus(status) {
  if (FINISHED_STATUSES.has(status)) return true;
  return ATTENDED_STATUS_ALIASES.has(String(status || '').toLowerCase());
}

function getAppointmentsForDate(db, dateStr) {
  return (db.appointments || []).filter(
    (apt) => normalizeDateKey(apt.date) === dateStr,
  );
}

function countScheduledAppointments(db, dateStr) {
  return getAppointmentsForDate(db, dateStr).filter(
    (apt) => !EXCLUDED_APPOINTMENT_STATUSES.has(apt.status),
  ).length;
}

function countAttendedAppointments(db, dateStr) {
  return getAppointmentsForDate(db, dateStr).filter(
    (apt) => isAttendedStatus(apt.status),
  ).length;
}

function sumReceivedPayments(db, startDate, endDate) {
  let total = 0;

  for (const payment of db.receivablePayments || []) {
    const dateKey = resolvePaymentDateKey(payment);
    if (!isDateInRange(dateKey, startDate, endDate)) continue;
    total += Number(payment.amount_received || payment.amountReceived || payment.amount || 0);
  }

  for (const txn of db.transactions || []) {
    if (txn.type !== 'receber') continue;
    const status = String(txn.status || '').toLowerCase();
    if (!PAID_TRANSACTION_STATUSES.has(status)) continue;
    const dateKey = normalizeDateKey(
      txn.paidDate || txn.payment_date || txn.paid_at || txn.received_at || txn.updatedAt,
    );
    if (!isDateInRange(dateKey, startDate, endDate)) continue;
    total += Number(txn.amount || txn.value || 0);
  }

  for (const txn of db.cashTransactions || []) {
    const type = String(txn.type || '').toLowerCase();
    if (!['income', 'entrada', 'receita', 'recebimento'].includes(type)) continue;
    const dateKey = normalizeDateKey(
      txn.date || txn.payment_date || txn.paid_at || txn.received_at || txn.created_at,
    );
    if (!isDateInRange(dateKey, startDate, endDate)) continue;
    total += Number(txn.amount || txn.value || 0);
  }

  return total;
}

function countPendingBudgets(db) {
  const seen = new Set();
  let count = 0;

  for (const row of db.clinicalAppointments || []) {
    const budget = row.budget;
    if (!budget?.id) continue;
    if (budget.status === BUDGET_STATUS.HISTORICO) continue;
    if (!PENDING_CLINICAL_BUDGET_STATUSES.has(budget.status)) continue;
    if (seen.has(budget.id)) continue;
    seen.add(budget.id);
    count += 1;
  }

  for (const budget of db.crmBudgets || []) {
    if (budget.status !== CRM_BUDGET_STATUS.EM_ANALISE) continue;
    const key = budget.id || `${budget.patientId}-${budget.createdAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }

  return count;
}

function resolvePatientIdFromClinicalRow(row, db) {
  if (row.patientId) return row.patientId;
  const apt = (db.appointments || []).find((a) => a.id === row.appointmentId);
  return apt?.patientId || null;
}

function countPatientsInTreatment(db) {
  const patientIds = new Set();

  for (const apt of db.appointments || []) {
    if (!apt.patientId) continue;
    if (apt.status === APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      patientIds.add(apt.patientId);
    }
  }

  for (const contract of db.generatedContracts || []) {
    if (!contract.patientId) continue;
    if (!ACTIVE_CONTRACT_STATUSES.has(contract.status)) continue;
    patientIds.add(contract.patientId);
  }

  for (const row of db.clinicalAppointments || []) {
    const patientId = resolvePatientIdFromClinicalRow(row, db);
    if (!patientId) continue;

    const planned = row.plannedProcedures || [];
    const hasPendingProcedures = planned.some(
      (proc) => !['concluido', 'concluído', 'realizado', 'cancelado'].includes(String(proc.status || '').toLowerCase()),
    );
    if (hasPendingProcedures || planned.length > 0) {
      patientIds.add(patientId);
    }

    const budget = row.budget;
    if (budget && ACTIVE_BUDGET_STATUSES.has(budget.status) && budget.status !== BUDGET_STATUS.HISTORICO) {
      patientIds.add(patientId);
    }
  }

  return patientIds.size;
}

function buildTodayAppointments(db, today) {
  const todayList = getAppointmentsForDate(db, today);

  let scheduled = 0;
  let inProgress = 0;
  let finished = 0;
  let noShows = 0;
  let total = 0;

  for (const apt of todayList) {
    if (EXCLUDED_APPOINTMENT_STATUSES.has(apt.status)) continue;

    if (apt.status === APPOINTMENT_STATUS.FALTOU) {
      noShows += 1;
      continue;
    }

    if (!TODAY_APPOINTMENT_STATUSES.has(apt.status)) continue;

    total += 1;
    if (SCHEDULED_STATUSES.has(apt.status)) scheduled += 1;
    if (IN_PROGRESS_STATUSES.has(apt.status)) inProgress += 1;
    if (isAttendedStatus(apt.status)) finished += 1;
  }

  const pacientesEmEspera = todayList.filter(
    (apt) => apt.date === today && SCHEDULED_STATUSES.has(apt.status),
  ).length;

  return {
    total,
    scheduled,
    inProgress,
    finished,
    noShows,
    pacientesEmEspera,
  };
}

/**
 * Métricas principais do Dashboard operacional.
 * @param {Date} [referenceDate]
 */
export function getDashboardMetrics(referenceDate = new Date()) {
  const db = loadDb();
  const today = getLocalDateKey(referenceDate);
  const monthRange = getMonthRange(referenceDate);
  const todayAppointments = buildTodayAppointments(db, today);

  const dailyRevenue = sumReceivedPayments(db, today, today);
  const monthlyRevenue = sumReceivedPayments(db, monthRange.start, monthRange.end);
  const pendingBudgets = countPendingBudgets(db);
  const patientsInTreatment = countPatientsInTreatment(db);

  return {
    todayAppointments,
    dailyRevenue,
    monthlyRevenue,
    pendingBudgets,
    patientsInTreatment,
    // aliases legados usados na UI
    atendimentosHoje: todayAppointments.total,
    faturamentoHoje: dailyRevenue,
    faturamentoMes: monthlyRevenue,
    orcamentosPendentes: pendingBudgets,
    pacientesEmTratamento: patientsInTreatment,
    pacientesEmEspera: todayAppointments.pacientesEmEspera,
    consultasHoje: todayAppointments.total,
  };
}

/**
 * Série dos últimos N dias para o gráfico do dashboard.
 * @param {number} [days=7]
 * @param {Date} [referenceDate]
 * @returns {Array<{ date: string, label: string, scheduled: number, attended: number, revenue: number }>}
 */
export function getDashboardChartData(days = 7, referenceDate = new Date()) {
  const db = loadDb();
  const result = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() - offset,
    );
    const dateStr = getLocalDateKey(date);
    const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    const scheduled = countScheduledAppointments(db, dateStr);
    const attended = countAttendedAppointments(db, dateStr);
    const revenue = Math.round(sumReceivedPayments(db, dateStr, dateStr) * 100) / 100;

    result.push({
      date: dateStr,
      label,
      scheduled,
      attended,
      revenue,
    });
  }

  return result;
}

/** Alias legado com chaves em português para compatibilidade com a UI. */
export function getDashboardWeeklyChart(days = 7, referenceDate = new Date()) {
  return getDashboardChartData(days, referenceDate).map((row) => ({
    date: row.date,
    label: row.label,
    agendados: row.scheduled,
    atendidos: row.attended,
    faturamento: row.revenue,
    scheduled: row.scheduled,
    attended: row.attended,
    revenue: row.revenue,
  }));
}
