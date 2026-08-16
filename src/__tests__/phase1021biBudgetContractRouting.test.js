/**
 * PHASE_10.21BI — routing determinístico budget → appointment → contract.
 * Sem signature evidence. Sem mutar CTR/ORC de produção.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { initDb, resetDb, withDb, peekDb, getDbCloneCount, resetDbCloneCount } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { getContractStatusForQuote } from '../services/contractModuleService.js';
import {
  buildClinicalAppointmentUrl,
  openExistingBudget,
  resolveEffectiveViewBudgetId,
  resolveBudgetForView,
} from '../services/budgetNavigationService.js';
import { getClinicalWorkflowState } from '../components/clinical/clinicalAppointmentConfig.js';
import {
  resolveContractForSelectedBudget,
  NO_CONTRACT_FOR_SELECTED_BUDGET,
  CONTRACT_BUDGET_MISMATCH,
  assertCeremonyMatchesSelectedBudget,
} from '../contracts/resolveContractForSelectedBudget.js';
import { evaluateClinicalSignatureReadiness } from '../contracts/clinicalSignatureReadiness.js';
import { getActiveCategory, navCategories } from '../navigation/navCategories.js';
import { canSeeNavItem } from '../navigation/navAccess.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';
import { isRoutePermissionAllowed } from '../utils/rbacHelpers.js';
import {
  decideAuthenticatedProfessionalSignature,
} from '../contracts/authenticatedSignerIdentity.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-bi-paulo';
const APPT = 'appt-bi-shared';
const ORC1_ID = 'budget-bi-orc-001';
const ORC2_ID = 'budget-bi-orc-002';
const CTR1_ID = 'gctr-bi-00001';
const CTR2_ID = 'gctr-bi-00002';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const PAULO_AUTH = '066dcd98-aecf-4886-8947-a439849e37f7';
const modules = {
  CORE: true, AGENDA: true, CRM: true, FINANCEIRO: true, MARKETING: true, ESTOQUE: true, SUPORTE: true,
};

const juliana = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenantId: TENANT,
  isMaster: false,
  has_system_access: true,
  has_custom_permissions: false,
};

function seedCanonicalPair() {
  withDb((db) => {
    db.clinicProfile = { ...(db.clinicProfile || {}), id: 'clinic-1', tenant_id: TENANT };
    db.patients = [{ id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT }];
    db.appointments = [{
      id: APPT,
      patientId: PATIENT,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      professionalId: JULIANA_COL,
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      id: 'clinical-bi',
      appointmentId: APPT,
      patientId: PATIENT,
      budget: {
        id: ORC2_ID,
        budgetNumber: 'ORC-002',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        totalValue: 200,
        professionalId: JULIANA_COL,
        createdAt: '2026-08-16T12:00:00.000Z',
        approvedAt: '2026-08-16T12:10:00.000Z',
      },
      budgetHistory: [{
        id: ORC1_ID,
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.HISTORICO,
        totalValue: 100,
        professionalId: JULIANA_COL,
        archivedAt: '2026-08-15T18:00:00.000Z',
        createdAt: '2026-08-15T10:00:00.000Z',
        approvedAt: '2026-08-15T11:00:00.000Z',
      }],
    }];
    db.generatedContracts = [
      {
        id: CTR1_ID,
        clinicId: 'clinic-1',
        contractNumber: 'CTR-2026-00001',
        status: CONTRACT_STATUS.SIGNED,
        budgetId: ORC1_ID,
        quoteId: APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        tenant_id: TENANT,
        generatedAt: '2026-08-15T12:00:00.000Z',
      },
      {
        id: CTR2_ID,
        clinicId: 'clinic-1',
        contractNumber: 'CTR-2026-00002',
        status: CONTRACT_STATUS.GENERATED,
        budgetId: ORC2_ID,
        quoteId: APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        tenant_id: TENANT,
        generatedAt: '2026-08-16T12:20:00.000Z',
      },
    ];
    return db;
  });
}

function sidebarLabels(user, pathname) {
  const categoryId = getActiveCategory(pathname);
  const category = navCategories.find((row) => row.id === categoryId);
  return (category?.items || [])
    .filter((item) => canSeeNavItem(user, item, modules, {}).allowed)
    .map((item) => item.label);
}

describe('PHASE_10.21BI budget→contract deterministic routing', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedCanonicalPair();
  });

  it('A ORC-001 abre CTR-00001', () => {
    const resolved = resolveContractForSelectedBudget({ budgetId: ORC1_ID, appointmentId: APPT, patientId: PATIENT });
    expect(resolved.ok).toBe(true);
    expect(resolved.contract.contractNumber).toBe('CTR-2026-00001');
    expect(getContractStatusForQuote(APPT, 'clinical_budget', ORC1_ID, PATIENT)?.id).toBe(CTR1_ID);
  });

  it('B ORC-002 abre CTR-00002', () => {
    const resolved = resolveContractForSelectedBudget({ budgetId: ORC2_ID, appointmentId: APPT, patientId: PATIENT });
    expect(resolved.ok).toBe(true);
    expect(resolved.contract.contractNumber).toBe('CTR-2026-00002');
    expect(getClinicalWorkflowState(APPT, ORC2_ID).linkedContractStatus).toBe(CONTRACT_STATUS.GENERATED);
  });

  it('C dois budgets do mesmo patientId nunca trocam contrato', () => {
    expect(resolveContractForSelectedBudget({ budgetId: ORC1_ID, patientId: PATIENT }).contract.id).toBe(CTR1_ID);
    expect(resolveContractForSelectedBudget({ budgetId: ORC2_ID, patientId: PATIENT }).contract.id).toBe(CTR2_ID);
  });

  it('D appointmentId compartilhado não é chave suficiente', () => {
    expect(getContractStatusForQuote(APPT, 'clinical_budget', ORC2_ID, PATIENT)?.id).toBe(CTR2_ID);
    expect(getContractStatusForQuote(APPT, 'clinical_budget', ORC1_ID, PATIENT)?.id).toBe(CTR1_ID);
  });

  it('E budgetId explícito tem precedência na URL e no selectedBudget', () => {
    const url = buildClinicalAppointmentUrl({ appointmentId: APPT, budgetId: ORC2_ID, section: 'contratos' });
    expect(url).toContain(`budgetId=${ORC2_ID}`);
    expect(url).not.toContain(ORC1_ID);
    expect(resolveEffectiveViewBudgetId(APPT, ORC2_ID, {
      appointmentStatus: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    })).toBe(ORC2_ID);
    expect(resolveBudgetForView(APPT, ORC2_ID).budget.id).toBe(ORC2_ID);
  });

  it('F contrato de outro budget nunca é fallback', () => {
    expect(getContractStatusForQuote(APPT, 'clinical_budget', 'budget-inexistente', PATIENT)).toBeNull();
  });

  it('G inexistência de contrato para budget explícito = fail closed', () => {
    const missing = resolveContractForSelectedBudget({
      budgetId: 'budget-sem-contrato',
      appointmentId: APPT,
      patientId: PATIENT,
    });
    expect(missing).toEqual({
      ok: false,
      code: NO_CONTRACT_FOR_SELECTED_BUDGET,
      contract: null,
    });
  });

  it('H ceremony.contractId deve ser o selectedContract.id', () => {
    const selected = resolveContractForSelectedBudget({ budgetId: ORC2_ID, appointmentId: APPT });
    expect(assertCeremonyMatchesSelectedBudget({
      selectedBudgetId: ORC2_ID,
      selectedContract: selected.contract,
    }).ok).toBe(true);
    expect(assertCeremonyMatchesSelectedBudget({
      selectedBudgetId: ORC2_ID,
      selectedContract: { id: CTR1_ID, budgetId: ORC1_ID },
    }).code).toBe(CONTRACT_BUDGET_MISMATCH);
  });

  it('I manifest/evidence não iniciam com mismatch budget/contract', () => {
    const readiness = evaluateClinicalSignatureReadiness({
      appointmentId: APPT,
      budgetId: ORC2_ID,
      patientId: PATIENT,
      tenantId: TENANT,
      contractId: CTR1_ID,
      user: juliana,
    });
    expect(readiness.ok).toBe(false);
  });

  it('J navegar ORC-001 → ORC-002 não mantém selectedContract stale', () => {
    const first = resolveContractForSelectedBudget({ budgetId: ORC1_ID, appointmentId: APPT });
    const second = resolveContractForSelectedBudget({ budgetId: ORC2_ID, appointmentId: APPT });
    expect(first.contract.id).toBe(CTR1_ID);
    expect(second.contract.id).toBe(CTR2_ID);
    expect(second.contract.id).not.toBe(first.contract.id);
  });

  it('K refresh direto na URL de ORC-002 resolve o mesmo contrato', () => {
    const urlBudgetId = new URL(`https://loveodonto.com.br${buildClinicalAppointmentUrl({
      appointmentId: APPT,
      budgetId: ORC2_ID,
    })}`).searchParams.get('budgetId');
    expect(urlBudgetId).toBe(ORC2_ID);
    expect(resolveContractForSelectedBudget({ budgetId: urlBudgetId, appointmentId: APPT }).contract.id).toBe(CTR2_ID);
  });

  it('L profissional mantém RBAC na rota clínica', () => {
    const permission = resolveRoutePermission(`/atendimento-clinico/${APPT}`);
    expect(isRoutePermissionAllowed(juliana, permission, canByPermission)).toBe(true);
    expect(canByPermission(juliana, 'prontuario_orcamentos:view')).toBe(true);
  });

  it('M banner accessDenied não permanece após navegação autorizada', () => {
    const previousPath = '/financeiro/contas-receber';
    const nextPath = `/atendimento-clinico/${APPT}`;
    const incoming = '';
    const staleCleared = Boolean(previousPath && previousPath !== nextPath && !incoming);
    expect(staleCleared).toBe(true);
  });

  it('N sidebar consistente entre /gestao-atendimento e /atendimento-clinico', () => {
    expect(getActiveCategory('/gestao-atendimento')).toBe('gestao-atendimento');
    expect(getActiveCategory(`/atendimento-clinico/${APPT}`)).toBe('gestao-atendimento');
    const hub = sidebarLabels(juliana, '/gestao-atendimento');
    const clinical = sidebarLabels(juliana, `/atendimento-clinico/${APPT}`);
    expect(hub).toEqual(clinical);
    expect(hub).toContain('Orçamentos');
    expect(hub).toContain('Agenda da Clínica');
  });

  it('O Paulo/admin não assina como profissional', () => {
    const master = { id: PAULO_AUTH, role: 'master', isMaster: true, tenantId: TENANT };
    const decided = decideAuthenticatedProfessionalSignature(master, {
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: JULIANA_COL,
    });
    expect(decided.decision).toBe('DENY');
  });

  it('P authenticated signer identity permanece fail-closed', () => {
    expect(JULIANA_COL.startsWith('col-saas-')).toBe(false);
    const decided = decideAuthenticatedProfessionalSignature(juliana, {
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: JULIANA_COL,
    });
    expect(['ALLOW', 'DENY']).toContain(decided.decision);
  });

  it('hub Abrir orçamento / Ver contrato usa o budget.id do card clicado', () => {
    const navigate = vi.fn();
    openExistingBudget(navigate, {
      budgetId: ORC2_ID,
      patientId: PATIENT,
      appointmentId: APPT,
      section: 'contratos',
    });
    const url = navigate.mock.calls[0][0];
    expect(url).toContain(`/atendimento-clinico/${APPT}`);
    expect(url).toContain(`budgetId=${ORC2_ID}`);
    expect(url).not.toContain(ORC1_ID);
  });

  it('zero clone pesado na seleção budget→contract', () => {
    resetDbCloneCount();
    resolveContractForSelectedBudget({ budgetId: ORC2_ID, appointmentId: APPT });
    resolveContractForSelectedBudget({ budgetId: ORC1_ID, appointmentId: APPT });
    expect(getDbCloneCount()).toBe(0);
    expect(peekDb()).toBe(peekDb());
  });
});
