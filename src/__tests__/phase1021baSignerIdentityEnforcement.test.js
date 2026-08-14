/**
 * PHASE_10.21BA — anti-impersonation do signatário profissional.
 * Sem mutar CTR-2026-00002. Sem comunicação externa.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;
vi.mock('../services/contractPdfService.js', () => ({
  contractHtmlWithSignatures: (html) => html || '',
  downloadContractPdfFromElement: async () => {},
  printContractElement: () => {},
}));

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS, DEFAULT_CONTRACT_SETTINGS } from '../contracts/contractConstants.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { prepareClinicalSignaturePackage } from '../services/clinicalSignaturePackageService.js';
import { signContractOnScreen } from '../services/contractModuleService.js';
import { ClinicalSignatureSection } from '../components/clinical/ClinicalSignatureSection.jsx';
import {
  SIGNER_IDENTITY_ERROR,
  SignerIdentityError,
  canAuthenticatedUserSignSlot,
  resolveAuthenticatedSignerIdentity,
} from '../contracts/authenticatedSignerIdentity.js';
import { printClinicalContractForManualSignature } from '../contracts/printClinicalContractForManualSignature.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER_TENANT = 'tenant-ba-other';
const PATIENT_ID = 'patient-ba-paulo';
const APPT_ID = 'appt-ba-identity';
const OTHER_APPT = 'appt-ba-other';
const BUDGET_ID = 'budget-ba-orc';
const OTHER_BUDGET = 'budget-ba-other';
const CONTRACT_ID = 'gctr-ba-identity';
const OTHER_CONTRACT = 'gctr-ba-other';
const JULIANA = 'col-ba-juliana';
const OTHER_DENTIST = 'col-ba-other-dentist';
const PAULO_COL = 'col-ba-paulo-admin';

const pauloAdmin = { id: 'user-ba-paulo', role: 'admin', tenantId: TENANT, tenant_id: TENANT, isMaster: false };
const pauloMaster = { id: 'user-ba-paulo-master', role: 'master', tenantId: TENANT, tenant_id: TENANT, isMaster: true };
const julianaUser = { id: 'user-ba-juliana', role: 'profissional', tenantId: TENANT, tenant_id: TENANT };
const otherDentistUser = { id: 'user-ba-other-dentist', role: 'profissional', tenantId: TENANT, tenant_id: TENANT };
const otherTenantUser = { id: 'user-ba-other-tenant', role: 'admin', tenantId: OTHER_TENANT, tenant_id: OTHER_TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function seed({
  dentistId = JULIANA,
  rtName = 'Dra. Juliana de Oliveira Freire',
  rtCro = 'CRO-MG 27267',
  requireRt = false,
  extraContract = null,
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }, { id: OTHER_TENANT, name: 'Outro' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT, nomeFantasia: 'Implanprime' };
    db.clinicDocumentation = { cnpj: '11222333000181', responsavelTecnico: rtName, croResponsavelTecnico: rtCro };
    db.collaborators = [
      { id: JULIANA, nomeCompleto: 'Juliana de Oliveira Freire', conselhoNumero: '27267', conselhoUf: 'MG', tenant_id: TENANT },
      { id: OTHER_DENTIST, nomeCompleto: 'Outro Dentista', conselhoNumero: '99999', conselhoUf: 'MG', tenant_id: TENANT },
      { id: PAULO_COL, nomeCompleto: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
    ];
    db.collaboratorAccess = [
      { collaboratorId: JULIANA, userId: julianaUser.id, role: 'profissional' },
      { collaboratorId: OTHER_DENTIST, userId: otherDentistUser.id, role: 'profissional' },
      { collaboratorId: PAULO_COL, userId: pauloAdmin.id, role: 'admin' },
      { collaboratorId: PAULO_COL, userId: pauloMaster.id, role: 'master' },
    ];
    db.memberships = [
      { tenant_id: TENANT, user_id: pauloAdmin.id, role: 'admin', has_system_access: true, status: 'active' },
      { tenant_id: TENANT, user_id: pauloMaster.id, role: 'master', has_system_access: true, status: 'active' },
      { tenant_id: TENANT, user_id: julianaUser.id, role: 'profissional', has_system_access: true, status: 'active' },
      { tenant_id: TENANT, user_id: otherDentistUser.id, role: 'profissional', has_system_access: true, status: 'active' },
      { tenant_id: OTHER_TENANT, user_id: otherTenantUser.id, role: 'admin', has_system_access: true, status: 'active' },
    ];
    db.patients = [{ id: PATIENT_ID, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT, cpf: '39053344705', birth_date: '1988-01-01' }];
    db.appointments = [
      { id: APPT_ID, patientId: PATIENT_ID, professionalId: dentistId, status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT },
      { id: OTHER_APPT, patientId: PATIENT_ID, professionalId: OTHER_DENTIST, status: APPOINTMENT_STATUS.EM_ATENDIMENTO, tenant_id: TENANT },
    ];
    db.clinicalAppointments = [
      {
        appointmentId: APPT_ID,
        patientId: PATIENT_ID,
        budget: {
          id: BUDGET_ID,
          budgetNumber: 'ORC-BA',
          status: BUDGET_STATUS.CONTRATO_GERADO,
          planName: 'Aplicação tópica de flúor',
          procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
          totalValue: 150,
          paymentOptions: [{ accepted: true, method: 'pix', presentationStatus: 'escolhida' }],
        },
      },
      {
        appointmentId: OTHER_APPT,
        patientId: PATIENT_ID,
        budget: { id: OTHER_BUDGET, budgetNumber: 'ORC-BA-2', status: BUDGET_STATUS.APROVADO, planName: 'Outro', procedures: [] },
      },
    ];
    db.contractSettings = [{
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      settings: { ...DEFAULT_CONTRACT_SETTINGS, requireTechnicalResponsible: requireRt },
    }];
    db.generatedContracts = [{
      id: CONTRACT_ID,
      contractNumber: 'CTR-BA-IDENTITY',
      status: CONTRACT_STATUS.GENERATED,
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      version: 1,
      renderedHtml: '<p>CTR-BA-IDENTITY</p>',
      metadata: { signerRules: { requireTechnicalResponsible: requireRt } },
    }];
    if (extraContract) db.generatedContracts.push(extraContract);
    db.contractSignatures = [];
  });
}

async function freeze(actor = pauloAdmin) {
  const prepared = await prepareClinicalSignaturePackage({
    user: actor,
    appointmentId: APPT_ID,
    budgetId: BUDGET_ID,
    patientId: PATIENT_ID,
    contractId: CONTRACT_ID,
  });
  expect(prepared.ok).toBe(true);
  return prepared;
}

function signAs(actor, { role, personId, name }) {
  return signContractOnScreen(actor, CONTRACT_ID, {
    signerName: name,
    signerRole: role,
    signerPersonId: personId,
    signatureImageDataUrl: 'data:image/png;base64,ba',
  });
}

function denyProfessional(actor, personId = JULIANA) {
  try {
    signAs(actor, { role: 'PROFESSIONAL', personId, name: 'Juliana de Oliveira Freire' });
    throw new Error('expected deny');
  } catch (error) {
    expect(error).toBeInstanceOf(SignerIdentityError);
    expect(error.code).toBe(SIGNER_IDENTITY_ERROR.MISMATCH);
  }
}

describe('PHASE_10.21BA signer identity enforcement', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A Paulo/admin tenta assinar como Juliana → DENY', async () => {
    seed();
    await freeze();
    denyProfessional(pauloAdmin);
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('B master tenta assinar como Juliana → DENY', async () => {
    seed();
    await freeze();
    denyProfessional(pauloMaster);
  });

  it('C Juliana autenticada assina como Juliana → ALLOW', async () => {
    seed();
    await freeze();
    const signed = signAs(julianaUser, { role: 'PROFESSIONAL', personId: JULIANA, name: 'Juliana de Oliveira Freire' });
    expect(signed.signature.signerPersonId).toBe(JULIANA);
    expect(signed.signature.signerRole).toBe('PROFESSIONAL');
    expect(signed.signature.evidenceJson.signatureMethod).toBe('AUTHENTICATED_ELECTRONIC');
    expect(signed.signature.evidenceJson.operatorUserId).toBeNull();
  });

  it('D outro dentista tenta assinar como Juliana → DENY', async () => {
    seed();
    await freeze();
    denyProfessional(otherDentistUser);
  });

  it('E profissional = RT → uma assinatura autenticada satisfaz ambos', async () => {
    seed({ requireRt: true });
    await freeze();
    signAs(pauloAdmin, { role: 'PATIENT', personId: PATIENT_ID, name: 'Paulo Henrique Silva de Assis' });
    const done = signAs(julianaUser, { role: 'PROFESSIONAL', personId: JULIANA, name: 'Juliana de Oliveira Freire' });
    expect(done.signature.rolesSatisfied).toEqual(expect.arrayContaining([
      CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE,
    ]));
    expect(done.contract.status).toBe(CONTRACT_STATUS.SIGNED);
  });

  it('F profissional ≠ RT → profissional não assina pelo RT', async () => {
    seed({ dentistId: OTHER_DENTIST, requireRt: true });
    await freeze();
    expect(() => signAs(otherDentistUser, {
      role: 'CLINIC_REPRESENTATIVE',
      personId: JULIANA,
      name: 'Juliana de Oliveira Freire',
    })).toThrow(SignerIdentityError);
    const asSelf = signAs(otherDentistUser, {
      role: 'PROFESSIONAL',
      personId: OTHER_DENTIST,
      name: 'Outro Dentista',
    });
    expect(asSelf.signature.signerPersonId).toBe(OTHER_DENTIST);
    expect(asSelf.contract.status).not.toBe(CONTRACT_STATUS.SIGNED);
  });

  it('G imprimir documento → zero signature evidence', async () => {
    seed();
    await freeze();
    const printed = printClinicalContractForManualSignature({
      user: pauloAdmin,
      contractId: CONTRACT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(printed.ok).toBe(true);
    expect(printed.signatureEvidenceCreated).toBe(false);
    expect(printed.statusChanged).toBe(false);
    expect(loadDb().contractSignatures).toHaveLength(0);
    expect(loadDb().generatedContracts[0].status).toBe(CONTRACT_STATUS.GENERATED);
  });

  it('H DevTools/direct call com signerPersonId e collaboratorId adulterados → DENY', async () => {
    seed();
    await freeze();
    const spoofed = { ...pauloAdmin, collaboratorId: JULIANA, collaborator_id: JULIANA };
    denyProfessional(spoofed);
    expect(resolveAuthenticatedSignerIdentity(spoofed).ok).toBe(false);
  });

  it('I assinatura presencial do paciente mantém signer=PATIENT e registra operador', async () => {
    seed();
    await freeze();
    const signed = signAs(pauloAdmin, { role: 'PATIENT', personId: PATIENT_ID, name: 'Paulo Henrique Silva de Assis' });
    expect(signed.signature.signerPersonId).toBe(PATIENT_ID);
    expect(signed.signature.signerRole).toBe('PATIENT');
    expect(signed.signature.evidenceJson.signatureMethod).toBe('OPERATOR_COLLECTED_PRESENCE');
    expect(signed.signature.evidenceJson.operatorUserId).toBe(pauloAdmin.id);
    expect(signed.signature.evidenceJson.signedByUserId).toBe(pauloAdmin.id);
    expect(signed.contract.status).not.toBe(CONTRACT_STATUS.SIGNED);
  });

  it('J contrato de outro tenant → DENY', async () => {
    seed();
    await freeze();
    try {
      signContractOnScreen(otherTenantUser, CONTRACT_ID, {
        signerName: 'Juliana de Oliveira Freire',
        signerRole: 'PROFESSIONAL',
        signerPersonId: JULIANA,
        signatureImageDataUrl: 'data:image/png;base64,ba',
      });
      throw new Error('expected deny');
    } catch (error) {
      expect(error.code).toBe(SIGNER_IDENTITY_ERROR.TENANT_MISMATCH);
    }
  });

  it('K contrato de outro appointment/budget → DENY', async () => {
    seed({
      extraContract: {
        id: OTHER_CONTRACT,
        contractNumber: 'CTR-BA-OTHER',
        status: CONTRACT_STATUS.GENERATED,
        quoteSource: 'clinical_budget',
        quoteId: OTHER_APPT,
        budgetId: OTHER_BUDGET,
        patientId: PATIENT_ID,
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        renderedHtml: '<p>other</p>',
        metadata: { packageManifestId: 'man-x', packageManifestHash: 'h', frozenAt: new Date().toISOString() },
      },
    });
    await freeze();
    try {
      signContractOnScreen(julianaUser, CONTRACT_ID, {
        signerName: 'Juliana de Oliveira Freire',
        signerRole: 'PROFESSIONAL',
        signerPersonId: JULIANA,
        signatureImageDataUrl: 'data:image/png;base64,ba',
        expectedAppointmentId: OTHER_APPT,
        expectedBudgetId: OTHER_BUDGET,
      });
      throw new Error('expected deny');
    } catch (error) {
      expect(error.code).toBe(SIGNER_IDENTITY_ERROR.CONTEXT_MISMATCH);
    }
  });

  it('UI: Paulo não vê Assinar como profissional; Juliana vê', async () => {
    seed();
    await freeze();
    const asPaulo = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID, patientId: PATIENT_ID, budgetId: BUDGET_ID, user: pauloAdmin,
    }));
    expect(asPaulo).toContain('Juliana de Oliveira Freire');
    expect(asPaulo).toContain('Aguardando assinatura da profissional');
    expect(asPaulo).toContain('clinical-print-manual-signature-cta');
    expect(asPaulo).not.toContain('clinical-sign-professional-cta');
    expect(asPaulo).toContain('clinical-sign-now-cta');

    const asJuliana = renderToStaticMarkup(React.createElement(ClinicalSignatureSection, {
      appointmentId: APPT_ID, patientId: PATIENT_ID, budgetId: BUDGET_ID, user: julianaUser,
    }));
    expect(asJuliana).toContain('clinical-sign-professional-cta');
    expect(asJuliana).toContain('Assinar como profissional');
    expect(canAuthenticatedUserSignSlot(julianaUser, { role: 'PROFESSIONAL', personId: JULIANA, status: 'pending' }).canSignElectronically).toBe(true);
  });

  it('não muta evidência forense e não cria writer paralelo', () => {
    const forensic = {
      id: 'gctr-ba-forensic',
      contractNumber: 'CTR-2026-00002',
      status: CONTRACT_STATUS.SIGNED,
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      tenant_id: TENANT,
      renderedHtml: '<p>forensic</p>',
      metadata: { packageManifestId: 'man-forensic' },
    };
    seed({ extraContract: forensic });
    withDb((db) => {
      db.contractSignatures = [{
        id: 'csig-forensic-juliana',
        contractId: 'gctr-ba-forensic',
        signerRole: 'PROFESSIONAL',
        signerPersonId: JULIANA,
        evidenceJson: { note: 'piloto humano pré-correção' },
      }];
    });
    const before = JSON.stringify(loadDb().generatedContracts.find((c) => c.contractNumber === 'CTR-2026-00002'));
    const beforeSig = JSON.stringify(loadDb().contractSignatures.find((s) => s.id === 'csig-forensic-juliana'));
    expect(canAuthenticatedUserSignSlot(pauloAdmin, { role: 'PROFESSIONAL', personId: JULIANA }).canSignElectronically).toBe(false);
    expect(JSON.stringify(loadDb().generatedContracts.find((c) => c.contractNumber === 'CTR-2026-00002'))).toBe(before);
    expect(JSON.stringify(loadDb().contractSignatures.find((s) => s.id === 'csig-forensic-juliana'))).toBe(beforeSig);

    const writer = readSrc('src/services/contractModuleService.js');
    expect(writer).toContain('assertAuthenticatedSignerForStroke');
    expect(writer).not.toMatch(/if \(user\.(isMaster|role === 'admin')\).*PROFESSIONAL/);
  });
});
