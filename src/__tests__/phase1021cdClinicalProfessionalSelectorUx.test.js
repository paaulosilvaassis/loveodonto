/**
 * @vitest-environment jsdom
 * PHASE_10.21CD — clique real do CTA "Definir profissional clínico"
 * não pode navegar para Dados da Equipe.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { DEFAULT_CONTRACT_SETTINGS } from '../contracts/contractConstants.js';
import {
  enrichContractReadinessChecklist,
  buildContractPrerequisiteResolutionCards,
} from '../contracts/contractPrerequisitesResolution.js';
import {
  evaluateClinicalProfessionalReadinessGate,
  resolveClinicalProfessionalIdentity,
  PROFESSIONAL_READINESS_GATE,
} from '../contracts/clinicalProfessionalIdentity.js';
import { assignClinicalProfessionalToAppointment } from '../contracts/clinicalProfessionalAssignment.js';
import {
  shouldOpenClinicalProfessionalSelector,
  isForbiddenAdminRedirectForClinicalAssignment,
} from '../contracts/clinicalProfessionalAssignmentCta.js';
import { ContractReadinessChecklist } from '../components/contracts/ContractReadinessChecklist.jsx';
import { SelectClinicalProfessionalModal } from '../components/clinical/SelectClinicalProfessionalModal.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-cd-clinic';
const PAULO_ID = 'col-saas-066dcd98-aecf-4886-8947-a439849e37f7';
const JULIANA_ID = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const APPT_ID = 'appt-cd-clara';
const USER = { id: 'user-cd-paulo', tenantId: TENANT, tenant_id: TENANT, role: 'admin' };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function seedClinic({ clinicalProfessionalId = null } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica CD' }];
    db.clinicProfile = { id: 'clinic-cd', tenant_id: TENANT, razaoSocial: 'Clínica CD' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Rua A',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    }];
    db.collaborators = [
      {
        id: PAULO_ID,
        tenant_id: TENANT,
        nomeCompleto: 'Paulo Henrique Silva de Assis',
        rhCategoria: 'Diretoria e Gestão',
        cargo: 'Sócio',
        status: 'ativo',
      },
      {
        id: JULIANA_ID,
        tenant_id: TENANT,
        nomeCompleto: 'Juliana de Oliveira Freire',
        rhCategoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
        especialidade: 'Implantodontista',
        registroProfissional: '27267',
        conselhoNome: 'CRO',
        conselhoUf: 'MG',
        status: 'ativo',
      },
    ];
    db.patients = [{
      id: 'pat-cd',
      tenant_id: TENANT,
      full_name: 'Paciente CD',
      cpf: '52998224725',
      birth_date: '1990-05-10',
    }];
    db.appointments = [{
      id: APPT_ID,
      patientId: 'pat-cd',
      professionalId: PAULO_ID,
      clinicalProfessionalId,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: APPT_ID,
      patientId: 'pat-cd',
      budget: {
        id: 'budget-cd',
        status: BUDGET_STATUS.APROVADO,
        planName: 'Profilaxia',
        procedures: [{ name: 'Profilaxia', quantity: 1, unitValue: 150 }],
      },
    }];
    db.contractSettings = [{
      clinicId: 'clinic-cd',
      settings: { ...DEFAULT_CONTRACT_SETTINGS, requireResponsibleProfessional: true },
    }];
    return db;
  });
}

function baseChecklist() {
  return {
    ok: true,
    canGenerate: true,
    partyLabel: 'Paciente sem responsável',
    warnings: [],
    requiredTcles: [],
    groups: {
      clinica: [], paciente: [], dependente: [], responsavel: [], profissional: [],
      contrato: [], financeiro: [], tcle: [], lgpd: [], template: [],
    },
    missing: [],
  };
}

function productionChecklist() {
  const identity = resolveClinicalProfessionalIdentity({ appointmentId: APPT_ID, tenantId: TENANT });
  const gate = evaluateClinicalProfessionalReadinessGate(identity);
  return enrichContractReadinessChecklist(baseChecklist(), {
    professionalGate: gate.code,
    professionalId: gate.ctaCollaboratorId,
    requiresProfessionalRegistration: false,
  });
}

function flush() {
  return act(async () => {
    await Promise.resolve();
  });
}

describe('PHASE_10.21CD real click of Definir profissional clínico', () => {
  let container;
  let root;
  const navigate = vi.fn();

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    await resetDb();
    await initDb();
    navigate.mockReset();
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('CTA do atendimento abre o modal e NÃO chama navigate(/admin/colaboradores)', async () => {
    seedClinic();
    const checklist = productionChecklist();
    const cards = buildContractPrerequisiteResolutionCards({
      checklist,
      appointmentId: APPT_ID,
      professionalId: PAULO_ID,
    });
    const professional = cards.cards.find((card) => card.group === 'profissional');
    expect(professional?.destination?.ctaLabel).toBe('Definir profissional clínico');
    expect(String(professional?.destination?.href || '')).not.toContain('/admin/colaboradores');
    expect(shouldOpenClinicalProfessionalSelector(professional)).toBe(true);
    expect(shouldOpenClinicalProfessionalSelector({
      group: 'profissional',
      destination: {
        href: '/admin/colaboradores?tab=profissional&returnTo=%2Fatendimento-clinico%2Fappt-cd',
        ctaLabel: 'Definir profissional clínico',
        action: 'fix_professional_data',
        mode: 'navigate',
      },
      items: [{ tag: 'professional:missing-clinical', label: 'Defina o profissional clínico responsável pelo atendimento.' }],
    })).toBe(true);

    function Harness() {
      const [open, setOpen] = useState(false);
      return createElement(
        'div',
        { 'data-testid': 'clinical-appointment-contratos' },
        createElement(ContractReadinessChecklist, {
          checklist,
          resolutionContext: {
            appointmentId: APPT_ID,
            patientId: 'pat-cd',
            budgetId: 'budget-cd',
            professionalId: PAULO_ID,
          },
          onAssignClinicalProfessional: () => setOpen(true),
          onResolve: (card) => {
            if (shouldOpenClinicalProfessionalSelector(card, { hasAssignedClinicalProfessional: false })) {
              setOpen(true);
              return;
            }
            if (isForbiddenAdminRedirectForClinicalAssignment(card?.destination?.href)) {
              navigate(card.destination.href);
              return;
            }
            if (card?.destination?.href) navigate(card.destination.href);
          },
        }),
        createElement(SelectClinicalProfessionalModal, {
          open,
          onOpenChange: setOpen,
          tenantId: TENANT,
          onConfirm: (id) => assignClinicalProfessionalToAppointment(USER, APPT_ID, id),
        }),
      );
    }

    await act(async () => {
      root.render(createElement(Harness));
    });

    const cta = container.querySelector('[data-testid="contract-prereq-cta-profissional"]');
    expect(cta).toBeTruthy();
    expect(cta.textContent).toContain('Definir profissional clínico');

    await act(async () => {
      cta.click();
    });
    await flush();

    expect(navigate).not.toHaveBeenCalled();
    const adminCalls = navigate.mock.calls.filter((args) => String(args[0] || '').includes('/admin/colaboradores'));
    expect(adminCalls).toEqual([]);

    const modal = document.querySelector('[data-testid="select-clinical-professional-modal"]')
      || container.querySelector('[data-testid="select-clinical-professional-modal"]');
    expect(document.body.textContent).toContain('Selecionar profissional clínico');
    expect(document.body.textContent).toContain('Juliana de Oliveira Freire');
    expect(document.body.textContent).not.toContain('Paulo Henrique Silva de Assis');
    expect(modal || document.body.textContent.includes('Selecionar profissional clínico')).toBeTruthy();

    const selectJuliana = document.querySelector(`[data-testid="select-clinical-professional-option-${JULIANA_ID}"]`);
    expect(selectJuliana).toBeTruthy();
    await act(async () => {
      selectJuliana.click();
    });
    await act(async () => {
      document.querySelector('[data-testid="select-clinical-professional-confirm"]').click();
    });
    await flush();

    const persisted = (loadDb().appointments || []).find((row) => row.id === APPT_ID);
    expect(persisted.clinicalProfessionalId).toBe(JULIANA_ID);
    expect(persisted.professionalId).toBe(PAULO_ID);

    const after = evaluateClinicalProfessionalReadinessGate(
      resolveClinicalProfessionalIdentity({ appointmentId: APPT_ID, tenantId: TENANT }),
    );
    expect(after.code).toBe(PROFESSIONAL_READINESS_GATE.OK);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ClinicalContractSection e a página de atendimento usam o seletor local, sem redirect admin', () => {
    const page = readSrc('src/pages/ClinicalAppointmentPage.jsx');
    const section = readSrc('src/components/clinical/ClinicalContractSection.jsx');
    const checklist = readSrc('src/components/contracts/ContractReadinessChecklist.jsx');
    expect(page).toContain('ClinicalContractSection');
    expect(section).toContain('onAssignClinicalProfessional={openClinicalProfessionalSelector}');
    expect(section).toContain('shouldOpenClinicalProfessionalSelector');
    expect(section).toContain('isForbiddenAdminRedirectForClinicalAssignment');
    expect(checklist).toContain('onAssignClinicalProfessional');
    expect(checklist).toContain('isClinicalProfessionalAssignmentCta');
  });
});
