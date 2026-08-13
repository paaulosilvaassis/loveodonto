import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildContractPrerequisiteResolutionCards,
  buildContractReturnUrl,
  buildPrerequisiteDestination,
  enrichContractReadinessChecklist,
  isSafeClinicalReturnUrl,
  listUnactionableBlockingCards,
  resolvePatientCadastroTab,
  UNKNOWN_BLOCKER_FAILSAFE,
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
    profissional: [],
    contrato: [],
    financeiro: [],
    tcle: [],
    lgpd: [],
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
    expect(clinicalSrc).toContain('enrichContractReadinessChecklist');
    expect(clinicalSrc).not.toContain('Cadastro do paciente incompleto.');
  });
});

function cardsFor(checklist, extra = {}) {
  return buildContractPrerequisiteResolutionCards({
    checklist,
    patientId: PATIENT_ID,
    appointmentId: APPOINTMENT_ID,
    budgetId: BUDGET_ID,
    professionalId: extra.professionalId || 'col-prereq-1',
  });
}

describe('PHASE_CONTRACT_BLOCKER_RESOLUTION_CENTER_V2', () => {
  it('1) endereço do paciente ausente → CTA cadastro do paciente', () => {
    const cards = cardsFor(baseChecklist({
      missing: [{ tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', critical: true }],
    }));
    const patient = cards.cards.find((c) => c.group === 'paciente');
    expect(patient?.destination?.ctaLabel).toBe('Completar cadastro do paciente');
    expect(patient?.destination?.href).toContain(`/pacientes/cadastro/${PATIENT_ID}`);
    expect(patient?.destination?.href).toContain('tab=enderecos');
    expect(patient?.isBlocking).toBe(true);
  });

  it('2) telefone ausente → mesmo CTA de paciente (tab contatos)', () => {
    const enriched = enrichContractReadinessChecklist(baseChecklist({ canGenerate: true }), {
      pendingCriticalFields: ['phone'],
    });
    expect(enriched.canGenerate).toBe(true);
    const cards = cardsFor(enriched);
    const patient = cards.cards.find((c) => c.group === 'paciente');
    expect(patient?.items.some((i) => /Telefone/i.test(i.label))).toBe(true);
    expect(patient?.destination?.ctaLabel).toBe('Completar cadastro do paciente');
    expect(patient?.destination?.href).toContain('tab=contatos');
    expect(cards.cards.filter((c) => c.group === 'paciente')).toHaveLength(1);
  });

  it('3) endereço da clínica ausente → CTA Dados da Clínica / endereços', () => {
    const cards = cardsFor(baseChecklist({
      missing: [{ tag: '#clinicaEndereco', label: 'Endereço da clínica', group: 'clinica', critical: true }],
    }));
    const clinic = cards.cards.find((c) => c.group === 'clinica');
    expect(clinic?.destination?.ctaLabel).toBe('Corrigir dados da clínica');
    expect(clinic?.destination?.href).toContain('/admin/dados-clinica');
    expect(clinic?.destination?.href).toContain('section=enderecos');
  });

  it('4) RT/CRO ausente → CTA Dados da Clínica / documentação', () => {
    const cards = cardsFor(baseChecklist({
      missing: [
        { tag: '#responsavelTecnicoCRO', label: 'CRO do responsável técnico', group: 'clinica', critical: true },
      ],
    }));
    const clinic = cards.cards.find((c) => c.group === 'clinica');
    expect(clinic?.destination?.href).toContain('section=documentacao');
    expect(clinic?.destination?.href).toContain('highlight=responsavel-tecnico');
  });

  it('5) CRO do profissional ausente → CTA colaborador correto', () => {
    const enriched = enrichContractReadinessChecklist(baseChecklist({ canGenerate: true }), {
      professionalId: 'col-prereq-1',
      professionalCro: '',
    });
    expect(enriched.canGenerate).toBe(false);
    const cards = cardsFor(enriched, { professionalId: 'col-prereq-1' });
    const professional = cards.cards.find((c) => c.group === 'profissional');
    expect(professional?.destination?.ctaLabel).toBe('Corrigir dados do profissional');
    expect(professional?.destination?.href).toContain('/admin/colaboradores');
    expect(professional?.destination?.href).toContain('collaboratorId=col-prereq-1');
    expect(professional?.destination?.href).toContain('tab=profissional');
    expect(professional?.destination?.href).not.toContain('/admin/colaboradores/novo');
  });

  it('6) TCLE ausente → CTA Consentimentos', () => {
    const cards = cardsFor(baseChecklist({
      missing: [{ tag: 'tcle:tcle_implante', label: 'TCLE obrigatório: Implantes', group: 'tcle', critical: true }],
      requiredTcles: [{ id: 'tcle_implante', title: 'Implantes' }],
    }));
    const tcle = cards.cards.find((c) => c.group === 'tcle');
    expect(tcle?.destination?.ctaLabel).toBe('Resolver TCLE');
    expect(tcle?.destination?.href).toContain('section=documentos');
    expect(tcle?.destination?.href).toContain('docCategory=consentimentos');
  });

  it('7) LGPD ausente → CTA correspondente; LGPD pronto não gera CTA', () => {
    const missing = cardsFor(baseChecklist({
      missing: [{ tag: 'lgpd:missing', label: 'Termo LGPD pendente', group: 'lgpd', critical: true }],
    }));
    expect(missing.cards.find((c) => c.group === 'lgpd')?.destination?.ctaLabel).toBe('Resolver LGPD');

    const ready = cardsFor(baseChecklist({ canGenerate: true }));
    expect(ready.cards.find((c) => c.group === 'lgpd')).toBeUndefined();
  });

  it('8) pagamento ausente → CTA Orçamento / condição financeira', () => {
    const cards = cardsFor(baseChecklist({
      missing: [{ tag: '#formaPagamento', label: 'Forma de pagamento', group: 'contrato', critical: true }],
    }));
    const financeiro = cards.cards.find((c) => c.group === 'financeiro');
    expect(financeiro?.destination?.ctaLabel).toBe('Corrigir condição financeira');
    expect(financeiro?.destination?.href).toContain('section=orcamento');
    expect(cards.cards.find((c) => c.group === 'contrato' && c.status === 'pending')).toBeUndefined();
  });

  it('9) vários blockers de paciente → 1 CTA de paciente', () => {
    const enriched = enrichContractReadinessChecklist(baseChecklist({
      missing: [
        { tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', critical: true },
      ],
    }), { pendingCriticalFields: ['phone', 'sex'] });
    const cards = cardsFor(enriched);
    const patientCards = cards.cards.filter((c) => c.group === 'paciente' && c.status === 'pending');
    expect(patientCards).toHaveLength(1);
    expect(patientCards[0].items.length).toBeGreaterThanOrEqual(2);
    expect(patientCards[0].destination?.ctaLabel).toBe('Completar cadastro do paciente');
  });

  it('10) vários domínios → 1 CTA por grupo', () => {
    const cards = cardsFor(baseChecklist({
      missing: [
        { tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', critical: true },
        { tag: '#clinicaEndereco', label: 'Endereço da clínica', group: 'clinica', critical: true },
        { tag: 'tcle:tcle_implante', label: 'TCLE obrigatório: Implantes', group: 'tcle', critical: true },
      ],
      requiredTcles: [{ id: 'tcle_implante', title: 'Implantes' }],
    }));
    const pending = cards.cards.filter((c) => c.status === 'pending');
    expect(pending.map((c) => c.group).sort()).toEqual(['clinica', 'paciente', 'tcle']);
    expect(pending.every((c) => c.destination?.ctaLabel)).toBe(true);
  });

  it('11) returnTo mantém appointment/budget/patient', () => {
    const dest = buildPrerequisiteDestination('paciente', {
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
      items: [{ label: 'Endereço do paciente' }],
    });
    expect(dest.returnUrl).toContain(`/atendimento-clinico/${APPOINTMENT_ID}`);
    expect(dest.returnUrl).toContain(`budgetId=${BUDGET_ID}`);
    expect(dest.returnUrl).toContain(`patientId=${PATIENT_ID}`);
    expect(dest.returnUrl).toContain('section=contratos');
    expect(dest.returnUrl).toContain('revalidate=1');
    expect(dest.href).toContain(PATIENT_ID);
  });

  it('12) revalidação remove blocker após correção', () => {
    const blocked = enrichContractReadinessChecklist(baseChecklist({
      missing: [{ tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', critical: true }],
    }), { professionalId: 'col-1', professionalCro: 'CRO-MG 1' });
    expect(cardsFor(blocked).canGenerate).toBe(false);

    const ready = enrichContractReadinessChecklist(baseChecklist({
      missing: [],
      canGenerate: true,
    }), { professionalId: 'col-1', professionalCro: 'CRO-MG 1' });
    const readyCards = cardsFor(ready);
    expect(readyCards.canGenerate).toBe(true);
    expect(readyCards.cards.filter((c) => c.status === 'pending')).toHaveLength(0);
  });

  it('13) canGenerate só libera quando o validator real libera', () => {
    const validatorBlocked = enrichContractReadinessChecklist(baseChecklist({
      missing: [{ tag: '#pacienteCPF', label: 'CPF do paciente', group: 'paciente', critical: true }],
      canGenerate: false,
    }), { pendingCriticalFields: [], professionalId: 'col-1', professionalCro: 'CRO-1' });
    expect(validatorBlocked.canGenerate).toBe(false);

    const validatorOk = enrichContractReadinessChecklist(baseChecklist({
      missing: [],
      canGenerate: true,
    }), { pendingCriticalFields: ['phone', 'sex', 'birth_date'], professionalId: 'col-1', professionalCro: 'CRO-1' });
    expect(validatorOk.canGenerate).toBe(true);
  });

  it('14) rota cross-tenant / externa não é construída', () => {
    const dest = buildPrerequisiteDestination('clinica', {
      patientId: PATIENT_ID,
      appointmentId: APPOINTMENT_ID,
      budgetId: BUDGET_ID,
      items: [{ tag: '#responsavelTecnicoCRO', label: 'CRO' }],
    });
    expect(dest.href.startsWith('/admin/dados-clinica')).toBe(true);
    expect(dest.href).not.toContain('://');
    expect(isSafeClinicalReturnUrl(dest.returnUrl)).toBe(true);
    expect(isSafeClinicalReturnUrl('https://evil.com/atendimento-clinico/x')).toBe(false);
    expect(isSafeClinicalReturnUrl('//other-tenant.example/atendimento-clinico/x')).toBe(false);
  });

  it('15) unknown blocking reason → fail-safe message', () => {
    const checklist = baseChecklist({ canGenerate: false });
    checklist.groups.mystery = [{ tag: 'mystery:x', label: 'Motivo desconhecido', critical: true }];
    const cards = cardsFor(checklist);
    const unknown = cards.cards.find((c) => c.group === 'mystery');
    expect(unknown?.explicitlyNonActionable).toBe(true);
    expect(unknown?.nonActionableReason).toBe(UNKNOWN_BLOCKER_FAILSAFE);
    expect(unknown?.destination?.href).toBeNull();
  });

  it('16) blocker acionável conhecido nunca fica sem CTA', () => {
    const checklist = enrichContractReadinessChecklist(baseChecklist({
      missing: [
        { tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', critical: true },
        { tag: '#clinicaEndereco', label: 'Endereço da clínica', group: 'clinica', critical: true },
        { tag: '#formaPagamento', label: 'Forma de pagamento', group: 'contrato', critical: true },
        { tag: 'tcle:tcle_implante', label: 'TCLE obrigatório: Implantes', group: 'tcle', critical: true },
        { tag: 'lgpd:missing', label: 'Termo LGPD pendente', group: 'lgpd', critical: true },
      ],
      requiredTcles: [{ id: 'tcle_implante', title: 'Implantes' }],
    }), { professionalId: 'col-prereq-1', professionalCro: '' });
    const resolution = cardsFor(checklist, { professionalId: 'col-prereq-1' });
    expect(listUnactionableBlockingCards(resolution)).toEqual([]);
    const pending = resolution.cards.filter((c) => c.status === 'pending' && !c.explicitlyNonActionable);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((c) => c.destination?.href && c.destination.action)).toBe(true);
  });
});
