/**
 * Dashboard e KPIs do módulo Contratos & Consentimentos.
 */
import { loadDb } from '../db/index.js';
import { getPatient } from './patientService.js';
import {
  CONTRACT_STATUS,
  PENDING_STATUSES,
  CONTRACT_CATEGORY_LABELS,
} from '../contracts/contractConstants.js';
import { getContractSettings, ensureContractsModuleSeeded } from './contractModuleService.js';

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

export function getContractDashboard(user) {
  ensureContractsModuleSeeded();
  const cid = clinicId();
  const db = loadDb();
  const settings = getContractSettings(user);
  const contracts = (db.generatedContracts || []).filter((c) => c.clinicId === cid);
  const templates = (db.contractTemplates || []).filter((t) => t.clinicId === cid && t.isActive !== false);

  const kpis = {
    gerados: contracts.length,
    pendentes: contracts.filter((c) => PENDING_STATUSES.includes(c.status)).length,
    assinados: contracts.filter((c) => c.status === CONTRACT_STATUS.SIGNED).length,
    vencidos: contracts.filter((c) => c.status === CONTRACT_STATUS.EXPIRED).length,
    recusados: contracts.filter((c) => c.status === CONTRACT_STATUS.REFUSED).length,
    valorProtegido: contracts
      .filter((c) => c.status === CONTRACT_STATUS.SIGNED)
      .reduce((sum, c) => sum + Number(c.totalValueSnapshot || 0), 0),
  };

  const byProfessional = {};
  for (const c of contracts) {
    const name = c.professionalSnapshotJson?.name || c.generatedBy || 'Não informado';
    byProfessional[name] = (byProfessional[name] || 0) + 1;
  }

  const byTreatment = {};
  for (const c of contracts) {
    const t = c.treatmentType || c.title || 'Geral';
    byTreatment[t] = (byTreatment[t] || 0) + 1;
  }

  const approvedBudgets = (db.crmBudgets || []).filter(
    (b) => b.status === 'APROVADO' && b.patientId,
  );
  const budgetsWithoutContract = approvedBudgets.filter((b) => {
    const has = contracts.some(
      (c) => c.quoteId === b.id && c.quoteSource === 'crm_budget',
    );
    return !has;
  });

  const pendingAlertDays = Number(settings.pendingAlertDays || 5);
  const now = Date.now();
  const stalePending = contracts.filter((c) => {
    if (!PENDING_STATUSES.includes(c.status)) return false;
    const age = now - new Date(c.generatedAt || c.createdAt || 0).getTime();
    return age > pendingAlertDays * 86400000;
  });

  const minorsWithoutGuardian = contracts.filter((c) => {
    if (c.status === CONTRACT_STATUS.SIGNED) return false;
    const snap = c.patientSnapshotJson || {};
    const patient = getPatient(c.patientId);
    const birth = patient?.profile?.birth_date || snap.birth_date;
    if (!birth) return false;
    const age = Math.floor((now - new Date(birth).getTime()) / (365.25 * 86400000));
    if (age >= 18) return false;
    const guardian = patient?.profile?.guardian_full_name || patient?.profile?.legal_guardian_name;
    return !guardian;
  });

  const alerts = [];
  if (budgetsWithoutContract.length) {
    alerts.push({
      type: 'warning',
      message: `${budgetsWithoutContract.length} orçamento(s) aprovado(s) sem contrato gerado.`,
    });
  }
  if (stalePending.length) {
    alerts.push({
      type: 'warning',
      message: `${stalePending.length} contrato(s) pendente(s) há mais de ${pendingAlertDays} dias.`,
    });
  }
  if (minorsWithoutGuardian.length) {
    alerts.push({
      type: 'danger',
      message: `${minorsWithoutGuardian.length} paciente(s) menor(es) sem responsável legal cadastrado.`,
    });
  }

  const signedIds = new Set(
    contracts.filter((c) => c.status === CONTRACT_STATUS.SIGNED).map((c) => c.patientId),
  );
  const signedWithoutConsent = contracts.filter((c) => {
    if (c.status !== CONTRACT_STATUS.SIGNED) return false;
    if (c.category === 'consentimento') return false;
    const hasConsent = contracts.some(
      (x) => x.patientId === c.patientId
        && x.category === 'consentimento'
        && x.status === CONTRACT_STATUS.SIGNED
        && x.quoteId === c.quoteId,
    );
    return !hasConsent;
  });

  if (signedWithoutConsent.length) {
    alerts.push({
      type: 'info',
      message: `${signedWithoutConsent.length} contrato(s) assinado(s) sem termo de consentimento vinculado.`,
    });
  }

  return {
    kpis,
    byProfessional: Object.entries(byProfessional).map(([name, count]) => ({ name, count })),
    byTreatment: Object.entries(byTreatment).map(([name, count]) => ({ name, count })),
    alerts,
    recentContracts: [...contracts]
      .sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0))
      .slice(0, 10),
    templateCount: templates.length,
    categoryLabels: CONTRACT_CATEGORY_LABELS,
    budgetsWithoutContract: budgetsWithoutContract.slice(0, 20),
  };
}
