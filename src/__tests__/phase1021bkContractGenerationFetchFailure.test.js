/**
 * PHASE_10.21BK — geração de contrato: Failed to fetch, preview vs persistência, idempotência.
 * Sem mutar CTR-2026-00001/00002 de produção. Sem comunicação externa.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../auth/saasSessionResolver.js', () => ({
  getPlatformAccessToken: vi.fn(async () => 'test-jwt-not-a-secret'),
}));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { createId } from '../services/helpers.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  getContractStatusForQuote,
} from '../services/contractModuleService.js';
import { composeProfessionalClinicalContractHtml } from '../components/clinical/contract/composeProfessionalClinicalContract.js';
import { saveBudget, updateBudgetStatus } from '../services/clinicalService.js';
import { resolveContractForSelectedBudget } from '../contracts/resolveContractForSelectedBudget.js';
import { buildAdminApiUrl } from '../config/adminApiBase.js';
import {
  GENERATED_CONTRACTS_SYNC_PATH,
  syncGeneratedContractToSaas,
} from '../services/contractSaasSyncService.js';
import {
  CONTRACT_GENERATION_INDETERMINATE_MSG,
  CONTRACT_GENERATION_SYNC_UNCONFIRMED_MSG,
  mapContractGenerationUserError,
} from '../services/contractGenerationError.js';
import { decideAuthenticatedProfessionalSignature } from '../contracts/authenticatedSignerIdentity.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const PAULO_AUTH = '066dcd98-aecf-4886-8947-a439849e37f7';
const APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const CTR1_ID = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const CTR2_ID = 'gctr-cc1d92aa-6304-4fdf-9502-cc498679edbd';
const ORC1 = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const ORC2 = 'budget-26cb84bf-f9ea-41da-b8a3-9cab0c26884b';
const NEW_BUDGET = 'budget-83f7d5d8-f144-4c1f-bcb0-6b709507fe50';
const LIVE_API = 'https://appgestaoodonto-production.up.railway.app';

const julianaUser = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Juliana de Oliveira Freire',
};
const pauloUser = {
  id: PAULO_AUTH,
  role: 'admin',
  tenant_id: TENANT,
  tenantId: TENANT,
  name: 'Paulo Henrique Silva de Assis',
};

function snapshotLegacy(id) {
  const row = (loadDb().generatedContracts || []).find((c) => c.id === id);
  return row
    ? JSON.stringify({
      id: row.id,
      contractNumber: row.contractNumber,
      budgetId: row.budgetId,
      status: row.status,
      generatedAt: row.generatedAt,
      documentHash: row.documentHash,
    })
    : null;
}

function seedPilot() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = {
      id: 'clinic-b721c2c9',
      razaoSocial: 'Implanprime LTDA',
      nomeFantasia: 'Implanprime',
      tenant_id: TENANT,
    };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra. Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      id: 'addr-1',
      principal: true,
      logradouro: 'Rua Teste',
      numero: '1',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30130-000',
    }];
    db.collaborators = [{
      id: JULIANA_COL,
      nomeCompleto: 'Juliana de Oliveira Freire',
      cro: 'CRO-MG 27267',
      conselhoNumero: 'CRO-MG 27267',
      active: true,
      tenant_id: TENANT,
    }];
    db.collaboratorAccess = [
      { collaboratorId: JULIANA_COL, userId: JULIANA_AUTH, role: 'profissional' },
    ];
    db.patients = [{
      id: PATIENT,
      full_name: 'Paulo Henrique Silva de Assis',
      cpf: '39053344705',
      birth_date: '1990-01-15',
      tenant_id: TENANT,
    }];
    db.appointments = [{
      id: APPT,
      patientId: PATIENT,
      professionalId: JULIANA_COL,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      id: 'clinical-bk',
      appointmentId: APPT,
      patientId: PATIENT,
      plannedProcedures: [],
      budgetHistory: [{
        id: ORC2,
        status: BUDGET_STATUS.HISTORICO,
        budgetNumber: null,
      }],
    }];
    db.generatedContracts = [
      {
        id: CTR1_ID,
        contractNumber: 'CTR-2026-00001',
        budgetId: ORC1,
        quoteId: 'appt-0181d36a-c8a5-44af-b635-4389e52c7662',
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        status: CONTRACT_STATUS.SIGNED,
        clinicId: 'clinic-b721c2c9',
        tenant_id: TENANT,
        generatedAt: '2026-08-14T00:46:09.926Z',
        documentHash: 'hash-ctr1',
      },
      {
        id: CTR2_ID,
        contractNumber: 'CTR-2026-00002',
        budgetId: ORC2,
        quoteId: APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        status: CONTRACT_STATUS.SIGNED,
        clinicId: 'clinic-b721c2c9',
        tenant_id: TENANT,
        generatedAt: '2026-08-14T18:16:13.996Z',
        documentHash: 'hash-ctr2',
      },
    ];
    db.contractSignatures = [
      { id: 'csig-ctr2-a', contractId: CTR2_ID },
      { id: 'csig-ctr2-b', contractId: CTR2_ID },
    ];
    return db;
  });
  ensureContractsModuleSeeded();
  saveBudget(julianaUser, APPT, {
    id: NEW_BUDGET,
    status: BUDGET_STATUS.RASCUNHO,
    planName: 'Aplicação tópica de flúor',
    procedures: [{
      id: createId('proc'),
      name: 'Aplicação tópica de flúor',
      quantity: 1,
      unitValue: 150,
      totalValue: 150,
    }],
    paymentOptions: [{
      id: createId('pay'),
      label: 'À vista PIX',
      type: 'a_vista',
      total: 150,
      accepted: true,
      presentToPatient: true,
      presentationStatus: 'escolhida',
    }],
    totalValue: 150,
    professionalId: JULIANA_COL,
  });
  updateBudgetStatus(julianaUser, APPT, BUDGET_STATUS.APROVADO);
}

function createDraft(budgetId = NEW_BUDGET) {
  const tpl = (loadDb().contractTemplates || []).find((t) => t.type === 'system_default');
  return createContractDraft(julianaUser, {
    quoteSource: 'clinical_budget',
    quoteId: APPT,
    patientId: PATIENT,
    budgetId,
    templateId: tpl.id,
    editedHtml: '<p>Contrato clínico BK</p>',
    skipHashtagValidation: true,
  });
}

describe('PHASE_10.21BK contract generation fetch failure', () => {
  beforeEach(() => {
    resetDb();
    initDb();
    seedPilot();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('A) preview funciona independentemente da persistência', () => {
    const before = (loadDb().generatedContracts || []).length;
    const html = composeProfessionalClinicalContractHtml({
      quoteId: APPT,
      patientId: PATIENT,
      budgetId: NEW_BUDGET,
    });
    expect(html).toMatch(/Contrato/i);
    expect((loadDb().generatedContracts || []).length).toBe(before);
  });

  it('B/C) geração chama o endpoint Railway correto', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ACCESS_SAAS_ENABLED', '1');
    vi.stubEnv('VITE_SUPABASE_PLATFORM_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PLATFORM_ANON_KEY', 'anon-public');
    vi.stubEnv('VITE_PLATFORM_API_BASE_URL', LIVE_API);
    vi.stubEnv('VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST', '');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'gctr-x' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const draft = createDraft();
    const result = await syncGeneratedContractToSaas(draft);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${LIVE_API}${GENERATED_CONTRACTS_SYNC_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toMatch(/^Bearer /);
    const body = JSON.parse(init.body);
    expect(body.record.budgetId).toBe(NEW_BUDGET);
    expect(body.record.tenant_id).toBe(TENANT);
    expect(buildAdminApiUrl(GENERATED_CONTRACTS_SYNC_PATH)).toBe(`${LIVE_API}${GENERATED_CONTRACTS_SYNC_PATH}`);
  });

  it('D/E) tenant e budgetId do rascunho batem com o ciclo novo', () => {
    const draft = createDraft();
    expect(draft.budgetId).toBe(NEW_BUDGET);
    expect(draft.tenant_id).toBe(TENANT);
    expect(draft.patientId).toBe(PATIENT);
    expect(draft.quoteId).toBe(APPT);
  });

  it('F) falha de fetch no sync não cria contrato fantasma extra', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ACCESS_SAAS_ENABLED', '1');
    vi.stubEnv('VITE_SUPABASE_PLATFORM_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PLATFORM_ANON_KEY', 'anon-public');
    vi.stubEnv('VITE_PLATFORM_API_BASE_URL', LIVE_API);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Failed to fetch');
    }));
    const before = (loadDb().generatedContracts || []).length;
    const draft = createDraft();
    const sync = await syncGeneratedContractToSaas(draft);
    expect(sync.ok).toBe(false);
    expect(sync.network).toBe(true);
    expect((loadDb().generatedContracts || []).length).toBe(before + 1);
    expect((loadDb().generatedContracts || []).filter((c) => c.budgetId === NEW_BUDGET)).toHaveLength(1);
  });

  it('G/H) retry e double-click não duplicam contrato', () => {
    const first = createDraft();
    const second = createDraft();
    const third = createDraft();
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect((loadDb().generatedContracts || []).filter((c) => c.budgetId === NEW_BUDGET)).toHaveLength(1);
  });

  it('I) contrato de outro budget não é reutilizado', () => {
    const first = createDraft(NEW_BUDGET);
    const otherBudget = createId('budget');
    saveBudget(julianaUser, APPT, {
      id: otherBudget,
      status: BUDGET_STATUS.RASCUNHO,
      planName: 'Outro',
      procedures: [{ id: createId('proc'), name: 'Outro', quantity: 1, unitValue: 10, totalValue: 10 }],
      paymentOptions: [{
        id: createId('pay'),
        label: 'PIX',
        type: 'a_vista',
        total: 10,
        accepted: true,
        presentToPatient: true,
        presentationStatus: 'escolhida',
      }],
      totalValue: 10,
      professionalId: JULIANA_COL,
    });
    updateBudgetStatus(julianaUser, APPT, BUDGET_STATUS.APROVADO);
    const other = createDraft(otherBudget);
    expect(other.id).not.toBe(first.id);
    expect(other.budgetId).toBe(otherBudget);
    expect(first.budgetId).toBe(NEW_BUDGET);
  });

  it('J/K) CTR-00001 e CTR-00002 não são tocados', () => {
    const snap1 = snapshotLegacy(CTR1_ID);
    const snap2 = snapshotLegacy(CTR2_ID);
    createDraft();
    createDraft();
    expect(snapshotLegacy(CTR1_ID)).toBe(snap1);
    expect(snapshotLegacy(CTR2_ID)).toBe(snap2);
  });

  it('L) geração não cria signature evidence', () => {
    const before = (loadDb().contractSignatures || []).length;
    createDraft();
    expect((loadDb().contractSignatures || []).length).toBe(before);
    expect((loadDb().contractSignatures || []).some((s) => s.contractId !== CTR2_ID && s.contractId !== CTR1_ID)).toBe(false);
  });

  it('M/N) Paulo não assina como Juliana; Juliana é a identidade profissional canônica', () => {
    const required = { role: CLINICAL_SIGNER_ROLE.PROFESSIONAL, personId: JULIANA_COL };
    expect(decideAuthenticatedProfessionalSignature(pauloUser, required).decision).toBe('DENY');
    expect(decideAuthenticatedProfessionalSignature(julianaUser, required).decision).toBe('ALLOW');
  });

  it('O) Failed to fetch não vaza na UI final', () => {
    expect(mapContractGenerationUserError(new Error('Failed to fetch'))).toBe(CONTRACT_GENERATION_INDETERMINATE_MSG);
    expect(mapContractGenerationUserError(new Error('Failed to fetch'), { persistedLocally: true }))
      .toBe(CONTRACT_GENERATION_SYNC_UNCONFIRMED_MSG);
    const modal = readFileSync(path.join(ROOT, 'src/components/contracts/GenerateContractModal.jsx'), 'utf8');
    expect(modal).toContain('mapContractGenerationUserError');
    expect(modal).toContain('generateInFlightRef');
    expect(modal).toContain('disabled={');
    expect(modal).toContain('busy');
    const createFn = modal.slice(modal.indexOf('const handleCreateDraft'), modal.indexOf('const handleSaveEdits'));
    expect(createFn).toContain('mapContractGenerationUserError');
    expect(createFn).not.toContain("e?.message || 'Erro ao gerar rascunho.'");
  });

  it('P) reader continua selecionando contrato por budgetId', () => {
    const draft = createDraft();
    const resolved = resolveContractForSelectedBudget({
      budgetId: NEW_BUDGET,
      appointmentId: APPT,
      patientId: PATIENT,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.contract.id).toBe(draft.id);
    expect(getContractStatusForQuote(APPT, 'clinical_budget', ORC2, PATIENT)?.id).toBe(CTR2_ID);
    expect(getContractStatusForQuote(APPT, 'clinical_budget', NEW_BUDGET, PATIENT)?.id).toBe(draft.id);
  });

  it('token de sync usa storage local, não getSession de rede na hora do POST', () => {
    expect(vi.isMockFunction(getPlatformAccessToken)).toBe(true);
    const syncSrc = readFileSync(path.join(ROOT, 'src/services/contractSaasSyncService.js'), 'utf8');
    expect(syncSrc).toContain('getPlatformAccessToken');
    expect(syncSrc).not.toContain('auth.getSession');
    expect(syncSrc).toContain('network: true');
  });
});
