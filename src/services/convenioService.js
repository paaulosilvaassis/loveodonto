/**
 * Módulo Convênios — ciclo completo odontológico (multi-tenant).
 * Convênio → Elegibilidade → Guia → Atendimento → Glosa → Recebimento → Rentabilidade
 */

import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import { logAction } from './logService.js';

export const PROVIDER_STATUS = { ATIVO: 'ativo', INATIVO: 'inativo' };
export const PLAN_STATUS = { ATIVO: 'ativo', INATIVO: 'inativo' };
export const PATIENT_INSURANCE_STATUS = { ATIVO: 'ativo', INATIVO: 'inativo', PENDENTE: 'pendente' };

export const AUTH_STATUS = {
  SOLICITADA: 'solicitada',
  PENDENTE: 'pendente',
  APROVADA: 'aprovada',
  NEGADA: 'negada',
  EXECUTADA: 'executada',
};

export const GUIDE_STATUS = {
  ABERTA: 'aberta',
  FECHADA: 'fechada',
  ENVIADA: 'enviada',
  FATURADA: 'faturada',
  RECEBIDA: 'recebida',
  GLOSADA: 'glosada',
};

export const GLOSA_STATUS = {
  ABERTA: 'aberta',
  CONTESTADA: 'contestada',
  RECUPERADA: 'recuperada',
  PERDIDA: 'perdida',
};

export const BATCH_STATUS = {
  ABERTO: 'aberto',
  ENVIADO: 'enviado',
  PROCESSADO: 'processado',
  RECEBIDO: 'recebido',
};

const DEFAULT_PROVIDERS = [
  { name: 'OdontoPrev', ansRegistration: '417173', tradeName: 'OdontoPrev' },
  { name: 'Amil Dental', ansRegistration: '326305', tradeName: 'Amil Dental' },
  { name: 'Bradesco Dental', ansRegistration: '005711', tradeName: 'Bradesco Dental' },
  { name: 'SulAmérica Odonto', ansRegistration: '006246', tradeName: 'SulAmérica Odonto' },
  { name: 'Unimed Odonto', ansRegistration: '339679', tradeName: 'Unimed Odonto' },
];

const now = () => new Date().toISOString();

function byTenant(items, tenantId) {
  if (!tenantId) return items || [];
  return (items || []).filter((i) => i.tenant_id === tenantId);
}

function getProviderName(db, providerId) {
  const p = (db.insuranceProviders || []).find((x) => x.id === providerId);
  return p?.name || '—';
}

function getPlanName(db, planId) {
  const p = (db.insurancePlans || []).find((x) => x.id === planId);
  return p?.name || '—';
}

function getPatientName(db, patientId) {
  const p = (db.patients || []).find((x) => x.id === patientId);
  return p?.full_name || p?.nickname || 'Paciente';
}

// ─── Seeds ───────────────────────────────────────────────────────────────────

export function ensureConvenioSeedsForTenant(tenantId) {
  if (!tenantId) return;
  withDb((db) => {
    const existing = byTenant(db.insuranceProviders, tenantId);
    if (existing.length) return;
    const ts = now();
    DEFAULT_PROVIDERS.forEach((seed) => {
      db.insuranceProviders.push({
        id: createId('insprov'),
        tenant_id: tenantId,
        name: seed.name,
        tradeName: seed.tradeName,
        ansRegistration: seed.ansRegistration,
        cnpj: '',
        phone: '',
        email: '',
        portalUrl: '',
        commercialContact: '',
        billingContact: '',
        logoUrl: '',
        notes: '',
        status: PROVIDER_STATUS.ATIVO,
        createdAt: ts,
        updatedAt: ts,
      });
    });
  });
}

// ─── Operadoras ──────────────────────────────────────────────────────────────

export function listProviders(tenantId, { includeInactive = false } = {}) {
  ensureConvenioSeedsForTenant(tenantId);
  const db = loadDb();
  return byTenant(db.insuranceProviders, tenantId)
    .filter((p) => includeInactive || p.status === PROVIDER_STATUS.ATIVO)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function saveProvider(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const base = {
      name: String(payload.name || '').trim(),
      tradeName: String(payload.tradeName || payload.name || '').trim(),
      ansRegistration: String(payload.ansRegistration || '').trim(),
      cnpj: String(payload.cnpj || '').trim(),
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      portalUrl: String(payload.portalUrl || '').trim(),
      commercialContact: String(payload.commercialContact || '').trim(),
      billingContact: String(payload.billingContact || '').trim(),
      logoUrl: String(payload.logoUrl || '').trim(),
      notes: String(payload.notes || '').trim(),
      status: payload.status || PROVIDER_STATUS.ATIVO,
      tenant_id: tenantId,
      updatedAt: ts,
    };
    if (!base.name) throw new Error('Nome da operadora é obrigatório');

    const idx = payload.id
      ? db.insuranceProviders.findIndex((p) => p.id === payload.id && p.tenant_id === tenantId)
      : -1;

    if (idx >= 0) {
      db.insuranceProviders[idx] = { ...db.insuranceProviders[idx], ...base };
      logAction('convenio:provider_update', { id: payload.id, tenantId });
      return db.insuranceProviders[idx];
    }

    const row = { id: createId('insprov'), ...base, createdAt: ts };
    db.insuranceProviders.push(row);
    logAction('convenio:provider_create', { id: row.id, tenantId });
    return row;
  });
}

// ─── Planos ──────────────────────────────────────────────────────────────────

export function listPlans(tenantId, { providerId, includeInactive = false } = {}) {
  const db = loadDb();
  return byTenant(db.insurancePlans, tenantId)
    .filter((p) => !providerId || p.provider_id === providerId)
    .filter((p) => includeInactive || p.status === PLAN_STATUS.ATIVO)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function savePlan(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    if (!payload.provider_id) throw new Error('Operadora é obrigatória');
    if (!String(payload.name || '').trim()) throw new Error('Nome do plano é obrigatório');

    const base = {
      provider_id: payload.provider_id,
      name: String(payload.name).trim(),
      coverageTable: payload.coverageTable || '',
      coparticipation: Number(payload.coparticipation) || 0,
      waitingPeriodDays: Number(payload.waitingPeriodDays) || 0,
      status: payload.status || PLAN_STATUS.ATIVO,
      tenant_id: tenantId,
      updatedAt: ts,
    };

    const idx = payload.id
      ? db.insurancePlans.findIndex((p) => p.id === payload.id && p.tenant_id === tenantId)
      : -1;

    if (idx >= 0) {
      db.insurancePlans[idx] = { ...db.insurancePlans[idx], ...base };
      return db.insurancePlans[idx];
    }

    const row = { id: createId('insplan'), ...base, createdAt: ts };
    db.insurancePlans.push(row);
    logAction('convenio:plan_create', { id: row.id, tenantId });
    return row;
  });
}

// ─── Pacientes conveniados ───────────────────────────────────────────────────

export function listInsuredPatients(tenantId) {
  const db = loadDb();
  const patientIds = new Set(
    (db.patients || [])
      .filter((p) => !tenantId || p.tenant_id === tenantId || !p.tenant_id)
      .map((p) => p.id)
  );
  const insurances = (db.patientInsurances || []).filter((ins) => patientIds.has(ins.patient_id));
  const byPatient = new Map();

  insurances.forEach((ins) => {
    if (!ins.patient_id) return;
    if (!byPatient.has(ins.patient_id)) {
      byPatient.set(ins.patient_id, {
        patientId: ins.patient_id,
        patientName: getPatientName(db, ins.patient_id),
        insurances: [],
      });
    }
    byPatient.get(ins.patient_id).insurances.push({
      ...ins,
      providerName: ins.provider_id ? getProviderName(db, ins.provider_id) : ins.insurance_name,
      planName: ins.plan_id ? getPlanName(db, ins.plan_id) : ins.plan_name,
    });
  });

  return Array.from(byPatient.values()).sort((a, b) =>
    a.patientName.localeCompare(b.patientName)
  );
}

export function savePatientInsurance(user, patientId, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const provider = payload.provider_id
      ? db.insuranceProviders.find((p) => p.id === payload.provider_id)
      : null;

    const row = {
      id: payload.id || createId('ins'),
      patient_id: patientId,
      tenant_id: tenantId,
      provider_id: payload.provider_id || null,
      plan_id: payload.plan_id || null,
      insurance_name: provider?.name || String(payload.insurance_name || '').trim(),
      plan_name: payload.plan_id ? getPlanName(db, payload.plan_id) : String(payload.plan_name || '').trim(),
      membership_number: String(payload.membership_number || '').trim(),
      validity: String(payload.validity || '').trim(),
      is_holder: Boolean(payload.is_holder),
      holder_cpf: String(payload.holder_cpf || '').trim(),
      company_partner: String(payload.company_partner || '').trim(),
      extra_data: String(payload.extra_data || '').trim(),
      status: payload.status || PATIENT_INSURANCE_STATUS.ATIVO,
      updatedAt: ts,
    };

    const idx = payload.id
      ? db.patientInsurances.findIndex((i) => i.id === payload.id)
      : -1;

    if (idx >= 0) {
      db.patientInsurances[idx] = { ...db.patientInsurances[idx], ...row };
    } else {
      db.patientInsurances.push({ ...row, createdAt: ts });
    }
    logAction('convenio:patient_insurance_save', { patientId, tenantId });
    return row;
  });
}

export function checkEligibility(user, patientInsuranceId) {
  return withDb((db) => {
    const ins = db.patientInsurances.find((i) => i.id === patientInsuranceId);
    if (!ins) throw new Error('Convênio do paciente não encontrado');
    const valid = ins.status === PATIENT_INSURANCE_STATUS.ATIVO;
    const expiry = ins.validity ? new Date(ins.validity) : null;
    const notExpired = !expiry || !Number.isNaN(expiry.getTime()) && expiry >= new Date();
    return {
      eligible: valid && notExpired,
      status: valid && notExpired ? 'elegivel' : 'inelegivel',
      checkedAt: now(),
      message: valid && notExpired ? 'Paciente elegível para atendimento.' : 'Verifique validade ou status do convênio.',
    };
  });
}

// ─── Autorizações ────────────────────────────────────────────────────────────

export function listAuthorizations(tenantId, filters = {}) {
  const db = loadDb();
  return byTenant(db.insuranceAuthorizations, tenantId)
    .filter((a) => !filters.status || a.status === filters.status)
    .filter((a) => !filters.providerId || a.provider_id === filters.providerId)
    .map((a) => enrichAuth(db, a))
    .sort((a, b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
}

function enrichAuth(db, a) {
  return {
    ...a,
    patientName: getPatientName(db, a.patient_id),
    providerName: getProviderName(db, a.provider_id),
  };
}

export function saveAuthorization(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const base = {
      patient_id: payload.patient_id,
      provider_id: payload.provider_id,
      plan_id: payload.plan_id || null,
      procedureCode: String(payload.procedureCode || '').trim(),
      procedureName: String(payload.procedureName || '').trim(),
      requestDate: payload.requestDate || ts.slice(0, 10),
      status: payload.status || AUTH_STATUS.SOLICITADA,
      authNumber: String(payload.authNumber || '').trim(),
      validUntil: payload.validUntil || null,
      attachments: payload.attachments || [],
      notes: String(payload.notes || '').trim(),
      tenant_id: tenantId,
      updatedAt: ts,
    };

    const idx = payload.id
      ? db.insuranceAuthorizations.findIndex((a) => a.id === payload.id && a.tenant_id === tenantId)
      : -1;

    if (idx >= 0) {
      db.insuranceAuthorizations[idx] = { ...db.insuranceAuthorizations[idx], ...base };
      return enrichAuth(db, db.insuranceAuthorizations[idx]);
    }

    const row = { id: createId('insauth'), ...base, createdAt: ts };
    db.insuranceAuthorizations.push(row);
    return enrichAuth(db, row);
  });
}

// ─── Guias TISS ──────────────────────────────────────────────────────────────

export function listGuides(tenantId, filters = {}) {
  const db = loadDb();
  return byTenant(db.insuranceGuides, tenantId)
    .filter((g) => !filters.status || g.status === filters.status)
    .filter((g) => !filters.providerId || g.provider_id === filters.providerId)
    .filter((g) => !filters.professionalId || g.professional_id === filters.professionalId)
    .filter((g) => {
      if (!filters.dateFrom && !filters.dateTo) return true;
      const d = g.serviceDate || '';
      if (filters.dateFrom && d < filters.dateFrom) return false;
      if (filters.dateTo && d > filters.dateTo) return false;
      return true;
    })
    .map((g) => enrichGuide(db, g))
    .sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));
}

function enrichGuide(db, g) {
  return {
    ...g,
    patientName: getPatientName(db, g.patient_id),
    providerName: getProviderName(db, g.provider_id),
    professionalName: g.professional_name || '—',
  };
}

export function saveGuide(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const tableValue = Number(payload.tableValue) || 0;
    const repasseValue = Number(payload.repasseValue) ?? tableValue;

    const base = {
      patient_id: payload.patient_id,
      provider_id: payload.provider_id,
      plan_id: payload.plan_id || null,
      authorization_id: payload.authorization_id || null,
      appointment_id: payload.appointment_id || null,
      procedureCode: String(payload.procedureCode || '').trim(),
      procedureName: String(payload.procedureName || '').trim(),
      professional_id: payload.professional_id || null,
      professional_name: String(payload.professional_name || '').trim(),
      serviceDate: payload.serviceDate || ts.slice(0, 10),
      quantity: Number(payload.quantity) || 1,
      tableValue,
      repasseValue,
      status: payload.status || GUIDE_STATUS.ABERTA,
      batch_id: payload.batch_id || null,
      tenant_id: tenantId,
      updatedAt: ts,
    };

    const idx = payload.id
      ? db.insuranceGuides.findIndex((g) => g.id === payload.id && g.tenant_id === tenantId)
      : -1;

    if (idx >= 0) {
      db.insuranceGuides[idx] = { ...db.insuranceGuides[idx], ...base };
      return enrichGuide(db, db.insuranceGuides[idx]);
    }

    const row = { id: createId('insguide'), ...base, createdAt: ts };
    db.insuranceGuides.push(row);
    logAction('convenio:guide_create', { id: row.id, tenantId });
    return enrichGuide(db, row);
  });
}

export function updateGuideStatus(user, guideId, status) {
  return withDb((db) => {
    const idx = db.insuranceGuides.findIndex((g) => g.id === guideId);
    if (idx < 0) throw new Error('Guia não encontrada');
    db.insuranceGuides[idx] = { ...db.insuranceGuides[idx], status, updatedAt: now() };
    return enrichGuide(db, db.insuranceGuides[idx]);
  });
}

// ─── Glosas ──────────────────────────────────────────────────────────────────

export function listGlosas(tenantId, filters = {}) {
  const db = loadDb();
  return byTenant(db.insuranceGlosas, tenantId)
    .filter((g) => !filters.status || g.status === filters.status)
    .map((g) => enrichGlosa(db, g))
    .sort((a, b) => (b.glosaDate || '').localeCompare(a.glosaDate || ''));
}

function enrichGlosa(db, g) {
  return {
    ...g,
    patientName: getPatientName(db, g.patient_id),
    providerName: getProviderName(db, g.provider_id),
  };
}

export function saveGlosa(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const base = {
      guide_id: payload.guide_id || null,
      batch_id: payload.batch_id || null,
      receipt_id: payload.receipt_id || null,
      patient_id: payload.patient_id || null,
      provider_id: payload.provider_id,
      procedureName: String(payload.procedureName || '').trim(),
      reason: String(payload.reason || '').trim(),
      glosaAmount: Number(payload.glosaAmount) || 0,
      glosaDate: payload.glosaDate || ts.slice(0, 10),
      status: payload.status || GLOSA_STATUS.ABERTA,
      tenant_id: tenantId,
      updatedAt: ts,
    };

    const idx = payload.id
      ? db.insuranceGlosas.findIndex((g) => g.id === payload.id && g.tenant_id === tenantId)
      : -1;

    if (idx >= 0) {
      db.insuranceGlosas[idx] = { ...db.insuranceGlosas[idx], ...base };
      return enrichGlosa(db, db.insuranceGlosas[idx]);
    }

    const row = { id: createId('insglosa'), ...base, createdAt: ts };
    db.insuranceGlosas.push(row);
    return enrichGlosa(db, row);
  });
}

// ─── Faturamento (lotes) ─────────────────────────────────────────────────────

export function listBillingBatches(tenantId, filters = {}) {
  const db = loadDb();
  return byTenant(db.insuranceBillingBatches, tenantId)
    .filter((b) => !filters.status || b.status === filters.status)
    .map((b) => ({
      ...b,
      providerName: getProviderName(db, b.provider_id),
    }))
    .sort((a, b) => (b.competence || '').localeCompare(a.competence || ''));
}

export function createBillingBatch(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const providerId = payload.provider_id;
    if (!providerId) throw new Error('Operadora é obrigatória');

    const guideIds = payload.guideIds || [];
    const guides = db.insuranceGuides.filter((g) =>
      guideIds.includes(g.id) && g.tenant_id === tenantId
    );
    const totalValue = guides.reduce((s, g) => s + (Number(g.repasseValue) || 0), 0);

    const batch = {
      id: createId('insbatch'),
      tenant_id: tenantId,
      provider_id: providerId,
      competence: payload.competence || ts.slice(0, 7),
      guideCount: guides.length,
      totalValue,
      status: BATCH_STATUS.ABERTO,
      sentAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db.insuranceBillingBatches.push(batch);

    guides.forEach((g) => {
      const idx = db.insuranceGuides.findIndex((x) => x.id === g.id);
      if (idx >= 0) {
        db.insuranceGuides[idx] = {
          ...db.insuranceGuides[idx],
          batch_id: batch.id,
          status: GUIDE_STATUS.FATURADA,
          updatedAt: ts,
        };
      }
    });

    logAction('convenio:batch_create', { id: batch.id, tenantId });
    return { ...batch, providerName: getProviderName(db, providerId) };
  });
}

export function updateBatchStatus(user, batchId, status) {
  return withDb((db) => {
    const idx = db.insuranceBillingBatches.findIndex((b) => b.id === batchId);
    if (idx < 0) throw new Error('Lote não encontrado');
    db.insuranceBillingBatches[idx] = {
      ...db.insuranceBillingBatches[idx],
      status,
      updatedAt: now(),
      sentAt: status === BATCH_STATUS.ENVIADO ? now() : db.insuranceBillingBatches[idx].sentAt,
    };
    return db.insuranceBillingBatches[idx];
  });
}

// ─── Recebimentos ────────────────────────────────────────────────────────────

export function listReceipts(tenantId) {
  const db = loadDb();
  return byTenant(db.insuranceReceipts, tenantId)
    .map((r) => ({
      ...r,
      providerName: getProviderName(db, r.provider_id),
    }))
    .sort((a, b) => (b.receiptDate || '').localeCompare(a.receiptDate || ''));
}

export function recordReceipt(user, payload) {
  return withDb((db) => {
    const tenantId = resolveTenantIdForWrite(user, payload.tenant_id);
    const ts = now();
    const expected = Number(payload.expectedAmount) || 0;
    const received = Number(payload.receivedAmount) || 0;
    const difference = Math.max(0, expected - received);

    const receipt = {
      id: createId('insrcpt'),
      tenant_id: tenantId,
      provider_id: payload.provider_id,
      batch_id: payload.batch_id || null,
      receiptDate: payload.receiptDate || ts.slice(0, 10),
      expectedAmount: expected,
      receivedAmount: received,
      differenceAmount: difference,
      notes: String(payload.notes || '').trim(),
      createdAt: ts,
      updatedAt: ts,
    };
    db.insuranceReceipts.push(receipt);

    if (payload.batch_id) {
      const bIdx = db.insuranceBillingBatches.findIndex((b) => b.id === payload.batch_id);
      if (bIdx >= 0) {
        db.insuranceBillingBatches[bIdx] = {
          ...db.insuranceBillingBatches[bIdx],
          status: BATCH_STATUS.RECEBIDO,
          updatedAt: ts,
        };
      }
    }

    if (difference > 0) {
      const glosa = {
        id: createId('insglosa'),
        tenant_id: tenantId,
        provider_id: payload.provider_id,
        batch_id: payload.batch_id || null,
        receipt_id: receipt.id,
        patient_id: null,
        guide_id: null,
        procedureName: 'Lote — diferença de recebimento',
        reason: 'Diferença no recebimento do lote',
        glosaAmount: difference,
        glosaDate: receipt.receiptDate,
        status: GLOSA_STATUS.ABERTA,
        createdAt: ts,
        updatedAt: ts,
      };
      db.insuranceGlosas.push(glosa);
    }

    logAction('convenio:receipt_record', { id: receipt.id, difference, tenantId });
    return { ...receipt, providerName: getProviderName(db, payload.provider_id) };
  });
}

// ─── Produção (derivada das guias) ───────────────────────────────────────────

export function listProduction(tenantId, filters = {}) {
  return listGuides(tenantId, filters).filter((g) =>
    [GUIDE_STATUS.FECHADA, GUIDE_STATUS.ENVIADA, GUIDE_STATUS.FATURADA, GUIDE_STATUS.RECEBIDA, GUIDE_STATUS.GLOSADA].includes(g.status)
  );
}
