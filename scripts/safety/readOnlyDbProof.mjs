/**
 * SPF.1B.0 — runner de prova READ ONLY via psql (núcleo testável; CLI em run-readonly-db-proof.mjs).
 *
 * Porta única para executar um query set APROVADO contra STAGING (e, só com autorização futura,
 * PRODUCTION). Reutiliza o guard central (supabaseTargetGuard): não há parser de ref nem allowlist próprios.
 *
 * Garantias:
 *   - alvo: LOVE_ODONTO_TARGET_ENV ∈ {staging, production}; connection string só por
 *     STAGING_DATABASE_URL / PRODUCTION_DATABASE_URL (sem fallback; a variável do outro ambiente presente = DENY)
 *   - connection string nunca por CLI e nunca impressa
 *   - guard central (operation=read) + assertPostgresClientEnvClean + URL precisa ser Postgres
 *   - production: segundo gate próprio, desligado (PRODUCTION_READ_EXECUTION_ENABLED = false);
 *     a autorização de WRITE não libera READ
 *   - query set: SHA-256 fixado + estrutura exata BEGIN READ ONLY / SET LOCAL statement_timeout /
 *     N consultas SELECT|WITH / ROLLBACK + varredura de comandos proibidos (inclusive dentro de $tag$…$tag$)
 *     + meta-comandos psql (\) proibidos
 *   - psql com -X -w -v ON_ERROR_STOP=1 -f <arquivo>; ambiente do filho mínimo, sem PG* herdado; sem retry
 *   - SPF.1B.0A: a senha NUNCA vai no argv. O psql recebe um alvo sem senha; a senha vai num PGPASSFILE
 *     efêmero (mkdtemp 0700 fora do repositório, arquivo 0600 criado com 'wx'), exposto só ao filho via
 *     PGPASSFILE e removido em finally (sucesso, exit != 0, falha de spawn, sinal tratável)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SupabaseTargetGuardError,
  assertPostgresClientEnvClean,
  guardSupabaseOperation,
  readTargetEnv,
} from '../../server/lib/supabaseTarget/supabaseTargetGuard.js';

const SAFETY_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Segundo gate: execução READ em production. Só um PR autorizado (fase SPF.1B) pode mudar isto. */
export const PRODUCTION_READ_EXECUTION_ENABLED = false;

export const RUNNER_TARGET_ENVS = Object.freeze(['staging', 'production']);

export const CONNECTION_ENV_VARS = Object.freeze({
  staging: 'STAGING_DATABASE_URL',
  production: 'PRODUCTION_DATABASE_URL',
});

/**
 * Query sets aprovados. Qualquer mudança no SQL exige nova revisão externa e atualização explícita do hash.
 */
export const APPROVED_QUERY_SETS = Object.freeze({
  'spf1b-patient-state-proof': Object.freeze({
    file: path.join(SAFETY_DIR, 'sql', 'spf1b-patient-state-proof.sql'),
    sha256: '225ef0e70c4499a2c43c9df38815be8ba0cb7fdad3ac66e1ca260e1d5e37cd16',
    queryCount: 8,
    markers: Object.freeze(['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  }),
});
export const DEFAULT_QUERY_SET = 'spf1b-patient-state-proof';

export const PSQL_CANDIDATES = Object.freeze([
  '/opt/homebrew/opt/libpq/bin/psql',
  '/usr/local/opt/libpq/bin/psql',
]);

/** Variáveis repassadas ao psql. Nenhuma PG*: o alvo vem só da connection string validada. */
const CHILD_ENV_ALLOWLIST = Object.freeze(['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES', 'TMPDIR']);

/** Palavras proibidas em qualquer statement (comentários removidos; strings e blocos $tag$ INCLUÍDOS). */
const PROHIBITED_SQL = Object.freeze([
  /\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bUPSERT\b/i, /\bMERGE\b/i, /\bCOPY\b/i,
  /\bCREATE\b/i, /\bALTER\b/i, /\bDROP\b/i, /\bTRUNCATE\b/i, /\bGRANT\b/i, /\bREVOKE\b/i,
  /\bCALL\b/i, /\bDO\b/i, /\bEXECUTE\b/i, /\bPREPARE\b/i, /\bDEALLOCATE\b/i, /\bLOCK\b/i,
  /\bVACUUM\b/i, /\bANALYZE\b/i, /\bCLUSTER\b/i, /\bREINDEX\b/i, /\bREFRESH\b/i, /\bCOMMENT\b/i,
  /\bLISTEN\b/i, /\bUNLISTEN\b/i, /\bNOTIFY\b/i, /\bIMPORT\b/i, /\bCOMMIT\b/i, /\bSAVEPOINT\b/i,
  /\bRELEASE\b/i, /\bABORT\b/i, /\bCHECKPOINT\b/i, /\bDISCARD\b/i, /\bRESET\b/i,
  /\bSECURITY\s+LABEL\b/i, /\bSTART\s+TRANSACTION\b/i, /\bmigrations?\b/i,
  /\bset_config\s*\(/i, /\bnextval\s*\(/i, /\bsetval\s*\(/i, /\bpg_terminate_backend\b/i,
  /\bpg_cancel_backend\b/i, /\bpg_reload_conf\b/i, /\bpg_advisory/i, /\bpg_notify\b/i, /\bpg_sleep/i,
  /\bpg_read_(binary_)?file\b/i, /\bpg_ls_dir\b/i, /\bpg_stat_file\b/i, /\blo_(import|export|unlink|from_bytea|put)\b/i,
  /\bdblink/i, /\bhttp_(get|post|request)\b/i, /\bnet\.http/i,
]);

/** Indícios de credencial / URL no arquivo inteiro (comentários incluídos). */
const CREDENTIAL_INDICATORS = Object.freeze([
  /:\/\//, /password/i, /passwd/i, /secret/i, /\beyJ[A-Za-z0-9_-]{5,}/, /sb_(secret|publishable)_/i,
  /service_role/i, /supabase\.(co|in|com)/i,
]);

function deny(code, reason) {
  throw new SupabaseTargetGuardError(code, reason ? { reason } : {});
}

/**
 * Tokenizador mínimo: separa statements por ';' fora de strings/identificadores/blocos $tag$,
 * remove comentários. Devolve statements (com strings) e o código sem strings/comentários.
 */
export function scanSql(sql) {
  const statements = [];
  let current = '';
  let bare = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) deny('QUERY_SET_MALFORMED', 'comentário de bloco não terminado');
      current += ' ';
      bare += ' ';
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      if (j >= n) deny('QUERY_SET_MALFORMED', 'string ou identificador não terminado');
      current += sql.slice(i, j + 1);
      bare += ' ';
      i = j + 1;
      continue;
    }
    if (ch === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        if (end < 0) deny('QUERY_SET_MALFORMED', 'bloco $tag$ não terminado');
        current += sql.slice(i, end + tag[0].length);
        bare += ' ';
        i = end + tag[0].length;
        continue;
      }
    }
    if (ch === ';') {
      statements.push(current.trim());
      current = '';
      bare += ';';
      i += 1;
      continue;
    }
    current += ch;
    bare += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return { statements: statements.filter(Boolean), bare };
}

const normalize = (s) => s.replace(/\s+/g, ' ').trim();

/** Validação estática fail-closed do query set (estrutura + conteúdo). Não substitui o hash. */
export function verifyReadOnlyQuerySetText(sql, { queryCount, markers = [] } = {}) {
  const text = String(sql ?? '');
  if (!text.trim()) deny('QUERY_SET_EMPTY');
  for (const re of CREDENTIAL_INDICATORS) {
    if (re.test(text)) deny('QUERY_SET_CREDENTIAL_OR_URL', 'arquivo contém indício de credencial/URL');
  }
  for (const marker of markers) {
    if (!new RegExp(`^--\\s*${marker}\\.`, 'm').test(text)) deny('QUERY_SET_MARKER_MISSING', `marcador ${marker} ausente`);
  }
  const { statements, bare } = scanSql(text);
  if (bare.includes('\\')) deny('QUERY_SET_PSQL_META_COMMAND', 'meta-comando psql (\\) fora de string');
  if (!statements.length || normalize(statements[0]).toUpperCase() !== 'BEGIN READ ONLY') {
    deny('QUERY_SET_NOT_READ_ONLY', 'primeiro statement deve ser BEGIN READ ONLY');
  }
  if (!/^SET LOCAL statement_timeout = '\d+(ms|s)'$/i.test(normalize(statements[1] || ''))) {
    deny('QUERY_SET_TIMEOUT_MISSING', "segundo statement deve ser SET LOCAL statement_timeout = '<n>s'");
  }
  if (normalize(statements[statements.length - 1]).toUpperCase() !== 'ROLLBACK') {
    deny('QUERY_SET_NO_ROLLBACK', 'último statement deve ser ROLLBACK');
  }
  const queries = statements.slice(2, -1);
  if (Number.isInteger(queryCount) && queries.length !== queryCount) {
    deny('QUERY_SET_STRUCTURE_MISMATCH', `esperado ${queryCount} consultas, encontrado ${queries.length}`);
  }
  for (const q of queries) {
    if (!/^(SELECT|WITH)\b/i.test(q)) deny('QUERY_SET_PROHIBITED_STATEMENT', 'só SELECT/WITH entre BEGIN e ROLLBACK');
  }
  for (const stmt of statements) {
    const hit = PROHIBITED_SQL.find((re) => re.test(stmt));
    if (hit) deny('QUERY_SET_PROHIBITED_SQL', `padrão proibido: ${hit.source.slice(0, 40)}`);
  }
  return { statements: statements.length, queries: queries.length };
}

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Lê, valida estrutura e confere o hash aprovado. */
export function loadApprovedQuerySet(name, { readFile = fs.readFileSync } = {}) {
  const spec = APPROVED_QUERY_SETS[name];
  if (!spec) deny('QUERY_SET_UNKNOWN', 'query set não aprovado');
  let sql;
  try {
    sql = readFile(spec.file, 'utf8');
  } catch {
    return deny('QUERY_SET_UNREADABLE');
  }
  const structure = verifyReadOnlyQuerySetText(sql, spec);
  const digest = sha256Hex(sql);
  if (digest !== spec.sha256) deny('QUERY_SET_HASH_MISMATCH', 'SHA-256 difere do aprovado; nova revisão necessária');
  return Object.freeze({ name, file: spec.file, sha256: digest, ...structure });
}

export function parseRunnerArgs(argv = []) {
  let querySet = DEFAULT_QUERY_SET;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (/:\/\/|@|postgres/i.test(arg)) deny('CLI_CONNECTION_STRING_FORBIDDEN', 'connection string só via variável de ambiente');
    if (arg === '--query-set') {
      querySet = String(argv[i + 1] ?? '');
      i += 1;
    } else if (arg.startsWith('--query-set=')) {
      querySet = arg.slice('--query-set='.length);
    } else {
      deny('CLI_ARGUMENT_NOT_ALLOWED', `argumento #${i + 1} não permitido (somente --query-set)`);
    }
  }
  return { querySet };
}

export function buildChildEnv(env = process.env) {
  const child = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    if (env[key] != null && env[key] !== '') child[key] = String(env[key]);
  }
  return child;
}

export function resolvePsqlPath(env = process.env, { isExecutable } = {}) {
  const check = isExecutable || ((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
  const fromPath = String(env.PATH || '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, 'psql'));
  return [...PSQL_CANDIDATES, ...fromPath].find((p) => check(p)) || null;
}

function sanitizeSsl(url) {
  const mode = String(new URL(url).searchParams.get('sslmode') || '').toLowerCase();
  if (mode === 'disable' || mode === 'allow') deny('SSL_NOT_ENFORCED', 'sslmode=disable/allow não é aceito');
}

const REPO_ROOT = path.resolve(SAFETY_DIR, '..', '..');

/** Formato .pgpass do libpq: '\' e ':' dentro de um campo são escapados com '\'. */
export function escapePgpassField(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

/**
 * Separa a connection string JÁ VALIDADA pelo guard em:
 *   - passwordlessTarget: URI sem senha (vai no argv do psql)
 *   - pgpassLine: host:port:database:username:password (vai só para o PGPASSFILE efêmero)
 * Nunca registra nem devolve a URL original.
 */
export function splitConnectionCredential(url) {
  let parsed;
  let user;
  let password;
  let database;
  try {
    parsed = new URL(url);
    user = decodeURIComponent(parsed.username || '');
    password = decodeURIComponent(parsed.password || '');
    database = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres';
  } catch {
    return deny('CONNECTION_STRING_DECODE_FAILED');
  }
  if (!user) deny('CONNECTION_USER_MISSING');
  if (!password) deny('CONNECTION_PASSWORD_MISSING', 'senha ausente na connection string');
  if ([user, password, database].some((v) => /[\r\n\0]/.test(v))) {
    deny('CONNECTION_CREDENTIAL_UNSUPPORTED', 'caracteres de controle não são suportados pelo formato .pgpass');
  }
  const host = parsed.hostname;
  const port = parsed.port || '5432';
  const target = new URL(url);
  target.password = '';
  const passwordlessTarget = target.toString();
  if (new URL(passwordlessTarget).password) deny('CONNECTION_PASSWORD_NOT_STRIPPED');
  const pgpassLine = `${[host, port, database, user, password].map(escapePgpassField).join(':')}\n`;
  return { passwordlessTarget, pgpassLine };
}

/** Cria o PGPASSFILE efêmero: diretório mkdtemp (0700) fora do repositório + arquivo 0600 criado com 'wx'. */
export function createEphemeralPgpass(line, { tmpRoot = os.tmpdir(), fsImpl = fs } = {}) {
  const root = fsImpl.realpathSync(tmpRoot);
  const repo = fsImpl.realpathSync(REPO_ROOT);
  if (root === repo || root.startsWith(`${repo}${path.sep}`)) deny('PGPASSFILE_DIR_INSIDE_REPOSITORY');
  const dir = fsImpl.mkdtempSync(path.join(root, 'lo-pgpass-'));
  const file = path.join(dir, crypto.randomBytes(12).toString('hex'));
  try {
    fsImpl.writeFileSync(file, line, { mode: 0o600, flag: 'wx' });
    if ((fsImpl.statSync(file).mode & 0o777) !== 0o600) deny('PGPASSFILE_MODE_INVALID');
  } catch (err) {
    fsImpl.rmSync(dir, { recursive: true, force: true });
    if (err instanceof SupabaseTargetGuardError) throw err;
    deny('PGPASSFILE_CREATE_FAILED');
  }
  return { dir, file };
}

export function removeEphemeralPgpass(handle, { fsImpl = fs } = {}) {
  fsImpl.rmSync(handle.dir, { recursive: true, force: true });
  if (fsImpl.existsSync(handle.dir)) throw new Error('cleanup incomplete');
}

/**
 * Executa o query set aprovado. Retorna { ok, exitCode, code? } e nunca lança para o chamador.
 * Dependências injetáveis para testes (spawn, resolvePsql, readFile, saídas).
 */
export function runReadOnlyDbProof({
  env = process.env,
  argv = [],
  spawn = spawnSync,
  resolvePsql = resolvePsqlPath,
  readFile = fs.readFileSync,
  tmpRoot = os.tmpdir(),
  fsImpl = fs,
  stdout = (line) => process.stdout.write(`${line}\n`),
  stderr = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  try {
    const { querySet } = parseRunnerArgs(argv);

    const targetEnv = readTargetEnv(env);
    if (!RUNNER_TARGET_ENVS.includes(targetEnv)) deny('TARGET_ENV_NOT_ALLOWED', 'runner aceita somente staging|production');
    if (targetEnv === 'production' && PRODUCTION_READ_EXECUTION_ENABLED !== true) {
      deny('PRODUCTION_READ_EXECUTION_DISABLED', 'execução em production não autorizada nesta fase');
    }

    const connectionVar = CONNECTION_ENV_VARS[targetEnv];
    const otherVar = Object.values(CONNECTION_ENV_VARS).find((v) => v !== connectionVar);
    if (String(env[otherVar] ?? '').trim()) {
      deny('CROSS_ENV_CONNECTION_VAR_PRESENT', `${otherVar} presente com alvo ${targetEnv}; remova-a do ambiente`);
    }
    const url = String(env[connectionVar] ?? '').trim();
    if (!url) deny('CONNECTION_VAR_MISSING', `${connectionVar} ausente (sem fallback para outras variáveis)`);

    assertPostgresClientEnvClean(env);

    const guard = guardSupabaseOperation({
      env: { LOVE_ODONTO_TARGET_ENV: targetEnv, SUPABASE_PROJECT_REF: env.SUPABASE_PROJECT_REF },
      url,
      operation: 'read',
    });
    if (guard.target.urlKind !== 'postgres') deny('NOT_A_POSTGRES_CONNECTION', 'esperada connection string postgres(ql)://');
    if (guard.gate.mode !== 'read') deny('OPERATION_NOT_READ');
    sanitizeSsl(url);
    const credential = splitConnectionCredential(url);

    const qs = loadApprovedQuerySet(querySet, { readFile });

    const psqlPath = resolvePsql(env);
    if (!psqlPath) deny('PSQL_NOT_FOUND', 'instale libpq (brew install libpq)');
    const childEnv = buildChildEnv(env);
    const version = spawn(psqlPath, ['--version'], { env: childEnv, encoding: 'utf8' });
    if (!version || version.status !== 0) deny('PSQL_UNUSABLE');

    stdout(JSON.stringify({
      guard: 'READ_ONLY_DB_PROOF',
      decision: 'EXECUTE',
      targetEnv,
      urlRefClass: guard.target.urlRefClass,
      connection: guard.target.connection,
      refSources: guard.target.refSources,
      querySet: qs.name,
      sha256: qs.sha256,
      psql: psqlPath,
      psqlVersion: String(version.stdout || '').trim().slice(0, 80),
      credentialTransport: 'ephemeral_pgpassfile',
    }));

    const args = ['-X', '-w', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off', '-f', qs.file, '-d', credential.passwordlessTarget];
    let passfile = null;
    let result = null;
    let spawnThrew = false;
    let cleanupFailed = false;
    try {
      passfile = createEphemeralPgpass(credential.pgpassLine, { tmpRoot, fsImpl });
      try {
        result = spawn(psqlPath, args, { env: { ...childEnv, PGPASSFILE: passfile.file }, stdio: 'inherit' });
      } catch {
        spawnThrew = true;
      }
    } finally {
      if (passfile) {
        try {
          removeEphemeralPgpass(passfile, { fsImpl });
        } catch {
          cleanupFailed = true;
        }
      }
    }
    if (cleanupFailed) {
      stderr(JSON.stringify({ ok: false, guard: 'READ_ONLY_DB_PROOF', code: 'PGPASSFILE_CLEANUP_FAILED' }));
      return { ok: false, exitCode: 3, code: 'PGPASSFILE_CLEANUP_FAILED' };
    }
    if (spawnThrew || !result || result.error) {
      stderr(JSON.stringify({ ok: false, guard: 'READ_ONLY_DB_PROOF', code: 'PSQL_SPAWN_FAILED', retry: false }));
      return { ok: false, exitCode: 1, code: 'PSQL_SPAWN_FAILED' };
    }
    let exitCode = Number.isInteger(result.status) ? result.status : 1;
    if (result.signal) exitCode = result.signal === 'SIGINT' ? 130 : 1;
    if (exitCode !== 0) {
      stderr(JSON.stringify({ guard: 'READ_ONLY_DB_PROOF', decision: 'FAILED', exitCode, retry: false }));
      return { ok: false, exitCode, code: 'PSQL_FAILED' };
    }
    stdout(JSON.stringify({ guard: 'READ_ONLY_DB_PROOF', decision: 'COMPLETED', exitCode: 0 }));
    return { ok: true, exitCode: 0 };
  } catch (err) {
    if (err instanceof SupabaseTargetGuardError) {
      stderr(JSON.stringify(err.toJSON()));
      return { ok: false, exitCode: 2, code: err.code };
    }
    stderr(JSON.stringify({ ok: false, guard: 'READ_ONLY_DB_PROOF', code: 'UNEXPECTED_ERROR' }));
    return { ok: false, exitCode: 1, code: 'UNEXPECTED_ERROR' };
  }
}
