/**
 * SPF.1A.1 — guard compartilhado de alvo Supabase. Somente dados sintéticos; nenhuma rede.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  SUPABASE_PROJECT_REFS,
} from '../lib/supabaseTarget/projectRefs.js';
import { PRODUCTION_OPERATION_AUTHORIZATIONS } from '../lib/supabaseTarget/productionAuthorizations.js';
import {
  DESTRUCTIVE_PRODUCTION_ENABLED,
  SupabaseTargetGuardError,
  assertSupabaseTarget,
  describeGuardDecision,
  evaluateOperationGate,
  guardSupabaseOperation,
  inspectCredential,
} from '../lib/supabaseTarget/supabaseTargetGuard.js';

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const SIGNATURE = 'SIGNATURE_SECRET_zz91_do_not_leak';

function fakeJwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.${SIGNATURE}`;
}
const STAGING_SERVICE_JWT = fakeJwt({ ref: STAGING_PROJECT_REF, role: 'service_role' });
const PROD_SERVICE_JWT = fakeJwt({ ref: PRODUCTION_PROJECT_REF, role: 'service_role' });
const OPAQUE_SECRET = 'sb_secret_SYNTHETIC_opaque_value_0123456789';

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SupabaseTargetGuardError);
    return err.code;
  }
  throw new Error('esperava DENY, mas foi permitido');
}

describe('projectRefs — fonte única', () => {
  it('refs conhecidos e distintos', () => {
    expect(STAGING_PROJECT_REF).toBe('tckdjyunwmdpqmewrwvt');
    expect(PRODUCTION_PROJECT_REF).toBe('uoepkwhqztmsjnzirpev');
    expect(SUPABASE_PROJECT_REFS.staging).not.toBe(SUPABASE_PROJECT_REFS.production);
    expect(Object.isFrozen(SUPABASE_PROJECT_REFS)).toBe(true);
  });
});

describe('assertSupabaseTarget', () => {
  it('1. LOVE_ODONTO_TARGET_ENV ausente → DENY', () => {
    expect(codeOf(() => assertSupabaseTarget({ env: {}, url: STAGING_URL }))).toBe('TARGET_ENV_MISSING');
  });

  it('2. LOVE_ODONTO_TARGET_ENV inválido → DENY', () => {
    for (const v of ['prod', 'STAGE', 'dev', 'production ; staging', '*']) {
      expect(codeOf(() => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: v }, url: STAGING_URL })))
        .toBe('TARGET_ENV_INVALID');
    }
  });

  it('3. staging declarado + URL staging → ALLOW (credencial com ref igual = MATCH)', () => {
    const t = assertSupabaseTarget({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL, credential: STAGING_SERVICE_JWT,
    });
    expect(t.targetEnv).toBe('staging');
    expect(t.urlRefStatus).toBe('MATCH');
    expect(t.credentialRefStatus).toBe('MATCH');
  });

  it('4. staging declarado + URL production → DENY', () => {
    expect(codeOf(() => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: PROD_URL })))
      .toBe('TARGET_REF_MISMATCH');
  });

  it('5. production declarado + URL staging → DENY', () => {
    expect(codeOf(() => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'production' }, url: STAGING_URL })))
      .toBe('TARGET_REF_MISMATCH');
  });

  it('local declarado exige URL local; URL remota → DENY', () => {
    expect(assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'local' }, url: 'http://127.0.0.1:54321' }).urlKind)
      .toBe('local');
    expect(codeOf(() => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'local' }, url: STAGING_URL })))
      .toBe('TARGET_REF_MISMATCH');
    expect(codeOf(() => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: 'http://localhost:54321' })))
      .toBe('TARGET_REF_MISMATCH');
  });

  it('8. URL inválida / host não reconhecido → DENY', () => {
    const env = { LOVE_ODONTO_TARGET_ENV: 'staging' };
    expect(codeOf(() => assertSupabaseTarget({ env, url: 'not a url' }))).toBe('URL_INVALID');
    expect(codeOf(() => assertSupabaseTarget({ env, url: 'ftp://x.supabase.co' }))).toBe('URL_INVALID');
    expect(codeOf(() => assertSupabaseTarget({ env, url: `https://${STAGING_PROJECT_REF}.supabase.co.evil.com` })))
      .toBe('URL_UNRECOGNIZED_HOST');
    expect(codeOf(() => assertSupabaseTarget({ env, url: `https://evil.com/${STAGING_PROJECT_REF}` })))
      .toBe('URL_UNRECOGNIZED_HOST');
  });

  it('9. project ref ausente → DENY (URL vazia; chave opaca sem SUPABASE_PROJECT_REF)', () => {
    expect(codeOf(() => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: '' })))
      .toBe('URL_MISSING');
    expect(codeOf(() => assertSupabaseTarget({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL, credential: OPAQUE_SECRET,
    }))).toBe('CREDENTIAL_REF_UNVERIFIABLE');
    const ok = assertSupabaseTarget({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging', SUPABASE_PROJECT_REF: STAGING_PROJECT_REF },
      url: STAGING_URL,
      credential: OPAQUE_SECRET,
    });
    expect(ok.credentialRefStatus).toBe('UNVERIFIABLE_EXPLICIT_REF_MATCH');
    expect(codeOf(() => assertSupabaseTarget({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging', SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF },
      url: STAGING_URL,
      credential: OPAQUE_SECRET,
    }))).toBe('EXPLICIT_REF_MISMATCH');
  });

  it('11. credencial com ref divergente → DENY', () => {
    expect(codeOf(() => assertSupabaseTarget({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL, credential: PROD_SERVICE_JWT,
    }))).toBe('CREDENTIAL_REF_MISMATCH');
    expect(codeOf(() => assertSupabaseTarget({
      env: { LOVE_ODONTO_TARGET_ENV: 'local' }, url: 'http://localhost:54321', credential: PROD_SERVICE_JWT,
    }))).toBe('CREDENTIAL_REF_MISMATCH');
  });

  it('inspectCredential nunca devolve o valor da chave', () => {
    for (const cred of [STAGING_SERVICE_JWT, OPAQUE_SECRET, 'eyJ.bad.jwt']) {
      const out = JSON.stringify(inspectCredential(cred));
      expect(out).not.toContain(SIGNATURE);
      expect(out).not.toContain('SYNTHETIC_opaque');
    }
    expect(inspectCredential('').presence).toBe('ABSENT');
  });
});

describe('evaluateOperationGate', () => {
  const stagingTarget = () => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL });
  const prodTarget = () => assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'production' }, url: PROD_URL });

  it('allowlist de production está vazia nesta fase e destrutivo em production está desligado', () => {
    expect(PRODUCTION_OPERATION_AUTHORIZATIONS).toHaveLength(0);
    expect(Object.isFrozen(PRODUCTION_OPERATION_AUTHORIZATIONS)).toBe(true);
    expect(DESTRUCTIVE_PRODUCTION_ENABLED).toBe(false);
  });

  it('dry-run é o padrão: write sem apply nunca vira apply', () => {
    const g = evaluateOperationGate({ target: stagingTarget(), operation: 'write', operationId: 'x.y' });
    expect(g.mode).toBe('dry-run');
    expect(evaluateOperationGate({ target: stagingTarget(), operation: 'write', operationId: 'x.y', apply: 'yes' }).mode)
      .toBe('dry-run');
  });

  it('3. staging write com apply explícito → ALLOW apply', () => {
    expect(evaluateOperationGate({ target: stagingTarget(), operation: 'write', operationId: 'x.y', apply: true }).mode)
      .toBe('apply');
  });

  it('6. production + URL production + sem autorização → DENY WRITE', () => {
    const env = { LOVE_ODONTO_TARGET_ENV: 'production' };
    expect(codeOf(() => evaluateOperationGate({
      target: prodTarget(), operation: 'write', operationId: 'security.apply037BillingRlsOnly', apply: true, env,
    }))).toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
    expect(codeOf(() => evaluateOperationGate({
      target: prodTarget(),
      operation: 'write',
      operationId: 'security.apply037BillingRlsOnly',
      apply: true,
      env: { ...env, LOVE_ODONTO_PRODUCTION_AUTHORIZATION: 'SPF-FAKE-ID' },
    }))).toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
  });

  it('7. production READ é distinto de WRITE: read permitido, write apply negado', () => {
    const read = evaluateOperationGate({ target: prodTarget(), operation: 'read' });
    expect(read.mode).toBe('read');
    expect(codeOf(() => evaluateOperationGate({
      target: prodTarget(), operation: 'write', operationId: 'x.y', apply: true, env: { LOVE_ODONTO_TARGET_ENV: 'production' },
    }))).toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
  });

  it('10. destrutivo: production negado até em dry-run; staging exige confirmação textual', () => {
    expect(codeOf(() => evaluateOperationGate({ target: prodTarget(), operation: 'destructive', operationId: 'a.b' })))
      .toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
    expect(codeOf(() => evaluateOperationGate({
      target: prodTarget(),
      operation: 'destructive',
      operationId: 'a.b',
      apply: true,
      env: { LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION: `DESTROY:${PRODUCTION_PROJECT_REF}:a.b` },
    }))).toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
    expect(evaluateOperationGate({ target: stagingTarget(), operation: 'destructive', operationId: 'a.b' }).mode)
      .toBe('dry-run');
    expect(codeOf(() => evaluateOperationGate({
      target: stagingTarget(), operation: 'destructive', operationId: 'a.b', apply: true, env: {},
    }))).toBe('DESTRUCTIVE_CONFIRMATION_REQUIRED');
    expect(codeOf(() => evaluateOperationGate({
      target: stagingTarget(),
      operation: 'destructive',
      operationId: 'a.b',
      apply: true,
      env: { LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION: `DESTROY:${STAGING_PROJECT_REF}:outra.operacao` },
    }))).toBe('DESTRUCTIVE_CONFIRMATION_REQUIRED');
    expect(evaluateOperationGate({
      target: stagingTarget(),
      operation: 'destructive',
      operationId: 'a.b',
      apply: true,
      env: { LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION: `DESTROY:${STAGING_PROJECT_REF}:a.b` },
    }).mode).toBe('apply');
  });

  it('operação inválida, sem operationId ou sem target → DENY', () => {
    expect(codeOf(() => evaluateOperationGate({ target: stagingTarget(), operation: 'drop' }))).toBe('OPERATION_INVALID');
    expect(codeOf(() => evaluateOperationGate({ target: stagingTarget(), operation: 'write', apply: true })))
      .toBe('OPERATION_ID_REQUIRED');
    expect(codeOf(() => evaluateOperationGate({ target: { targetEnv: 'staging' }, operation: 'read' })))
      .toBe('TARGET_NOT_ASSERTED');
  });
});

describe('12. segredos nunca aparecem em erro/log', () => {
  it('negações e decisões serializadas não contêm chaves, JWT ou assinatura', () => {
    const outputs = [];
    const attempts = [
      () => guardSupabaseOperation({
        env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL, credential: PROD_SERVICE_JWT, operation: 'read',
      }),
      () => guardSupabaseOperation({
        env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL, credential: OPAQUE_SECRET, operation: 'read',
      }),
      () => guardSupabaseOperation({
        env: { LOVE_ODONTO_TARGET_ENV: 'production', LOVE_ODONTO_PRODUCTION_AUTHORIZATION: OPAQUE_SECRET },
        url: PROD_URL,
        credential: PROD_SERVICE_JWT,
        operation: 'write',
        operationId: 'x.y',
        apply: true,
      }),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
      } catch (err) {
        outputs.push(err.message, JSON.stringify(err.toJSON()), JSON.stringify(err.details), String(err.stack));
      }
    }
    const allowed = guardSupabaseOperation({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging' }, url: STAGING_URL, credential: STAGING_SERVICE_JWT, operation: 'read',
    });
    outputs.push(describeGuardDecision(allowed), JSON.stringify(allowed));
    expect(outputs.length).toBeGreaterThanOrEqual(13);
    const joined = outputs.join('\n');
    for (const secret of [SIGNATURE, OPAQUE_SECRET, 'SYNTHETIC_opaque', STAGING_SERVICE_JWT, PROD_SERVICE_JWT]) {
      expect(joined).not.toContain(secret);
    }
  });
});
