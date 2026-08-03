/**
 * Phase 9.2A/B — guard contra execução remota (puro, sem spawn).
 */
import {
  FORBIDDEN_COMMAND_TOKENS,
  FORBIDDEN_ENV_KEYS,
  PRODUCTION_REF,
  STAGING_REF,
  auditRemoteLinkArtifacts,
  readLinkedProjectMeta,
} from './constants.mjs';
import { evaluateOptIn } from './optInContract.mjs';

export { evaluateOptIn, evaluateOptInContract } from './optInContract.mjs';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

/**
 * Valida um comando proposto antes do spawn.
 * @param {string} binary
 * @param {string[]} args
 */
export function guardCommand(binary, args = [], env = process.env) {
  const joined = [binary, ...args].join(' ').toLowerCase();
  const flat = args.map((a) => String(a).toLowerCase());

  if (/\bnpx\b/.test(joined)) {
    return { status: 'BLOCKED_REMOTE_COMMAND', reason: 'npx_forbidden', command: joined };
  }

  for (const token of FORBIDDEN_COMMAND_TOKENS) {
    if (joined.includes(token)) {
      return { status: 'BLOCKED_REMOTE_COMMAND', reason: `token:${token}`, command: joined };
    }
  }

  // "db push" as separate args
  if (flat.includes('push') && (flat.includes('db') || joined.includes('db push'))) {
    return { status: 'BLOCKED_REMOTE_COMMAND', reason: 'db_push', command: joined };
  }
  if (flat.includes('link')) {
    return { status: 'BLOCKED_REMOTE_COMMAND', reason: 'link', command: joined };
  }
  if (flat.includes('--linked') || flat.includes('--db-url')) {
    return { status: 'BLOCKED_REMOTE_COMMAND', reason: 'remote_query_flag', command: joined };
  }

  if (joined.includes(PRODUCTION_REF) || joined.includes(STAGING_REF)) {
    return { status: 'BLOCKED_PRODUCTION_REFERENCE', reason: 'project_ref_in_args', command: joined };
  }

  for (const key of FORBIDDEN_ENV_KEYS) {
    if (env[key] && String(env[key]).trim()) {
      return {
        status: 'BLOCKED_REMOTE_DATABASE_URL',
        reason: `env:${key}`,
        command: joined,
      };
    }
  }

  return { status: 'SAFE_LOCAL_ENVIRONMENT', reason: null, command: joined };
}

/**
 * Gate completo de isolamento (sem spawn).
 */
export function evaluateRemoteGuard(env = process.env) {
  const optIn = evaluateOptIn(env);
  const audit = auditRemoteLinkArtifacts();
  const linked = readLinkedProjectMeta();
  const remoteEnv = FORBIDDEN_ENV_KEYS.filter((k) => env[k] && String(env[k]).trim());
  const blockers = [...optIn.blockers];

  // Link metadata in default supabase/ is OK as long as runner uses supabase-local
  // and never runs against linked workdir. Still report it.
  if (remoteEnv.length) blockers.push('REMOTE_DATABASE_URL_PRESENT');
  if (process.argv.join(' ').includes(PRODUCTION_REF)) {
    blockers.push('PRODUCTION_REFERENCE_PRESENT');
  }
  if (process.argv.join(' ').includes(STAGING_REF)) {
    blockers.push('STAGING_REFERENCE_PRESENT');
  }

  // Using default supabase/ workdir while linked is explicit failure when forceDefaultWorkdir
  const forceDefault = isTruthy(env.FORCE_APP_SUPABASE_WORKDIR);
  if (forceDefault && linked.present) {
    blockers.push('BLOCKED_REMOTE_PROJECT_LINK');
  }

  let status = 'SAFE_LOCAL_ENVIRONMENT';
  if (optIn.status !== 'OPT_IN_OK') status = 'LOCAL_INTEGRATION_SKIPPED';
  else if (blockers.includes('BLOCKED_REMOTE_PROJECT_LINK')) status = 'BLOCKED_REMOTE_PROJECT_LINK';
  else if (blockers.includes('REMOTE_DATABASE_URL_PRESENT')) status = 'BLOCKED_REMOTE_DATABASE_URL';
  else if (blockers.includes('PRODUCTION_REFERENCE_PRESENT')) status = 'BLOCKED_PRODUCTION_REFERENCE';
  else if (blockers.includes('STAGING_REFERENCE_PRESENT')) status = 'BLOCKED_PRODUCTION_REFERENCE';

  return {
    status: blockers.length && optIn.status === 'OPT_IN_OK'
      ? (blockers.includes('BLOCKED_REMOTE_PROJECT_LINK')
        ? 'BLOCKED_REMOTE_PROJECT_LINK'
        : blockers.includes('REMOTE_DATABASE_URL_PRESENT')
          ? 'BLOCKED_REMOTE_DATABASE_URL'
          : 'BLOCKED_PRODUCTION_REFERENCE')
      : status,
    optIn,
    audit,
    linkedPresent: linked.present,
    linkedRef: linked.data?.ref || null,
    linkedMetadataPreserved: true,
    remoteEnvKeys: remoteEnv,
    blockers,
    allowedWhenOpen: [
      'supabase --version',
      'supabase start',
      'supabase status',
      'supabase db reset',
      'supabase db query --local',
      'supabase stop',
    ],
    forbidden: [
      'supabase link',
      'supabase db push',
      'supabase secrets',
      'supabase projects',
      'supabase functions deploy',
      'supabase db query --linked',
      'supabase db query --db-url',
    ],
  };
}
