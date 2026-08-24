/**
 * PHASE_10.21BX — persistir generatedContracts.version em contratos futuros.
 * Sem backfill. Sem mutar CTR-2026-00004. Sem assinar produção. Sem e-mail.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  INITIAL_GENERATED_CONTRACT_VERSION,
  readPersistedContractVersion,
} from '../contracts/generatedContractVersion.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  createContractDraft,
  ensureContractsModuleSeeded,
  finalizeGeneratedContract,
} from '../services/contractModuleService.js';
import { getGeneratedContract } from '../services/contractService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-bx';
const user = { id: 'user-bx', name: 'Dr. BX', role: 'admin', tenant_id: TENANT, tenantId: TENANT };
const CTR00004 = 'gctr-930c24bc-f658-4354-81e3-8eea61335361';

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('PHASE_10.21BX contract version SSOT', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'Clínica BX', status: 'active' }];
      db.clinicProfile = { id: 'clinic-bx', razaoSocial: 'Clínica BX', tenant_id: TENANT };
      db.clinicDocumentation = {
        cnpj: '12345678000199',
        responsavelTecnico: 'Dr. BX',
        conselhoRegionalNumero: 'CRO-MG 1',
      };
      db.clinicAddresses = [{
        principal: true,
        logradouro: 'Rua BX',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        uf: 'MG',
        cep: '30100000',
      }];
      db.patients = [{
        id: 'pat-bx',
        tenant_id: TENANT,
        full_name: 'Paciente BX',
        cpf: '52998224725',
        birth_date: '1990-01-01',
        sex: 'M',
      }];
      db.patientAddresses = [{
        patient_id: 'pat-bx',
        principal: true,
        logradouro: 'Rua Paciente',
        numero: '10',
        bairro: 'Savassi',
        cidade: 'Belo Horizonte',
        uf: 'MG',
      }];
      db.crmBudgets = [{
        id: 'budget-bx',
        title: 'Profilaxia',
        patientId: 'pat-bx',
        leadId: 'lead-bx',
        status: 'APROVADO',
        totalValue: 350,
        paymentMethod: 'À vista',
        itemsJson: [{ description: 'Profilaxia', value: 350 }],
        createdAt: new Date().toISOString(),
      }];
      return db;
    });
    ensureContractsModuleSeeded();
  });

  it('draft futuro persiste version=1 distinto de templateVersion', () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const row = createContractDraft(user, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-bx',
      patientId: 'pat-bx',
      templateId: tpl.id,
    });
    expect(row.id).not.toBe(CTR00004);
    expect(readPersistedContractVersion(row)).toBe(INITIAL_GENERATED_CONTRACT_VERSION);
    expect(row.templateVersion).toBe(Number(tpl.version || 1));
    expect(getGeneratedContract(row.id).version).toBe(1);
  });

  it('finalize preserva version sem incrementar', () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const draft = createContractDraft(user, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-bx',
      patientId: 'pat-bx',
      templateId: tpl.id,
    });
    expect(draft.version).toBe(1);
    const finalized = finalizeGeneratedContract(user, draft.id);
    expect(finalized.version).toBe(1);
    expect(finalized.status).toBe(CONTRACT_STATUS.GENERATED);
  });

  it('freeze de contrato legado sem version não faz backfill', async () => {
    withDb((db) => {
      db.appointments = [{
        id: 'appt-bx-legacy',
        patientId: 'pat-bx',
        professionalId: 'col-bx',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      }];
      db.clinicalAppointments = [{
        appointmentId: 'appt-bx-legacy',
        patientId: 'pat-bx',
        budget: {
          id: 'budget-bx-clinical',
          budgetNumber: 'ORC-BX',
          status: BUDGET_STATUS.CONTRATO_GERADO,
          planName: 'Aplicação tópica de flúor',
          procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
          totalValue: 150,
          paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
        },
      }];
      db.generatedContracts = [{
        id: 'gctr-bx-unversioned',
        contractNumber: 'CTR-BX-LEGACY',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        quoteId: 'appt-bx-legacy',
        budgetId: 'budget-bx-clinical',
        patientId: 'pat-bx',
        clinicId: 'clinic-bx',
        tenant_id: TENANT,
        templateVersion: 1,
        renderedHtml: '<p>legado sem version</p>',
        metadata: {},
      }];
      db.clinicalPackageManifests = [];
    });
    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId: 'appt-bx-legacy',
      budgetId: 'budget-bx-clinical',
      patientId: 'pat-bx',
      contractId: 'gctr-bx-unversioned',
    });
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toMatch(/versão/i);
    const live = getGeneratedContract('gctr-bx-unversioned');
    expect(Object.prototype.hasOwnProperty.call(live, 'version')).toBe(false);
    expect(readPersistedContractVersion(live)).toBeNull();
    expect(live.metadata?.packageManifestId).toBeFalsy();
    expect(loadDb().generatedContracts.some((c) => c.id === CTR00004)).toBe(false);
  });

  it('writers futuros não backfillam CTR-00004', () => {
    const draftSrc = readSrc('src/services/contractService.js');
    const freezeSrc = readSrc('src/services/clinicalSignaturePackageService.js');
    const moduleSrc = readSrc('src/services/contractModuleService.js');
    expect(draftSrc).toContain('version: INITIAL_GENERATED_CONTRACT_VERSION');
    expect(freezeSrc).not.toMatch(/version:\s*1/);
    expect(freezeSrc).not.toContain(CTR00004);
    expect(moduleSrc).not.toContain(CTR00004);
    expect(draftSrc).not.toContain(CTR00004);
  });
});
