/**
 * SPF.1A.1 — guard compartilhado de alvo Supabase (fail-closed).
 *
 * assertSupabaseTarget: prova que o alvo declarado (LOVE_ODONTO_TARGET_ENV) bate com o
 *   project ref da URL e, quando possível, com o ref embutido na credencial.
 * evaluateOperationGate: decide read / dry-run / apply. Escrita sem apply = dry-run;
 *   escrita em production exige autorização versionada; destrutivo em production = sempre negado.
 *
 * Regras de sigilo: erros e relatórios carregam só códigos, classes e refs públicos.
 * Nenhum valor de credencial, JWT ou URL completa é incluído.
 *
 * Reaproveita a semântica de assertStagingSupabaseUrl (nega vazio / exige ref esperado) e
 * extractSupabaseProjectRef (ref explícito via SUPABASE_PROJECT_REF) já existentes no repo.
 */
import {
  LOCAL_PROJECT_REF,
  TARGET_ENVS,
  classifyProjectRef,
  expectedRefForTargetEnv,
} from './projectRefs.js';
import { PRODUCTION_OPERATION_AUTHORIZATIONS } from './productionAuthorizations.js';

export const TARGET_ENV_VAR = 'LOVE_ODONTO_TARGET_ENV';
export const PRODUCTION_AUTHORIZATION_VAR = 'LOVE_ODONTO_PRODUCTION_AUTHORIZATION';
export const DESTRUCTIVE_CONFIRMATION_VAR = 'LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION';
export const EXPLICIT_PROJECT_REF_VAR = 'SUPABASE_PROJECT_REF';

/** Operações destrutivas em production ficam desligadas no código; só um PR revisado muda isto. */
export const DESTRUCTIVE_PRODUCTION_ENABLED = false;

export const OPERATIONS = Object.freeze(['read', 'write', 'destructive']);

const SUPABASE_HOST_RE = /^([a-z0-9]{20})\.supabase\.(co|in)$/;
const SUPABASE_DB_HOST_RE = /^db\.([a-z0-9]{20})\.supabase\.(co|in)$/;
const SUPABASE_POOLER_HOST_RE = /^[a-z0-9-]+\.pooler\.supabase\.com$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal']);
const REF_RE = /^[a-z0-9]{20}$/;
const HTTP_PROTOCOLS = new Set(['https:', 'http:']);
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
/** 5432 = direto / session pooler; 6543 = transaction pooler (compartilhado ou dedicado). */
const POSTGRES_PORTS = new Set(['', '5432', '6543']);
/**
 * libpq aceita parâmetros de conexão na query (?host=, ?hostaddr=, ?user=, ?options=, ?service=…)
 * que SOBRESCREVEM o alvo da URI. Só parâmetros que não mudam o destino são aceitos.
 */
const POSTGRES_ALLOWED_QUERY_PARAMS = new Set(['sslmode', 'sslrootcert', 'connect_timeout', 'application_name']);
/** Variáveis de ambiente do libpq que podem redirecionar/alterar a conexão fora da URI. */
export const POSTGRES_CLIENT_OVERRIDE_ENV_VARS = Object.freeze([
  'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS',
]);
const SAFE_DETAIL_KEYS = new Set([
  'targetEnv', 'expectedRefClass', 'expectedRef', 'urlRefClass', 'urlRef', 'urlKind',
  'credentialPresence', 'credentialRefStatus', 'credentialRefClass', 'explicitRefStatus',
  'operation', 'operationId', 'mode', 'allowed', 'expectedFormat', 'reason',
  'connection', 'refSources', 'hostRefClass', 'usernameRefClass', 'queryParam', 'envVars',
]);

function sanitizeDetails(details) {
  const out = {};
  for (const [k, v] of Object.entries(details || {})) {
    if (!SAFE_DETAIL_KEYS.has(k)) continue;
    if (v == null || typeof v === 'boolean' || typeof v === 'number') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.map((x) => String(x)).slice(0, 10);
    else out[k] = String(v).slice(0, 120);
  }
  return out;
}

export class SupabaseTargetGuardError extends Error {
  constructor(code, details = {}) {
    super(`[SUPABASE_TARGET_GUARD] DENY ${code}`);
    this.name = 'SupabaseTargetGuardError';
    this.code = code;
    this.details = sanitizeDetails(details);
  }

  toJSON() {
    return { ok: false, guard: 'SUPABASE_TARGET_GUARD', decision: 'DENY', code: this.code, ...this.details };
  }
}

function deny(code, details) {
  throw new SupabaseTargetGuardError(code, details);
}

function readRaw(env, key) {
  const v = env?.[key];
  return v == null ? '' : String(v).trim();
}

export function readTargetEnv(env = process.env) {
  const raw = readRaw(env, TARGET_ENV_VAR).toLowerCase();
  if (!raw) deny('TARGET_ENV_MISSING', { reason: `${TARGET_ENV_VAR} obrigatório: ${TARGET_ENVS.join('|')}` });
  if (!TARGET_ENVS.includes(raw)) {
    deny('TARGET_ENV_INVALID', { reason: `${TARGET_ENV_VAR} deve ser ${TARGET_ENVS.join('|')}` });
  }
  return raw;
}

/** Ref embutido no usuário do pooler (`<role>.<ref>`); `postgres` sem sufixo → null. Sufixo inválido → negar. */
function usernameRefOf(parsed) {
  let user;
  try {
    user = decodeURIComponent(parsed.username || '');
  } catch {
    return deny('URL_INVALID', { reason: 'usuário com percent-encoding inválido' });
  }
  const dot = user.lastIndexOf('.');
  if (dot < 0) return null;
  const suffix = user.slice(dot + 1).toLowerCase();
  if (dot === 0 || !REF_RE.test(suffix)) {
    return deny('USERNAME_REF_INVALID', { reason: 'sufixo do usuário não é um project ref inequívoco' });
  }
  return suffix;
}

function assertPostgresQueryParams(parsed) {
  for (const key of parsed.searchParams.keys()) {
    if (!POSTGRES_ALLOWED_QUERY_PARAMS.has(key.toLowerCase())) {
      deny('QUERY_PARAM_NOT_ALLOWED', {
        queryParam: key.slice(0, 40),
        reason: `permitidos: ${[...POSTGRES_ALLOWED_QUERY_PARAMS].join(',')}`,
      });
    }
  }
}

function parsePostgresConnection(parsed) {
  if (parsed.hash) deny('URL_INVALID');
  const host = parsed.hostname.toLowerCase();
  if (!host) deny('URL_INVALID');
  if (!POSTGRES_PORTS.has(parsed.port)) deny('PORT_UNEXPECTED', { reason: 'portas aceitas: 5432, 6543' });
  assertPostgresQueryParams(parsed);

  const userRef = usernameRefOf(parsed);
  const direct = host.match(SUPABASE_DB_HOST_RE);
  let hostRef = null;
  let connection;
  if (direct) {
    hostRef = direct[1];
    connection = parsed.port === '6543' ? 'dedicated_pooler' : 'direct';
  } else if (SUPABASE_POOLER_HOST_RE.test(host)) {
    connection = parsed.port === '6543' ? 'transaction_pooler' : 'session_pooler';
  } else if (LOCAL_HOSTS.has(host)) {
    if (userRef) {
      deny('HOST_USERNAME_REF_CONFLICT', { hostRefClass: 'LOCAL', usernameRefClass: classifyProjectRef(userRef) });
    }
    return { kind: 'local', connection: 'local_postgres', ref: LOCAL_PROJECT_REF, refSources: ['host'] };
  } else {
    deny('URL_UNRECOGNIZED_HOST', { reason: 'host não é db.<ref>.supabase.co, *.pooler.supabase.com nem local' });
  }

  if (hostRef && userRef && hostRef !== userRef) {
    deny('HOST_USERNAME_REF_CONFLICT', {
      connection, hostRefClass: classifyProjectRef(hostRef), usernameRefClass: classifyProjectRef(userRef),
    });
  }
  const ref = hostRef || userRef;
  if (!ref) deny('REF_UNDETERMINED', { connection, reason: 'pooler sem usuário <role>.<ref>' });
  const refSources = [hostRef && 'host', userRef && 'username'].filter(Boolean);
  return { kind: 'postgres', connection, ref, refSources };
}

/**
 * Extrai o ref do alvo Supabase. Aceita:
 *   REST      https://<ref>.supabase.co
 *   direto    postgres(ql)://<user>@db.<ref>.supabase.co:5432/…   (6543 = pooler dedicado)
 *   pooler    postgres(ql)://<role>.<ref>@<região>.pooler.supabase.com:5432|6543/…
 *   local     http(s)/postgres(ql) em localhost
 * Host e usuário, quando ambos carregam ref, precisam concordar. Qualquer ambiguidade = negar.
 * Nunca devolve senha, usuário ou a URL.
 */
export function parseSupabaseUrlRef(url) {
  const raw = String(url ?? '').trim();
  if (!raw) deny('URL_MISSING');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    deny('URL_INVALID');
  }
  if (POSTGRES_PROTOCOLS.has(parsed.protocol)) return parsePostgresConnection(parsed);
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) deny('URL_INVALID');
  const host = parsed.hostname.toLowerCase();
  const m = host.match(SUPABASE_HOST_RE);
  if (m) return { kind: 'supabase', connection: 'rest', ref: m[1], refSources: ['host'] };
  if (LOCAL_HOSTS.has(host)) return { kind: 'local', connection: 'local_rest', ref: LOCAL_PROJECT_REF, refSources: ['host'] };
  return deny('URL_UNRECOGNIZED_HOST', { reason: 'host não é <ref>.supabase.co nem local' });
}

/**
 * Antes de rodar psql/libpq: variáveis PG* podem sobrescrever o alvo validado na URI → negar se presentes.
 * Só nomes são reportados, nunca valores.
 */
export function assertPostgresClientEnvClean(env = process.env) {
  const present = POSTGRES_CLIENT_OVERRIDE_ENV_VARS.filter((k) => readRaw(env, k) !== '');
  if (present.length) {
    deny('POSTGRES_CLIENT_ENV_OVERRIDE', { envVars: present, reason: 'remova estas variáveis do ambiente do psql' });
  }
  return true;
}

/**
 * Inspeciona a credencial sem nunca devolvê-la.
 * JWT legado (anon/service_role) carrega o claim `ref`; chaves sb_secret_/sb_publishable_/sbp_ são opacas.
 */
export function inspectCredential(credential) {
  const raw = String(credential ?? '').trim();
  if (!raw) return { presence: 'ABSENT', verifiable: false, ref: null };
  const parts = raw.split('.');
  if (raw.startsWith('eyJ') && parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const ref = typeof payload?.ref === 'string' ? payload.ref.toLowerCase() : '';
      if (REF_RE.test(ref)) return { presence: 'PRESENT', verifiable: true, ref };
      return { presence: 'PRESENT', verifiable: false, ref: null, reason: 'JWT_WITHOUT_REF' };
    } catch {
      return { presence: 'PRESENT', verifiable: false, ref: null, reason: 'JWT_UNPARSEABLE' };
    }
  }
  return { presence: 'PRESENT', verifiable: false, ref: null, reason: 'OPAQUE_KEY' };
}

/**
 * @param {object} opts
 * @param {Record<string,string|undefined>} [opts.env] ambiente do shell (process.env) — fonte do TARGET_ENV
 * @param {string} opts.url URL Supabase (REST ou connection string Postgres) que a ferramenta realmente vai usar
 * @param {string} [opts.credential] chave API que a ferramenta vai usar (só inspecionada, nunca exposta).
 *   Para Postgres NÃO passar a senha: o ref é provado pelo host/usuário da connection string.
 * @param {string} [opts.explicitProjectRef] ref explícito (senão env.SUPABASE_PROJECT_REF)
 */
export function assertSupabaseTarget({ env = process.env, url, credential, explicitProjectRef } = {}) {
  const targetEnv = readTargetEnv(env);
  const expectedRef = expectedRefForTargetEnv(targetEnv);
  const base = { targetEnv, expectedRefClass: classifyProjectRef(expectedRef) };

  const parsed = parseSupabaseUrlRef(url);
  const urlInfo = {
    urlKind: parsed.kind,
    connection: parsed.connection,
    refSources: parsed.refSources,
    urlRefClass: classifyProjectRef(parsed.ref),
  };
  if (parsed.ref !== expectedRef) {
    deny('TARGET_REF_MISMATCH', { ...base, ...urlInfo, expectedRef, urlRef: parsed.ref });
  }

  const explicit = String(explicitProjectRef ?? readRaw(env, EXPLICIT_PROJECT_REF_VAR)).trim().toLowerCase();
  let explicitRefStatus = 'ABSENT';
  if (explicit) {
    if (explicit !== expectedRef) {
      deny('EXPLICIT_REF_MISMATCH', { ...base, ...urlInfo, explicitRefStatus: 'MISMATCH' });
    }
    explicitRefStatus = 'MATCH';
  }

  const cred = inspectCredential(credential);
  let credentialRefStatus;
  if (cred.presence === 'ABSENT') {
    credentialRefStatus = 'ABSENT';
  } else if (cred.verifiable) {
    if (cred.ref !== expectedRef) {
      deny('CREDENTIAL_REF_MISMATCH', {
        ...base, ...urlInfo, credentialRefStatus: 'MISMATCH', credentialRefClass: classifyProjectRef(cred.ref),
      });
    }
    credentialRefStatus = 'MATCH';
  } else if (targetEnv === 'local') {
    // Chaves do Supabase local (demo JWT sem ref) não carregam project ref.
    credentialRefStatus = 'UNVERIFIABLE';
  } else if (explicitRefStatus === 'MATCH') {
    credentialRefStatus = 'UNVERIFIABLE_EXPLICIT_REF_MATCH';
  } else {
    deny('CREDENTIAL_REF_UNVERIFIABLE', {
      ...base, ...urlInfo, credentialRefStatus: 'UNVERIFIABLE',
      reason: `credencial sem ref verificável: defina ${EXPLICIT_PROJECT_REF_VAR} com o ref esperado`,
    });
  }

  return Object.freeze({
    ...base,
    expectedRef,
    urlRef: parsed.ref,
    urlKind: parsed.kind,
    connection: parsed.connection,
    refSources: Object.freeze([...parsed.refSources]),
    urlRefClass: urlInfo.urlRefClass,
    urlRefStatus: 'MATCH',
    credentialPresence: cred.presence,
    credentialRefStatus,
    explicitRefStatus,
  });
}

function findProductionAuthorization(authId, operationId, now) {
  return PRODUCTION_OPERATION_AUTHORIZATIONS.find((entry) => entry
    && entry.id === authId
    && entry.operationId === operationId
    && Number.isFinite(Date.parse(entry.expiresAt))
    && Date.parse(entry.expiresAt) > now.getTime());
}

/**
 * @param {object} opts
 * @param {ReturnType<typeof assertSupabaseTarget>} opts.target resultado de assertSupabaseTarget
 * @param {'read'|'write'|'destructive'} opts.operation
 * @param {string} [opts.operationId] identificador estável da ferramenta (obrigatório para write/destructive)
 * @param {boolean} [opts.apply] pedido explícito de aplicar; ausente = dry-run
 */
export function evaluateOperationGate({
  target, operation, operationId, apply = false, env = process.env, now = new Date(),
} = {}) {
  if (!target || !target.targetEnv || target.urlRefStatus !== 'MATCH') deny('TARGET_NOT_ASSERTED');
  if (!OPERATIONS.includes(operation)) deny('OPERATION_INVALID', { reason: `operation: ${OPERATIONS.join('|')}` });
  const base = { targetEnv: target.targetEnv, expectedRefClass: target.expectedRefClass, operation, operationId };

  if (operation === 'read') return Object.freeze({ ...base, allowed: true, mode: 'read' });

  if (!operationId || typeof operationId !== 'string') deny('OPERATION_ID_REQUIRED', base);
  const isProduction = target.targetEnv === 'production';

  if (operation === 'destructive') {
    if (isProduction && !DESTRUCTIVE_PRODUCTION_ENABLED) deny('PRODUCTION_DESTRUCTIVE_DISABLED', base);
    if (apply !== true) return Object.freeze({ ...base, allowed: true, mode: 'dry-run' });
    const expected = `DESTROY:${target.expectedRef}:${operationId}`;
    if (readRaw(env, DESTRUCTIVE_CONFIRMATION_VAR) !== expected) {
      deny('DESTRUCTIVE_CONFIRMATION_REQUIRED', {
        ...base, expectedFormat: `${DESTRUCTIVE_CONFIRMATION_VAR}=DESTROY:<ref>:<operationId>`,
      });
    }
    return Object.freeze({ ...base, allowed: true, mode: 'apply' });
  }

  // write
  if (apply !== true) return Object.freeze({ ...base, allowed: true, mode: 'dry-run' });
  if (isProduction) {
    const authId = readRaw(env, PRODUCTION_AUTHORIZATION_VAR);
    if (!authId || !findProductionAuthorization(authId, operationId, now)) {
      deny('PRODUCTION_WRITE_NOT_AUTHORIZED', {
        ...base, reason: 'nenhuma autorização versionada válida em productionAuthorizations.js',
      });
    }
  }
  return Object.freeze({ ...base, allowed: true, mode: 'apply' });
}

/** Atalho: assert do alvo + gate da operação. Lança SupabaseTargetGuardError em qualquer negação. */
export function guardSupabaseOperation({
  env = process.env, url, credential, explicitProjectRef, operation, operationId, apply = false, now,
} = {}) {
  const target = assertSupabaseTarget({ env, url, credential, explicitProjectRef });
  const gate = evaluateOperationGate({ target, operation, operationId, apply, env, now });
  return Object.freeze({ target, gate });
}

/** Linha de log segura (sem segredos) para registrar a decisão. */
export function describeGuardDecision({ target, gate }) {
  return `[SUPABASE_TARGET_GUARD] ALLOW env=${target.targetEnv} ref=${target.urlRefClass}`
    + ` credential=${target.credentialRefStatus} op=${gate.operation}`
    + `${gate.operationId ? `:${gate.operationId}` : ''} mode=${gate.mode}`;
}
