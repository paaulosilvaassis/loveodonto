/**
 * PHASE_10.21AV — barra operacional do atendimento clínico.
 * Somente UX. Não finaliza atendimento. Não muta orçamento/contrato.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  ClinicalAttendanceSessionBar,
  ATTENDANCE_SESSION_COPY,
} from '../components/clinical/ClinicalAttendanceSessionBar.jsx';
import { todayLocalIso } from '../services/clinicalAttendanceState.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const NEW_APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const NEW_CLINICAL = 'clinical-av-new';
const NEW_BUDGET = 'budget-au-orc-002';
const OLD_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const OLD_CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const OLD_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const OLD_CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const USER = { id: 'user-av', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function legalSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    appointments: db.appointments.map((a) => ({ id: a.id, status: a.status, finishedAt: a.finishedAt || null })),
    clinicals: db.clinicalAppointments.map((c) => ({
      id: c.id,
      appointmentId: c.appointmentId,
      finishedAt: c.finishedAt || null,
      budgetId: c.budget?.id,
      budgetNumber: c.budget?.budgetNumber ?? null,
      budgetStatus: c.budget?.status,
    })),
    contracts: (db.generatedContracts || []).map((c) => ({
      id: c.id,
      contractNumber: c.contractNumber,
      status: c.status,
      budgetId: c.budgetId,
    })),
    signatures: db.contractSignatures,
  });
}

function seedPilot() {
  const today = todayLocalIso();
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.patients = [{ id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT }];
    db.appointments = [
      {
        id: OLD_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.FINALIZADO,
        finishedAt: '2026-08-14T15:03:44.712Z',
        date: '2026-08-13',
        tenant_id: TENANT,
      },
      {
        id: NEW_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        date: today,
        startTime: '13:00',
        tenant_id: TENANT,
      },
    ];
    db.clinicalAppointments = [
      {
        id: OLD_CLINICAL,
        appointmentId: OLD_APPT,
        patientId: PATIENT,
        finishedAt: '2026-08-14T15:03:44.712Z',
        budget: {
          id: OLD_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
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
        },
      },
    ];
    db.generatedContracts = [{
      id: OLD_CONTRACT,
      contractNumber: 'CTR-2026-00001',
      status: CONTRACT_STATUS.SIGNED,
      budgetId: OLD_BUDGET,
      quoteId: OLD_APPT,
    }];
    db.contractSignatures = [{ id: 'sig-legacy-av', contractId: OLD_CONTRACT, signerRole: 'patient' }];
  });
}

function renderBar() {
  const db = loadDb();
  const appointment = db.appointments.find((a) => a.id === NEW_APPT);
  const clinical = db.clinicalAppointments.find((c) => c.appointmentId === NEW_APPT);
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(ClinicalAttendanceSessionBar, {
        user: USER,
        appointment,
        patient: db.patients[0],
        budget: clinical.budget,
      }),
    ),
  );
}

function operationalCssBlock() {
  const css = readSrc('src/index.css');
  const start = css.indexOf('.clinical-attendance-session-bar {');
  const attention = css.indexOf('.clinical-attendance-session-bar.is-attention');
  return css.slice(start, attention > start ? attention : start + 800);
}

describe('PHASE_10.21AV — barra operacional do atendimento', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPilot();
  });

  it('A/B/C/D) atendimento ativo mostra copy operacional e CTA', () => {
    const html = renderBar();
    expect(html).toContain(ATTENDANCE_SESSION_COPY.title);
    expect(html).toContain(ATTENDANCE_SESSION_COPY.subtitle);
    expect(html).toContain('Finalizar atendimento');
    expect(html).toContain('data-testid="finish-attendance-cta"');
    expect(html).toContain('data-testid="clinical-finish-session-bar"');
    expect(html).not.toContain('is-attention');
  });

  it('E/F) remove copy interna de workflow/auditoria', () => {
    const html = renderBar();
    const src = readSrc('src/components/clinical/ClinicalAttendanceSessionBar.jsx');
    expect(html).not.toContain('workflow oficial');
    expect(html).not.toContain('sem alterar orçamento ou contrato históricos');
    expect(src).not.toContain('workflow oficial');
    expect(src).not.toContain('sem alterar orçamento ou contrato históricos');
  });

  it('G) estado normal não usa semantic warning', () => {
    const html = renderBar();
    expect(html).toContain('clinical-attendance-session-bar');
    expect(html).not.toContain('is-attention');
    const operational = operationalCssBlock();
    expect(operational).toContain('var(--color-border)');
    expect(operational).toContain('var(--color-bg-card)');
    expect(operational).not.toContain('#fff7ed');
    expect(operational).not.toContain('#fdba74');
    expect(operational).not.toContain('#9a3412');
  });

  it('H/I/J) renderizar a barra não altera lifecycle, orçamento nem contrato', () => {
    const before = legalSnapshot();
    renderBar();
    renderBar();
    expect(legalSnapshot()).toBe(before);
    const db = loadDb();
    expect(db.appointments.find((a) => a.id === NEW_APPT).status).toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
    expect(db.clinicalAppointments.find((c) => c.appointmentId === NEW_APPT).budget.budgetNumber).toBe('ORC-002');
    expect(db.clinicalAppointments.find((c) => c.appointmentId === OLD_APPT).budget.id).toBe(OLD_BUDGET);
    expect(db.generatedContracts).toHaveLength(1);
    expect(db.generatedContracts[0].contractNumber).toBe('CTR-2026-00001');
  });
});
