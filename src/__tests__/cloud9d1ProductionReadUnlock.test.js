/**
 * CLOUD.9D.1 — Minimal production READ unlock (WRITE remains hard-locked).
 * Code-only: no env activation, no remote writes, no PHI.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  PATIENTS_PRODUCTION_LOCKED_FLAGS,
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
  getPatientRepositoryFlags,
} from '../repositories/patient/patientRepositoryFlags.ts';

const ENV_KEYS = [
  'PROD',
  'VITE_SUPABASE_APP_URL',
  'VITE_PATIENTS_READ',
  'VITE_PATIENTS_SHADOW',
  'VITE_PATIENTS_COMPARE',
  'VITE_PATIENTS_READ_PRIMARY',
  'VITE_PATIENTS_WRITE',
  'VITE_PATIENTS_WRITE_PRIMARY',
  'VITE_PATIENTS_DUAL_WRITE',
  'VITE_PATIENTS_WRITE_COMPARE',
];

const PROD_HOST = 'https://uoepkwhqztmsjnzirpev.supabase.co';

describe('CLOUD.9D.1 production read unlock', () => {
  const backup = {};

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (Object.prototype.hasOwnProperty.call(backup, key)) {
        import.meta.env[key] = backup[key];
      } else {
        delete import.meta.env[key];
      }
      delete backup[key];
    }
  });

  function snapEnv() {
    for (const key of ENV_KEYS) {
      backup[key] = import.meta.env[key];
    }
  }

  function setProdRuntime() {
    snapEnv();
    import.meta.env.PROD = true;
    import.meta.env.VITE_SUPABASE_APP_URL = PROD_HOST;
  }

  it('defaults permanecem false', () => {
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_SHADOW).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_COMPARE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ_PRIMARY).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE_PRIMARY).toBe(false);
  });

  it('production locked keys cobrem somente WRITE*', () => {
    expect(PATIENTS_PRODUCTION_LOCKED_FLAGS).toEqual([
      'PATIENTS_WRITE',
      'PATIENTS_WRITE_PRIMARY',
      'PATIENTS_DUAL_WRITE',
      'PATIENTS_WRITE_COMPARE',
    ]);
    expect(PATIENTS_PRODUCTION_LOCKED_FLAGS).not.toContain('PATIENTS_READ');
    expect(PATIENTS_PRODUCTION_LOCKED_FLAGS).not.toContain('PATIENTS_SHADOW');
    expect(PATIENTS_PRODUCTION_LOCKED_FLAGS).not.toContain('PATIENTS_COMPARE');
    expect(PATIENTS_PRODUCTION_LOCKED_FLAGS).not.toContain('PATIENTS_READ_PRIMARY');
  });

  it('A — PROD + all env false → all patient flags false', () => {
    setProdRuntime();
    for (const key of ENV_KEYS) {
      if (key === 'PROD' || key === 'VITE_SUPABASE_APP_URL') continue;
      import.meta.env[key] = 'false';
    }
    const flags = getPatientRepositoryFlags();
    expect(flags).toEqual({
      PATIENTS_READ: false,
      PATIENTS_READ_PRIMARY: false,
      PATIENTS_SHADOW: false,
      PATIENTS_COMPARE: false,
      PATIENTS_WRITE: false,
      PATIENTS_WRITE_PRIMARY: false,
      PATIENTS_DUAL_WRITE: false,
      PATIENTS_WRITE_COMPARE: false,
    });
  });

  it('B — PROD + READ=true → READ can become true', () => {
    setProdRuntime();
    import.meta.env.VITE_PATIENTS_READ = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_READ).toBe(true);
    expect(flags.PATIENTS_WRITE).toBe(false);
  });

  it('C — PROD + SHADOW=true → SHADOW can become true', () => {
    setProdRuntime();
    import.meta.env.VITE_PATIENTS_SHADOW = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_SHADOW).toBe(true);
    expect(flags.PATIENTS_WRITE).toBe(false);
  });

  it('D — PROD + READ+READ_PRIMARY=true → READ_PRIMARY can become true', () => {
    setProdRuntime();
    import.meta.env.VITE_PATIENTS_READ = 'true';
    import.meta.env.VITE_PATIENTS_READ_PRIMARY = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_READ).toBe(true);
    expect(flags.PATIENTS_READ_PRIMARY).toBe(true);
    expect(flags.PATIENTS_WRITE).toBe(false);
  });

  it('E — PROD + WRITE=true → WRITE remains false', () => {
    setProdRuntime();
    import.meta.env.VITE_PATIENTS_READ = 'true';
    import.meta.env.VITE_PATIENTS_WRITE = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_READ).toBe(true);
    expect(flags.PATIENTS_WRITE).toBe(false);
  });

  it('F — PROD + WRITE_PRIMARY=true → WRITE_PRIMARY remains false', () => {
    setProdRuntime();
    import.meta.env.VITE_PATIENTS_READ = 'true';
    import.meta.env.VITE_PATIENTS_WRITE = 'true';
    import.meta.env.VITE_PATIENTS_WRITE_PRIMARY = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_WRITE).toBe(false);
    expect(flags.PATIENTS_WRITE_PRIMARY).toBe(false);
  });

  it('G — production Supabase host no longer blocks READ_PRIMARY', () => {
    snapEnv();
    import.meta.env.PROD = false;
    import.meta.env.VITE_SUPABASE_APP_URL = PROD_HOST;
    import.meta.env.VITE_PATIENTS_READ = 'true';
    import.meta.env.VITE_PATIENTS_READ_PRIMARY = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_READ_PRIMARY).toBe(true);
  });

  it('H — production Supabase host still blocks write flags', () => {
    snapEnv();
    import.meta.env.PROD = false;
    import.meta.env.VITE_SUPABASE_APP_URL = PROD_HOST;
    import.meta.env.VITE_PATIENTS_READ = 'true';
    import.meta.env.VITE_PATIENTS_WRITE = 'true';
    import.meta.env.VITE_PATIENTS_WRITE_PRIMARY = 'true';
    import.meta.env.VITE_PATIENTS_DUAL_WRITE = 'true';
    import.meta.env.VITE_PATIENTS_WRITE_COMPARE = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_WRITE).toBe(false);
    expect(flags.PATIENTS_WRITE_PRIMARY).toBe(false);
    expect(flags.PATIENTS_DUAL_WRITE).toBe(false);
    expect(flags.PATIENTS_WRITE_COMPARE).toBe(false);
  });

  it('COMPARE permanece configurável em PROD (default false)', () => {
    setProdRuntime();
    import.meta.env.VITE_PATIENTS_SHADOW = 'true';
    import.meta.env.VITE_PATIENTS_COMPARE = 'true';
    const flags = getPatientRepositoryFlags();
    expect(flags.PATIENTS_COMPARE).toBe(true);
  });
});
