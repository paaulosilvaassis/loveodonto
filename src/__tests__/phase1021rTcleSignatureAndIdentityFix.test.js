import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, resetDb, withDb } from '../db/index.js';
import { replaceTemplateVariables } from '../utils/documentTemplates.js';
import {
  resolvePatientFullName,
  resolveProfessionalCro,
  resolveProfessionalFullName,
} from '../utils/patientIdentity.js';
import { createDocumentRecord } from '../services/documentService.js';
import {
  attachTcleDocumentToTreatmentPackage,
  listPackageDocumentStatuses,
} from '../services/tclePackageAttachmentService.js';
import { buildDocumentPackageForBudget } from '../services/operationalContractWizardService.js';
import {
  buildPrerequisiteDestination,
} from '../contracts/contractPrerequisitesResolution.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PATIENT_ID = 'patient-paulo-1021r';
const APPT_ID = 'appt-1021r';
const BUDGET_ID = 'budget-1021r';
const CONTRACT_ID = 'contract-1021r';
const TENANT = 'tenant-1021r';
const user = { id: 'user-1', role: 'admin', tenantId: TENANT, tenant_id: TENANT };

function seedBase() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clinic', status: 'active' }];
    db.patients = [{
      id: PATIENT_ID,
      tenant_id: TENANT,
      full_name: 'Paulo Henrique Silva de Assis',
      nickname: 'de Assis',
      social_name: '',
      cpf: '52998224725',
      birth_date: '1985-03-15',
    }];
    db.collaborators = [{
      id: 'col-juliana',
      tenant_id: TENANT,
      nomeCompleto: 'Dra. Juliana de Oliveira Freire',
      apelido: 'Juliana',
      conselhoNumero: '12345',
      conselhoUf: 'MG',
      registroProfissional: '12345',
      status: 'ativo',
    }];
    db.appointments = [{
      id: APPT_ID,
      tenant_id: TENANT,
      patientId: PATIENT_ID,
      professionalId: 'col-juliana',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      date: '2026-08-11',
    }];
    db.clinicalAppointments = [{
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budget: {
        id: BUDGET_ID,
        status: BUDGET_STATUS.APROVADO,
        planName: 'Protocolo total inferior',
        procedures: [{ name: 'Protocolo total inferior', quantity: 1, unitValue: 1000 }],
      },
      budgetHistory: [],
      documents: [],
    }];
    db.clinicProfile = {
      id: 'clinic-1021r',
      tenant_id: TENANT,
      nomeClinica: 'Implanprime',
    };
    db.generatedContracts = [{
      id: CONTRACT_ID,
      clinicId: 'clinic-1021r',
      quoteId: APPT_ID,
      quoteSource: 'clinical_budget',
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      status: CONTRACT_STATUS.GENERATED,
      renderedHtml: '<p>Contrato</p>',
      metadata: { attachedTcleIds: [] },
      generatedAt: new Date().toISOString(),
    }];
    db.documentRecords = [];
    return db;
  });
}

describe('PHASE_10.21R — TCLE signature integration + identity fix', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
    seedBase();
  });

  it('1/2 TCLE entra no package e é idempotente', () => {
    const doc = createDocumentRecord(user, {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'consent_implante',
      title: 'Implante',
      content: 'TCLE teste',
      metadata: { tcleId: 'tcle_implante' },
    });
    const first = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      documentId: doc.id,
      templateKey: 'consent_implante',
    });
    expect(first.ok).toBe(true);
    expect(first.attached).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.tcleId).toBe('tcle_implante');

    const second = attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      documentId: doc.id,
      templateKey: 'consent_implante',
    });
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);

    const pkg = buildDocumentPackageForBudget({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    const tcle = pkg.items.find((i) => i.documentType === 'TCLE');
    expect(tcle?.ready).toBe(true);
  });

  it('3/4 Contrato + TCLE + LGPD coexistem com identidade própria', () => {
    attachTcleDocumentToTreatmentPackage({
      user,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      templateKey: 'consent_implante',
    });
    const statuses = listPackageDocumentStatuses({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    const types = statuses.map((s) => s.documentType);
    expect(types).toEqual(expect.arrayContaining(['CONTRACT_SERVICES', 'TCLE', 'LGPD']));
    expect(new Set(types).size).toBeGreaterThanOrEqual(3);
    expect(statuses.find((s) => s.documentType === 'CONTRACT_SERVICES')?.label)
      .not.toEqual(statuses.find((s) => s.documentType === 'TCLE')?.label);
  });

  it('5 paciente completo nunca é truncado (inclui nickname enganoso)', () => {
    const nested = {
      profile: { full_name: 'Paulo Henrique Silva de Assis' },
      nickname: 'de Assis',
    };
    expect(resolvePatientFullName(nested)).toBe('Paulo Henrique Silva de Assis');
    expect(resolvePatientFullName({
      full_name: 'Maria da Silva',
      nickname: 'Maria',
    })).toBe('Maria da Silva');
    expect(resolvePatientFullName({
      full_name: 'João Pedro Souza Neto',
    })).toBe('João Pedro Souza Neto');

    const body = 'Nome: {{NOME_PACIENTE}}';
    const out = replaceTemplateVariables(body, {
      NOME_PACIENTE: 'Paulo Henrique Silva de Assis',
      NOME: 'ERRADO',
    });
    expect(out).toBe('Nome: Paulo Henrique Silva de Assis');
    expect(out).not.toBe('Nome: de Assis');
    expect(out.startsWith('Nome: Paulo')).toBe(true);
  });

  it('6/7 CRO profissional mapeado; ausência não inventa CRO', () => {
    const withCro = resolveProfessionalCro({
      nomeCompleto: 'Dra. Juliana de Oliveira Freire',
      conselhoNumero: '12345',
      conselhoUf: 'MG',
    });
    expect(withCro.cro).toBe('12345');
    expect(withCro.display).toMatch(/12345/);
    expect(resolveProfessionalFullName({
      nomeCompleto: 'Dra. Juliana de Oliveira Freire',
    })).toBe('Dra. Juliana de Oliveira Freire');

    const missing = resolveProfessionalCro({ nomeCompleto: 'Dr. Sem CRO' });
    expect(missing.cro).toBe('');
    expect(missing.display).toBe('');
  });

  it('8/9 CTA Resolver TCLE abre Consentimentos e destaca template', () => {
    const dest = buildPrerequisiteDestination('tcle', {
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      items: [{ tag: 'tcle:tcle_implante', label: 'TCLE Implantes' }],
    });
    expect(dest.href).toContain('section=documentos');
    expect(dest.href).toContain('docCategory=consentimentos');
    expect(dest.href).toContain('docTemplate=consent_implante');
    expect(dest.href).toContain(`patientId=${PATIENT_ID}`);
    expect(dest.returnUrl).toContain('section=contratos');

    const page = readFileSync(path.join(ROOT, 'src/pages/ClinicalAppointmentPage.jsx'), 'utf8');
    expect(page).toContain('docCategoryParam');
    expect(page).toContain('initialCategory={docCategoryParam}');
    expect(page).toContain('initialTemplateKey={docTemplateParam}');
    expect(page).toContain('key={`docs-${docCategoryParam');
  });

  it('10/11 package statuses sem motor paralelo; sem comunicação auto', () => {
    const svc = readFileSync(path.join(ROOT, 'src/services/tclePackageAttachmentService.js'), 'utf8');
    expect(svc).toContain('attachedTcleIds');
    expect(svc).not.toMatch(/whatsapp|sendEmail|twilio|sms/i);
    expect(svc).not.toMatch(/createSignatureEnvelope|new SignatureProvider/);

    const docs = readFileSync(path.join(ROOT, 'src/components/clinical/DocumentsSection.jsx'), 'utf8');
    expect(docs).toContain('Adicionar ao pacote de assinatura');
    expect(docs).toContain('resolvePatientFullName');
  });

  it('12/13/14/15 sem alteração financeiro/agenda; V1 e rollout intactos', () => {
    const files = [
      'src/services/tclePackageAttachmentService.js',
      'src/utils/patientIdentity.js',
      'src/components/clinical/DocumentsSection.jsx',
    ];
    for (const rel of files) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(/contracts_operational_ux_global_enabled/);
      expect(src).not.toMatch(/productionGlobalEnabled\s*=\s*true/);
      expect(src).not.toMatch(/feature_flags/);
    }
    expect(existsSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'src/pages/contratos/ContractsPendentesPage.jsx'))).toBe(true);
  });

  it('treatment mapping: protocolo usa tcle_implante (regra atual do registry)', () => {
    // Regra existente: PROTOCOLO_TOTAL → tcle_implante (não inventar obrigação nova).
    const registry = readFileSync(path.join(ROOT, 'src/contracts/contractTcleRegistry.js'), 'utf8');
    expect(registry).toContain('PROTOCOLO_TOTAL');
    expect(registry).toContain("id: 'tcle_implante'");
    expect(registry).toContain('Implantes / Protocolo');
  });
});
