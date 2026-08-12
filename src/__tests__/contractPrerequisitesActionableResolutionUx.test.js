import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildContractPrerequisiteResolutionCards,
  buildContractReturnUrl,
  buildPrerequisiteDestination,
  isSafeClinicalReturnUrl,
  resolvePatientCadastroTab,
} from '../contracts/contractPrerequisitesResolution.js';
import { getContractReadinessChecklist } from '../services/contractValidationService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PATIENT_ID = 'pat-prereq-ux-1';
const APPOINTMENT_ID = 'apt-prereq-ux-1';
const BUDGET_ID = 'bud-prereq-ux-1';

function baseChecklist({ missing = [], requiredTcles = [], canGenerate = false } = {}) {
  const groups = {
    clinica: [],
    paciente: [],
    dependente: [],
    responsavel: [],
    contrato: [],
    tcle: [],
    template: [],
  };
  for (const item of missing) {
    groups[item.group || 'contrato'].push(item);
  }
  return {
    ok: canGenerate,
    canGenerate,
    partyLabel: 'Paciente sem responsável',
    warnings: [],
    requiredTcles,
    groups,
    missing,
  };
}

describe('PHASE_CONTRACT_PREREQUISITES_ACTIONABLE_RESOLUTION_UX', () => {
  it('A) falta CRO → CTA Corrigir dados da clínica', () => {
    const checklist = baseChecklist({
      missing: [
        { tag: '#responsavelTecnicoCRO', label: 'CRO do responsável técnico', group: 'clinica', critical: true },
        { tag: '#responsavelTecnicoNome', label: 'Nome do responsável técnico (CRO)', group: 'clinica', critical: true },
      ],
    });
    const cards = buildContractPrerequisiteResolutionCards({
      checklist,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
    });
    const clinic = cards.cards.find((c) => c.group === 'clinica');
    expect(clinic?.status).toBe('pending');
    expect(clinic?.destination?.ctaLabel).toBe('Corrigir dados da clínica');
    expect(clinic?.destination?.href).toContain('/admin/dados-clinica');
    expect(clinic?.destination?.href).toContain('section=documentacao');
    expect(clinic?.destination?.href).toContain('returnTo=');
  });

  it('B) falta endereço → CTA aponta para o mesmo patientId', () => {
    const checklist = baseChecklist({
      missing: [
        { tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', critical: true },
      ],
    });
    const cards = buildContractPrerequisiteResolutionCards({
      checklist,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
    });
    const patient = cards.cards.find((c) => c.group === 'paciente');
    expect(patient?.destination?.ctaLabel).toBe('Completar cadastro do paciente');
    expect(patient?.destination?.href).toContain(`/pacientes/cadastro/${PATIENT_ID}`);
    expect(patient?.destination?.href).toContain('tab=enderecos');
    expect(patient?.destination?.patientId).toBe(PATIENT_ID);
    expect(patient?.destination?.href).not.toMatch(/\/pacientes\/cadastro\?/);
    expect(resolvePatientCadastroTab([{ label: 'Endereço do paciente' }])).toBe('enderecos');
  });

  it('C) falta TCLE → CTA Resolver TCLE no fluxo de consentimentos', () => {
    const checklist = baseChecklist({
      missing: [
        {
          tag: 'tcle:tcle_implante',
          label: 'TCLE obrigatório: Termo de Consentimento — Implantes / Protocolo',
          group: 'tcle',
          critical: true,
        },
      ],
      requiredTcles: [{ id: 'tcle_implante', title: 'Termo de Consentimento — Implantes / Protocolo' }],
    });
    const cards = buildContractPrerequisiteResolutionCards({
      checklist,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
    });
    const tcle = cards.cards.find((c) => c.group === 'tcle');
    expect(tcle?.destination?.ctaLabel).toBe('Resolver TCLE');
    expect(tcle?.destination?.href).toContain(`/atendimento-clinico/${APPOINTMENT_ID}`);
    expect(tcle?.destination?.href).toContain('section=documentos');
    expect(tcle?.destination?.href).toContain('docCategory=consentimentos');
    expect(tcle?.destination?.href).toContain('docTemplate=consent_implante');
  });

  it('D/E) patientId e budgetId nunca são perdidos no destino', () => {
    const dest = buildPrerequisiteDestination('paciente', {
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
      items: [{ label: 'CPF' }],
    });
    expect(dest.patientId).toBe(PATIENT_ID);
    expect(dest.appointmentId).toBe(APPOINTMENT_ID);
    expect(dest.budgetId).toBe(BUDGET_ID);
    expect(dest.href).toContain(PATIENT_ID);
    expect(dest.href).toContain(`budgetId=${BUDGET_ID}`);
    expect(dest.returnUrl).toContain(APPOINTMENT_ID);
    expect(dest.returnUrl).toContain(`budgetId=${BUDGET_ID}`);
    expect(dest.returnUrl).toContain('section=contratos');
  });

  it('F) retorno ao contrato é seguro e preserva contexto', () => {
    const url = buildContractReturnUrl({
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
      patientId: PATIENT_ID,
    });
    expect(isSafeClinicalReturnUrl(url)).toBe(true);
    expect(isSafeClinicalReturnUrl('https://evil.com')).toBe(false);
    expect(isSafeClinicalReturnUrl('//evil.com')).toBe(false);
    expect(isSafeClinicalReturnUrl('/admin/dados-clinica')).toBe(false);
    expect(url).toContain('/atendimento-clinico/');
    expect(url).toContain('section=contratos');
    expect(url).toContain('revalidate=1');
  });

  it('G/H/I) revalidação: bloqueado com pendência e liberado só quando válido', () => {
    const blocked = baseChecklist({
      missing: [
        { tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente' },
      ],
      canGenerate: false,
    });
    const blockedCards = buildContractPrerequisiteResolutionCards({
      checklist: blocked,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
    });
    expect(blockedCards.canGenerate).toBe(false);
    expect(blockedCards.cards.some((c) => c.status === 'pending')).toBe(true);

    const ready = baseChecklist({ missing: [], canGenerate: true, requiredTcles: [] });
    const readyCards = buildContractPrerequisiteResolutionCards({
      checklist: ready,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
    });
    expect(readyCards.canGenerate).toBe(true);
    expect(readyCards.cards.filter((c) => c.status === 'pending')).toHaveLength(0);

    // canGenerate continua autoritativo no checklist — builder não inventa liberação
    expect(typeof getContractReadinessChecklist).toBe('function');
  });

  it('mostra grupos concluídos enquanto ainda há pendências', () => {
    const checklist = baseChecklist({
      missing: [
        { tag: 'tcle:tcle_implante', label: 'TCLE obrigatório: Implantes', group: 'tcle' },
      ],
      requiredTcles: [{ id: 'tcle_implante', title: 'Implantes' }],
    });
    const cards = buildContractPrerequisiteResolutionCards({
      checklist,
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
    });
    expect(cards.cards.find((c) => c.group === 'clinica')?.status).toBe('complete');
    expect(cards.cards.find((c) => c.group === 'paciente')?.status).toBe('complete');
    expect(cards.cards.find((c) => c.group === 'tcle')?.status).toBe('pending');
  });

  it('J) nenhuma alteração em rollout/feature_flags nesta fase', () => {
    const files = [
      'src/contracts/contractPrerequisitesResolution.js',
      'src/components/contracts/ContractReadinessChecklist.jsx',
      'src/components/clinical/ClinicalContractSection.jsx',
    ];
    for (const rel of files) {
      const full = path.join(ROOT, rel);
      expect(existsSync(full)).toBe(true);
      const src = readFileSync(full, 'utf8');
      expect(src).not.toMatch(/contracts_operational_ux/);
      expect(src).not.toMatch(/feature_flags/);
      expect(src).not.toMatch(/productionGlobalEnabled\s*=\s*true/);
    }
  });

  it('UI clínica e checklist usam resolution cards', () => {
    const checklistSrc = readFileSync(
      path.join(ROOT, 'src/components/contracts/ContractReadinessChecklist.jsx'),
      'utf8',
    );
    const clinicalSrc = readFileSync(
      path.join(ROOT, 'src/components/clinical/ClinicalContractSection.jsx'),
      'utf8',
    );
    expect(checklistSrc).toContain('buildContractPrerequisiteResolutionCards');
    expect(checklistSrc).toContain('contract-prereq-cta-');
    expect(clinicalSrc).toContain('handleResolvePrerequisite');
    expect(clinicalSrc).toContain('resolutionContext');
  });
});
