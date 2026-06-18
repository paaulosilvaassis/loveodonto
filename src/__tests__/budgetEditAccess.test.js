import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  resolveBudgetReadOnlyState,
  isContractLinkedToBudget,
  isBudgetLocked,
  diagnoseBudgetLock,
  normalizeBudgetStatus,
  isRealFinanceLinkedToBudget,
} from '../components/clinical/budget/budgetEditAccessUtils.js';

const unlockedCtx = {
  isLocked: false,
  hasReceivables: false,
  hasFinancing: false,
  hasActiveContract: false,
  contractSigned: false,
  contractCanceled: false,
  contractApplies: false,
};

describe('budgetEditAccessUtils', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('permite edição para orçamento em negociação aberto por budgetId', () => {
    const budget = {
      id: 'budget-1',
      status: BUDGET_STATUS.NEGOCIACAO,
      paymentOptions: [{ id: 'p1', presentToPatient: true }],
    };

    const access = resolveBudgetReadOnlyState(budget, unlockedCtx);
    expect(access.isReadOnly).toBe(false);
    expect(access.isNegotiationOpen).toBe(true);
    expect(access.canApprove).toBe(true);
    expect(access.canPresent).toBe(true);
    expect(access.canChooseCondition).toBe(true);
  });

  it('permite edição para RASCUNHO, ENVIADO e alias APRESENTADO', () => {
    for (const status of [BUDGET_STATUS.RASCUNHO, BUDGET_STATUS.ENVIADO, 'APRESENTADO']) {
      const access = resolveBudgetReadOnlyState({ id: 'b1', status }, unlockedCtx);
      expect(access.isReadOnly).toBe(false);
      expect(access.canEdit).toBe(true);
    }
  });

  it('isBudgetLocked retorna false para negociação sem contrato/financeiro', () => {
    const budget = { id: 'budget-neg', status: BUDGET_STATUS.RASCUNHO };
    expect(isBudgetLocked(budget, unlockedCtx)).toBe(false);
  });

  it('isBudgetLocked retorna true para CONTRATO_GERADO, HISTORICO e CANCELADO', () => {
    expect(isBudgetLocked({ status: BUDGET_STATUS.CONTRATO_GERADO }, unlockedCtx)).toBe(true);
    expect(isBudgetLocked({ status: BUDGET_STATUS.HISTORICO }, unlockedCtx)).toBe(true);
    expect(isBudgetLocked({ status: BUDGET_STATUS.CANCELADO }, unlockedCtx)).toBe(true);
  });

  it('isBudgetLocked retorna true com contrato real vinculado ao orçamento aprovado', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'ctr-1',
        budgetId: 'b1',
        status: CONTRACT_STATUS.GENERATED,
        patientId: 'patient-1',
      }];
      return db;
    });

    const locked = isBudgetLocked(
      { id: 'b1', status: BUDGET_STATUS.APROVADO },
      {
        ...unlockedCtx,
        contract: { id: 'ctr-1', budgetId: 'b1', status: CONTRACT_STATUS.GENERATED },
        contractApplies: true,
        hasActiveContract: true,
      },
    );
    expect(locked).toBe(true);
    expect(diagnoseBudgetLock(
      { id: 'b1', status: BUDGET_STATUS.APROVADO },
      {
        ...unlockedCtx,
        contract: { id: 'ctr-1', budgetId: 'b1', status: CONTRACT_STATUS.GENERATED },
        hasActiveContract: true,
      },
    ).reason).toBe('contract');
  });

  it('APROVADO com financeiro real permanece desbloqueado para fluxo de contrato', () => {
    withDb((db) => {
      db.accountsReceivable = [{
        id: 'recv-1',
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        origin_id: 'b1',
        net_amount: 1000,
        status: 'PENDING',
      }];
      return db;
    });

    const budget = { id: 'b1', status: BUDGET_STATUS.APROVADO };
    expect(isBudgetLocked(budget, { ...unlockedCtx, patientId: 'patient-1' })).toBe(false);

    const access = resolveBudgetReadOnlyState(budget, { ...unlockedCtx, patientId: 'patient-1' });
    expect(access.isEditBlocked).toBe(false);
    expect(access.isApprovedView).toBe(true);
    expect(access.canGenerateContract).toBe(true);
    expect(access.isReadOnly).toBe(true);
    expect(access.canEdit).toBe(false);
  });

  it('negociação com financeiro legado no mesmo budget.id permanece editável', () => {
    withDb((db) => {
      db.accountsReceivable = [{
        id: 'recv-stale',
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        origin_id: 'budget-draft',
        net_amount: 25000,
        status: 'PENDING',
      }];
      return db;
    });

    const budget = {
      id: 'budget-draft',
      status: BUDGET_STATUS.RASCUNHO,
      financeGenerated: true,
      financingId: 'fin-stale',
    };

    expect(isRealFinanceLinkedToBudget('budget-draft')).toBe(true);
    expect(isBudgetLocked(budget, unlockedCtx)).toBe(false);
    expect(resolveBudgetReadOnlyState(budget, unlockedCtx).isEditBlocked).toBe(false);
  });

  it('budget with old patient finance but no finance linked to current budget remains editable', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'ctr-old',
        budgetId: 'budget-001',
        status: CONTRACT_STATUS.SIGNED,
        patientId: 'patient-1',
      }];
      db.accountsReceivable = [{
        id: 'recv-old',
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        origin_id: 'budget-001',
        net_amount: 25000,
      }];
      db.financings = [{
        id: 'fin-old',
        patient_id: 'patient-1',
        budget_id: 'budget-001',
        status: 'active',
      }];
      return db;
    });

    const budget = {
      id: 'budget-003',
      budgetNumber: 'ORC-003',
      status: BUDGET_STATUS.RASCUNHO,
      financeGenerated: true,
      financingId: 'fin-orphan',
    };

    expect(isRealFinanceLinkedToBudget('budget-003')).toBe(false);
    expect(isBudgetLocked(budget, { ...unlockedCtx, patientId: 'patient-1' })).toBe(false);

    const access = resolveBudgetReadOnlyState(budget, { ...unlockedCtx, patientId: 'patient-1' });
    expect(access.isEditBlocked).toBe(false);
    expect(access.isReadOnly).toBe(false);
    expect(access.canApprove).toBe(true);
    expect(access.canChooseCondition).toBe(true);
    expect(access.canPresent).toBe(true);
    expect(diagnoseBudgetLock(budget, unlockedCtx).locked).toBe(false);
  });

  it('pending budget with patient having old contract remains editable', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'ctr-old',
        clinicId: 'clinic-1',
        quoteId: 'apt-1',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-001',
        status: CONTRACT_STATUS.SIGNED,
        patientId: 'patient-1',
      }];
      db.accountsReceivable = [{
        id: 'recv-old',
        tenant_id: 'tenant-1',
        patient_id: 'patient-1',
        origin_id: 'budget-001',
        net_amount: 25000,
      }];
      return db;
    });

    const budget = {
      id: 'budget-003',
      budgetNumber: 'ORC-003',
      status: BUDGET_STATUS.RASCUNHO,
    };
    const access = resolveBudgetReadOnlyState(budget, { ...unlockedCtx, patientId: 'patient-1' });

    expect(access.isReadOnly).toBe(false);
    expect(access.isEditBlocked).toBe(false);
    expect(access.canApprove).toBe(true);
    expect(access.canChooseCondition).toBe(true);
    expect(isBudgetLocked(budget, { ...unlockedCtx, patientId: 'patient-1' })).toBe(false);
  });

  it('orphan contractId on draft budget does not lock without real contract', () => {
    const budget = {
      id: 'budget-draft',
      status: BUDGET_STATUS.RASCUNHO,
      contractId: 'ctr-missing',
    };

    expect(isBudgetLocked(budget, unlockedCtx)).toBe(false);
    expect(diagnoseBudgetLock(budget, unlockedCtx).locked).toBe(false);
  });

  it('financeGenerated true without receivables does not lock draft budget', () => {
    withDb((db) => {
      db.accountsReceivable = [];
      db.financings = [];
      db.patientFinancings = [];
      return db;
    });

    const budget = {
      id: 'budget-draft',
      status: BUDGET_STATUS.RASCUNHO,
      financeGenerated: true,
      financingId: 'fin-orphan',
    };

    expect(isBudgetLocked(budget, unlockedCtx)).toBe(false);
    expect(diagnoseBudgetLock(budget, unlockedCtx).locked).toBe(false);
  });

  it('não bloqueia por contrato legado sem budgetId no mesmo atendimento', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'ctr-legacy',
        quoteId: 'apt-1',
        quoteSource: 'clinical_budget',
        status: CONTRACT_STATUS.SIGNED,
        patientId: 'patient-1',
      }];
      return db;
    });

    const budget = { id: 'budget-new', status: BUDGET_STATUS.RASCUNHO };
    expect(isBudgetLocked(budget, {
      ...unlockedCtx,
      patientId: 'patient-1',
      contract: { id: 'ctr-legacy', status: CONTRACT_STATUS.SIGNED },
      contractApplies: false,
      hasActiveContract: false,
    })).toBe(false);
  });

  it('APROVADO sem contrato/financeiro congela edição comercial mas libera contrato', () => {
    const access = resolveBudgetReadOnlyState(
      { id: 'b1', status: BUDGET_STATUS.APROVADO },
      unlockedCtx,
    );
    expect(access.isEditBlocked).toBe(false);
    expect(access.isReadOnly).toBe(true);
    expect(access.isApprovedView).toBe(true);
    expect(access.isHistoricalView).toBe(false);
    expect(access.canApprove).toBe(false);
    expect(access.canGenerateContract).toBe(true);
  });

  it('bloqueia orçamento com status CONTRATO_GERADO', () => {
    const access = resolveBudgetReadOnlyState(
      { id: 'b1', status: BUDGET_STATUS.CONTRATO_GERADO },
      unlockedCtx,
    );
    expect(access.isReadOnly).toBe(true);
    expect(access.isNegotiationOpen).toBe(false);
    expect(access.lockReason).toBe('status');
  });

  it('bloqueia orçamento arquivado com status HISTORICO', () => {
    const access = resolveBudgetReadOnlyState(
      { id: 'b1', status: BUDGET_STATUS.HISTORICO },
      unlockedCtx,
    );
    expect(access.isReadOnly).toBe(true);
    expect(access.isHistoricalView).toBe(true);
    expect(access.canApprove).toBe(false);
    expect(access.lockReason).toBe('status');
  });

  it('não vincula contrato legado sem budgetId a orçamento em negociação', () => {
    const linked = isContractLinkedToBudget(
      { id: 'ctr-1', budgetId: null, quoteId: 'apt-1' },
      { id: 'budget-neg', status: BUDGET_STATUS.NEGOCIACAO },
    );
    expect(linked).toBe(false);
  });

  it('REPROVADO permanece editável sem vínculo real', () => {
    const access = resolveBudgetReadOnlyState(
      { id: 'b1', status: BUDGET_STATUS.REPROVADO },
      unlockedCtx,
    );
    expect(access.isReadOnly).toBe(false);
  });

  it('normaliza status EM_ELABORACAO para RASCUNHO', () => {
    expect(normalizeBudgetStatus('EM_ELABORACAO')).toBe(BUDGET_STATUS.RASCUNHO);
  });
});
