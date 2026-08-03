/**
 * Relatório de faturamento (produção / valor contratado), sem duplicar lógica de recebimento.
 * Fontes: financings (valor total do contrato) e accountsReceivable sem vínculo de financiamento.
 */
import { loadDb } from '../db/index.js';
import { listFinancings } from './financingsService.js';
import { listReceivables, RECEIVABLE_ORIGIN_TYPE, RECEIVABLE_STATUS } from './receivablesService.js';
import { FINANCING_STATUS } from './auditEventCatalog.js';

/** Status que não entram no faturamento líquido (KPIs e gráficos). */
const FINANCING_EXCLUDED_FROM_KPI = new Set([
  FINANCING_STATUS.CANCELED,
  FINANCING_STATUS.RENEGOTIATED,
  FINANCING_STATUS.DRAFT,
  FINANCING_STATUS.PENDING_ANALYSIS,
]);

function saleDay(iso) {
  return (iso || '').slice(0, 10);
}

function inDateRange(day, startDate, endDate) {
  if (!day) return !(startDate || endDate);
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

function patientName(patients, id) {
  const p = patients.find((x) => x.id === id);
  return (p?.full_name || p?.name || '—').trim() || '—';
}

function professionalLabel(collaborators, id) {
  if (!id) return '—';
  const c = collaborators.find((x) => x.id === id);
  if (!c) return String(id);
  return (c.apelido || c.nomeCompleto || '').trim() || String(id);
}

function specialtyFromCollaborator(collaborators, professionalId) {
  if (!professionalId) return '—';
  const c = collaborators.find((x) => x.id === professionalId);
  if (!c) return '—';
  const esp = Array.isArray(c.especialidades) && c.especialidades.length ? c.especialidades[0] : '';
  return (esp || c.cargo || '—').trim() || '—';
}

function mapDisplayStatus(kind, rawStatus) {
  if (kind === 'financiamento') {
    if (rawStatus === FINANCING_STATUS.CANCELED) return 'cancelado';
    if (rawStatus === FINANCING_STATUS.RENEGOTIATED) return 'renegociado';
    return 'ativo';
  }
  if (rawStatus === RECEIVABLE_STATUS.CANCELED) return 'cancelado';
  if (rawStatus === RECEIVABLE_STATUS.RENEGOTIATED) return 'renegociado';
  return 'ativo';
}

function buildChartData(kpiLines) {
  const byPeriod = new Map();
  const byProfessional = new Map();
  const bySpecialty = new Map();
  const byTipo = [
    { tipo: 'À vista', value: 0 },
    { tipo: 'Financiamento', value: 0 },
  ];

  for (const l of kpiLines) {
    const month = (l.saleDateShort || '').slice(0, 7);
    if (month) {
      byPeriod.set(month, (byPeriod.get(month) || 0) + l.totalAmount);
    }
    const prof = l.professionalName || '—';
    byProfessional.set(prof, (byProfessional.get(prof) || 0) + l.totalAmount);
    const spec = l.specialty || '—';
    bySpecialty.set(spec, (bySpecialty.get(spec) || 0) + l.totalAmount);
    if (l.kind === 'avista') byTipo[0].value += l.totalAmount;
    else byTipo[1].value += l.totalAmount;
  }

  const byPeriodArr = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, valor]) => ({ periodo, valor }));

  const byProfessionalArr = [...byProfessional.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([profissional, valor]) => ({ profissional, valor }));

  const bySpecialtyArr = [...bySpecialty.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([especialidade, valor]) => ({ especialidade, valor }));

  return {
    byPeriod: byPeriodArr,
    byProfessional: byProfessionalArr,
    bySpecialty: bySpecialtyArr,
    byTipo,
  };
}

/**
 * @param {object} filters
 * @param {string} [filters.startDate] YYYY-MM-DD (created_at)
 * @param {string} [filters.endDate]
 * @param {string} [filters.patientId]
 * @param {string} [filters.professionalId]
 * @param {string} [filters.type] '' | 'avista' | 'financiamento'
 * @param {string} [filters.status] '' | 'ativo' | 'cancelado' | 'renegociado'
 * @param {string|number} [filters.minValue]
 * @param {string|number} [filters.maxValue]
 */
export function getFaturamentoReport(filters = {}) {
  const db = loadDb();
  const patients = db.patients || [];
  const collaborators = db.collaborators || [];

  const {
    startDate = '',
    endDate = '',
    patientId = '',
    professionalId = '',
    type = '',
    status: statusFilter = '',
    minValue = '',
    maxValue = '',
  } = filters;

  const minV = minValue !== '' && minValue !== undefined && minValue !== null ? Number(minValue) : null;
  const maxV = maxValue !== '' && maxValue !== undefined && maxValue !== null ? Number(maxValue) : null;

  const lines = [];

  const financings = listFinancings({});
  for (const f of financings) {
    const saleDateShort = saleDay(f.created_at);
    if (!inDateRange(saleDateShort, startDate, endDate)) continue;

    const displayStatus = mapDisplayStatus('financiamento', f.status);
    const countsInKpi = !FINANCING_EXCLUDED_FROM_KPI.has(f.status);

    lines.push({
      key: `fin:${f.id}`,
      kind: 'financiamento',
      financingId: f.id,
      receivableId: null,
      patientId: f.patient_id,
      patientName: patientName(patients, f.patient_id),
      tipoLabel: 'Financiamento',
      totalAmount: Number(f.total_amount || 0),
      receivedAmount: Number(f.total_paid_amount || 0),
      openAmount: Number(f.total_open_amount || 0),
      saleDate: f.created_at,
      saleDateShort,
      professionalId: f.professional_id || null,
      professionalName: professionalLabel(collaborators, f.professional_id),
      specialty: specialtyFromCollaborator(collaborators, f.professional_id),
      treatment: (f.description || '').trim() || '—',
      displayStatus,
      rawFinancingStatus: f.status,
      rawReceivableStatus: null,
      countsInKpi,
    });
  }

  const receivables = listReceivables({});
  for (const r of receivables) {
    if (r.financing_id) continue;
    if (r.origin_type === RECEIVABLE_ORIGIN_TYPE.FINANCING) continue;

    const saleDateShort = saleDay(r.created_at);
    if (!inDateRange(saleDateShort, startDate, endDate)) continue;

    const displayStatus = mapDisplayStatus('avista', r.status);
    const countsInKpi =
      r.status !== RECEIVABLE_STATUS.CANCELED && r.status !== RECEIVABLE_STATUS.RENEGOTIATED;

    lines.push({
      key: `recv:${r.id}`,
      kind: 'avista',
      financingId: null,
      receivableId: r.id,
      patientId: r.patient_id,
      patientName: patientName(patients, r.patient_id),
      tipoLabel: 'À vista',
      totalAmount: Number(r.net_amount || 0),
      receivedAmount: Number(r.received_amount || 0),
      openAmount: Number(r.remaining_amount || 0),
      saleDate: r.created_at,
      saleDateShort,
      professionalId: r.professional_id || null,
      professionalName: professionalLabel(collaborators, r.professional_id),
      specialty: specialtyFromCollaborator(collaborators, r.professional_id),
      treatment: (r.description || '').trim() || '—',
      displayStatus,
      rawFinancingStatus: null,
      rawReceivableStatus: r.status,
      countsInKpi,
    });
  }

  let filtered = lines;
  if (patientId) filtered = filtered.filter((l) => l.patientId === patientId);
  if (professionalId) filtered = filtered.filter((l) => l.professionalId === professionalId);
  if (type === 'avista') filtered = filtered.filter((l) => l.kind === 'avista');
  if (type === 'financiamento') filtered = filtered.filter((l) => l.kind === 'financiamento');
  if (statusFilter) filtered = filtered.filter((l) => l.displayStatus === statusFilter);
  if (minV !== null && !Number.isNaN(minV)) filtered = filtered.filter((l) => l.totalAmount >= minV);
  if (maxV !== null && !Number.isNaN(maxV)) filtered = filtered.filter((l) => l.totalAmount <= maxV);

  filtered.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));

  const kpiLines = filtered.filter((l) => l.countsInKpi);
  const totalFaturamento = kpiLines.reduce((s, l) => s + l.totalAmount, 0);
  const vista = kpiLines.filter((l) => l.kind === 'avista').reduce((s, l) => s + l.totalAmount, 0);
  const fin = kpiLines.filter((l) => l.kind === 'financiamento').reduce((s, l) => s + l.totalAmount, 0);
  const countSales = kpiLines.length;
  const ticketMedio = countSales > 0 ? totalFaturamento / countSales : 0;
  const patientSet = new Set(kpiLines.map((l) => l.patientId).filter(Boolean));
  const mediaPorPaciente = patientSet.size > 0 ? totalFaturamento / patientSet.size : 0;

  return {
    lines: filtered,
    kpis: {
      totalFaturamento,
      vista,
      fin,
      ticketMedio,
      countSales,
      mediaPorPaciente,
      uniquePatientCount: patientSet.size,
    },
    chartData: buildChartData(kpiLines),
  };
}
