/**
 * Serviço de integridade de dados — Fase 1 da sprint de estabilização.
 *
 * Valida os vínculos críticos entre orçamento, contrato, financeiro e tenant.
 * Zero vínculo órfão é a meta antes de liberar para produção.
 */
import { loadDb } from '../db/index.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';

function issue(code, severity, entity, detail) {
  return { code, severity, entity, detail };
}

function resolveClinicalPatientId(ca, db) {
  if (ca?.patientId) return ca.patientId;
  const apt = (db.appointments || []).find((a) => a.id === ca.appointmentId);
  return apt?.patientId || null;
}

/**
 * Coleta todos os orçamentos (ativos + histórico) com referência ao appointmentId.
 */
function collectAllBudgets(db) {
  const all = [];
  for (const ca of db.clinicalAppointments || []) {
    const patientId = resolveClinicalPatientId(ca, db);
    if (ca.budget?.id) {
      all.push({
        id: ca.budget.id,
        status: ca.budget.status,
        totalValue: ca.budget.totalValue || 0,
        appointmentId: ca.appointmentId,
        patientId,
        source: 'active',
        contractId: ca.budget.contractId || null,
        financialId: ca.budget.financialId || null,
        financingId: ca.budget.financingId || null,
        financeGenerated: ca.budget.financeGenerated || false,
      });
    }
    for (const h of ca.budgetHistory || []) {
      all.push({
        id: h.id,
        status: h.status || BUDGET_STATUS.HISTORICO,
        totalValue: h.totalValue || 0,
        appointmentId: ca.appointmentId,
        patientId,
        source: 'history',
        contractId: h.contractId || null,
        financialId: h.financialId || null,
        financingId: h.financingId || null,
        financeGenerated: h.financeGenerated || false,
      });
    }
  }
  return all;
}

/**
 * CHECK 0.1 — budget.id único no paciente.
 */
function checkBudgetIdUniqueness(budgets) {
  const issues = [];
  const seen = new Map();
  for (const b of budgets) {
    const key = `${b.patientId}::${b.id}`;
    if (seen.has(key)) {
      issues.push(issue(
        'BUDGET_ID_DUPLICATE',
        'critical',
        `budget:${b.id}`,
        `budgetId duplicado para paciente ${b.patientId}`,
      ));
    }
    seen.set(key, true);
  }
  return issues;
}

/**
 * CHECK 0.2 — contract.id único.
 */
function checkContractIdUniqueness(db) {
  const issues = [];
  const seen = new Set();
  for (const c of db.generatedContracts || []) {
    if (seen.has(c.id)) {
      issues.push(issue('CONTRACT_ID_DUPLICATE', 'critical', `contract:${c.id}`, `contractId duplicado`));
    }
    seen.add(c.id);
  }
  return issues;
}

/**
 * CHECK 0.3 — receivable.origin_id referencia budget.id real.
 */
function checkReceivableOriginId(db, budgetIds) {
  const issues = [];
  for (const r of db.accountsReceivable || []) {
    if (!r.origin_id) {
      issues.push(issue('RECEIVABLE_NO_ORIGIN_ID', 'critical', `receivable:${r.id}`, 'origin_id ausente'));
      continue;
    }
    if (!budgetIds.has(r.origin_id) && !budgetIds.has(r.budget_id)) {
      issues.push(issue(
        'RECEIVABLE_ORPHAN_ORIGIN',
        'critical',
        `receivable:${r.id}`,
        `origin_id "${r.origin_id}" não corresponde a nenhum budget.id conhecido`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.4 — financing.budget_id referencia budget.id real.
 */
function checkFinancingBudgetId(db, budgetIds) {
  const issues = [];
  const lists = [db.financings, db.patientFinancings].filter(Boolean);
  for (const f of lists.flat()) {
    const bid = f.budget_id || f.budgetId || f.treatment_plan_id;
    if (!bid) {
      issues.push(issue('FINANCING_NO_BUDGET_ID', 'critical', `financing:${f.id}`, 'budget_id ausente'));
      continue;
    }
    if (!budgetIds.has(bid)) {
      issues.push(issue(
        'FINANCING_ORPHAN_BUDGET',
        'critical',
        `financing:${f.id}`,
        `budget_id "${bid}" não corresponde a nenhum budget.id conhecido`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.5 — generatedContract.budgetId referencia budget.id real.
 */
function checkContractBudgetId(db, budgetIds) {
  const issues = [];
  for (const c of db.generatedContracts || []) {
    if (!c.budgetId) {
      issues.push(issue(
        'CONTRACT_NO_BUDGET_ID',
        'warning',
        `contract:${c.id || c.contractNumber}`,
        'budgetId ausente no contrato (gerado antes da correção B3)',
      ));
      continue;
    }
    if (!budgetIds.has(c.budgetId)) {
      issues.push(issue(
        'CONTRACT_ORPHAN_BUDGET',
        'critical',
        `contract:${c.id}`,
        `budgetId "${c.budgetId}" não corresponde a nenhum budget.id conhecido`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.6 — generatedContract.quoteId referencia appointment real.
 */
function checkContractQuoteId(db) {
  const issues = [];
  const apptIds = new Set((db.appointments || []).map((a) => a.id));
  for (const c of db.generatedContracts || []) {
    if (c.quoteSource === 'clinical_budget' && c.quoteId && !apptIds.has(c.quoteId)) {
      issues.push(issue(
        'CONTRACT_ORPHAN_QUOTE',
        'critical',
        `contract:${c.id}`,
        `quoteId "${c.quoteId}" não corresponde a nenhum atendimento`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.7 — tenant_id presente em registros críticos.
 */
function checkTenantId(db) {
  const issues = [];
  const collections = [
    { name: 'patients', rows: db.patients || [] },
    { name: 'accountsReceivable', rows: db.accountsReceivable || [] },
    { name: 'financings', rows: [...(db.financings || []), ...(db.patientFinancings || [])] },
    { name: 'generatedContracts', rows: db.generatedContracts || [] },
  ];
  for (const col of collections) {
    for (const row of col.rows) {
      if (!row.tenant_id) {
        issues.push(issue(
          'MISSING_TENANT_ID',
          'warning',
          `${col.name}:${row.id}`,
          `tenant_id ausente em ${col.name}`,
        ));
      }
    }
  }
  return issues;
}

/**
 * CHECK 0.8 — orçamento novo não herda campos financeiros do anterior.
 */
function checkNewBudgetInheritance(budgets) {
  const issues = [];
  const PENDING_STATUSES = new Set([
    BUDGET_STATUS.RASCUNHO, BUDGET_STATUS.ENVIADO, BUDGET_STATUS.NEGOCIACAO,
  ]);
  for (const b of budgets) {
    if (!PENDING_STATUSES.has(b.status)) continue;
    if (b.contractId || b.financialId) {
      issues.push(issue(
        'NEW_BUDGET_INHERITED_IDS',
        'critical',
        `budget:${b.id}`,
        `orçamento pendente herdou contractId="${b.contractId}" ou financialId="${b.financialId}" — risco de bloqueio fantasma`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.9 — snapshot financeiro do contrato não vazio para contratos aprovados.
 */
function checkContractFinancialSnapshot(db) {
  const APPROVED_STATUSES = new Set(['generated', 'sent', 'viewed', 'signed', 'completed', 'signed_by_patient', 'signed_by_clinic']);
  const issues = [];
  for (const c of db.generatedContracts || []) {
    if (!APPROVED_STATUSES.has(c.status)) continue;
    const snap = c.financialSnapshotJson;
    if (!snap || (!snap.parcelas?.length && !snap.financiamentos?.length && !snap.valorTotal)) {
      issues.push(issue(
        'CONTRACT_EMPTY_FINANCIAL_SNAPSHOT',
        'critical',
        `contract:${c.id}`,
        `snapshot financeiro vazio em contrato com status "${c.status}" — gerado antes da correção B3`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.10 — cruzamento de valores: orçamento aprovado vs. snapshot do contrato.
 */
function checkContractValueCrossReference(db, budgets) {
  const issues = [];
  const APPROVED = new Set([BUDGET_STATUS.APROVADO, BUDGET_STATUS.CONTRATO_GERADO]);
  for (const c of db.generatedContracts || []) {
    if (!c.budgetId || !c.totalValueSnapshot) continue;
    const budget = budgets.find((b) => b.id === c.budgetId);
    if (!budget || !APPROVED.has(budget.status) || !budget.totalValue) continue;
    const tol = budget.totalValue * 0.01;
    if (Math.abs(Number(c.totalValueSnapshot) - budget.totalValue) > tol) {
      issues.push(issue(
        'VALUE_MISMATCH_BUDGET_CONTRACT',
        'critical',
        `contract:${c.id}`,
        `snapshot do contrato R$ ${Number(c.totalValueSnapshot).toFixed(2)} ≠ orçamento R$ ${budget.totalValue.toFixed(2)}`,
      ));
    }
  }
  return issues;
}

/**
 * CHECK 0.11 — cruzamento de valores: orçamento aprovado vs. receivables.
 */
function checkValueCrossReference(db, budgets) {
  const issues = [];
  const APPROVED = new Set([BUDGET_STATUS.APROVADO, BUDGET_STATUS.CONTRATO_GERADO]);
  for (const b of budgets) {
    if (!APPROVED.has(b.status) || !b.totalValue) continue;
    const receivables = (db.accountsReceivable || []).filter(
      (r) => r.origin_id === b.id || r.budget_id === b.id,
    );
    if (!receivables.length) continue;
    const sumReceivables = receivables.reduce((acc, r) => acc + Number(r.original_amount || r.net_amount || 0), 0);
    const tolerance = b.totalValue * 0.01;
    if (Math.abs(sumReceivables - b.totalValue) > tolerance && sumReceivables > 0) {
      issues.push(issue(
        'VALUE_MISMATCH_BUDGET_RECEIVABLES',
        'warning',
        `budget:${b.id}`,
        `valor do orçamento R$ ${b.totalValue.toFixed(2)} ≠ soma das parcelas R$ ${sumReceivables.toFixed(2)}`,
      ));
    }
  }
  return issues;
}

/**
 * Executa todos os checks de integridade e retorna relatório estruturado.
 */
export function runDataIntegrityCheck() {
  const db = loadDb();
  const budgets = collectAllBudgets(db);
  const budgetIds = new Set(budgets.map((b) => b.id));

  const allIssues = [
    ...checkBudgetIdUniqueness(budgets),
    ...checkContractIdUniqueness(db),
    ...checkReceivableOriginId(db, budgetIds),
    ...checkFinancingBudgetId(db, budgetIds),
    ...checkContractBudgetId(db, budgetIds),
    ...checkContractQuoteId(db),
    ...checkTenantId(db),
    ...checkNewBudgetInheritance(budgets),
    ...checkContractFinancialSnapshot(db),
    ...checkContractValueCrossReference(db, budgets),
    ...checkValueCrossReference(db, budgets),
  ];

  const critical = allIssues.filter((i) => i.severity === 'critical');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  const ok = allIssues.length === 0;
  const gate = critical.length === 0;

  return {
    ok,
    gate,
    critical: critical.length,
    warnings: warnings.length,
    issues: allIssues,
    budgetCount: budgets.length,
    contractCount: (db.generatedContracts || []).length,
    receivableCount: (db.accountsReceivable || []).length,
    financingCount: [...(db.financings || []), ...(db.patientFinancings || [])].length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Roda apenas para um paciente específico (para diagnóstico pontual).
 */
export function runDataIntegrityCheckForPatient(patientId) {
  if (!patientId) return null;
  const full = runDataIntegrityCheck();
  const filtered = full.issues.filter((i) => i.entity.includes(patientId));
  return { ...full, issues: filtered };
}
