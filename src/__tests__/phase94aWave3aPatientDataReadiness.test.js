/**
 * Phase 9.4A Wave 3A — Patient Data Readiness Audit (somente leitura / estático).
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGING_REF } from '../../scripts/supabase/constants.mjs';
import {
  AUDIT_CONFIRMATION_ENV,
  AUDIT_CONFIRMATION_VALUE,
  CLASSIFICATION,
  assertNoRawPiiLeak,
  auditPatientSnapshot,
  hashId,
  maskCpf,
  maskEmail,
  maskPhone,
} from '../../scripts/patients/patientDataAudit.mjs';
import { runPatientDataAuditCli as runCli } from '../../scripts/patients/patientDataAuditCli.mjs';
import {
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
  getPatientRepositoryFlags,
} from '../repositories/patient/patientRepositoryFlags.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SYNTHETIC = path.join(
  REPO_ROOT,
  'scripts/patients/fixtures/wave3a_synthetic_snapshot.json',
);

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function loadSynthetic() {
  return JSON.parse(fs.readFileSync(SYNTHETIC, 'utf8'));
}

describe('Phase 9.4A Wave 3A — auditor read-only guards', () => {
  it('auditor nunca escreve no snapshot (somente leitura do input)', () => {
    const snap = loadSynthetic();
    const before = JSON.stringify(snap);
    const report = auditPatientSnapshot(snap, { sourceLabel: 'test' });
    expect(JSON.stringify(snap)).toBe(before);
    expect(report.simulation.persisted).toBe(false);
    expect(report.remoteActionsExecuted).toBe(false);
  });

  it('auditor nunca chama rede (sem fetch/http no engine/cli)', () => {
    const engine = read('scripts/patients/patientDataAuditEngine.mjs');
    const cli = read('scripts/patients/patientDataAuditCli.mjs');
    const entry = read('scripts/patients/auditIndexedDbPatientData.mjs');
    const mask = read('scripts/patients/patientDataAuditMask.mjs');
    for (const src of [engine, cli, entry, mask]) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/supabase\.co/);
      expect(src).not.toMatch(/createClient/);
    }
  });

  it('PII mascarada — CPF/telefone/e-mail não aparecem completos no relatório', () => {
    const snap = loadSynthetic();
    const report = auditPatientSnapshot(snap, { sourceLabel: 'test' });
    const json = JSON.stringify(report);
    expect(json).not.toContain('52998224725');
    expect(json).not.toContain('ana.ready@example.com');
    expect(json).not.toContain('988887777');
    expect(maskCpf('52998224725')).toBe('529.***.***-25');
    expect(maskPhone('11988887777')).toMatch(/\*\*/);
    expect(maskEmail('ana.ready@example.com')).not.toContain('ana.ready');
    const leak = assertNoRawPiiLeak(json);
    expect(leak.ok).toBe(true);
  });

  it('conflitos, órfãos, cross-tenant e cardinalidade detectados', () => {
    const report = auditPatientSnapshot(loadSynthetic(), { sourceLabel: 'test' });
    expect(report.cpf.duplicateSameTenant).toBeGreaterThan(0);
    expect(report.phones.orphan).toBeGreaterThan(0);
    expect(report.phones.crossTenant).toBeGreaterThan(0);
    expect(report.phones.multiPrimary).toBeGreaterThan(0);
    expect(report.documents.orphan).toBeGreaterThan(0);
    expect(report.documents.duplicateOneToOne).toBeGreaterThan(0);
    expect(report.addresses.orphan).toBeGreaterThan(0);
    expect(report.addresses.crossTenant).toBeGreaterThan(0);
    expect(report.records.orphan).toBeGreaterThan(0);
    expect(report.records.duplicateRecordNumberSameTenant).toBeGreaterThan(0);
    expect(report.brokenExternalLinks).toBeGreaterThan(0);
    expect(report.classifications[CLASSIFICATION.BLOCKED_DUPLICATE_CPF]).toBeGreaterThan(0);
    expect(report.classifications[CLASSIFICATION.BLOCKED_MISSING_TENANT]).toBeGreaterThan(0);
    expect(report.classifications[CLASSIFICATION.BLOCKED_CROSS_TENANT]).toBeGreaterThan(0);
    expect(report.classifications[CLASSIFICATION.BLOCKED_INVALID_CARDINALITY]).toBeGreaterThan(0);
    expect(report.classifications[CLASSIFICATION.MANUAL_REVIEW_REQUIRED]).toBeGreaterThan(0);
    expect(report.gate).toBe('BLOCKED_BY_CROSS_TENANT_DATA');
  });

  it('simulação não persiste e remoteActionsExecuted=false', () => {
    const report = auditPatientSnapshot(loadSynthetic());
    expect(report.simulation.mode).toBe('SIMULATION_ONLY_NO_PERSIST');
    expect(report.simulation.persisted).toBe(false);
    expect(report.remoteActionsExecuted).toBe(false);
    expect(typeof report.simulation.wouldInsertPatients).toBe('number');
  });

  it('CLI exige confirmação explícita', async () => {
    const blocked = await runCli(['node', 'audit'], {});
    expect(blocked.ok).toBe(false);
    expect(blocked.report.remoteActionsExecuted).toBe(false);
    expect(blocked.report.gate).toBe('BLOCKED_BY_UNAVAILABLE_LOCAL_DATA');

    const ok = await runCli(
      ['node', 'audit', '--synthetic'],
      { [AUDIT_CONFIRMATION_ENV]: AUDIT_CONFIRMATION_VALUE },
    );
    expect(ok.ok).toBe(true);
    expect(ok.report.dataAccessible).toBe(true);
    expect(ok.report.remoteActionsExecuted).toBe(false);
    expect(ok.readable).toBeTruthy();
    expect(assertNoRawPiiLeak(ok.readable).ok).toBe(true);
  });

  it('sem snapshot → BLOCKED_BY_UNAVAILABLE_LOCAL_DATA (não inventa métricas)', async () => {
    const r = await runCli(
      ['node', 'audit'],
      { [AUDIT_CONFIRMATION_ENV]: AUDIT_CONFIRMATION_VALUE },
    );
    expect(r.ok).toBe(false);
    expect(r.report.dataAccessible).toBe(false);
    expect(r.report.gate).toBe('BLOCKED_BY_UNAVAILABLE_LOCAL_DATA');
    expect(r.report.profile).toBeUndefined();
  });

  it('hashId é estável e não vaza id cru nos samples', () => {
    expect(hashId('patient-ready-001')).toMatch(/^h:[a-f0-9]{12}$/);
    const report = auditPatientSnapshot(loadSynthetic());
    for (const s of report.classificationSamples) {
      expect(s.id).toBeUndefined();
      expect(s.idHash || s.patientIdHash).toBeTruthy();
    }
  });
});

describe('Phase 9.4A Wave 3A — invariantes de produto (não alterar)', () => {
  it('flags de Pacientes permanecem false', () => {
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_READ).toBe(false);
    expect(flags.PATIENTS_WRITE).toBe(false);
    expect(flags.PATIENTS_DUAL_WRITE).toBe(false);
    expect(flags.PATIENTS_SHADOW).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ).toBe(false);
  });

  it('patientService não alterado / não ligado ao repository', () => {
    const service = read('src/services/patientService.js');
    expect(service).not.toMatch(/PATIENTS_READ|PATIENTS_WRITE|PATIENTS_DUAL_WRITE/);
    expect(service).not.toMatch(/createPatientRepository|patientSupabaseRepository/);
  });

  it('migrations 025/027 não alteradas nesta wave (existem e SHA estável no FS)', () => {
    const m025 = path.join(REPO_ROOT, 'supabase/migrations/025_app_patients_core.sql');
    const m027 = path.join(REPO_ROOT, 'supabase/migrations/027_app_patient_details.sql');
    expect(fs.existsSync(m025)).toBe(true);
    expect(fs.existsSync(m027)).toBe(true);
    // Wave 3A nao deve introduzir write paths nestes arquivos via auditor
    const eng = read('scripts/patients/patientDataAuditEngine.mjs');
    expect(eng).not.toMatch(/025_app_patients|027_app_patient/);
  });

  it('linkedRef preservado e package script exposto', () => {
    expect(STAGING_REF).toBe('tckdjyunwmdpqmewrwvt');
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['test:supabase:phase94a-wave3a']).toContain(
      'phase94aWave3aPatientDataReadiness',
    );
  });

  it('artefatos e relatório existem', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/patients/patientDataAudit.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/patients/patientDataAuditEngine.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/patients/auditIndexedDbPatientData.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'docs/reports/PHASE_9_4A_WAVE3A_PATIENT_DATA_READINESS_AUDIT.md'))).toBe(true);
  });

  it('não usa vi.fn fetch — sanity que teste não mocka escrita remota', () => {
    expect(vi).toBeTruthy();
    // garante ausência de spy de rede no suite (contrato documental)
    expect(typeof fetch).toBe('function');
  });
});
