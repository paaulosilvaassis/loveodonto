/**
 * SPF.1A.2 — guard de alvo para connection strings Postgres do Supabase.
 * Somente valores sintéticos (FAKE_PASSWORD); nenhuma conexão, nenhuma rede.
 */
import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from '../lib/supabaseTarget/projectRefs.js';
import {
  POSTGRES_CLIENT_OVERRIDE_ENV_VARS,
  SupabaseTargetGuardError,
  assertPostgresClientEnvClean,
  assertSupabaseTarget,
  describeGuardDecision,
  evaluateOperationGate,
  guardSupabaseOperation,
  parseSupabaseUrlRef,
} from '../lib/supabaseTarget/supabaseTargetGuard.js';

const S = STAGING_PROJECT_REF;
const P = PRODUCTION_PROJECT_REF;
const PASSWORD = 'FAKE_PASSWORD_x9!Qz_should_never_leak';
const ENC_PASSWORD = encodeURIComponent(PASSWORD);
const STAGING = { LOVE_ODONTO_TARGET_ENV: 'staging' };
const PROD = { LOVE_ODONTO_TARGET_ENV: 'production' };

const url = {
  restStaging: `https://${S}.supabase.co`,
  restProd: `https://${P}.supabase.co`,
  directStaging: `postgresql://postgres:${ENC_PASSWORD}@db.${S}.supabase.co:5432/postgres`,
  directProd: `postgres://postgres:${ENC_PASSWORD}@db.${P}.supabase.co:5432/postgres`,
  sessionStaging: `postgresql://postgres.${S}:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
  sessionProd: `postgresql://postgres.${P}:${ENC_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  transactionStaging: `postgresql://postgres.${S}:${ENC_PASSWORD}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`,
  transactionProd: `postgresql://postgres.${P}:${ENC_PASSWORD}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
  dedicatedPoolerStaging: `postgresql://postgres:${ENC_PASSWORD}@db.${S}.supabase.co:6543/postgres`,
};

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SupabaseTargetGuardError);
    return err;
  }
  throw new Error('esperava DENY, mas foi permitido');
}
const denyCode = (fn) => codeOf(fn).code;

describe('SPF.1A.2 — reconhecimento de alvo (MATCH)', () => {
  it('1. REST staging → MATCH', () => {
    const t = assertSupabaseTarget({ env: STAGING, url: url.restStaging });
    expect(t).toMatchObject({ urlRefStatus: 'MATCH', connection: 'rest', urlRefClass: 'STAGING' });
    expect(t.refSources).toEqual(['host']);
  });

  it('2. REST production → MATCH', () => {
    expect(assertSupabaseTarget({ env: PROD, url: url.restProd })).toMatchObject({ urlRefStatus: 'MATCH', connection: 'rest' });
  });

  it('3. direct Postgres staging → MATCH (host)', () => {
    const t = assertSupabaseTarget({ env: STAGING, url: url.directStaging });
    expect(t).toMatchObject({ urlRefStatus: 'MATCH', connection: 'direct', urlKind: 'postgres', urlRefClass: 'STAGING' });
    expect(t.refSources).toEqual(['host']);
  });

  it('4. direct Postgres production (esquema postgres://) → MATCH', () => {
    expect(assertSupabaseTarget({ env: PROD, url: url.directProd }))
      .toMatchObject({ urlRefStatus: 'MATCH', connection: 'direct', urlRefClass: 'PRODUCTION' });
  });

  it('5. session pooler staging → MATCH (username)', () => {
    const t = assertSupabaseTarget({ env: STAGING, url: url.sessionStaging });
    expect(t).toMatchObject({ urlRefStatus: 'MATCH', connection: 'session_pooler' });
    expect(t.refSources).toEqual(['username']);
  });

  it('6. session pooler production → MATCH', () => {
    expect(assertSupabaseTarget({ env: PROD, url: url.sessionProd }))
      .toMatchObject({ urlRefStatus: 'MATCH', connection: 'session_pooler', urlRefClass: 'PRODUCTION' });
  });

  it('7. transaction pooler (6543) staging e production → MATCH; pooler dedicado em db.<ref>:6543 → MATCH', () => {
    expect(assertSupabaseTarget({ env: STAGING, url: url.transactionStaging }).connection).toBe('transaction_pooler');
    expect(assertSupabaseTarget({ env: PROD, url: url.transactionProd }).connection).toBe('transaction_pooler');
    expect(assertSupabaseTarget({ env: STAGING, url: url.dedicatedPoolerStaging }).connection).toBe('dedicated_pooler');
  });

  it('host e usuário concordando → MATCH com as duas fontes', () => {
    const t = assertSupabaseTarget({
      env: STAGING, url: `postgresql://postgres.${S}:${ENC_PASSWORD}@db.${S}.supabase.co:5432/postgres`,
    });
    expect(t.refSources).toEqual(['host', 'username']);
  });

  it('host em maiúsculas é normalizado', () => {
    expect(assertSupabaseTarget({
      env: PROD, url: `postgresql://postgres:${ENC_PASSWORD}@DB.${P.toUpperCase()}.SUPABASE.CO:5432/postgres`,
    }).urlRefStatus).toBe('MATCH');
  });

  it('Postgres local exige alvo local', () => {
    const local = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
    expect(assertSupabaseTarget({ env: { LOVE_ODONTO_TARGET_ENV: 'local' }, url: local }).connection).toBe('local_postgres');
    expect(denyCode(() => assertSupabaseTarget({ env: STAGING, url: local }))).toBe('TARGET_REF_MISMATCH');
  });
});

describe('SPF.1A.2 — negações', () => {
  it('8. declarado staging + conexão production → DENY', () => {
    for (const u of [url.directProd, url.sessionProd, url.transactionProd, url.restProd]) {
      expect(denyCode(() => assertSupabaseTarget({ env: STAGING, url: u }))).toBe('TARGET_REF_MISMATCH');
    }
  });

  it('9. declarado production + conexão staging → DENY', () => {
    for (const u of [url.directStaging, url.sessionStaging, url.transactionStaging, url.restStaging]) {
      expect(denyCode(() => assertSupabaseTarget({ env: PROD, url: u }))).toBe('TARGET_REF_MISMATCH');
    }
  });

  it('10. URL Postgres malformada → DENY', () => {
    for (const u of [
      'postgresql://',
      'postgresql://:@',
      'postgresql//postgres@db.x.supabase.co',
      `postgresql://postgres%ZZ:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres:${ENC_PASSWORD}@db.${S}.supabase.co:5432/postgres#frag`,
      `mysql://root:${ENC_PASSWORD}@db.${S}.supabase.co:3306/x`,
    ]) {
      expect(['URL_INVALID', 'URL_UNRECOGNIZED_HOST']).toContain(denyCode(() => parseSupabaseUrlRef(u)));
    }
  });

  it('11. host desconhecido → DENY', () => {
    for (const u of [
      `postgresql://postgres:${ENC_PASSWORD}@evil.example.com:5432/postgres`,
      `postgresql://postgres.${S}:${ENC_PASSWORD}@pooler.supabase.com.evil.io:5432/postgres`,
      `postgresql://postgres:${ENC_PASSWORD}@db.${S}.supabase.co.evil.io:5432/postgres`,
      `postgresql://postgres:${ENC_PASSWORD}@${S}.supabase.co:5432/postgres`,
      `postgresql://postgres:${ENC_PASSWORD}@db.${S}.supabase.co,db.${P}.supabase.co:5432/postgres`,
    ]) {
      expect(['URL_UNRECOGNIZED_HOST', 'URL_INVALID']).toContain(denyCode(() => parseSupabaseUrlRef(u)));
    }
  });

  it('12. ref do host ≠ ref do usuário → DENY', () => {
    const err = codeOf(() => assertSupabaseTarget({
      env: STAGING, url: `postgresql://postgres.${P}:${ENC_PASSWORD}@db.${S}.supabase.co:5432/postgres`,
    }));
    expect(err.code).toBe('HOST_USERNAME_REF_CONFLICT');
    expect(err.details).toMatchObject({ hostRefClass: 'STAGING', usernameRefClass: 'PRODUCTION' });
    expect(denyCode(() => parseSupabaseUrlRef(
      `postgresql://postgres.${S}:${ENC_PASSWORD}@localhost:5432/postgres`,
    ))).toBe('HOST_USERNAME_REF_CONFLICT');
  });

  it('13. ref não determinável → DENY', () => {
    expect(denyCode(() => parseSupabaseUrlRef(
      `postgresql://postgres:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    ))).toBe('REF_UNDETERMINED');
    for (const user of ['postgres.notaref', `postgres.${S}x`, `.${S}`, 'postgres.']) {
      expect(denyCode(() => parseSupabaseUrlRef(
        `postgresql://${encodeURIComponent(user)}:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
      ))).toBe('USERNAME_REF_INVALID');
    }
    expect(denyCode(() => parseSupabaseUrlRef(''))).toBe('URL_MISSING');
    expect(denyCode(() => parseSupabaseUrlRef(url.directStaging.replace(':5432', ':6000')))).toBe('PORT_UNEXPECTED');
  });

  it('16. parâmetros de query não alteram o ref validado (redirecionadores do libpq → DENY)', () => {
    for (const q of [
      `host=db.${P}.supabase.co`, 'hostaddr=10.0.0.1', `user=postgres.${P}`, 'port=5432', 'dbname=other',
      `options=reference%3D${P}`, 'service=prod', 'passfile=/tmp/x',
    ]) {
      const err = codeOf(() => assertSupabaseTarget({ env: STAGING, url: `${url.directStaging}?${q}` }));
      expect(err.code).toBe('QUERY_PARAM_NOT_ALLOWED');
      expect(JSON.stringify(err.toJSON())).not.toContain(P);
    }
    const safe = assertSupabaseTarget({
      env: STAGING, url: `${url.sessionStaging}?sslmode=require&connect_timeout=10&application_name=spf1b`,
    });
    expect(safe).toMatchObject({ urlRefStatus: 'MATCH', urlRef: S });
  });

  it('17. usuário percent-encoded é decodificado corretamente', () => {
    const encoded = `postgresql://postgres%2E${S}:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
    expect(assertSupabaseTarget({ env: STAGING, url: encoded })).toMatchObject({ urlRef: S, refSources: ['username'] });
    const encodedProd = `postgresql://postgres%2E${P}:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
    expect(denyCode(() => assertSupabaseTarget({ env: STAGING, url: encodedProd }))).toBe('TARGET_REF_MISMATCH');
  });

  it('SUPABASE_PROJECT_REF explícito divergente da connection string → DENY', () => {
    expect(denyCode(() => assertSupabaseTarget({
      env: { ...STAGING, SUPABASE_PROJECT_REF: P }, url: url.sessionStaging,
    }))).toBe('EXPLICIT_REF_MISMATCH');
  });
});

describe('SPF.1A.2 — variáveis PG* do cliente', () => {
  it('ambiente limpo passa; qualquer PG* que redireciona → DENY listando só nomes', () => {
    expect(assertPostgresClientEnvClean({ PATH: '/usr/bin', PGPASSWORD_UNRELATED: 'x' })).toBe(true);
    for (const k of POSTGRES_CLIENT_OVERRIDE_ENV_VARS) {
      const err = codeOf(() => assertPostgresClientEnvClean({ [k]: `db.${P}.supabase.co` }));
      expect(err.code).toBe('POSTGRES_CLIENT_ENV_OVERRIDE');
      expect(err.details.envVars).toEqual([k]);
      expect(JSON.stringify(err.toJSON())).not.toContain(P);
    }
  });
});

describe('SPF.1A.2 — sigilo e gates preservados', () => {
  it('14/15. senha e connection string nunca aparecem em resultado, erro, stack ou log', () => {
    const outputs = [];
    const all = Object.values(url);
    for (const u of all) {
      for (const env of [STAGING, PROD]) {
        try {
          const r = guardSupabaseOperation({ env, url: u, operation: 'read' });
          outputs.push(JSON.stringify(r), describeGuardDecision(r), JSON.stringify(parseSupabaseUrlRef(u)));
        } catch (err) {
          outputs.push(err.message, String(err.stack), JSON.stringify(err.toJSON()));
        }
      }
    }
    for (const bad of [
      `postgresql://postgres.${P}:${ENC_PASSWORD}@db.${S}.supabase.co:5432/postgres`,
      `postgresql://postgres:${ENC_PASSWORD}@evil.example.com:5432/postgres`,
      `${url.directStaging}?host=evil`,
      `postgresql://postgres%ZZ:${ENC_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
    ]) {
      try {
        assertSupabaseTarget({ env: STAGING, url: bad });
      } catch (err) {
        outputs.push(err.message, String(err.stack), JSON.stringify(err.toJSON()));
      }
    }
    const joined = outputs.join('\n');
    expect(outputs.length).toBeGreaterThan(20);
    for (const secret of [PASSWORD, ENC_PASSWORD, 'FAKE_PASSWORD', ...all, 'postgresql://', 'postgres://', 'evil.example.com']) {
      expect(joined).not.toContain(secret);
    }
  });

  it('Postgres em production continua sujeito ao PRODUCTION_DEFAULT_DENY / DESTRUCTIVE_DEFAULT_DENY', () => {
    const target = assertSupabaseTarget({ env: PROD, url: url.sessionProd });
    expect(evaluateOperationGate({ target, operation: 'read' }).mode).toBe('read');
    expect(denyCode(() => evaluateOperationGate({ target, operation: 'write', operationId: 'x.y', apply: true, env: PROD })))
      .toBe('PRODUCTION_WRITE_NOT_AUTHORIZED');
    expect(denyCode(() => evaluateOperationGate({ target, operation: 'destructive', operationId: 'x.y', env: PROD })))
      .toBe('PRODUCTION_DESTRUCTIVE_DISABLED');
  });

  it('senha passada por engano como credential é opaca: sem ref explícito → DENY', () => {
    expect(denyCode(() => assertSupabaseTarget({ env: STAGING, url: url.sessionStaging, credential: PASSWORD })))
      .toBe('CREDENTIAL_REF_UNVERIFIABLE');
  });
});
