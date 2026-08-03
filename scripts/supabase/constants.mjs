/**
 * Phase 9.2A — constantes e auditoria do link remoto (somente leitura FS).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
export const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
export const LOCAL_PROJECT_ID = 'love-odonto-local-disposable';

export const APP_SUPABASE_DIR = path.join(REPO_ROOT, 'supabase');
export const LINKED_PROJECT_PATH = path.join(APP_SUPABASE_DIR, '.temp', 'linked-project.json');
export const PROJECT_REF_PATH = path.join(APP_SUPABASE_DIR, '.temp', 'project-ref');
export const ISOLATED_DIR = path.join(REPO_ROOT, 'supabase-local');
/** Legacy Phase 9.2A paths (kept for compatibility / bootstrap source). */
export const ISOLATED_CONFIG = path.join(ISOLATED_DIR, 'config.toml');
export const ISOLATED_MIGRATIONS = path.join(ISOLATED_DIR, 'migrations');
/**
 * Supabase CLI 2.x layout when cwd/workdir = supabase-local/:
 *   supabase-local/supabase/config.toml
 *   supabase-local/supabase/migrations/
 */
export const ISOLATED_CLI_SUPABASE_DIR = path.join(ISOLATED_DIR, 'supabase');
export const ISOLATED_CLI_CONFIG = path.join(ISOLATED_CLI_SUPABASE_DIR, 'config.toml');
export const ISOLATED_CLI_MIGRATIONS = path.join(ISOLATED_CLI_SUPABASE_DIR, 'migrations');
export const APP_MIGRATIONS = path.join(APP_SUPABASE_DIR, 'migrations');
export const LOCAL_BOOTSTRAP_MIGRATION = '000_local_bootstrap_tenants.sql';

export const INTEGRATION_OPT_IN = 'RUN_SUPABASE_LOCAL_INTEGRATION';
export const LOCAL_CONFIRMATION_ENV = 'LOVE_ODONTO_LOCAL_DB_CONFIRMATION';
export const LOCAL_CONFIRMATION_VALUE = 'LOCAL_DISPOSABLE_ONLY';

export const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
];

export const FORBIDDEN_COMMAND_TOKENS = [
  'link',
  'db push',
  'dbpush',
  'projects',
  'secrets',
  'functions deploy',
  'migration repair',
  '--linked',
];

export const ALLOWED_LOCAL_COMMANDS = new Set([
  '--version',
  'start',
  'status',
  'stop',
  'db reset',
  'db query',
]);

export function readLinkedProjectMeta() {
  if (!fs.existsSync(LINKED_PROJECT_PATH)) {
    return { present: false, path: LINKED_PROJECT_PATH, data: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(LINKED_PROJECT_PATH, 'utf8'));
    return { present: true, path: LINKED_PROJECT_PATH, data };
  } catch {
    return { present: true, path: LINKED_PROJECT_PATH, data: { ref: 'unreadable' } };
  }
}

export function readProjectRefFile() {
  if (!fs.existsSync(PROJECT_REF_PATH)) {
    return { present: false, path: PROJECT_REF_PATH, ref: null };
  }
  const ref = fs.readFileSync(PROJECT_REF_PATH, 'utf8').trim();
  return { present: true, path: PROJECT_REF_PATH, ref };
}

/**
 * Auditoria estática do link remoto — não remove nem altera metadata.
 */
export function auditRemoteLinkArtifacts() {
  const linked = readLinkedProjectMeta();
  const projectRef = readProjectRefFile();
  const artifacts = [
    {
      artifact: 'linked-project.json',
      path: linked.path,
      projectRef: linked.data?.ref || null,
      isRemote: Boolean(linked.data?.ref),
      usedBy: 'supabase CLI link metadata (.temp)',
      risk: linked.present
        ? 'HIGH — default workdir supabase/ could target staging/remote'
        : 'none',
    },
    {
      artifact: 'project-ref',
      path: projectRef.path,
      projectRef: projectRef.ref,
      isRemote: Boolean(projectRef.ref),
      usedBy: 'supabase CLI .temp project-ref',
      risk: projectRef.present ? 'HIGH' : 'none',
    },
    {
      artifact: 'supabase/config.toml (app)',
      path: path.join(APP_SUPABASE_DIR, 'config.toml'),
      projectRef: null,
      isRemote: false,
      usedBy: 'default CLI workdir',
      risk: fs.existsSync(path.join(APP_SUPABASE_DIR, 'config.toml'))
        ? 'MEDIUM — must not contain remote refs'
        : 'LOW — absent; isolated config preferred',
    },
    {
      artifact: 'supabase-local/config.toml',
      path: ISOLATED_CONFIG,
      projectRef: LOCAL_PROJECT_ID,
      isRemote: false,
      usedBy: 'Phase 9.2A legacy isolated config (mirrored to CLI path)',
      risk: 'LOW — disposable local label only',
    },
    {
      artifact: 'supabase-local/supabase/config.toml',
      path: ISOLATED_CLI_CONFIG,
      projectRef: LOCAL_PROJECT_ID,
      isRemote: false,
      usedBy: 'Phase 9.2E Supabase CLI 2.x layout (cwd=supabase-local)',
      risk: 'LOW — disposable local label only',
    },
  ];

  return {
    stagingRef: STAGING_REF,
    productionRef: PRODUCTION_REF,
    linkedPresent: linked.present,
    linkedRef: linked.data?.ref || null,
    linkedName: linked.data?.name || null,
    linkedPreserved: true,
    artifacts,
    isolationStrategy: 'OPTION_1_ISOLATED_WORKDIR',
    isolationDir: ISOLATED_DIR,
  };
}
