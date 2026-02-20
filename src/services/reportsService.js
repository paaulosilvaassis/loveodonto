import { loadDb } from '../db/index.js';
import { getDelinquency } from './financeService.js';

export const getDashboardMetrics = () => {
  const db = loadDb();
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDate = new Date();
  upcomingDate.setDate(upcomingDate.getDate() + 7);
  const upcoming = upcomingDate.toISOString().slice(0, 10);

  const agendaHoje = db.appointments.filter((item) => item.date === today);
  const contasAVencer = db.transactions.filter(
    (txn) => txn.dueDate >= today && txn.dueDate <= upcoming && txn.status !== 'pago'
  );
  const inadimplencia = getDelinquency();
  const retornos = db.appointments.filter((item) => item.isReturn);

  const aniversariantes = db.patients.filter((patient) => {
    if (!patient.birthDate) return false;
    const [, month, day] = patient.birthDate.split('-');
    const [, monthNow, dayNow] = today.split('-');
    if (month !== monthNow) return false;
    return Number(day) >= Number(dayNow) && Number(day) <= Number(dayNow) + 7;
  });

  return {
    agendaHoje,
    contasAVencer,
    inadimplencia,
    retornos,
    aniversariantes,
  };
};

export const getInsights = () => {
  const db = loadDb();
  const totalAppointments = db.appointments.length;
  const faltas = db.appointments.filter((item) => item.status === 'faltou').length;
  const taxaFaltas = totalAppointments ? Number((faltas / totalAppointments).toFixed(2)) : 0;

  const procedimentos = (db.records || []).filter((item) => item.type === 'procedimento');
  const procedimentosMap = procedimentos.reduce((acc, record) => {
    const key = record.procedureName || 'Sem nome';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const receita = db.transactions
    .filter((txn) => txn.type === 'receber' && txn.status === 'pago')
    .reduce((sum, txn) => sum + txn.amount, 0);

  const ociosos = db.appointments.filter(
    (item) => item.status === 'cancelado' || item.status === 'faltou'
  ).length;

  return {
    taxaFaltas,
    ociosos,
    topProcedimentos: procedimentosMap,
    receita,
  };
};
