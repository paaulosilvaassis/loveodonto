/**
 * Dashboard e relatórios executivos — módulo Convênios.
 */

import { loadDb } from '../db/index.js';
import {
  listProviders,
  listGuides,
  listGlosas,
  listBillingBatches,
  listReceipts,
  listInsuredPatients,
  listProduction,
  GUIDE_STATUS,
  GLOSA_STATUS,
  PROVIDER_STATUS,
  ensureConvenioSeedsForTenant,
} from './convenioService.js';

function byTenant(items, tenantId) {
  if (!tenantId) return items || [];
  return (items || []).filter((i) => i.tenant_id === tenantId);
}

function sum(items, fn) {
  return items.reduce((s, i) => s + (Number(fn(i)) || 0), 0);
}

export function getConvenioDashboard(tenantId) {
  ensureConvenioSeedsForTenant(tenantId);
  const db = loadDb();
  const providers = listProviders(tenantId);
  const guides = listGuides(tenantId);
  const glosas = listGlosas(tenantId);
  const batches = listBillingBatches(tenantId);
  const receipts = listReceipts(tenantId);
  const insured = listInsuredPatients(tenantId);

  const activeProviders = providers.filter((p) => p.status === PROVIDER_STATUS.ATIVO).length;
  const pendingGuides = guides.filter((g) =>
    [GUIDE_STATUS.ABERTA, GUIDE_STATUS.FECHADA, GUIDE_STATUS.ENVIADA].includes(g.status)
  ).length;
  const billedGuides = guides.filter((g) =>
    [GUIDE_STATUS.FATURADA, GUIDE_STATUS.RECEBIDA].includes(g.status)
  ).length;
  const openGlosas = glosas.filter((g) =>
    [GLOSA_STATUS.ABERTA, GLOSA_STATUS.CONTESTADA].includes(g.status)
  );

  const receitaPrevista = sum(guides.filter((g) => g.status !== GUIDE_STATUS.ABERTA), (g) => g.repasseValue);
  const receitaRecebida = sum(receipts, (r) => r.receivedAmount);
  const valorGlosado = sum(glosas, (g) => g.glosaAmount);
  const valorRecuperado = sum(glosas.filter((g) => g.status === GLOSA_STATUS.RECUPERADA), (g) => g.glosaAmount);
  const glosaPercent = receitaPrevista > 0 ? Math.round((valorGlosado / receitaPrevista) * 1000) / 10 : 0;
  const ticketMedio = billedGuides > 0 ? receitaPrevista / billedGuides : 0;

  const ranking = providers.map((p) => {
    const pGuides = guides.filter((g) => g.provider_id === p.id);
    const revenue = sum(pGuides, (g) => g.repasseValue);
    const patients = insured.filter((ip) =>
      ip.insurances.some((ins) => ins.provider_id === p.id)
    ).length;
    return {
      providerId: p.id,
      name: p.name,
      patients,
      revenue,
      guides: pGuides.length,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  return {
    kpis: {
      conveniosAtivos: activeProviders,
      pacientesConveniados: insured.length,
      guiasEmitidas: guides.length,
      guiasPendentes: pendingGuides,
      guiasFaturadas: billedGuides,
      glosasAbertas: openGlosas.length,
      receitaPrevista,
      receitaRecebida,
      ticketMedio,
      valorGlosado,
      valorRecuperado,
      percentualGlosa: glosaPercent,
    },
    ranking,
    glosaKpis: {
      valorGlosado,
      valorRecuperado,
      percentualGlosa: glosaPercent,
    },
  };
}

export function getConvenioExecutiveReport(tenantId) {
  const dashboard = getConvenioDashboard(tenantId);
  const db = loadDb();
  const production = listProduction(tenantId);

  const profitability = dashboard.ranking.map((row) => {
    const costEstimate = row.revenue * 0.6;
    const profit = row.revenue - costEstimate;
    const margin = row.revenue > 0 ? Math.round((profit / row.revenue) * 1000) / 10 : 0;
    return {
      ...row,
      costEstimate,
      profit,
      marginPercent: margin,
    };
  });

  const byProfessional = {};
  production.forEach((g) => {
    const key = g.professional_id || g.professional_name || 'sem_profissional';
    if (!byProfessional[key]) {
      byProfessional[key] = { name: g.professional_name || '—', count: 0, revenue: 0 };
    }
    byProfessional[key].count += 1;
    byProfessional[key].revenue += Number(g.repasseValue) || 0;
  });

  const procedureCounts = {};
  production.forEach((g) => {
    const key = g.procedureName || 'Procedimento';
    procedureCounts[key] = (procedureCounts[key] || 0) + 1;
  });
  const topProcedures = Object.entries(procedureCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const receipts = listReceipts(tenantId);
  const avgReceiptDays = batchesAverageDays(db, tenantId);

  return {
    ...dashboard,
    profitability,
    productionByProfessional: Object.values(byProfessional).sort((a, b) => b.revenue - a.revenue),
    topProcedures,
    avgReceiptDays,
    totalReceipts: receipts.length,
  };
}

function batchesAverageDays(db, tenantId) {
  const batches = byTenant(db.insuranceBillingBatches, tenantId)
    .filter((b) => b.sentAt && b.status === 'recebido');
  if (!batches.length) return 0;
  const receipts = byTenant(db.insuranceReceipts, tenantId);
  let totalDays = 0;
  let count = 0;
  batches.forEach((b) => {
    const r = receipts.find((rc) => rc.batch_id === b.id);
    if (!r?.receiptDate || !b.sentAt) return;
    const sent = new Date(b.sentAt);
    const rec = new Date(r.receiptDate);
    const days = Math.max(0, Math.floor((rec - sent) / 86400000));
    totalDays += days;
    count += 1;
  });
  return count ? Math.round(totalDays / count) : 0;
}
