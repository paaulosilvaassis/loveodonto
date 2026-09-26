/**
 * SPF.1B.0 / SPF.1B.0A — runner READ ONLY via psql. Tudo simulado: spawn falso, psql falso, nenhuma rede,
 * nenhuma conexão. Connection strings e senhas são sintéticas.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF } from '../lib/supabaseTarget/projectRefs.js';
import {
  APPROVED_QUERY_SETS,
  DEFAULT_QUERY_SET,
  PRODUCTION_READ_EXECUTION_ENABLED,
  buildChildEnv,
  createEphemeralPgpass,
  escapePgpassField,
  resolvePsqlPath,
  runReadOnlyDbProof,
  sha256Hex,
  splitConnectionCredential,
} from '../../scripts/safety/readOnlyDbProof.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SQL_FILE = APPROVED_QUERY_SETS[DEFAULT_QUERY_SET].file;
const APPROVED_SQL = fs.readFileSync(SQL_FILE, 'utf8');
const PASSWORD = 'FAKE_PASSWORD_Zk3!q:with\\colon_never_print';
const ENC = encodeURIComponent(PASSWORD);
const POOLER_HOST = 'aws-0-sa-east-1.pooler.supabase.com';
const STAGING_URL = `postgresql://postgres.${STAGING_PROJECT_REF}:${ENC}@${POOLER_HOST}:5432/postgres?sslmode=require`;
const PROD_URL = `postgresql://postgres.${PRODUCTION_PROJECT_REF}:${ENC}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const FAKE_PSQL = '/fake/libpq/bin/psql';

let TMP_ROOT;
beforeAll(() => { TMP_ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lo-runner-test-'))); });
afterEach(() => { expect(fs.readdirSync(TMP_ROOT)).toEqual([]); });
afterAll(() => { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); });

/** Parser do formato .pgpass conforme libpq ('\' escapa o próximo caractere; ':' separa campos). */
function parsePgpassLine(line) {
  const fields = [];
  let cur = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) { cur += line[i + 1]; i += 1; } else if (ch === ':') { fields.push(cur); cur = ''; } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function run({ env = {}, argv = [], readFile, psqlExit = 0, resolvePsql, spawnImpl, fsImpl, tmpRoot } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const seen = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (args[0] === '--version') return { status: 0, stdout: 'psql (PostgreSQL) 18.6\n' };
    const pf = opts.env.PGPASSFILE;
    seen.push({
      exists: Boolean(pf) && fs.existsSync(pf),
      mode: pf && fs.existsSync(pf) ? fs.statSync(pf).mode & 0o777 : null,
      dirMode: pf && fs.existsSync(pf) ? fs.statSync(path.dirname(pf)).mode & 0o777 : null,
      content: pf && fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : null,
      path: pf,
    });
    if (spawnImpl) return spawnImpl();
    return { status: psqlExit };
  };
  const result = runReadOnlyDbProof({
    env: { PATH: '/usr/bin:/bin', HOME: '/Users/test', LANG: 'en_US.UTF-8', ...env },
    argv,
    spawn,
    resolvePsql: resolvePsql || (() => FAKE_PSQL),
    readFile: readFile || ((file, enc) => fs.readFileSync(file, enc)),
    tmpRoot: tmpRoot || TMP_ROOT,
    fsImpl: fsImpl || fs,
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
  });
  return { result, calls, seen, out: out.join('\n'), err: err.join('\n') };
}
const STAGING_ENV = { LOVE_ODONTO_TARGET_ENV: 'staging', STAGING_DATABASE_URL: STAGING_URL };
const withSql = (mutate) => (file, enc) => (file === SQL_FILE ? mutate(APPROVED_SQL) : fs.readFileSync(file, enc));

function expectDeny(r, code) {
  expect(r.result.ok).toBe(false);
  expect(r.result.exitCode).toBe(2);
  expect(r.result.code).toBe(code);
  expect(r.calls).toHaveLength(0);
}

describe('query set aprovado', () => {
  it('hash fixado corresponde ao arquivo versionado', () => {
    expect(sha256Hex(APPROVED_SQL)).toBe(APPROVED_QUERY_SETS[DEFAULT_QUERY_SET].sha256);
    expect(APPROVED_SQL.startsWith('-- SPF.1B')).toBe(true);
  });
});

describe('SPF.1B.0 — alvo e conexão', () => {
  it('1. LOVE_ODONTO_TARGET_ENV ausente → DENY', () => {
    expectDeny(run({ env: { STAGING_DATABASE_URL: STAGING_URL } }), 'TARGET_ENV_MISSING');
  });

  it('2. target env inválido → DENY (local também não é aceito pelo runner)', () => {
    expectDeny(run({ env: { ...STAGING_ENV, LOVE_ODONTO_TARGET_ENV: 'prod' } }), 'TARGET_ENV_INVALID');
    expectDeny(run({ env: { ...STAGING_ENV, LOVE_ODONTO_TARGET_ENV: 'local' } }), 'TARGET_ENV_NOT_ALLOWED');
  });

  it('3. staging + URL staging → chega à execução (mock) com sucesso', () => {
    const r = run({ env: STAGING_ENV });
    expect(r.result).toEqual({ ok: true, exitCode: 0 });
    expect(r.calls.map((c) => c.args[0])).toEqual(['--version', '-X']);
    const decision = JSON.parse(r.out.split('\n')[0]);
    expect(decision).toMatchObject({
      decision: 'EXECUTE', targetEnv: 'staging', urlRefClass: 'STAGING', connection: 'session_pooler',
      sha256: APPROVED_QUERY_SETS[DEFAULT_QUERY_SET].sha256, psql: FAKE_PSQL, credentialTransport: 'ephemeral_pgpassfile',
    });
  });

  it('4. staging + URL production → DENY', () => {
    expectDeny(run({ env: { LOVE_ODONTO_TARGET_ENV: 'staging', STAGING_DATABASE_URL: PROD_URL } }), 'TARGET_REF_MISMATCH');
  });

  it('5. production + URL production → DENY nesta fase', () => {
    expect(PRODUCTION_READ_EXECUTION_ENABLED).toBe(false);
    expectDeny(run({ env: { LOVE_ODONTO_TARGET_ENV: 'production', PRODUCTION_DATABASE_URL: PROD_URL } }),
      'PRODUCTION_READ_EXECUTION_DISABLED');
  });

  it('6. production + URL staging → DENY', () => {
    expectDeny(run({ env: { LOVE_ODONTO_TARGET_ENV: 'production', PRODUCTION_DATABASE_URL: STAGING_URL } }),
      'PRODUCTION_READ_EXECUTION_DISABLED');
  });

  it('variável do outro ambiente presente → DENY', () => {
    expectDeny(run({ env: { ...STAGING_ENV, PRODUCTION_DATABASE_URL: PROD_URL } }), 'CROSS_ENV_CONNECTION_VAR_PRESENT');
  });

  it('7. DATABASE_URL / SUPABASE_URL genéricas não são aceitas (sem fallback)', () => {
    expectDeny(run({
      env: { LOVE_ODONTO_TARGET_ENV: 'staging', DATABASE_URL: STAGING_URL, SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co` },
    }), 'CONNECTION_VAR_MISSING');
  });

  it('8. connection string por CLI não é aceita; argumentos de escrita também não', () => {
    expectDeny(run({ env: STAGING_ENV, argv: [STAGING_URL] }), 'CLI_CONNECTION_STRING_FORBIDDEN');
    expectDeny(run({ env: STAGING_ENV, argv: [`postgres.${STAGING_PROJECT_REF}@host`] }), 'CLI_CONNECTION_STRING_FORBIDDEN');
    for (const a of ['--apply', '--write', '-c', '-d', '--query-set-file=/tmp/x.sql']) {
      expectDeny(run({ env: STAGING_ENV, argv: [a] }), 'CLI_ARGUMENT_NOT_ALLOWED');
    }
    expectDeny(run({ env: STAGING_ENV, argv: ['--query-set', 'outro'] }), 'QUERY_SET_UNKNOWN');
  });

  it('9. PGHOST presente → DENY', () => {
    expectDeny(run({ env: { ...STAGING_ENV, PGHOST: `db.${PRODUCTION_PROJECT_REF}.supabase.co` } }), 'POSTGRES_CLIENT_ENV_OVERRIDE');
  });

  it('10. PGOPTIONS presente → DENY', () => {
    expectDeny(run({ env: { ...STAGING_ENV, PGOPTIONS: '-c default_transaction_read_only=off' } }), 'POSTGRES_CLIENT_ENV_OVERRIDE');
  });

  it('PGPASSFILE / PGPASSWORD herdados do pai → DENY antes da execução', () => {
    expectDeny(run({ env: { ...STAGING_ENV, PGPASSFILE: '/tmp/other-pgpass' } }), 'POSTGRES_CLIENT_ENV_OVERRIDE');
    expectDeny(run({ env: { ...STAGING_ENV, PGPASSWORD: 'x' } }), 'POSTGRES_CLIENT_ENV_OVERRIDE');
  });

  it('URL REST, sslmode=disable, psql ausente e senha ausente → DENY', () => {
    expectDeny(run({ env: { ...STAGING_ENV, STAGING_DATABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co` } }),
      'NOT_A_POSTGRES_CONNECTION');
    expectDeny(run({ env: { ...STAGING_ENV, STAGING_DATABASE_URL: STAGING_URL.replace('require', 'disable') } }),
      'SSL_NOT_ENFORCED');
    expectDeny(run({ env: STAGING_ENV, resolvePsql: () => null }), 'PSQL_NOT_FOUND');
    expectDeny(run({
      env: { ...STAGING_ENV, STAGING_DATABASE_URL: `postgresql://postgres.${STAGING_PROJECT_REF}@${POOLER_HOST}:5432/postgres` },
    }), 'CONNECTION_PASSWORD_MISSING');
  });
});

describe('SPF.1B.0 — validação do query set', () => {
  it('11. query set com hash alterado → DENY', () => {
    expectDeny(run({ env: STAGING_ENV, readFile: withSql((s) => `${s}-- comentário extra\n`) }), 'QUERY_SET_HASH_MISMATCH');
  });

  it('12. sem BEGIN READ ONLY → DENY', () => {
    expectDeny(run({ env: STAGING_ENV, readFile: withSql((s) => s.replace('BEGIN READ ONLY;', 'BEGIN;')) }),
      'QUERY_SET_NOT_READ_ONLY');
  });

  it('13. sem ROLLBACK (removido ou trocado por COMMIT) → DENY', () => {
    expectDeny(run({ env: STAGING_ENV, readFile: withSql((s) => s.replace(/ROLLBACK;\s*$/, '')) }), 'QUERY_SET_NO_ROLLBACK');
    expectDeny(run({ env: STAGING_ENV, readFile: withSql((s) => s.replace(/ROLLBACK;\s*$/, 'COMMIT;\n')) }),
      'QUERY_SET_NO_ROLLBACK');
  });

  it('14. SQL proibido → DENY (inclusive dentro de blocos dinâmicos $q$ e meta-comandos psql)', () => {
    expectDeny(run({
      env: STAGING_ENV,
      readFile: withSql((s) => s.replace(
        "SELECT current_setting('transaction_read_only') AS transaction_read_only_at_end",
        "SELECT set_config('transaction_read_only', 'off', true) AS transaction_read_only_at_end",
      )),
    }), 'QUERY_SET_PROHIBITED_SQL');
    expectDeny(run({
      env: STAGING_ENV,
      readFile: withSql((s) => s.replace('SELECT count(*) AS tenant_groups', 'DELETE FROM public.patients RETURNING 1 AS tenant_groups')),
    }), 'QUERY_SET_PROHIBITED_SQL');
    expectDeny(run({
      env: STAGING_ENV,
      readFile: withSql((s) => s.replace('ROLLBACK;', 'DELETE FROM public.patients;\nROLLBACK;')),
    }), 'QUERY_SET_STRUCTURE_MISMATCH');
    expectDeny(run({
      env: STAGING_ENV,
      readFile: withSql((s) => s.replace("SET LOCAL statement_timeout = '30s';", "SET LOCAL statement_timeout = '30s';\n\\! echo x\n")),
    }), 'QUERY_SET_PSQL_META_COMMAND');
    expectDeny(run({
      env: STAGING_ENV,
      readFile: withSql((s) => s.replace('-- Q7.', '-- postgresql://leak Q7.')),
    }), 'QUERY_SET_CREDENTIAL_OR_URL');
  });
});

describe('SPF.1B.0 — invocação do psql', () => {
  it('15/16/17. psql recebe -X, -w, ON_ERROR_STOP=1, pager off e o arquivo completo aprovado; nada de -c', () => {
    const r = run({ env: STAGING_ENV });
    const exec = r.calls[1];
    expect(exec.cmd).toBe(FAKE_PSQL);
    expect(exec.args).toContain('-X');
    expect(exec.args).toContain('-w');
    expect(exec.args[exec.args.indexOf('-v') + 1]).toBe('ON_ERROR_STOP=1');
    expect(exec.args[exec.args.indexOf('-P') + 1]).toBe('pager=off');
    expect(exec.args[exec.args.indexOf('-f') + 1]).toBe(SQL_FILE);
    expect(exec.args).not.toContain('-c');
    expect(exec.args.filter((a) => a === '-f')).toHaveLength(1);
    expect(exec.args[exec.args.indexOf('-d') + 1])
      .toBe(`postgresql://postgres.${STAGING_PROJECT_REF}@${POOLER_HOST}:5432/postgres?sslmode=require`);
  });

  it('ambiente do psql é mínimo: PATH/HOME/locale + só PGPASSFILE (criado pelo runner) na execução', () => {
    const r = run({ env: { ...STAGING_ENV, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', PGSSLMODE: 'disable' } });
    const allowed = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'TMPDIR'];
    expect(Object.keys(r.calls[0].opts.env).every((k) => allowed.includes(k))).toBe(true);
    const execKeys = Object.keys(r.calls[1].opts.env);
    expect(execKeys.every((k) => allowed.includes(k) || k === 'PGPASSFILE')).toBe(true);
    expect(execKeys).toContain('PGPASSFILE');
    for (const call of r.calls) {
      const childEnv = JSON.stringify(call.opts.env);
      for (const forbidden of ['PGPASSWORD', 'PGSSLMODE', 'STAGING_DATABASE_URL', 'PRODUCTION_DATABASE_URL', PASSWORD, ENC]) {
        expect(childEnv).not.toContain(forbidden);
      }
    }
    expect(Object.keys(buildChildEnv({ PGHOST: 'x', PATH: '/bin', STAGING_DATABASE_URL: STAGING_URL }))).toEqual(['PATH']);
  });

  it('18/19/20. senha e URL nunca aparecem em stdout/stderr (sucesso e negações)', () => {
    const runs = [
      run({ env: STAGING_ENV }),
      run({ env: STAGING_ENV, psqlExit: 3 }),
      run({ env: { LOVE_ODONTO_TARGET_ENV: 'staging', STAGING_DATABASE_URL: PROD_URL } }),
      run({ env: { ...STAGING_ENV, STAGING_DATABASE_URL: `${STAGING_URL}&host=evil` } }),
      run({ env: { ...STAGING_ENV, PGHOST: 'x' } }),
      run({ env: STAGING_ENV, argv: [STAGING_URL] }),
      run({ env: { LOVE_ODONTO_TARGET_ENV: 'production', PRODUCTION_DATABASE_URL: PROD_URL } }),
      run({ env: STAGING_ENV, spawnImpl: () => { throw new Error(`boom ${PASSWORD}`); } }),
    ];
    for (const r of runs) {
      const logs = `${r.out}\n${r.err}`;
      for (const secret of [PASSWORD, ENC, 'FAKE_PASSWORD', STAGING_URL, PROD_URL, 'postgresql://', 'lo-pgpass-']) {
        expect(logs).not.toContain(secret);
      }
    }
  });

  it('21. psql com exit != 0 → FAIL sem retry', () => {
    const r = run({ env: STAGING_ENV, psqlExit: 3 });
    expect(r.result).toMatchObject({ ok: false, exitCode: 3, code: 'PSQL_FAILED' });
    expect(r.calls).toHaveLength(2);
    expect(JSON.parse(r.err)).toMatchObject({ decision: 'FAILED', retry: false });
  });

  it('22. nenhum gate de WRITE libera READ em production', () => {
    const r = run({
      env: {
        LOVE_ODONTO_TARGET_ENV: 'production',
        PRODUCTION_DATABASE_URL: PROD_URL,
        LOVE_ODONTO_PRODUCTION_AUTHORIZATION: 'ANY-AUTH-ID',
        LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION: `DESTROY:${PRODUCTION_PROJECT_REF}:x`,
        PRODUCTION_READ_EXECUTION_ENABLED: 'true',
      },
    });
    expectDeny(r, 'PRODUCTION_READ_EXECUTION_DISABLED');
    const src = fs.readFileSync(path.join(ROOT, 'scripts/safety/readOnlyDbProof.mjs'), 'utf8');
    expect(src).toContain('export const PRODUCTION_READ_EXECUTION_ENABLED = false;');
    expect(src).not.toMatch(/productionAuthorizations|PRODUCTION_AUTHORIZATION_VAR|LOVE_ODONTO_PRODUCTION_AUTHORIZATION/);
    expect(src).not.toMatch(/process\.env\.PRODUCTION_READ_EXECUTION_ENABLED|env\.PRODUCTION_READ_EXECUTION_ENABLED/);
  });

  it('resolvePsqlPath prefere o libpq do Homebrew e cai para o PATH', () => {
    expect(resolvePsqlPath({ PATH: '/x/bin' }, { isExecutable: (p) => p === '/opt/homebrew/opt/libpq/bin/psql' }))
      .toBe('/opt/homebrew/opt/libpq/bin/psql');
    expect(resolvePsqlPath({ PATH: '/x/bin' }, { isExecutable: (p) => p === '/x/bin/psql' })).toBe('/x/bin/psql');
    expect(resolvePsqlPath({ PATH: '' }, { isExecutable: () => false })).toBeNull();
  });

  it('CLI é um wrapper fino sobre runReadOnlyDbProof e trata sinais antes do cleanup', () => {
    const cli = fs.readFileSync(path.join(ROOT, 'scripts/safety/run-readonly-db-proof.mjs'), 'utf8');
    expect(cli).toContain("runReadOnlyDbProof({ env: process.env, argv: process.argv.slice(2) })");
    expect(cli).toContain('process.exit(result.exitCode)');
    expect(cli).toMatch(/\['SIGINT', 'SIGTERM', 'SIGHUP'\]/);
  });
});

describe('SPF.1B.0A — credencial fora do argv (PGPASSFILE efêmero)', () => {
  it('senha e connection string completa não aparecem no argv do psql', () => {
    const r = run({ env: STAGING_ENV });
    for (const call of r.calls) {
      const argv = call.args.join(' ');
      for (const secret of [PASSWORD, ENC, STAGING_URL, 'FAKE_PASSWORD']) expect(argv).not.toContain(secret);
    }
  });

  it('7.1/7.2. arquivo existe durante a execução, modo 0600, diretório 0700, fora do repositório', () => {
    const r = run({ env: STAGING_ENV });
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]).toMatchObject({ exists: true, mode: 0o600, dirMode: 0o700 });
    expect(r.seen[0].path.startsWith(`${TMP_ROOT}${path.sep}`)).toBe(true);
    expect(r.seen[0].path.startsWith(ROOT)).toBe(false);
    expect(path.basename(path.dirname(r.seen[0].path))).toMatch(/^lo-pgpass-/);
  });

  it('conteúdo segue o formato libpq com escaping de : e \\ e casa com host/porta/banco/usuário do alvo', () => {
    const r = run({ env: STAGING_ENV });
    const content = r.seen[0].content;
    expect(content.endsWith('\n')).toBe(true);
    expect(content.split('\n').filter(Boolean)).toHaveLength(1);
    expect(parsePgpassLine(content.trimEnd())).toEqual([POOLER_HOST, '5432', 'postgres', `postgres.${STAGING_PROJECT_REF}`, PASSWORD]);
    expect(escapePgpassField('a:b\\c')).toBe('a\\:b\\\\c');
    expect(escapePgpassField('\\:')).toBe('\\\\\\:');
  });

  it('7.3. removido após sucesso', () => {
    const r = run({ env: STAGING_ENV });
    expect(r.result.ok).toBe(true);
    expect(fs.existsSync(r.seen[0].path)).toBe(false);
    expect(fs.existsSync(path.dirname(r.seen[0].path))).toBe(false);
  });

  it('7.4. removido após psql exit != 0', () => {
    const r = run({ env: STAGING_ENV, psqlExit: 1 });
    expect(r.result).toMatchObject({ ok: false, code: 'PSQL_FAILED' });
    expect(r.seen[0].exists).toBe(true);
    expect(fs.existsSync(path.dirname(r.seen[0].path))).toBe(false);
  });

  it('7.5. removido após falha de spawn (exceção ou result.error), sem retry e sem vazar a mensagem', () => {
    const thrown = run({ env: STAGING_ENV, spawnImpl: () => { throw new Error(`spawn failed ${PASSWORD}`); } });
    expect(thrown.result).toMatchObject({ ok: false, exitCode: 1, code: 'PSQL_SPAWN_FAILED' });
    expect(thrown.calls).toHaveLength(2);
    expect(fs.existsSync(path.dirname(thrown.seen[0].path))).toBe(false);
    expect(thrown.err).not.toContain(PASSWORD);
    const errored = run({ env: STAGING_ENV, spawnImpl: () => ({ status: null, error: new Error('ENOENT') }) });
    expect(errored.result.code).toBe('PSQL_SPAWN_FAILED');
    expect(fs.existsSync(path.dirname(errored.seen[0].path))).toBe(false);
  });

  it('interrupção (psql morto por SIGINT) → exit 130 e arquivo removido', () => {
    const r = run({ env: STAGING_ENV, spawnImpl: () => ({ status: null, signal: 'SIGINT' }) });
    expect(r.result).toMatchObject({ ok: false, exitCode: 130 });
    expect(fs.existsSync(path.dirname(r.seen[0].path))).toBe(false);
  });

  it('falha de cleanup → erro sanitizado, sem conteúdo do arquivo', () => {
    const brokenFs = { ...fs, rmSync: () => {}, existsSync: (p) => fs.existsSync(p) };
    const r = run({ env: STAGING_ENV, fsImpl: brokenFs });
    expect(r.result).toMatchObject({ ok: false, exitCode: 3, code: 'PGPASSFILE_CLEANUP_FAILED' });
    expect(JSON.parse(r.err)).toEqual({ ok: false, guard: 'READ_ONLY_DB_PROOF', code: 'PGPASSFILE_CLEANUP_FAILED' });
    expect(`${r.out}${r.err}`).not.toContain(PASSWORD);
    fs.rmSync(path.dirname(r.seen[0].path), { recursive: true, force: true });
  });

  it('diretório temporário dentro do repositório → DENY sem criar arquivo', () => {
    const r = run({ env: STAGING_ENV, tmpRoot: ROOT });
    expect(r.result.code).toBe('PGPASSFILE_DIR_INSIDE_REPOSITORY');
    expect(r.seen).toHaveLength(0);
    expect(fs.readdirSync(ROOT).some((n) => n.startsWith('lo-pgpass-'))).toBe(false);
  });

  it('splitConnectionCredential: alvo sem senha; control chars → DENY', () => {
    const { passwordlessTarget, pgpassLine } = splitConnectionCredential(STAGING_URL);
    expect(passwordlessTarget).not.toContain(ENC);
    expect(new URL(passwordlessTarget).password).toBe('');
    expect(pgpassLine).toContain(escapePgpassField(PASSWORD));
    expect(() => splitConnectionCredential(STAGING_URL.replace(ENC, encodeURIComponent('bad\npw')))).toThrow();
  });

  it('createEphemeralPgpass cria com modo 0600 diretamente (flag wx) e sem reutilizar arquivo', () => {
    const h = createEphemeralPgpass('h:5432:db:u:p\n', { tmpRoot: TMP_ROOT });
    expect(fs.statSync(h.file).mode & 0o777).toBe(0o600);
    expect(() => fs.writeFileSync(h.file, 'x', { flag: 'wx' })).toThrow();
    fs.rmSync(h.dir, { recursive: true, force: true });
  });
});
