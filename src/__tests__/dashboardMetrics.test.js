import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  getDashboardMetrics,
  getDashboardChartData,
  getLocalDateKey,
} from '../services/dashboardMetricsService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { RECEIVABLE_STATUS } from '../services/receivablesService.js';

describe('dashboardMetricsService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
    });
  });

  it('soma recebimentos pagos no dia via receivablePayments', () => {
    const today = getLocalDateKey();

    withDb((db) => {
      db.receivablePayments = [{
        id: 'pay-1',
        tenant_id: 'tenant-1',
        receivable_id: 'recv-1',
        payment_date: today,
        amount_received: 1500,
        created_at: `${today}T15:00:00.000Z`,
      }];
      db.accountsReceivable = [{
        id: 'recv-1',
        tenant_id: 'tenant-1',
        status: RECEIVABLE_STATUS.PAID,
        net_amount: 1500,
        remaining_amount: 0,
        received_amount: 1500,
      }];
      db.appointments = [];
      db.clinicalAppointments = [];
    });

    const metrics = getDashboardMetrics();
    expect(metrics.dailyRevenue).toBe(1500);
    expect(metrics.monthlyRevenue).toBe(1500);
    expect(metrics.faturamentoHoje).toBe(1500);
  });

  it('não conta parcelas em aberto no faturamento', () => {
    const today = getLocalDateKey();

    withDb((db) => {
      db.accountsReceivable = [{
        id: 'recv-open',
        tenant_id: 'tenant-1',
        status: RECEIVABLE_STATUS.PENDING,
        due_date: today,
        net_amount: 5000,
        remaining_amount: 5000,
        received_amount: 0,
      }];
      db.receivablePayments = [];
      db.appointments = [];
      db.clinicalAppointments = [];
    });

    const metrics = getDashboardMetrics();
    expect(metrics.dailyRevenue).toBe(0);
    expect(metrics.monthlyRevenue).toBe(0);
  });

  it('conta orçamentos pendentes clínicos', () => {
    withDb((db) => {
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        budget: {
          id: 'budget-1',
          status: BUDGET_STATUS.RASCUNHO,
          totalValue: 3000,
        },
        plannedProcedures: [],
      }];
      db.appointments = [];
    });

    const metrics = getDashboardMetrics();
    expect(metrics.pendingBudgets).toBe(1);
    expect(metrics.orcamentosPendentes).toBe(1);
  });

  it('conta pacientes em tratamento com atendimento em andamento', () => {
    withDb((db) => {
      db.appointments = [{
        id: 'apt-1',
        tenant_id: 'tenant-1',
        patientId: 'p1',
        date: getLocalDateKey(),
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      }];
      db.clinicalAppointments = [];
    });

    const metrics = getDashboardMetrics();
    expect(metrics.patientsInTreatment).toBe(1);
  });

  it('conta atendimentos do dia por status', () => {
    const today = getLocalDateKey();

    withDb((db) => {
      db.appointments = [
        { id: 'a1', tenant_id: 'tenant-1', patientId: 'p1', date: today, status: APPOINTMENT_STATUS.CONFIRMADO },
        { id: 'a2', tenant_id: 'tenant-1', patientId: 'p2', date: today, status: APPOINTMENT_STATUS.EM_ATENDIMENTO },
        { id: 'a3', tenant_id: 'tenant-1', patientId: 'p3', date: today, status: APPOINTMENT_STATUS.FINALIZADO },
        { id: 'a4', tenant_id: 'tenant-1', patientId: 'p4', date: today, status: APPOINTMENT_STATUS.FALTOU },
        { id: 'a5', tenant_id: 'tenant-1', patientId: 'p5', date: today, status: APPOINTMENT_STATUS.CANCELADO },
      ];
      db.clinicalAppointments = [];
    });

    const metrics = getDashboardMetrics();
    expect(metrics.todayAppointments.total).toBe(3);
    expect(metrics.todayAppointments.scheduled).toBe(1);
    expect(metrics.todayAppointments.inProgress).toBe(1);
    expect(metrics.todayAppointments.finished).toBe(1);
    expect(metrics.todayAppointments.noShows).toBe(1);
  });

  it('getDashboardChartData reflete agendamentos, atendimentos e faturamento do dia', () => {
    const today = getLocalDateKey();
    const referenceDate = new Date(`${today}T12:00:00`);

    withDb((db) => {
      db.appointments = [
        {
          id: 'apt-scheduled',
          tenant_id: 'tenant-1',
          patientId: 'p1',
          date: today,
          status: APPOINTMENT_STATUS.AGENDADO,
        },
        {
          id: 'apt-finished',
          tenant_id: 'tenant-1',
          patientId: 'p2',
          date: today,
          status: APPOINTMENT_STATUS.FINALIZADO,
        },
        {
          id: 'apt-cancelled',
          tenant_id: 'tenant-1',
          patientId: 'p3',
          date: today,
          status: APPOINTMENT_STATUS.CANCELADO,
        },
      ];
      db.receivablePayments = [{
        id: 'pay-chart',
        tenant_id: 'tenant-1',
        receivable_id: 'recv-chart',
        payment_date: today,
        amount_received: 500,
        created_at: `${today}T18:00:00.000Z`,
      }];
      db.accountsReceivable = [{
        id: 'recv-chart',
        tenant_id: 'tenant-1',
        status: RECEIVABLE_STATUS.PAID,
        net_amount: 500,
        remaining_amount: 0,
        received_amount: 500,
      }];
      db.clinicalAppointments = [];
    });

    const chart = getDashboardChartData(7, referenceDate);
    const todayRow = chart.find((row) => row.date === today);

    expect(todayRow).toBeDefined();
    expect(todayRow.scheduled).toBe(2);
    expect(todayRow.attended).toBe(1);
    expect(todayRow.revenue).toBe(500);
  });

  it('getDashboardChartData não conta parcelas em aberto no faturamento', () => {
    const today = getLocalDateKey();
    const referenceDate = new Date(`${today}T12:00:00`);

    withDb((db) => {
      db.accountsReceivable = [{
        id: 'recv-open',
        tenant_id: 'tenant-1',
        status: RECEIVABLE_STATUS.PENDING,
        due_date: today,
        net_amount: 5000,
        remaining_amount: 5000,
        received_amount: 0,
      }];
      db.receivablePayments = [];
      db.appointments = [];
      db.clinicalAppointments = [];
    });

    const chart = getDashboardChartData(7, referenceDate);
    const todayRow = chart.find((row) => row.date === today);

    expect(todayRow?.revenue).toBe(0);
  });

  it('getDashboardChartData conta atendimento com status concluído', () => {
    const today = getLocalDateKey();
    const referenceDate = new Date(`${today}T12:00:00`);

    withDb((db) => {
      db.appointments = [{
        id: 'apt-concluido',
        tenant_id: 'tenant-1',
        patientId: 'p1',
        date: today,
        status: 'concluído',
      }];
      db.receivablePayments = [];
      db.clinicalAppointments = [];
    });

    const chart = getDashboardChartData(7, referenceDate);
    const todayRow = chart.find((row) => row.date === today);

    expect(todayRow?.scheduled).toBe(1);
    expect(todayRow?.attended).toBe(1);
  });
});
