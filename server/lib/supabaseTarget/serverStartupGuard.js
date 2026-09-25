/**
 * SPF.1A.1 — guard de startup da Admin API (Railway).
 *
 * Rollout seguro em dois modos:
 *   - report  (EXPECTED_SUPABASE_PROJECT_REF ausente — estado atual do Railway):
 *       não bloqueia; registra a classe do alvo (PRODUCTION/STAGING/UNKNOWN) e avisa.
 *   - enforce (EXPECTED_SUPABASE_PROJECT_REF definido):
 *       exige ref da SUPABASE_URL == esperado; credencial JWT com ref divergente = falha;
 *       LOVE_ODONTO_TARGET_ENV, se definido, precisa apontar para o mesmo ref.
 *       Qualquer divergência → fail-closed (exit 2) antes de criar o client Supabase.
 *
 * Ativação posterior (fora desta fase): definir no Railway
 *   EXPECTED_SUPABASE_PROJECT_REF=<ref do projeto que a API deve usar>
 * e, opcionalmente, LOVE_ODONTO_TARGET_ENV=production|staging.
 */
import { TARGET_ENVS, classifyProjectRef, expectedRefForTargetEnv } from './projectRefs.js';
import { inspectCredential } from './supabaseTargetGuard.js';

export const EXPECTED_REF_VAR = 'EXPECTED_SUPABASE_PROJECT_REF';

const REF_RE = /^[a-z0-9]{20}$/;
const SUPABASE_HOST_RE = /^([a-z0-9]{20})\.supabase\.(co|in)$/;

function urlRefOf(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return { status: 'MISSING', ref: null };
  try {
    const m = new URL(raw).hostname.toLowerCase().match(SUPABASE_HOST_RE);
    return m ? { status: 'OK', ref: m[1] } : { status: 'UNRECOGNIZED_HOST', ref: null };
  } catch {
    return { status: 'INVALID', ref: null };
  }
}

export function evaluateServerSupabaseTarget(env = process.env) {
  const expected = String(env[EXPECTED_REF_VAR] ?? '').trim().toLowerCase();
  const url = urlRefOf(env.SUPABASE_URL);
  const cred = inspectCredential(env.SUPABASE_SERVICE_ROLE_KEY);
  const credentialVsUrl = !cred.verifiable
    ? (cred.presence === 'ABSENT' ? 'ABSENT' : 'UNVERIFIABLE')
    : (cred.ref === url.ref ? 'MATCH' : 'MISMATCH');

  const summary = {
    urlStatus: url.status,
    urlRefClass: classifyProjectRef(url.ref),
    credentialRefStatus: credentialVsUrl,
  };

  if (!expected) {
    return { ok: true, mode: 'report', code: 'EXPECTED_REF_NOT_CONFIGURED', ...summary };
  }

  const fail = (code) => ({ ok: false, mode: 'enforce', code, expectedRefClass: classifyProjectRef(expected), ...summary });
  if (!REF_RE.test(expected)) return fail('EXPECTED_REF_INVALID');
  if (url.status !== 'OK') return fail(`SUPABASE_URL_${url.status}`);
  if (url.ref !== expected) return fail('TARGET_REF_MISMATCH');
  if (cred.verifiable && cred.ref !== expected) return fail('CREDENTIAL_REF_MISMATCH');

  const targetEnv = String(env.LOVE_ODONTO_TARGET_ENV ?? '').trim().toLowerCase();
  if (targetEnv) {
    if (!TARGET_ENVS.includes(targetEnv)) return fail('TARGET_ENV_INVALID');
    if (expectedRefForTargetEnv(targetEnv) !== expected) return fail('TARGET_ENV_REF_MISMATCH');
  }

  return { ok: true, mode: 'enforce', code: 'TARGET_MATCH', expectedRefClass: classifyProjectRef(expected), ...summary };
}

/** Aplica o resultado no processo: enforce + divergência → exit(2). Nunca imprime URL/chave. */
export function applyServerStartupGuard({
  env = process.env, log = console.log, warn = console.warn, error = console.error, exit = process.exit,
} = {}) {
  const result = evaluateServerSupabaseTarget(env);
  const line = `mode=${result.mode} code=${result.code} urlRef=${result.urlRefClass}`
    + ` credential=${result.credentialRefStatus}${result.expectedRefClass ? ` expected=${result.expectedRefClass}` : ''}`;
  if (!result.ok) {
    error(`[SaaS Admin API] HARD STOP SUPABASE_TARGET_GUARD ${line}`);
    exit(2);
    return result;
  }
  if (result.mode === 'report') {
    warn(`[SaaS Admin API] SUPABASE_TARGET_GUARD report-only (${EXPECTED_REF_VAR} não definido) ${line}`);
    if (result.credentialRefStatus === 'MISMATCH') {
      warn('[SaaS Admin API] SUPABASE_TARGET_GUARD aviso: ref da service role difere do ref da SUPABASE_URL.');
    }
  } else {
    log(`[SaaS Admin API] SUPABASE_TARGET_GUARD ${line}`);
  }
  return result;
}
