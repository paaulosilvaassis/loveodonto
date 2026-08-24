/**
 * PHASE_10.21BZ — cutover do writer real de version para contratos futuros.
 * Sem produção, sem backfill CTR-00004, sem e-mail, sem stroke real.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  INITIAL_GENERATED_CONTRACT_VERSION,
  requirePersistedContractVersion,
} from '../contracts/generatedContractVersion.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import {
  createContractDraft,
  ensureContractsModuleSeeded,
  finalizeGeneratedContract,
  signContractOnScreen,
} from '../services/contractModuleService.js';
import { getGeneratedContract } from '../services/contractService.js';
import { generateFinalSignedPdfDataUrl } from '../services/finalSignedContractArtifactService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-bz';
const user = { id: 'user-bz', name: 'Dr. BZ', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('PHASE_10.21BZ real writer cutover', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'Clínica BZ', status: 'active' }];
      db.clinicProfile = { id: 'clinic-bz', razaoSocial: 'Clínica BZ', tenant_id: TENANT };
      db.clinicDocumentation = {
        cnpj: '12345678000199',
        responsavelTecnico: 'Dr. BZ',
        conselhoRegionalNumero: 'CRO-MG 1',
      };
      db.clinicAddresses = [{
        principal: true, logradouro: 'Rua BZ', numero: '1', bairro: 'Centro',
        cidade: 'Belo Horizonte', uf: 'MG', cep: '30100000',
      }];
      db.patients = [{
        id: 'pat-bz', tenant_id: TENANT, full_name: 'Paciente BZ',
        cpf: '52998224725', birth_date: '1990-01-01', sex: 'M',
      }];
      db.patientAddresses = [{
        patient_id: 'pat-bz', principal: true, logradouro: 'Rua Paciente',
        numero: '10', bairro: 'Savassi', cidade: 'Belo Horizonte', uf: 'MG',
      }];
      db.crmBudgets = [{
        id: 'budget-bz-crm', title: 'Profilaxia', patientId: 'pat-bz', leadId: 'lead-bz',
        status: 'APROVADO', totalValue: 350, paymentMethod: 'À vista',
        itemsJson: [{ description: 'Profilaxia', value: 350 }],
        createdAt: new Date().toISOString(),
      }];
      db.appointments = [{
        id: 'appt-bz', patientId: 'pat-bz', professionalId: 'col-bz',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT,
      }];
      db.clinicalAppointments = [{
        appointmentId: 'appt-bz',
        patientId: 'pat-bz',
        budget: {
          id: 'budget-bz-clinical',
          budgetNumber: 'ORC-BZ',
          status: BUDGET_STATUS.APROVADO,
          planName: 'Aplicação tópica de flúor',
          procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
          totalValue: 150,
          paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
        },
      }];
      return db;
    });
    ensureContractsModuleSeeded();
  });

  it('UI writer persiste version=1, finalize/freeze/evidence/PDF usam o campo persistido', async () => {
    const modal = readSrc('src/components/contracts/GenerateContractModal.jsx');
    expect(modal).toContain('createContractDraft(user');
    expect(readSrc('src/services/contractModuleService.js')).toContain('createGeneratedContractDraft(user, payload)');
    expect(readSrc('src/services/contractService.js')).toContain('version: INITIAL_GENERATED_CONTRACT_VERSION');

    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const draft = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: 'appt-bz',
      patientId: 'pat-bz',
      budgetId: 'budget-bz-clinical',
      templateId: tpl.id,
      editedHtml: '<p>Contrato BZ flúor</p>',
      skipHashtagValidation: true,
    });
    expect(draft.version).toBe(INITIAL_GENERATED_CONTRACT_VERSION);
    expect(getGeneratedContract(draft.id).version).toBe(1);
    expect(requirePersistedContractVersion(getGeneratedContract(draft.id))).toBe(1);

    const finalized = finalizeGeneratedContract(user, draft.id);
    expect(finalized.version).toBe(1);
    expect(finalized.status).toBe(CONTRACT_STATUS.GENERATED);

    const prepared = await prepareClinicalSignaturePackage({
      user,
      appointmentId: 'appt-bz',
      budgetId: 'budget-bz-clinical',
      patientId: 'pat-bz',
      contractId: draft.id,
    });
    expect(prepared.ok).toBe(true);
    const frozen = (loadDb().clinicalPackageManifests || [])[0];
    const contractDoc = (frozen?.documents || []).find((d) => d.documentType === 'SERVICE_CONTRACT' || d.documentKey === 'contract');
    expect(String(contractDoc?.documentVersion)).toBe('1');

    const signed = signContractOnScreen(user, draft.id, {
      signerName: 'Paciente BZ',
      signerCpf: '52998224725',
      signerRole: 'PATIENT',
      signerPersonId: 'pat-bz',
      signatureImageDataUrl: 'data:image/png;base64,abc',
    });
    expect(signed.signature.evidenceJson.contractVersion).toBe(1);
    expect(signed.signature.evidenceJson.contractVersion).not.toBeUndefined();

    const pdf = generateFinalSignedPdfDataUrl({
      contract: { ...getGeneratedContract(draft.id), status: 'signed' },
      signatures: [signed.signature],
    });
    expect(String(pdf)).toMatch(/^data:application\/pdf/);
  });

  it('finalize sem version bloqueia; writers novos não usam fallback implícito', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-bz-no-version',
        clinicId: 'clinic-bz',
        patientId: 'pat-bz',
        quoteId: 'budget-bz-crm',
        quoteSource: 'crm_budget',
        budgetId: 'budget-bz-crm',
        status: 'draft',
        finalContent: '<p>x</p>',
        renderedHtml: '<p>x</p>',
        metadata: {},
      }];
    });
    expect(() => finalizeGeneratedContract(user, 'gctr-bz-no-version')).toThrow(/versão/i);

    const signSrc = readSrc('src/services/contractModuleService.js');
    const freezeSrc = readSrc('src/services/clinicalSignaturePackageService.js');
    const pdfSrc = readSrc('src/services/finalSignedContractArtifactService.js');
    const helper = readSrc('src/contracts/generatedContractVersion.js');
    expect(helper).toContain('export function requirePersistedContractVersion');
    expect(helper).not.toContain('?? INITIAL_GENERATED_CONTRACT_VERSION');
    expect(signSrc).toContain('requirePersistedContractVersion(contract)');
    expect(signSrc).not.toMatch(/contract\.version \|\| 1/);
    expect(freezeSrc).toContain('requirePersistedContractVersion(contract)');
    expect(freezeSrc).not.toMatch(/templateVersion \|\| contract\.version \|\| '1'/);
    expect(pdfSrc).toContain('requirePersistedContractVersion');
    expect(pdfSrc).not.toMatch(/live\.version \|\| 1/);
    expect(pdfSrc).not.toMatch(/contract\.version \|\| 1/);
    expect(signSrc).not.toContain('gctr-930c24bc-f658-4354-81e3-8eea61335361');
  });
});
