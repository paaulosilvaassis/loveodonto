import { loadDb } from '../db/index.js';
import { listReceivables, RECEIVABLE_STATUS } from './receivablesService.js';
import {
  listPayables,
  listStandaloneCashTransactions,
  getCategoryName,
} from './payablesService.js';
import { listCommissions, COMMISSION_STATUS } from './commissionCalculationService.js';
import { listBoletoCharges, BOLETO_CHARGE_STATUS } from './boletoChargesService.js';
import { getCashSummaryForDate } from './cashRegisterService.js';

const BR_MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });

const FIXED_CATEGORY_KEYWORDS = ['aluguel', 'salario', 'folha', 'marketing', 'sistema', 'internet', 'energia', 'administr'];
const VARIABLE_LAB_KEYWORDS = ['laboratorio', 'protetico', 'protese', 'laboratório'];
const VARIABLE_SUPPLY_KEYWORDS = ['material', 'clinico', 'clínico', 'odontologico', 'odontológico'];
const VARIABLE_FEE_KEYWORDS = ['taxa', 'juros', 'maquininha', 'cartao', 'cartão', 'boleto'];

const sum = (arr) => arr.reduce((s, n) => s + Number(n || 0), 0);
const toNum = (v) => Number(v || 0);
const monthKeyFrom = (iso) => String(iso || '').slice(0, 7);
const lower = (v) => String(v || '').trim().toLowerCase();

function buildMonthKeys(startDate, endDate) {
  const s = String(startDate || '');
  const e = String(endDate || '');
  if (!s || !e || s > e) return [];
  const [sy, sm] = s.slice(0, 7).split('-').map(Number);
  const [ey, em] = e.slice(0, 7).split('-').map(Number);
  const out = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function formatMonthLabel(month) {
  const d = new Date(`${month}-01T12:00:00`);
  return BR_MONTH.format(d).replace('.', '');
}

function initSeries(months) {
  return months.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
}

function pushSeries(series, month, value) {
  if (!month || !(month in series)) return;
  series[month] += toNum(value);
}

function matchSpecialty(itemSpecialty, filterSpecialty) {
  if (!filterSpecialty) return true;
  return lower(itemSpecialty) === lower(filterSpecialty);
}

function matchesUnit(obj, unitId) {
  if (!unitId) return true;
  return (obj?.clinic_unit_id || obj?.unit_id || '') === unitId;
}

function specialtyFromCollaborator(collaborators, professionalId) {
  if (!professionalId) return '—';
  const c = collaborators.find((x) => x.id === professionalId);
  if (!c) return '—';
  const esp = Array.isArray(c.especialidades) && c.especialidades.length ? c.especialidades[0] : '';
  return (esp || c.cargo || '—').trim() || '—';
}

function inDayRange(day, startDate, endDate) {
  const d = String(day || '').slice(0, 10);
  if (!d) return false;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

function classifyExpenseLine(categoryName, description) {
  const txt = `${lower(categoryName)} ${lower(description)}`;
  if (VARIABLE_LAB_KEYWORDS.some((k) => txt.includes(k))) return 'lab';
  if (VARIABLE_SUPPLY_KEYWORDS.some((k) => txt.includes(k))) return 'materials';
  if (VARIABLE_FEE_KEYWORDS.some((k) => txt.includes(k))) return 'fees';
  if (FIXED_CATEGORY_KEYWORDS.some((k) => txt.includes(k))) {
    if (txt.includes('aluguel')) return 'rent';
    if (txt.includes('salario') || txt.includes('folha')) return 'payroll';
    if (txt.includes('marketing')) return 'marketing';
    if (txt.includes('sistema') || txt.includes('internet')) return 'systems';
    return 'admin';
  }
  return 'admin';
}

function matchCostCenter(receivable, costCenterId) {
  if (!costCenterId) return true;
  return String(receivable?.cost_center_id || '') === String(costCenterId);
}

function receivableMatchesFilters(r, { unitId, professionalId, specialty, revenueType, costCenterId }, collaborators) {
  if (!matchesUnit(r, unitId)) return false;
  if (professionalId && r.professional_id !== professionalId) return false;
  if (!matchSpecialty(specialtyFromCollaborator(collaborators, r.professional_id), specialty)) return false;
  if (revenueType === 'avista' && r.financing_id) return false;
  if (revenueType === 'financiamento' && !r.financing_id) return false;
  if (!matchCostCenter(r, costCenterId)) return false;
  return true;
}

/** DRE regime de caixa: entradas e saídas pela data de movimento efetivo. */
export function getDreCashBasisReport(filters = {}) {
  const db = loadDb();
  const {
    startDate = '',
    endDate = '',
    unitId = '',
    professionalId = '',
    specialty = '',
    revenueType = '',
    costCenterId = '',
  } = filters;

  const months = buildMonthKeys(startDate, endDate);
  const monthSet = new Set(months);
  const empty = initSeries(months);
  const collaborators = Array.isArray(db.collaborators) ? db.collaborators : [];

  const receivableList = listReceivables({});
  const recvMap = new Map(receivableList.map((r) => [r.id, r]));
  const payments = Array.isArray(db.receivablePayments) ? db.receivablePayments : [];

  const recebimentosAvista = { ...empty };
  const recebimentosParcelas = { ...empty };
  const financiamentosRecebidos = { ...empty };
  const boletosPagos = { ...empty };
  const outrosRecebimentos = { ...empty };

  payments.forEach((p) => {
    const payDay = String(p.payment_date || '').slice(0, 10);
    if (!inDayRange(payDay, startDate, endDate)) return;
    const r = recvMap.get(p.receivable_id);
    if (!r || !receivableMatchesFilters(r, { unitId, professionalId, specialty, revenueType, costCenterId }, collaborators)) return;
    const mk = monthKeyFrom(payDay);
    if (!monthSet.has(mk)) return;
    const amt = toNum(p.amount_received);
    if (!r.financing_id) pushSeries(recebimentosAvista, mk, amt);
    else if (Number(r.installment_number || 0) === 0) pushSeries(financiamentosRecebidos, mk, amt);
    else pushSeries(recebimentosParcelas, mk, amt);
  });

  const boletos = listBoletoCharges({});
  boletos
    .filter((b) => b.status === BOLETO_CHARGE_STATUS.PAID && b.paid_at)
    .forEach((b) => {
      const paidDay = String(b.paid_at).slice(0, 10);
      if (!inDayRange(paidDay, startDate, endDate)) return;
      const r = b.receivable_id ? recvMap.get(b.receivable_id) : null;
      if (r && !receivableMatchesFilters(r, { unitId, professionalId, specialty, revenueType, costCenterId }, collaborators)) return;
      if (!r && (professionalId || unitId || specialty || revenueType || costCenterId)) return;
      const mk = monthKeyFrom(paidDay);
      if (!monthSet.has(mk)) return;
      pushSeries(boletosPagos, mk, toNum(b.amount));
    });

  const entradasTotal = { ...empty };
  months.forEach((m) => {
    entradasTotal[m] =
      recebimentosAvista[m] +
      recebimentosParcelas[m] +
      financiamentosRecebidos[m] +
      outrosRecebimentos[m];
  });

  const comissoesPagas = { ...empty };
  const laboratorioPago = { ...empty };
  const materiaisPago = { ...empty };
  const taxasPago = { ...empty };
  const despesasFixasPagas = { ...empty };
  const pagamentosAvulsos = { ...empty };

  listCommissions({})
    .filter((c) => c.status === COMMISSION_STATUS.PAID)
    .forEach((c) => {
      const payDay = String(c.payment_date || c.reference_date || '').slice(0, 10);
      if (!inDayRange(payDay, startDate, endDate)) return;
      if (professionalId && c.professional_id !== professionalId) return;
      if (!matchSpecialty(c.metadata?.specialty || specialtyFromCollaborator(collaborators, c.professional_id), specialty)) return;
      if (costCenterId) {
        const cc = c.metadata?.cost_center_id;
        if (cc !== undefined && cc !== null && cc !== '' && String(cc) !== String(costCenterId)) return;
      }
      const mk = monthKeyFrom(payDay);
      if (!monthSet.has(mk)) return;
      pushSeries(comissoesPagas, mk, toNum(c.commission_amount));
    });

  listPayables({}).forEach((p) => {
    const paidDay = String(p.paidDate || '').slice(0, 10);
    if (!paidDay || !inDayRange(paidDay, startDate, endDate)) return;
    if (!matchesUnit(p, unitId)) return;
    const mk = monthKeyFrom(paidDay);
    if (!monthSet.has(mk)) return;
    const amt = toNum(p.amountPaid != null ? p.amountPaid : p.amount);
    const categoryName = getCategoryName(p.categoryId);
    const bucket = classifyExpenseLine(categoryName, p.description);
    if (bucket === 'lab') pushSeries(laboratorioPago, mk, amt);
    else if (bucket === 'materials') pushSeries(materiaisPago, mk, amt);
    else if (bucket === 'fees') pushSeries(taxasPago, mk, amt);
    else pushSeries(despesasFixasPagas, mk, amt);
  });

  listStandaloneCashTransactions({}).forEach((t) => {
    const d = String(t.date || t.created_at || '').slice(0, 10);
    if (!inDayRange(d, startDate, endDate)) return;
    const mk = monthKeyFrom(d);
    if (!monthSet.has(mk)) return;
    pushSeries(pagamentosAvulsos, mk, toNum(t.amount));
  });

  const saidasTotal = { ...empty };
  const saldoOperacional = { ...empty };
  const saldoAcumulado = { ...empty };
  let run = 0;
  months.forEach((m) => {
    saidasTotal[m] =
      comissoesPagas[m] +
      laboratorioPago[m] +
      materiaisPago[m] +
      taxasPago[m] +
      despesasFixasPagas[m] +
      pagamentosAvulsos[m];
    saldoOperacional[m] = entradasTotal[m] - saidasTotal[m];
    run += saldoOperacional[m];
    saldoAcumulado[m] = run;
  });

  const totalIn = totalSeries(entradasTotal, months);
  const totalOut = totalSeries(saidasTotal, months);
  const totalBoletos = totalSeries(boletosPagos, months);
  const variacaoCaixa =
    months.length >= 2
      ? saldoOperacional[months[months.length - 1]] - saldoOperacional[months[months.length - 2]]
      : 0;

  const insights = [];
  insights.push(
    'Totais de entrada consideram apenas baixas em títulos (recebimentos). Boletos pagos aparecem como referência e podem coincidir com essas baixas.'
  );
  if (months.length >= 2) {
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    if (saldoOperacional[last] < saldoOperacional[prev]) {
      insights.push('O saldo operacional de caixa caiu no último mês da série.');
    }
  }
  if (totalIn > 0 && totalOut > totalIn * 1.05) {
    insights.push('Saídas realizadas superam entradas no período selecionado.');
  }

  return {
    months: months.map((m) => ({ key: m, label: formatMonthLabel(m) })),
    series: {
      recebimentosAvista,
      recebimentosParcelas,
      financiamentosRecebidos,
      boletosPagos,
      outrosRecebimentos,
      entradasTotal,
      comissoesPagas,
      laboratorioPago,
      materiaisPago,
      taxasPago,
      despesasFixasPagas,
      pagamentosAvulsos,
      saidasTotal,
      saldoOperacional,
      saldoAcumulado,
    },
    kpis: {
      entradasTotal: totalIn,
      saidasTotal: totalOut,
      saldoPeriodo: totalIn - totalOut,
      saldoFinalAcumulado: run,
      boletosPagosRef: totalBoletos,
      variacaoCaixa,
    },
    charts: {
      entradasVsSaidas: months.map((m) => ({
        month: m,
        entradas: entradasTotal[m],
        saidas: saidasTotal[m],
      })),
      fluxoCaixa: months.map((m) => ({ month: m, saldo: saldoOperacional[m], acumulado: saldoAcumulado[m] })),
    },
    insights,
  };
}

function totalSeries(series, months) {
  return sum(months.map((m) => series[m]));
}

function liquidityBand(ratio) {
  if (ratio >= 1.15) return { key: 'healthy', label: 'Saudável' };
  if (ratio >= 0.85) return { key: 'attention', label: 'Atenção' };
  return { key: 'critical', label: 'Crítico' };
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Indicadores de liquidez em data de referência (fim do período ou hoje). */
export function getDreLiquidityReport(filters = {}) {
  const db = loadDb();
  const {
    endDate = '',
    unitId = '',
    professionalId = '',
    specialty = '',
    costCenterId = '',
  } = filters;

  const today = new Date().toISOString().slice(0, 10);
  const refDate = endDate && endDate < today ? endDate : today;
  const collaborators = Array.isArray(db.collaborators) ? db.collaborators : [];

  const cash = getCashSummaryForDate(refDate);
  const disponivel = toNum(cash.currentBalance);

  const receivableList = listReceivables({});
  const activeRecv = receivableList.filter((r) =>
    ![RECEIVABLE_STATUS.CANCELED, RECEIVABLE_STATUS.RENEGOTIATED].includes(r.status)
  );

  const inShortWindow = (dueIso, days) => {
    const d = String(dueIso || '').slice(0, 10);
    if (!d) return false;
    return d >= refDate && d <= addDaysIso(refDate, days);
  };

  let receber7 = 0;
  let receber30 = 0;
  activeRecv.forEach((r) => {
    if (!matchesUnit(r, unitId)) return;
    if (professionalId && r.professional_id !== professionalId) return;
    if (!matchSpecialty(specialtyFromCollaborator(collaborators, r.professional_id), specialty)) return;
    if (!matchCostCenter(r, costCenterId)) return;
    const rem = toNum(r.remaining_amount);
    if (rem <= 0) return;
    if (inShortWindow(r.due_date, 7)) receber7 += rem;
    if (inShortWindow(r.due_date, 30)) receber30 += rem;
  });

  let pagar7 = 0;
  let pagar30 = 0;
  listPayables({}).forEach((p) => {
    if (p.paidDate) return;
    if (!matchesUnit(p, unitId)) return;
    const due = String(p.dueDate || '').slice(0, 10);
    const amt = toNum(p.amount);
    if (inShortWindow(due, 7)) pagar7 += amt;
    if (inShortWindow(due, 30)) pagar30 += amt;
  });

  const obrigacoesImediatas = Math.max(pagar7, 0.01);
  const obrigacoes30 = Math.max(pagar30, 0.01);
  const liquidezImediata = disponivel / obrigacoesImediatas;
  const liquidezCorrenteSimpl = (disponivel + receber30) / obrigacoes30;
  const cobertura7 = (disponivel + receber7) / obrigacoesImediatas;
  const cobertura30 = (disponivel + receber30) / obrigacoes30;
  const saldoProjetado30 = disponivel + receber30 - pagar30;

  const bandImediata = liquidityBand(cobertura7);
  const band30 = liquidityBand(cobertura30);

  const upcomingsReceivables = activeRecv
    .filter((r) => matchesUnit(r, unitId) && matchCostCenter(r, costCenterId))
    .filter((r) => !professionalId || r.professional_id === professionalId)
    .filter((r) => matchSpecialty(specialtyFromCollaborator(collaborators, r.professional_id), specialty))
    .filter((r) => toNum(r.remaining_amount) > 0 && inShortWindow(r.due_date, 30))
    .map((r) => ({
      tipo: 'A receber',
      descricao: (r.description || '').slice(0, 80) || r.id,
      vencimento: r.due_date,
      valor: toNum(r.remaining_amount),
    }))
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    .slice(0, 15);

  const upcomingsPayables = listPayables({})
    .filter((p) => !p.paidDate && matchesUnit(p, unitId))
    .filter((p) => toNum(p.amount) > 0 && inShortWindow(p.dueDate, 30))
    .map((p) => ({
      tipo: 'A pagar',
      descricao: (p.description || '').slice(0, 80) || p.id,
      vencimento: p.dueDate,
      valor: toNum(p.amount),
    }))
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
    .slice(0, 15);

  const insights = [];
  if (cobertura30 < 1) {
    insights.push('A clínica não cobre integralmente as obrigações dos próximos 30 dias com disponível + recebíveis do período.');
  } else if (cobertura30 < 1.15) {
    insights.push('Cobertura de 30 dias está em faixa de atenção; monitore vencimentos.');
  }
  if (disponivel < pagar7 && pagar7 > 0) {
    insights.push('Saldo disponível na data de referência é inferior ao volume a pagar em 7 dias.');
  }
  if (liquidezImediata >= 1.15) {
    insights.push('Liquidez imediata na faixa saudável em relação às obrigações da semana.');
  }

  return {
    refDate,
    kpis: {
      disponivel,
      receberCurto: receber30,
      pagarCurto: pagar30,
      liquidezImediata,
      liquidezCorrenteSimpl,
      cobertura7,
      cobertura30,
      saldoProjetado30,
    },
    bands: {
      imediata: bandImediata,
      trinta: band30,
    },
    charts: {
      coberturaBarras: [
        { name: '7 dias', ratio: cobertura7, disponivel, obrigacoes: pagar7, receber: receber7 },
        { name: '30 dias', ratio: cobertura30, disponivel, obrigacoes: pagar30, receber: receber30 },
      ],
      projecao: [
        { etapa: 'Hoje', saldo: disponivel },
        { etapa: '+ Recebíveis 30d', saldo: disponivel + receber30 },
        { etapa: '− Pagáveis 30d', saldo: saldoProjetado30 },
      ],
      liquidezGauge: [
        { name: 'Imediata', value: Math.min(liquidezImediata, 2) },
        { name: 'Corrente s.', value: Math.min(liquidezCorrenteSimpl, 2) },
      ],
    },
    details: {
      ativosPassivos: [
        { label: 'Disponível (caixa ref.)', valor: disponivel, grupo: 'ativo' },
        { label: 'A receber (30 dias)', valor: receber30, grupo: 'ativo' },
        { label: 'A pagar (30 dias)', valor: pagar30, grupo: 'passivo' },
      ],
      vencimentos: [...upcomingsReceivables, ...upcomingsPayables].sort((a, b) =>
        String(a.vencimento).localeCompare(String(b.vencimento))
      ),
    },
    insights,
  };
}
