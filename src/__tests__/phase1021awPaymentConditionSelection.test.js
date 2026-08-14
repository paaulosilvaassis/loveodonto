/**
 * PHASE_10.21AW — UX da seleção de condição de pagamento no ORC-002.
 * Sem aprovar, gerar contrato, assinar ou comunicar.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { getBudget } from '../services/clinicalService.js';
import { getActiveClinicalBudget } from '../services/budgetNavigationService.js';
import { resolveClinicalBudgetIdentity } from '../services/clinicalBudgetLockService.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../components/clinical/clinicalAppointmentConfig.js';
import {
  choosePaymentCondition,
} from '../components/clinical/budget/budgetPaymentPresentationService.js';
import {
  getChosenPaymentOption,
  isPaymentOptionChosen,
  PAYMENT_PRESENTATION_STATUS,
} from '../components/clinical/budget/budgetPaymentPdfUtils.js';
import { getAcceptedOption, resolveBudgetFinancials } from '../components/clinical/budget/budgetUtils.js';
import { BudgetPaymentConditions } from '../components/clinical/budget/BudgetPaymentConditions.jsx';
import { BudgetSummaryPanel } from '../components/clinical/budget/BudgetSummaryPanel.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-aw';
const OLD_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const NEW_APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const OLD_CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const NEW_CLINICAL = 'clinical-aw-new';
const OLD_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const NEW_BUDGET = 'budget-aw-orc-002';
const OTHER_BUDGET = 'budget-aw-other-patient';
const OLD_CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const USER = { id: 'user-aw', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function paymentOptions(chosenId = 'pay-a-vista') {
  return DEFAULT_PAYMENT_OPTIONS().map((opt) => {
    const chosen = opt.id === chosenId;
    return {
      ...opt,
      total: 150,
      accepted: chosen,
      presentToPatient: chosen,
      presentationStatus: chosen ? PAYMENT_PRESENTATION_STATUS.ESCOLHIDA : null,
      presentedAt: chosen ? '2026-08-14T16:00:00.000Z' : null,
    };
  });
}

function legalSnapshot() {
  const db = loadDb();
  const legacy = db.clinicalAppointments.find((c) => c.appointmentId === OLD_APPT);
  const neu = db.clinicalAppointments.find((c) => c.appointmentId === NEW_APPT);
  const contract = (db.generatedContracts || []).find((c) => c.id === OLD_CONTRACT);
  return JSON.stringify({
    legacyBudgetId: legacy?.budget?.id,
    legacyBudgetNumber: legacy?.budget?.budgetNumber ?? null,
    legacyStatus: legacy?.budget?.status,
    legacyChosen: getChosenPaymentOption(legacy?.budget)?.id || null,
    newBudgetId: neu?.budget?.id,
    newBudgetNumber: neu?.budget?.budgetNumber,
    newStatus: neu?.budget?.status,
    contractId: contract?.id,
    contractNumber: contract?.contractNumber,
    contractStatus: contract?.status,
    signatures: db.contractSignatures,
    manifest: contract?.metadata,
    budgetIds: (db.clinicalAppointments || []).map((c) => c.budget?.id),
    contractIds: (db.generatedContracts || []).map((c) => c.id),
  });
}

function persistBudget(appointmentId, budget) {
  withDb((db) => {
    const row = db.clinicalAppointments.find((c) => c.appointmentId === appointmentId);
    row.budget = budget;
  });
}

function seedPilot() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.patients = [
      { id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: TENANT },
    ];
    db.appointments = [
      {
        id: OLD_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.FINALIZADO,
        tenant_id: TENANT,
      },
      {
        id: NEW_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      },
      {
        id: 'appt-other-aw',
        patientId: OTHER_PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      },
    ];
    db.clinicalAppointments = [
      {
        id: OLD_CLINICAL,
        appointmentId: OLD_APPT,
        patientId: PATIENT,
        budget: {
          id: OLD_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
          createdAt: '2026-08-13T20:00:00.000Z',
          paymentOptions: paymentOptions('pay-a-vista'),
        },
      },
      {
        id: NEW_CLINICAL,
        appointmentId: NEW_APPT,
        patientId: PATIENT,
        budget: {
          id: NEW_BUDGET,
          budgetNumber: 'ORC-002',
          status: BUDGET_STATUS.NEGOCIACAO,
          totalValue: 150,
          planName: 'Aplicação topica de fluor',
          createdAt: '2026-08-14T15:40:00.000Z',
          paymentOptions: paymentOptions('pay-a-vista'),
        },
      },
      {
        id: 'clinical-other-aw',
        appointmentId: 'appt-other-aw',
        patientId: OTHER_PATIENT,
        budget: {
          id: OTHER_BUDGET,
          budgetNumber: 'ORC-009',
          status: BUDGET_STATUS.NEGOCIACAO,
          totalValue: 999,
          createdAt: '2026-08-14T16:00:00.000Z',
          paymentOptions: paymentOptions('pay-cartao'),
        },
      },
    ];
    db.generatedContracts = [{
      id: OLD_CONTRACT,
      contractNumber: 'CTR-2026-00001',
      status: CONTRACT_STATUS.SIGNED,
      budgetId: OLD_BUDGET,
      quoteId: OLD_APPT,
      quoteSource: 'clinical_budget',
      metadata: { packageManifestId: 'manifest-legacy-aw', frozenAt: '2026-08-13T21:00:00.000Z' },
    }];
    db.contractSignatures = [{
      id: 'sig-legacy-aw',
      contractId: OLD_CONTRACT,
      signerRole: 'patient',
    }];
  });
}

function renderConditions(budget) {
  return renderToStaticMarkup(
    React.createElement(BudgetPaymentConditions, {
      budget,
      setBudget() {},
      originalValue: 150,
      onPresent() {},
      onChoose() {},
      readOnly: false,
      user: USER,
    }),
  );
}

describe('PHASE_10.21AW — seleção de condição de pagamento', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPilot();
  });

  it('A) ORC-002 carrega a condição escolhida pelo próprio budgetId', () => {
    const identity = resolveClinicalBudgetIdentity({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
    });
    expect(identity.budgetId).toBe(NEW_BUDGET);
    expect(identity.displayNumber).toBe('ORC-002');
    const budget = getActiveClinicalBudget(NEW_APPT);
    expect(budget.id).toBe(NEW_BUDGET);
    expect(getChosenPaymentOption(budget).id).toBe('pay-a-vista');
    expect(getAcceptedOption(budget).id).toBe('pay-a-vista');
    expect(getChosenPaymentOption(budget).id).toBe(getAcceptedOption(budget).id);
  });

  it('B/C) À vista escolhida mostra estado; demais mostram CTA', () => {
    const html = renderConditions(getActiveClinicalBudget(NEW_APPT));
    expect(html).toContain('data-testid="payment-condition-chosen-state"');
    expect(html).toContain('Condição escolhida');
    expect(html).toContain('data-testid="payment-condition-choose-cta-parcelado_clinica"');
    expect(html).toContain('Marcar como escolhida');
    expect(html).not.toContain('data-testid="payment-condition-choose-cta-a_vista"');
    expect(html).toContain('data-testid="payment-condition-card-a_vista"');
    expect(html).toContain('is-chosen');
  });

  it('D/E) selecionar outra condição remove atomicamente a anterior', () => {
    const current = getActiveClinicalBudget(NEW_APPT);
    const result = choosePaymentCondition(current, 'pay-parcelado', {
      originalValue: 150,
      user: USER,
      appointmentId: NEW_APPT,
      expectedBudgetId: NEW_BUDGET,
    });
    expect(result.ok).toBe(true);
    const chosen = result.nextBudget.paymentOptions.filter(isPaymentOptionChosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].id).toBe('pay-parcelado');
    expect(getAcceptedOption(result.nextBudget).id).toBe('pay-parcelado');
    expect(getChosenPaymentOption(result.nextBudget).id).toBe('pay-parcelado');
    const previous = result.nextBudget.paymentOptions.find((o) => o.id === 'pay-a-vista');
    expect(previous.accepted).toBe(false);
    expect(previous.presentationStatus).not.toBe(PAYMENT_PRESENTATION_STATUS.ESCOLHIDA);
  });

  it('F) resumo lateral deriva do mesmo SSOT', () => {
    const budget = getActiveClinicalBudget(NEW_APPT);
    const financials = resolveBudgetFinancials(budget);
    expect(financials.accepted.id).toBe(getChosenPaymentOption(budget).id);
    const html = renderToStaticMarkup(
      React.createElement(BudgetSummaryPanel, {
        displayNumber: 'ORC-002',
        patientName: 'Paulo Henrique Silva de Assis',
        planName: 'Aplicação topica de fluor',
        professionalName: 'Juliana de Oliveira Freire',
        procedureCount: 1,
        originalValue: financials.originalValue,
        discount: financials.discount,
        finalValue: financials.finalValue,
        validityDate: '',
        status: budget.status,
        chosenOption: financials.accepted,
      }),
    );
    expect(html).toContain('Condição escolhida pelo paciente');
    expect(html).toContain('À vista');
    expect(html).toContain('150,00');
  });

  it('G) refresh preserva a seleção no budgetId ativo', () => {
    const first = getChosenPaymentOption(getActiveClinicalBudget(NEW_APPT));
    const reloaded = getChosenPaymentOption(getBudget(NEW_APPT));
    expect(reloaded.id).toBe(first.id);
    expect(reloaded.id).toBe('pay-a-vista');
    const switched = choosePaymentCondition(getActiveClinicalBudget(NEW_APPT), 'pay-cartao', {
      originalValue: 150,
      user: USER,
      appointmentId: NEW_APPT,
      expectedBudgetId: NEW_BUDGET,
    });
    persistBudget(NEW_APPT, switched.nextBudget);
    expect(getChosenPaymentOption(getActiveClinicalBudget(NEW_APPT)).id).toBe('pay-cartao');
    expect(getChosenPaymentOption(getBudget(NEW_APPT)).id).toBe('pay-cartao');
  });

  it('fail closed: mismatch de appointment/budget não altera ORC-002', () => {
    const before = JSON.stringify(getActiveClinicalBudget(NEW_APPT).paymentOptions);
    const mismatch = choosePaymentCondition(getBudget('appt-other-aw'), 'pay-a-vista', {
      originalValue: 150,
      user: USER,
      appointmentId: NEW_APPT,
      expectedBudgetId: NEW_BUDGET,
    });
    expect(mismatch.ok).toBe(false);
    expect(JSON.stringify(getActiveClinicalBudget(NEW_APPT).paymentOptions)).toBe(before);
  });

  it('H/I/J/K/L) legado, contrato, assinatura, manifest e comunicação intactos', () => {
    const before = legalSnapshot();
    const html = renderConditions(getActiveClinicalBudget(NEW_APPT));
    expect(html).toContain('Condição escolhida');
    const switched = choosePaymentCondition(getActiveClinicalBudget(NEW_APPT), 'pay-parcelado', {
      originalValue: 150,
      user: USER,
      appointmentId: NEW_APPT,
      expectedBudgetId: NEW_BUDGET,
    });
    expect(switched.ok).toBe(true);
    expect(legalSnapshot()).toBe(before);
    const db = loadDb();
    expect(db.clinicalAppointments.find((c) => c.appointmentId === OLD_APPT).budget.id).toBe(OLD_BUDGET);
    expect(db.generatedContracts).toHaveLength(1);
    expect(db.generatedContracts[0].contractNumber).toBe('CTR-2026-00001');
    expect(db.contractSignatures).toHaveLength(1);
    expect(db.clinicalAppointments.map((c) => c.budget?.id)).toEqual([
      OLD_BUDGET,
      NEW_BUDGET,
      OTHER_BUDGET,
    ]);
  });

  it('UX: Apresentar ao paciente permanece passo separado; escolhida não desapresenta', () => {
    const src = readSrc('src/components/clinical/budget/BudgetPaymentConditions.jsx');
    expect(src).toContain('disabled={chosen}');
    expect(src).toContain("? 'Apresentada' : 'Apresentar ao paciente'");
    const html = renderConditions(getActiveClinicalBudget(NEW_APPT));
    expect(html).toContain('data-testid="payment-condition-present-cta-a_vista"');
    expect(html).toContain('disabled');
    expect(html).toContain('Apresentar ao paciente');
    const presentSrc = readSrc('src/components/clinical/budget/budgetPaymentPresentationService.js');
    expect(presentSrc).toContain('action: alreadyPresented ? \'unpresented\' : \'presented\'');
  });

  it('handler clínico usa choosePaymentCondition no budget ativo', () => {
    const src = readSrc('src/components/clinical/ClinicalBudgetSection.jsx');
    expect(src).toContain('choosePaymentCondition');
    expect(src).toContain('getActiveClinicalBudget(appointmentId)');
    expect(src).toContain('expectedBudgetId: budget.id');
    expect(src).not.toContain('item.id !== opt.id');
  });
});
