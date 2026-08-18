/**
 * PHASE_10 Wave A — Jornada jurídica única.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { ROLE_DEFAULT_PERMISSIONS } from '../permissions/roleDefaults.js';
import { permissionId } from '../permissions/catalog.js';
import {
  LEGAL_PACKAGE_STATUS,
  deriveLegalPackageStatus,
  mapContractStatusToDocumentStatus,
  isLegalDocumentLocked,
} from '../contracts/legalPackageStatus.js';
import {
  buildContractPackageViewModel,
  listPatientLegalPackages,
} from '../contracts/legalPackageViewModel.js';
import { ensureLegalPackageForBudget } from '../contracts/legalPackageEnsure.js';
import {
  buildLegalPackageCeremonyDocuments,
  ceremonyIncludesLgpd,
} from '../contracts/legalPackageCeremony.js';
import { buildLegalPackageAppointmentUrl, buildProntuarioLegalPackagesUrl } from '../contracts/legalPackageNavigation.js';
import {
  deriveLegalPackageAvailableActions,
  resolveLegalPackagePermissions,
} from '../contracts/legalPackagePermissions.js';
import LegalPackagePanel from '../components/contracts/legal/LegalPackagePanel.jsx';
import PatientLegalPackagesTab from '../components/prontuario/PatientLegalPackagesTab.jsx';
import { CONTRACTS_V2_SURFACE } from '../domain/contracts/contracts-v2-technical-harness.ts';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PATIENT_ID = 'pat-wave-a';
const APPT_ID = 'apt-wave-a';
const BUDGET_ID = 'bud-wave-a';
const TENANT = 'tenant-wave-a';
const admin = { id: 'user-admin-wa', role: 'admin', tenantId: TENANT, tenant_id: TENANT, isMaster: false };
const reception = { id: 'user-rec-wa', role: 'recepcao', tenantId: TENANT, tenant_id: TENANT };

function seedClinic({ withContract = false, contractStatus = CONTRACT_STATUS.DRAFT, withTcle = false } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica Wave A', status: 'active' }];
    db.clinicProfile = { id: 'clinic-wave-a', tenant_id: TENANT, razaoSocial: 'Clínica Wave A', nomeFantasia: 'Wave A' };
    db.clinicDocumentation = { cnpj: '12345678000199' };
    db.patients = [{
      id: PATIENT_ID,
      tenant_id: TENANT,
      full_name: 'Paciente Wave A',
      guardian_name: 'Responsável Wave A',
      cpf: '52998224725',
    }];
    db.appointments = [{
      id: APPT_ID,
      tenant_id: TENANT,
      patientId: PATIENT_ID,
      professionalId: 'col-wa',
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
    }];
    db.collaborators = [{ id: 'col-wa', nomeCompleto: 'Dra. Wave', conselhoNumero: '111', status: 'ativo' }];
    db.clinicalAppointments = [{
      appointmentId: APPT_ID,
      patientId: PATIENT_ID,
      budget: {
        id: BUDGET_ID,
        status: BUDGET_STATUS.APROVADO,
        planName: 'Protocolo total inferior',
        budgetNumber: 'ORC-WA-1',
        totalValue: 10000,
        procedures: [{ name: 'Implante', tooth: '26', quantity: 1, unitValue: 10000 }],
      },
      budgetHistory: [],
    }];
    db.generatedContracts = withContract ? [{
      id: 'ctr-wave-a',
      clinicId: 'clinic-wave-a',
      patientId: PATIENT_ID,
      quoteId: APPT_ID,
      quoteSource: 'clinical_budget',
      budgetId: BUDGET_ID,
      status: contractStatus,
      title: 'Contrato Wave A',
      renderedHtml: '<p>Contrato</p>',
      documentHash: 'hash-v1',
      version: 1,
      createdAt: '2026-08-16T10:00:00.000Z',
      updatedAt: '2026-08-16T10:00:00.000Z',
      metadata: withTcle ? { attachedTcleIds: ['tcle_implante'] } : {},
    }] : [];
    db.documentRecords = withTcle ? [{
      id: 'doc-tcle-wa',
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
      templateKey: 'tcle_implante',
      title: 'TCLE Implante',
      content: '<p>TCLE</p>',
      metadata: { tcleId: 'tcle_implante', applicability: 'applicable' },
    }] : [];
    db.rolePermissions = [];
    return db;
  });
}

describe('PHASE_10 Wave A — jornada jurídica única', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    seedClinic();
  });

  it('1. orçamento sem package', () => {
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      user: admin,
    });
    expect(vm.exists).toBe(false);
    expect(vm.packageStatus).toBe(LEGAL_PACKAGE_STATUS.NOT_STARTED);
    expect(vm.actions.some((a) => a.key === 'generate')).toBe(true);
  });

  it('2 e 3. geração de package é idempotente e não duplica', () => {
    const first = ensureLegalPackageForBudget({
      user: admin,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
    });
    expect(first.ok).toBe(true);
    expect(first.reused).toBe(false);
    expect(first.duplicated).toBe(false);
    expect(first.contractId).toBeTruthy();

    const second = ensureLegalPackageForBudget({
      user: admin,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
    });
    expect(second.ok).toBe(true);
    expect(second.reused).toBe(true);
    expect(second.duplicated).toBe(false);
    expect(second.contractId).toBe(first.contractId);

    const dbContracts = [];
    withDb((db) => {
      dbContracts.push(...(db.generatedContracts || []).filter((c) => c.budgetId === BUDGET_ID));
      return db;
    });
    expect(dbContracts.filter((c) => c.status !== CONTRACT_STATUS.CANCELED).length).toBe(1);
  });

  it('4. package existente é reutilizado', () => {
    seedClinic({ withContract: true });
    const result = ensureLegalPackageForBudget({
      user: admin,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
    });
    expect(result.reused).toBe(true);
    expect(result.contractId).toBe('ctr-wave-a');
  });

  it('5. contrato + TCLE + LGPD no view model', () => {
    seedClinic({ withContract: true, withTcle: true });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      user: admin,
    });
    const types = vm.documents.map((d) => d.documentType);
    expect(types).toContain('SERVICE_CONTRACT');
    expect(types.some((t) => String(t).includes('CONSENT') || t === 'IMPLANT_CONSENT')).toBe(true);
    expect(types).toContain('LGPD_TERM');
    expect(vm.documents.find((d) => d.operationalType === 'LGPD')?.required).toBe(true);
  });

  it('6. documento obrigatório pendente', () => {
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(vm.pending.some((d) => d.operationalType === 'CONTRACT_SERVICES' || d.operationalType === 'TCLE')).toBe(true);
  });

  it('7. documento opcional presente', () => {
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(vm.optional.some((d) => d.documentType === 'IMAGE_AUTHORIZATION')).toBe(true);
  });

  it('8. package aguardando assinatura', () => {
    seedClinic({ withContract: true, contractStatus: CONTRACT_STATUS.SENT, withTcle: true });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(vm.packageStatus).toBe(LEGAL_PACKAGE_STATUS.AWAITING_SIGNATURE);
  });

  it('9. package parcialmente assinado', () => {
    seedClinic({ withContract: true, contractStatus: CONTRACT_STATUS.SIGNED_BY_PATIENT, withTcle: true });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(vm.packageStatus).toBe(LEGAL_PACKAGE_STATUS.PARTIALLY_SIGNED);
  });

  it('10. package concluído', () => {
    seedClinic({ withContract: true, contractStatus: CONTRACT_STATUS.SIGNED, withTcle: true });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(vm.packageStatus).toBe(LEGAL_PACKAGE_STATUS.COMPLETED);
  });

  it('11 e 12. documento locked e signed sem edição', () => {
    seedClinic({ withContract: true, contractStatus: CONTRACT_STATUS.SIGNED, withTcle: true });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
      user: admin,
    });
    const contractDoc = vm.documents.find((d) => d.operationalType === 'CONTRACT_SERVICES');
    expect(contractDoc.locked).toBe(true);
    expect(contractDoc.signed).toBe(true);
    expect(contractDoc.action?.key).not.toBe('generate');
    expect(isLegalDocumentLocked({ status: CONTRACT_STATUS.SIGNED }, 'signed')).toBe(true);
  });

  it('13. recepção autorizada via RBAC existente', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.recepcao).toEqual(ROLE_DEFAULT_PERMISSIONS.atendimento);
    expect(ROLE_DEFAULT_PERMISSIONS.recepcao).toContain(permissionId('prontuario_contratos', 'view'));
    expect(ROLE_DEFAULT_PERMISSIONS.recepcao).toContain(permissionId('admin_contratos', 'generate'));
    expect(ROLE_DEFAULT_PERMISSIONS.recepcao).toContain(permissionId('prontuario_contratos', 'send'));
    const perms = resolveLegalPackagePermissions(reception);
    expect(perms.canView).toBe(true);
    expect(perms.canGenerate).toBe(true);
    expect(perms.canSend).toBe(true);
    expect(perms.canEditDraft).toBe(false);
    expect(perms.canSignNow).toBe(false);
    expect(perms.canViewEvidence).toBe(false);
    expect(perms.canCancel).toBe(false);
  });

  it('14. recepção bloqueada quando rolePermissions não concede gerar', () => {
    withDb((db) => {
      db.rolePermissions = [
        { role: 'recepcao', permission_id: permissionId('dashboard', 'view') },
      ];
      return db;
    });
    const perms = resolveLegalPackagePermissions(reception);
    expect(perms.canGenerate).toBe(false);
    const result = ensureLegalPackageForBudget({
      user: reception,
      patientId: PATIENT_ID,
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
    });
    expect(result.ok).toBe(false);
  });

  it('15. prontuário sem histórico', () => {
    withDb((db) => {
      db.clinicalAppointments = [];
      db.generatedContracts = [];
      return db;
    });
    expect(listPatientLegalPackages({ patientId: PATIENT_ID })).toEqual([]);
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PatientLegalPackagesTab, { patientId: PATIENT_ID, user: admin }),
      ),
    );
    expect(html).toContain('patient-legal-packages-empty');
  });

  it('16. prontuário com package', () => {
    seedClinic({ withContract: true, withTcle: true });
    const list = listPatientLegalPackages({ patientId: PATIENT_ID, user: admin });
    expect(list.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PatientLegalPackagesTab, { patientId: PATIENT_ID, user: admin }),
      ),
    );
    expect(html).toContain('patient-legal-packages');
    expect(html).toContain('Abrir pacote');
  });

  it('17. orçamento navega para o mesmo package', () => {
    const url = buildLegalPackageAppointmentUrl({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
    });
    expect(url).toContain(`/atendimento-clinico/${APPT_ID}`);
    expect(url).toContain('section=contratos');
    expect(url).toContain(`budgetId=${BUDGET_ID}`);
    const sectionSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/clinical/budget/BudgetLegalPackageSection.jsx'),
      'utf8',
    );
    expect(sectionSrc).toContain('Abrir pacote jurídico');
    expect(sectionSrc).toContain('Gerar contrato e consentimentos');
  });

  it('18. atendimento usa o painel Pacote jurídico', () => {
    seedClinic({ withContract: true });
    const html = renderToStaticMarkup(
      React.createElement(LegalPackagePanel, {
        appointmentId: APPT_ID,
        budgetId: BUDGET_ID,
        patientId: PATIENT_ID,
        user: admin,
      }),
    );
    expect(html).toContain('Pacote jurídico');
    expect(html).toContain('legal-package-panel');
    const clinical = fs.readFileSync(
      path.join(ROOT, 'src/components/clinical/ClinicalContractSection.jsx'),
      'utf8',
    );
    expect(clinical).toContain('ClinicalDocumentPackagePanel');
    expect(clinical).not.toContain('instancias-v2');
  });

  it('19. LGPD presente na cerimônia', () => {
    seedClinic({ withContract: true, withTcle: true });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    const docs = buildLegalPackageCeremonyDocuments(vm);
    expect(ceremonyIncludesLgpd(docs)).toBe(true);
    const publicPage = fs.readFileSync(
      path.join(ROOT, 'src/pages/contratos/ContractSignPublicPage.jsx'),
      'utf8',
    );
    expect(publicPage).toContain('buildLegalPackageCeremonyFromContract');
    expect(publicPage).not.toContain('ContractSignPublicV2Page');
  });

  it('20. ações corretas por status', () => {
    const idle = deriveLegalPackageAvailableActions({
      packageStatus: 'not_started',
      documents: [],
      user: admin,
    });
    expect(idle.some((a) => a.key === 'generate')).toBe(true);

    const sent = deriveLegalPackageAvailableActions({
      packageStatus: 'awaiting_signature',
      documents: [{ documentType: 'SERVICE_CONTRACT', status: 'awaiting_signature' }],
      user: admin,
    });
    expect(sent.some((a) => a.key === 'resend' || a.key === 'sign_now')).toBe(true);

    const recActions = deriveLegalPackageAvailableActions({
      packageStatus: 'awaiting_signature',
      documents: [{ documentType: 'SERVICE_CONTRACT', status: 'awaiting_signature' }],
      user: reception,
    });
    expect(recActions.some((a) => a.key === 'sign_now')).toBe(false);
  });

  it('21. compatibilidade com documento V1', () => {
    seedClinic({ withContract: true, contractStatus: CONTRACT_STATUS.GENERATED });
    const vm = buildContractPackageViewModel({
      appointmentId: APPT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(vm.origin).toBe('v1_operational');
    expect(vm.contractId).toBe('ctr-wave-a');
    expect(vm.documents[0].hash).toBe('hash-v1');
    expect(mapContractStatusToDocumentStatus({ status: 'generated' })).toBe('ready');
  });

  it('22. harness V2 não entra na jornada clínica', () => {
    const harnessRoutes = contractsShellNavItems
      .filter((item) => item.surface === CONTRACTS_V2_SURFACE.TECHNICAL_HARNESS)
      .map((item) => item.route);
    expect(harnessRoutes.length).toBeGreaterThan(0);
    const clinical = fs.readFileSync(path.join(ROOT, 'src/pages/ClinicalAppointmentPage.jsx'), 'utf8');
    const chart = fs.readFileSync(path.join(ROOT, 'src/pages/PatientChartPage.jsx'), 'utf8');
    const budget = fs.readFileSync(path.join(ROOT, 'src/components/clinical/ClinicalBudgetSection.jsx'), 'utf8');
    for (const file of [clinical, chart, budget]) {
      for (const route of harnessRoutes) {
        expect(file).not.toContain(route);
      }
    }
  });

  it('23. nenhuma duplicação de ContractPackage', () => {
    const a = ensureLegalPackageForBudget({
      user: admin, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID,
    });
    const b = ensureLegalPackageForBudget({
      user: admin, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID,
    });
    const c = ensureLegalPackageForBudget({
      user: admin, patientId: PATIENT_ID, appointmentId: APPT_ID, budgetId: BUDGET_ID,
    });
    expect(a.package.packageId).toBe(b.package.packageId);
    expect(b.package.packageId).toBe(c.package.packageId);
    expect(deriveLegalPackageStatus({ hasPackage: false })).toBe(LEGAL_PACKAGE_STATUS.NOT_STARTED);
  });

  it('orçamento aprovado renderiza Documentação jurídica', () => {
    const sectionSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/clinical/budget/BudgetLegalPackageSection.jsx'),
      'utf8',
    );
    const budgetSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/clinical/ClinicalBudgetSection.jsx'),
      'utf8',
    );
    expect(sectionSrc).toContain('Documentação jurídica');
    expect(sectionSrc).toContain('Gerar contrato e consentimentos');
    expect(budgetSrc).toContain('BudgetLegalPackageSection');
  });

  it('prontuário URL canônica', () => {
    expect(buildProntuarioLegalPackagesUrl(PATIENT_ID)).toBe(`/prontuario/${PATIENT_ID}?tab=contratos`);
  });
});
