import { loadDb } from '../db/index.js';
import { getFaturamentoReport } from './faturamentoService.js';
import { listReceivables, RECEIVABLE_STATUS } from './receivablesService.js';
import { listFinancings, FINANCING_STATUS } from './financingsService.js';
import { listPayables, listStandaloneCashTransactions, getCategoryName } from './payablesService.js';
import { listCommissions, COMMISSION_STATUS } from './commissionCalculationService.js';

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

/** Mesma regra de `faturamentoService` (especialidade principal do colaborador). */
function specialtyFromCollaborator(collaborators, professionalId) {
  if (!professionalId) return '—';
  const c = collaborators.find((x) => x.id === professionalId);
  if (!c) return '—';
  const esp = Array.isArray(c.especialidades) && c.especialidades.length ? c.especialidades[0] : '';
  return (esp || c.cargo || '—').trim() || '—';
}

function inCompetenceDayRange(day, startDate, endDate) {
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

export function getDreReport(filters = {}) {
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

  const faturamento = getFaturamentoReport({
    startDate,
    endDate,
    professionalId,
    type: revenueType,
    status: '',
  });
  const recvById = new Map((Array.isArray(db.accountsReceivable) ? db.accountsReceivable : []).map((r) => [r.id, r]));
  let lines = (faturamento.lines || [])
    .filter((l) => matchSpecialty(l.specialty, specialty))
    .filter((l) => matchesUnit(l, unitId));
  if (costCenterId) {
    lines = lines.filter((l) => {
      if (!l.receivableId) return true;
      const r = recvById.get(l.receivableId);
      return r && String(r.cost_center_id || '') === String(costCenterId);
    });
  }

  const receitaBruta = { ...empty };
  const descontos = { ...empty };
  const estornos = { ...empty };

  lines.forEach((l) => {
    const m = monthKeyFrom(l.saleDateShort || l.saleDate || l.created_at);
    pushSeries(receitaBruta, m, l.totalAmount);
  });

  const receivables = listReceivables(professionalId ? { professionalId } : {})
    .filter((r) => !r.financing_id)
    .filter((_r) => revenueType !== 'financiamento')
    .filter((r) => matchesUnit(r, unitId))
    .filter((r) => !costCenterId || String(r.cost_center_id || '') === String(costCenterId))
    .filter((r) =>
      inCompetenceDayRange((r.created_at || r.issue_date || '').slice(0, 10), startDate, endDate)
    )
    .filter((r) =>
      matchSpecialty(specialtyFromCollaborator(collaborators, r.professional_id), specialty)
    );
  receivables.forEach((r) => {
    const comp = monthKeyFrom(r.created_at || r.issue_date);
    pushSeries(descontos, comp, r.discount_amount);
    if ([RECEIVABLE_STATUS.CANCELED, RECEIVABLE_STATUS.RENEGOTIATED].includes(r.status)) {
      pushSeries(estornos, comp, r.net_amount);
    }
  });

  const financings = listFinancings(professionalId ? { professional_id: professionalId } : {})
    .filter((f) => revenueType !== 'avista')
    .filter((f) => matchesUnit(f, unitId))
    .filter((f) =>
      matchSpecialty(specialtyFromCollaborator(collaborators, f.professional_id), specialty)
    )
    .filter((f) =>
      inCompetenceDayRange((f.created_at || f.issue_date || '').slice(0, 10), startDate, endDate)
    );
  financings.forEach((f) => {
    const comp = monthKeyFrom(f.created_at || f.issue_date);
    pushSeries(descontos, comp, f.discount_amount);
    if ([FINANCING_STATUS.CANCELED, FINANCING_STATUS.RENEGOTIATED].includes(f.status)) {
      pushSeries(estornos, comp, f.total_amount);
    }
  });

  const receitaLiquida = { ...empty };
  months.forEach((m) => {
    receitaLiquida[m] = receitaBruta[m] - descontos[m] - estornos[m];
  });

  const comDentista = { ...empty };
  const comComercial = { ...empty };
  const labCost = { ...empty };
  const matCost = { ...empty };
  const feeCost = { ...empty };
  const rentCost = { ...empty };
  const payrollCost = { ...empty };
  const marketingCost = { ...empty };
  const systemsCost = { ...empty };
  const adminCost = { ...empty };

  const commissions = listCommissions({
    startDate,
    endDate,
    ...(professionalId ? { professional_id: professionalId } : {}),
  })
    .filter((c) => c.status !== COMMISSION_STATUS.REVERSED)
    .filter((c) => {
      if (!costCenterId) return true;
      const cc = c.metadata?.cost_center_id;
      if (cc === undefined || cc === null || cc === '') return true;
      return String(cc) === String(costCenterId);
    })
    .filter((c) =>
      matchSpecialty(
        c.metadata?.specialty || specialtyFromCollaborator(collaborators, c.professional_id),
        specialty
      )
    );
  commissions.forEach((c) => {
    const m = monthKeyFrom(c.reference_date);
    if (lower(c.role) === 'comercial') pushSeries(comComercial, m, c.commission_amount);
    else pushSeries(comDentista, m, c.commission_amount);
  });

  listPayables({}).forEach((p) => {
    if (!matchesUnit(p, unitId)) return;
    const categoryName = getCategoryName(p.categoryId);
    const m = monthKeyFrom(p.paidDate || p.dueDate);
    if (!monthSet.has(m)) return;
    const amt = toNum(p.paidDate ? (p.amountPaid != null ? p.amountPaid : p.amount) : p.amount);
    const bucket = classifyExpenseLine(categoryName, p.description);
    if (bucket === 'lab') pushSeries(labCost, m, amt);
    else if (bucket === 'materials') pushSeries(matCost, m, amt);
    else if (bucket === 'fees') pushSeries(feeCost, m, amt);
    else if (bucket === 'rent') pushSeries(rentCost, m, amt);
    else if (bucket === 'payroll') pushSeries(payrollCost, m, amt);
    else if (bucket === 'marketing') pushSeries(marketingCost, m, amt);
    else if (bucket === 'systems') pushSeries(systemsCost, m, amt);
    else pushSeries(adminCost, m, amt);
  });

  listStandaloneCashTransactions({}).forEach((t) => {
    const m = monthKeyFrom(t.date || t.created_at);
    if (!monthSet.has(m)) return;
    const bucket = classifyExpenseLine('', t.description);
    if (bucket === 'lab') pushSeries(labCost, m, t.amount);
    else if (bucket === 'materials') pushSeries(matCost, m, t.amount);
    else if (bucket === 'fees') pushSeries(feeCost, m, t.amount);
    else if (bucket === 'marketing') pushSeries(marketingCost, m, t.amount);
    else if (bucket === 'systems') pushSeries(systemsCost, m, t.amount);
    else pushSeries(adminCost, m, t.amount);
  });

  const custosVariaveis = { ...empty };
  const custosFixos = { ...empty };
  const margemContribuicao = { ...empty };
  const resultadoOperacional = { ...empty };
  const lucroLiquido = { ...empty };

  months.forEach((m) => {
    custosVariaveis[m] = comDentista[m] + comComercial[m] + labCost[m] + matCost[m] + feeCost[m];
    margemContribuicao[m] = receitaLiquida[m] - custosVariaveis[m];
    custosFixos[m] = rentCost[m] + payrollCost[m] + marketingCost[m] + systemsCost[m] + adminCost[m];
    resultadoOperacional[m] = margemContribuicao[m] - custosFixos[m];
    lucroLiquido[m] = resultadoOperacional[m];
  });

  const total = (series) => sum(months.map((m) => series[m]));
  const receitaTotal = total(receitaBruta);
  const receitaLiquidaTotal = total(receitaLiquida);
  const custoTotal = total(custosVariaveis) + total(custosFixos);
  const lucroTotal = total(lucroLiquido);
  const margemPercent = receitaLiquidaTotal > 0 ? (lucroTotal / receitaLiquidaTotal) * 100 : 0;
  const margemContribuicaoPercent = receitaLiquidaTotal > 0 ? (total(margemContribuicao) / receitaLiquidaTotal) * 100 : 0;
  const breakEvenPoint = margemContribuicaoPercent > 0
    ? total(custosFixos) / (margemContribuicaoPercent / 100)
    : null;

  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const marginNow = lastMonth ? (receitaLiquida[lastMonth] > 0 ? (lucroLiquido[lastMonth] / receitaLiquida[lastMonth]) * 100 : 0) : 0;
  const marginPrev = prevMonth ? (receitaLiquida[prevMonth] > 0 ? (lucroLiquido[prevMonth] / receitaLiquida[prevMonth]) * 100 : 0) : 0;
  const marginDelta = marginNow - marginPrev;

  const bySpecMap = new Map();
  lines
    .filter((l) => l.countsInKpi)
    .forEach((l) => {
      const spec = l.specialty || '—';
      bySpecMap.set(spec, (bySpecMap.get(spec) || 0) + toNum(l.totalAmount));
    });
  const bySpecialty = [...bySpecMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, value]) => ({ name, value }));
  const topSpecialty = bySpecialty[0];
  const topSpecialtyPercent = receitaTotal > 0 ? (toNum(topSpecialty?.value) / receitaTotal) * 100 : 0;
  const commissionsTotal = total(comDentista) + total(comComercial);
  const commissionsPercent = receitaTotal > 0 ? (commissionsTotal / receitaTotal) * 100 : 0;

  const insights = [];
  if (months.length >= 2) insights.push(`Sua margem variou ${marginDelta.toFixed(1)} p.p. no último mês comparado ao anterior.`);
  if (topSpecialty?.name) insights.push(`${topSpecialty.name} representa ${topSpecialtyPercent.toFixed(1)}% da receita no período.`);
  insights.push(`Comissões representam ${commissionsPercent.toFixed(1)}% do faturamento bruto.`);

  const collaboratorName = (id) => {
    const c = collaborators.find((x) => x.id === id);
    return c ? (c.apelido || c.nomeCompleto || id) : (id || 'Sem profissional');
  };

  const commissionByProfessional = Object.values(
    commissions.reduce((acc, c) => {
      const key = c.professional_id || 'none';
      if (!acc[key]) acc[key] = { professional: collaboratorName(c.professional_id), value: 0 };
      acc[key].value += toNum(c.commission_amount);
      return acc;
    }, {})
  ).sort((a, b) => b.value - a.value);

  const commissionBySpecMap = new Map();
  commissions.forEach((c) => {
    const spec =
      c.metadata?.specialty || specialtyFromCollaborator(collaborators, c.professional_id) || '—';
    commissionBySpecMap.set(spec, (commissionBySpecMap.get(spec) || 0) + toNum(c.commission_amount));
  });
  const commissionBySpecialty = [...commissionBySpecMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([especialidade, value]) => ({ especialidade, value }));

  return {
    months: months.map((m) => ({ key: m, label: formatMonthLabel(m) })),
    series: {
      receitaBruta,
      descontos,
      estornos,
      receitaLiquida,
      comDentista,
      comComercial,
      labCost,
      matCost,
      feeCost,
      custosVariaveis,
      margemContribuicao,
      rentCost,
      payrollCost,
      marketingCost,
      systemsCost,
      adminCost,
      custosFixos,
      resultadoOperacional,
      lucroLiquido,
    },
    kpis: {
      receitaTotal,
      receitaLiquidaTotal,
      custoTotal,
      lucroTotal,
      margemPercent,
      breakEvenPoint,
    },
    charts: {
      lucroPorMes: months.map((m) => ({ month: m, value: lucroLiquido[m] })),
      receitaVsCusto: months.map((m) => ({ month: m, receita: receitaLiquida[m], custo: custosVariaveis[m] + custosFixos[m] })),
      margemPorMes: months.map((m) => ({ month: m, value: receitaLiquida[m] > 0 ? (lucroLiquido[m] / receitaLiquida[m]) * 100 : 0 })),
      receitaPorEspecialidade: bySpecialty,
    },
    details: {
      commissionByProfessional,
      commissionBySpecialty,
      receitaBySpecialty: bySpecialty,
      receitaByTreatment: lines.slice(0, 100).map((l) => ({ treatment: l.treatment, patient: l.patientName, amount: l.totalAmount })),
      receitaByPatient: Object.values(lines.reduce((acc, l) => {
        const key = l.patientId || l.patientName;
        if (!acc[key]) acc[key] = { patient: l.patientName, value: 0 };
        acc[key].value += toNum(l.totalAmount);
        return acc;
      }, {})).sort((a, b) => b.value - a.value).slice(0, 20),
    },
    insights,
  };
}
