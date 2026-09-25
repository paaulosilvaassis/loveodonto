/**
 * SPF.1A.1 — gates dos scripts CRITICAL/HIGH e proteção de startup da Admin API.
 * Nenhum script é executado; os gates são funções puras e a ligação é verificada no código-fonte.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from '../lib/supabaseTarget/projectRefs.js';
import { SupabaseTargetGuardError } from '../lib/supabaseTarget/supabaseTargetGuard.js';
import {
  SCRIPT_OPERATION_IDS,
  gateCollaboratorIdBackfill,
  gateManagementApiMigrationScript,
  gateManualCollaboratorAccess,
  gateResetPlatformTenants,
  gateRhBackfill,
  runScriptGateOrExit,
} from '../lib/supabaseTarget/scriptGates.js';
import {
  applyServerStartupGuard,
  evaluateServerSupabaseTarget,
} from '../lib/supabaseTarget/serverStartupGuard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const SIGNATURE = 'SIGNATURE_SECRET_q7_never_log';
const jwt = (ref) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc({ ref, role: 'service_role' })}.${SIGNATURE}`;
};
const PROD_KEY = jwt(PRODUCTION_PROJECT_REF);
const STAGING_KEY = jwt(STAGING_PROJECT_REF);
const PROD = { LOVE_ODONTO_TARGET_ENV: 'production' };
const STAGING = { LOVE_ODONTO_TARGET_ENV: 'staging' };

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SupabaseTargetGuardError);
    return err.code;
  }
  throw new Error('esperava DENY, mas foi permitido');
}

describe('reset-platform-tenants — proteção máxima', () => {
  const base = { url: PROD_URL, credential: PROD_KEY };
  it('RECUSA production em qualquer modo (dry-run, --confirm, com confirmação destrutiva)', () => {
    expect(codeOf(() => gateResetPlatformTenants({ ...base, env: PROD, argv: [] })))
      .toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
    expect(codeOf(() => gateResetPlatformTenants({ ...base, env: PROD, argv: ['--confirm'] })))
      .toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
    expect(codeOf(() => gateResetPlatformTenants({
      ...base,
      env: {
        ...PROD,
        LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION: `DESTROY:${PRODUCTION_PROJECT_REF}:${SCRIPT_OPERATION_IDS.resetPlatformTenants}`,
        LOVE_ODONTO_PRODUCTION_AUTHORIZATION: 'ANY',
      },
      argv: ['--confirm'],
    }))).toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
  });

  it('RECUSA sem alvo declarado e com alvo divergente da URL (caso .env apontando p/ production)', () => {
    expect(codeOf(() => gateResetPlatformTenants({ ...base, env: {}, argv: [] }))).toBe('TARGET_ENV_MISSING');
    expect(codeOf(() => gateResetPlatformTenants({ ...base, env: STAGING, argv: ['--confirm'] })))
      .toBe('TARGET_REF_MISMATCH');
  });

  it('staging: --confirm sozinho não basta', () => {
    expect(gateResetPlatformTenants({ env: STAGING, url: STAGING_URL, credential: STAGING_KEY, argv: [] }).gate.mode)
      .toBe('dry-run');
    expect(codeOf(() => gateResetPlatformTenants({
      env: STAGING, url: STAGING_URL, credential: STAGING_KEY, argv: ['--confirm'],
    }))).toBe('DESTRUCTIVE_CONFIRMATION_REQUIRED');
  });
});

describe('manual-collaborator-access-guided', () => {
  it('RECUSA production e exige confirmação destrutiva fora dela', () => {
    expect(codeOf(() => gateManualCollaboratorAccess({ env: PROD, url: PROD_URL, credential: PROD_KEY, argv: ['--apply'] })))
      .toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
    expect(gateManualCollaboratorAccess({ env: STAGING, url: STAGING_URL, credential: STAGING_KEY, argv: [] }).gate.mode)
      .toBe('dry-run');
    expect(codeOf(() => gateManualCollaboratorAccess({
      env: STAGING, url: STAGING_URL, credential: STAGING_KEY, argv: ['--apply'],
    }))).toBe('DESTRUCTIVE_CONFIRMATION_REQUIRED');
  });
});

describe('rh-backfill-to-supabase e collaborator-id-backfill', () => {
  for (const [name, gate] of [['rh-backfill', gateRhBackfill], ['collaborator-id-backfill', gateCollaboratorIdBackfill]]) {
    it(`${name}: production apply e rollback negados; dry-run é o padrão`, () => {
      expect(codeOf(() => gate({ env: PROD, url: PROD_URL, credential: PROD_KEY, apply: true })))
        .toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
      expect(codeOf(() => gate({ env: PROD, url: PROD_URL, credential: PROD_KEY, rollback: true })))
        .toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
      expect(gate({ env: STAGING, url: STAGING_URL, credential: STAGING_KEY }).gate.mode).toBe('dry-run');
      expect(gate({ env: STAGING, url: STAGING_URL, credential: STAGING_KEY, apply: true }).gate.mode).toBe('apply');
    });

    it(`${name}: .env com production enquanto o operador declara staging → DENY (sem fallback)`, () => {
      expect(codeOf(() => gate({ env: STAGING, url: PROD_URL, credential: PROD_KEY }))).toBe('TARGET_REF_MISMATCH');
      expect(codeOf(() => gate({ env: STAGING, url: STAGING_URL, credential: PROD_KEY }))).toBe('CREDENTIAL_REF_MISMATCH');
      expect(codeOf(() => gate({ env: {}, url: STAGING_URL, credential: STAGING_KEY }))).toBe('TARGET_ENV_MISSING');
    });
  }
});

describe('security/apply* (Management API contra ref fixo de production)', () => {
  const scripts = [
    SCRIPT_OPERATION_IDS.applyAeProductionMigrationOne,
    SCRIPT_OPERATION_IDS.apply037BillingRlsOnly,
    SCRIPT_OPERATION_IDS.apply038ClinicLogosEnumerationOnly,
    SCRIPT_OPERATION_IDS.apply039HelperTextOverloadOnly,
    SCRIPT_OPERATION_IDS.apply040ProductionPrivateStorageOnly,
  ];
  for (const operationId of scripts) {
    it(`${operationId}: sem --apply bloqueia; com --apply em production nega sem autorização`, () => {
      const base = { operationId, managementRef: PRODUCTION_PROJECT_REF };
      expect(codeOf(() => gateManagementApiMigrationScript({ ...base, env: PROD, argv: [] })))
        .toBe('DRY_RUN_UNSUPPORTED');
      expect(codeOf(() => gateManagementApiMigrationScript({ ...base, env: PROD, argv: ['--apply'] })))
        .toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
      expect(codeOf(() => gateManagementApiMigrationScript({
        ...base, env: { ...PROD, LOVE_ODONTO_PRODUCTION_AUTHORIZATION: 'NOT-IN-ALLOWLIST' }, argv: ['--apply'],
      }))).toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
      expect(codeOf(() => gateManagementApiMigrationScript({ ...base, env: {}, argv: ['--apply'] })))
        .toBe('TARGET_ENV_MISSING');
      expect(codeOf(() => gateManagementApiMigrationScript({ ...base, env: STAGING, argv: ['--apply'] })))
        .toBe('TARGET_REF_MISMATCH');
      expect(codeOf(() => gateManagementApiMigrationScript({
        ...base, env: PROD, supabaseUrl: STAGING_URL, argv: ['--apply'],
      }))).toBe('TARGET_REF_MISMATCH');
      expect(codeOf(() => gateManagementApiMigrationScript({
        ...base, env: PROD, supabaseUrl: PROD_URL, credential: STAGING_KEY, argv: ['--apply'],
      }))).toBe('CREDENTIAL_REF_MISMATCH');
    });
  }
});

describe('runScriptGateOrExit', () => {
  it('em negação imprime JSON sanitizado e sai com 2, sem vazar a chave', () => {
    const log = vi.fn();
    const exit = vi.fn();
    const out = runScriptGateOrExit(
      () => gateResetPlatformTenants({ env: PROD, url: PROD_URL, credential: PROD_KEY, argv: ['--confirm'] }),
      { log, info: vi.fn(), exit },
    );
    expect(out).toBeNull();
    expect(exit).toHaveBeenCalledWith(2);
    const printed = log.mock.calls.flat().join('\n');
    expect(JSON.parse(printed).code).toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
    expect(printed).not.toContain(SIGNATURE);
    expect(printed).not.toContain(PROD_KEY);
  });

  it('erros que não são do guard são repassados', () => {
    expect(() => runScriptGateOrExit(() => { throw new TypeError('boom'); }, { log: vi.fn(), exit: vi.fn() }))
      .toThrow('boom');
  });
});

describe('ligação nos scripts (estática — os scripts não são executados)', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const before = (src, a, b) => {
    const ia = src.indexOf(a);
    const ib = src.indexOf(b);
    expect(ia, `${a} ausente`).toBeGreaterThan(-1);
    expect(ib, `${b} ausente`).toBeGreaterThan(-1);
    expect(ia, `${a} deve vir antes de ${b}`).toBeLessThan(ib);
  };

  it('reset-platform-tenants: gate antes de criar o client', () => {
    const src = read('scripts/reset-platform-tenants.mjs');
    before(src, 'gateResetPlatformTenants({', 'const supabase = createClient(');
    expect(src).toContain("guard.gate.mode === 'apply'");
  });

  it('applyAeProductionMigrationOne: gate antes do token e do apply; ref central', () => {
    const src = read('scripts/security/applyAeProductionMigrationOne.mjs');
    before(src, 'gateManagementApiMigrationScript({', 'const token = process.env.SUPABASE_ACCESS_TOKEN');
    before(src, 'gateManagementApiMigrationScript({', 'await managementSql(sql)');
    expect(src).not.toContain(`'${PRODUCTION_PROJECT_REF}'`);
  });

  for (const file of [
    'scripts/security/apply037BillingRlsOnly.mjs',
    'scripts/security/apply038ClinicLogosEnumerationOnly.mjs',
    'scripts/security/apply039HelperTextOverloadOnly.mjs',
    'scripts/security/apply040ProductionPrivateStorageOnly.mjs',
  ]) {
    it(`${path.basename(file)}: gate é a primeira ação de main(); ref central`, () => {
      const src = read(file);
      before(src, 'async function main() {', 'gateManagementApiMigrationScript({');
      before(src, 'gateManagementApiMigrationScript({', 'const accessToken = process.env.SUPABASE_ACCESS_TOKEN');
      expect(src).not.toContain(`'${PRODUCTION_PROJECT_REF}'`);
    });
  }

  it('manual-collaborator-access-guided: gate antes de reiniciar API / criar clients admin', () => {
    const src = read('scripts/manual-collaborator-access-guided.mjs');
    const main = src.slice(src.indexOf('async function main() {'));
    before(main, 'gateManualCollaboratorAccess({', 'await restartApi()');
    before(main, 'gateManualCollaboratorAccess({', 'createClient(supabaseUrl, serviceKey');
  });

  it('rh-backfill-to-supabase: gate no createSupabaseAdmin; rollback passa pelo gate; sem no-op de production', () => {
    const src = read('scripts/rh-backfill-to-supabase.mjs');
    before(src, 'gateRhBackfill({', 'client: createClient(');
    expect(src).toContain('createSupabaseAdmin(args, { rollback: true })');
    expect(src).not.toContain('if (projectRef === PROD_PROJECT_REF)');
  });

  it('collaborator-id-backfill: gate no createSupabaseAdmin; apply e rollback declarados', () => {
    const src = read('scripts/collaborator-id-backfill.mjs');
    before(src, 'gateCollaboratorIdBackfill({', 'return createClient(');
    expect(src).toContain('createSupabaseAdmin({ apply: true })');
    expect(src).toContain('createSupabaseAdmin({ rollback: true })');
  });

  it('server/index.js: guard de startup antes de criar o client service-role', () => {
    const src = read('server/index.js');
    before(src, 'validateServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY)', 'applyServerStartupGuard({');
    before(src, 'applyServerStartupGuard({', 'const supabase = createClient(SUPABASE_URL');
  });
});

describe('guard de startup da Admin API (rollout seguro)', () => {
  it('sem EXPECTED_SUPABASE_PROJECT_REF: report-only, não bloqueia (estado atual do Railway)', () => {
    const r = evaluateServerSupabaseTarget({ SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: PROD_KEY });
    expect(r).toMatchObject({ ok: true, mode: 'report', urlRefClass: 'PRODUCTION', credentialRefStatus: 'MATCH' });
    const exit = vi.fn();
    applyServerStartupGuard({
      env: { SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' },
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      exit,
    });
    expect(exit).not.toHaveBeenCalled();
  });

  it('enforce: ref esperado == URL → ok', () => {
    expect(evaluateServerSupabaseTarget({
      EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF, SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: PROD_KEY,
    })).toMatchObject({ ok: true, mode: 'enforce', code: 'TARGET_MATCH' });
  });

  it('enforce: divergências → fail-closed com exit(2) e sem vazar chave', () => {
    const cases = [
      [{ EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF, SUPABASE_URL: STAGING_URL }, 'TARGET_REF_MISMATCH'],
      [{ EXPECTED_SUPABASE_PROJECT_REF: 'not-a-ref', SUPABASE_URL: PROD_URL }, 'EXPECTED_REF_INVALID'],
      [{ EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF, SUPABASE_URL: 'nope' }, 'SUPABASE_URL_INVALID'],
      [{
        EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF, SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: STAGING_KEY,
      }, 'CREDENTIAL_REF_MISMATCH'],
      [{
        EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF, SUPABASE_URL: PROD_URL, LOVE_ODONTO_TARGET_ENV: 'staging',
      }, 'TARGET_ENV_REF_MISMATCH'],
    ];
    for (const [env, code] of cases) {
      const error = vi.fn();
      const exit = vi.fn();
      const r = applyServerStartupGuard({ env, log: vi.fn(), warn: vi.fn(), error, exit });
      expect(r.code).toBe(code);
      expect(exit).toHaveBeenCalledWith(2);
      expect(error.mock.calls.flat().join(' ')).not.toContain(SIGNATURE);
    }
  });
});
