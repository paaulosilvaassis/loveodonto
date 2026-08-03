/**
 * Phase 9.2 — Camada 1: STATIC PREFLIGHT (sem processos externos, sem rede, sem Docker).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const PROD_REF = 'uoepkwhqztmsjnzirpev';
export const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
export const LINKED_PATH = path.join(REPO_ROOT, 'supabase/.temp/linked-project.json');

export const REQUIRED_MIGRATIONS = [
  '020_app_appointments.sql',
  '021_app_financial_core.sql',
  '022_app_crm_kanban_core.sql',
  '023_app_appointments_financial_crm_rls.sql',
];

export const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
];

const INTEGRATION_SCRIPT = path.join(REPO_ROOT, 'scripts/phase92-local-integration.mjs');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

function readMigrationText(name) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

function envKeysPresent(env = process.env) {
  return FORBIDDEN_ENV_KEYS.filter((key) => {
    const value = env[key];
    return value && String(value).trim();
  });
}

function duplicatePrefixes(files) {
  const counts = {};
  for (const file of files) {
    const prefix = file.slice(0, 3);
    if (!/^\d{3}$/.test(prefix)) continue;
    counts[prefix] = (counts[prefix] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, n]) => n > 1)
    .map(([prefix]) => prefix);
}

function migrationsHaveRemoteRefs() {
  const offenders = [];
  for (const name of REQUIRED_MIGRATIONS) {
    const sql = readMigrationText(name);
    if (sql.includes(PROD_REF)) offenders.push(`${name}:productionRef`);
    if (/postgres(ql)?:\/\/[^\s'"]+/i.test(sql)) offenders.push(`${name}:dbUrl`);
    if (/supabase\.co/i.test(sql) && !/comment/i.test(sql.slice(0, 200))) {
      // allow comments; flag bare host names outside comments loosely
      if (/https?:\/\/[a-z0-9.-]+\.supabase\.co/i.test(sql)) {
        offenders.push(`${name}:supabaseHost`);
      }
    }
  }
  return offenders;
}

function migrationsHaveDestructiveUnauthorized() {
  const offenders = [];
  for (const name of REQUIRED_MIGRATIONS) {
    const sql = readMigrationText(name);
    const lines = sql.split(/\r?\n/).filter((l) => !l.trim().startsWith('--'));
    const active = lines.join('\n');
    if (/\btruncate\b/i.test(active)) offenders.push(`${name}:truncate`);
    if (/\bdrop\s+table\b/i.test(active) && !/\bdrop\s+table\s+if\s+exists\b/i.test(active)) {
      offenders.push(`${name}:dropTableBare`);
    }
  }
  return offenders;
}

function migrationsHaveRealSeed() {
  const offenders = [];
  for (const name of REQUIRED_MIGRATIONS) {
    const sql = readMigrationText(name);
    const lines = sql.split(/\r?\n/).filter((l) => !l.trim().startsWith('--'));
    const active = lines.join('\n');
    if (/\binsert\s+into\b/i.test(active)) offenders.push(name);
  }
  return offenders;
}

function packageHasLocalScript() {
  if (!fs.existsSync(PACKAGE_JSON)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    return Boolean(pkg?.scripts?.['test:supabase:local']);
  } catch {
    return false;
  }
}

/**
 * Static-only preflight. Never spawns processes.
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
export function runStaticPreflight(options = {}) {
  const env = options.env || process.env;
  const files = listMigrationFiles();
  const missing = REQUIRED_MIGRATIONS.filter((f) => !files.includes(f));
  const duplicates = duplicatePrefixes(files);
  const remoteOffenders = missing.length ? [] : migrationsHaveRemoteRefs();
  const destructive = missing.length ? [] : migrationsHaveDestructiveUnauthorized();
  const seeds = missing.length ? [] : migrationsHaveRealSeed();
  const remoteEnv = envKeysPresent(env);
  const configToml = fs.existsSync(path.join(REPO_ROOT, 'supabase/config.toml'));
  const integrationScript = fs.existsSync(INTEGRATION_SCRIPT);
  const localScript = packageHasLocalScript();
  const domainEventsFlagPath = path.join(REPO_ROOT, 'src/domain-events/domainEventFlags.ts');
  const domainEventsPresent = fs.existsSync(domainEventsFlagPath);

  const checks = [
    {
      check: 'MIGRATIONS_DIR_EXISTS',
      result: fs.existsSync(MIGRATIONS_DIR) ? 'PASS' : 'FAIL',
      evidence: MIGRATIONS_DIR,
      blocker: !fs.existsSync(MIGRATIONS_DIR),
    },
    {
      check: 'REQUIRED_MIGRATIONS_020_023',
      result: missing.length === 0 ? 'PASS' : 'FAIL',
      evidence: missing.length ? `missing=${missing.join(',')}` : '020–023 present',
      blocker: missing.length > 0,
    },
    {
      check: 'MIGRATION_ORDER_VALID',
      result: missing.length === 0 ? 'PASS' : 'FAIL',
      evidence: 'required sequence 020→021→022→023',
      blocker: missing.length > 0,
    },
    {
      check: 'NO_DUPLICATE_PREFIXES_020_023',
      result: ['020', '021', '022', '023'].every((p) => !duplicates.includes(p)) ? 'PASS' : 'FAIL',
      evidence: duplicates.length ? `duplicates=${duplicates.join(',')}` : 'no duplicates on 020–023',
      blocker: ['020', '021', '022', '023'].some((p) => duplicates.includes(p)),
    },
    {
      check: 'NO_PRODUCTION_REFERENCE_IN_020_023',
      result: remoteOffenders.length === 0 ? 'PASS' : 'FAIL',
      evidence: remoteOffenders.length ? remoteOffenders.join('|') : `no ${PROD_REF} / remote URL in 020–023`,
      blocker: remoteOffenders.length > 0,
    },
    {
      check: 'NO_REMOTE_DATABASE_URL_IN_ENV',
      result: remoteEnv.length === 0 ? 'PASS' : 'FAIL',
      evidence: remoteEnv.length ? `present=${remoteEnv.join(',')}` : 'forbidden remote env keys absent',
      blocker: remoteEnv.length > 0,
    },
    {
      check: 'NO_REAL_SEED_IN_020_023',
      result: seeds.length === 0 ? 'PASS' : 'FAIL',
      evidence: seeds.length ? `insertIn=${seeds.join(',')}` : 'no INSERT in 020–023 active SQL',
      blocker: seeds.length > 0,
    },
    {
      check: 'NO_UNAUTHORIZED_DESTRUCTIVE_SQL',
      result: destructive.length === 0 ? 'PASS' : 'FAIL',
      evidence: destructive.length ? destructive.join('|') : 'no bare destructive DDL in 020–023',
      blocker: destructive.length > 0,
    },
    {
      check: 'INTEGRATION_SCRIPT_PRESENT',
      result: integrationScript ? 'PASS' : 'FAIL',
      evidence: INTEGRATION_SCRIPT,
      blocker: !integrationScript,
    },
    {
      check: 'PACKAGE_LOCAL_SCRIPT_PRESENT',
      result: localScript ? 'PASS' : 'FAIL',
      evidence: 'package.json scripts["test:supabase:local"]',
      blocker: !localScript,
    },
    {
      check: 'CONFIG_TOML_PRESENT',
      result: configToml ? 'PASS' : 'WARN',
      evidence: configToml ? 'supabase/config.toml exists' : 'missing — required before local supabase start',
      blocker: false,
    },
    {
      check: 'DOMAIN_EVENTS_CQRS_FROZEN_ARTIFACTS',
      result: domainEventsPresent ? 'PASS' : 'WARN',
      evidence: domainEventsPresent
        ? 'domainEventFlags.ts present; Phase 9.2 does not mutate flags/runtime'
        : 'domainEventFlags.ts not found',
      blocker: false,
    },
  ];

  const blockers = checks.filter((c) => c.blocker).map((c) => c.check);
  const status = blockers.length === 0 ? 'STATIC_PREFLIGHT_PASS' : 'STATIC_PREFLIGHT_FAILED';

  return {
    layer: 'STATIC_PREFLIGHT',
    status,
    checks,
    blockers,
    migrationsExecuted: false,
    spawnedProcess: false,
    usedNpx: false,
    usedNetwork: false,
    sqlFileCount: files.length,
  };
}
