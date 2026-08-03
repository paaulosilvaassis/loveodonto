/**
 * Phase 9.2A/E/H — isolamento do workdir local.
 *
 * Fonte canônica:
 *   - App SQL: supabase/migrations/*.sql
 *   - Bootstrap local-only: supabase-local/migrations/000_local_bootstrap_tenants.sql
 *   - Config: supabase-local/config.toml
 *
 * Espelho CLI (Supabase CLI 2.x, cwd=supabase-local):
 *   - supabase-local/supabase/migrations/  (reconstruído deterministicamente)
 *   - supabase-local/supabase/config.toml
 *
 * Sem symlinks. Windows + Mac. Não toca linked-project.json do app.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_MIGRATIONS,
  ISOLATED_CLI_CONFIG,
  ISOLATED_CLI_MIGRATIONS,
  ISOLATED_CLI_SUPABASE_DIR,
  ISOLATED_CONFIG,
  ISOLATED_DIR,
  ISOLATED_MIGRATIONS,
  LOCAL_BOOTSTRAP_MIGRATION,
  LOCAL_PROJECT_ID,
  LINKED_PROJECT_PATH,
  readLinkedProjectMeta,
} from './constants.mjs';

function parseConfigText(text, configPath) {
  const remoteRefs = [];
  if (/tckdjyunwmdpqmewrwvt/.test(text)) remoteRefs.push('staging');
  if (/uoepkwhqztmsjnzirpev/.test(text)) remoteRefs.push('production');
  if (/https?:\/\/[a-z0-9.-]+\.supabase\.co/i.test(text)) remoteRefs.push('supabaseHost');
  if (/service_role|eyJ[a-zA-Z0-9_-]{10,}\./i.test(text)) remoteRefs.push('possibleSecret');

  const projectIdMatch = text.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  const projectId = projectIdMatch?.[1] || null;
  const localOk = projectId === LOCAL_PROJECT_ID && remoteRefs.length === 0;

  return {
    present: true,
    status: localOk ? 'CONFIG_LOCAL_OK' : remoteRefs.length ? 'CONFIG_HAS_REMOTE' : 'CONFIG_UNEXPECTED_PROJECT_ID',
    projectId,
    remoteRefs,
    path: configPath,
  };
}

function readConfigSnippet() {
  const candidates = [ISOLATED_CLI_CONFIG, ISOLATED_CONFIG];
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    return parseConfigText(fs.readFileSync(configPath, 'utf8'), configPath);
  }
  return { present: false, status: 'CONFIG_MISSING', remoteRefs: [], path: ISOLATED_CONFIG };
}

/** Cópia de arquivo sem symlink/junction (Windows + Mac). */
export function copyFileNoLink(source, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  // Evita hardlink/APFS clone compartilhado: regrava conteúdo.
  const bytes = fs.readFileSync(source);
  fs.writeFileSync(dest, bytes);
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function listSqlNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Manifesto canônico esperado no espelho CLI:
 *   APP migrations + bootstrap local 000_*.
 */
export function buildCanonicalMigrationManifest() {
  const files = [];
  const errors = [];

  if (!fs.existsSync(APP_MIGRATIONS)) {
    errors.push('APP_MIGRATIONS_MISSING');
  } else {
    for (const name of listSqlNames(APP_MIGRATIONS)) {
      const abs = path.join(APP_MIGRATIONS, name);
      files.push({
        name,
        source: abs,
        origin: 'app',
        sha256: sha256File(abs),
      });
    }
  }

  const bootstrapAbs = path.join(ISOLATED_MIGRATIONS, LOCAL_BOOTSTRAP_MIGRATION);
  if (!fs.existsSync(bootstrapAbs)) {
    errors.push('BOOTSTRAP_MISSING');
  } else {
    files.push({
      name: LOCAL_BOOTSTRAP_MIGRATION,
      source: bootstrapAbs,
      origin: 'local_bootstrap',
      sha256: sha256File(bootstrapAbs),
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, errors, count: files.length };
}

/**
 * Remove apenas o conteúdo SQL do espelho CLI (descartável).
 * Preserva .gitkeep e não toca .temp / fixtures / linked remoto.
 */
export function wipeCliMigrationsMirror() {
  fs.mkdirSync(ISOLATED_CLI_MIGRATIONS, { recursive: true });
  const removed = [];
  for (const name of fs.readdirSync(ISOLATED_CLI_MIGRATIONS)) {
    if (name === '.gitkeep') continue;
    const abs = path.join(ISOLATED_CLI_MIGRATIONS, name);
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || st.isFile()) {
      fs.unlinkSync(abs);
      removed.push(name);
    } else if (st.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
      removed.push(`${name}/`);
    }
  }
  return removed;
}

/**
 * Phase 9.2H — reconstrução determinística do espelho CLI + refresh legacy.
 * Sempre sobrescreve. Nunca preserva cópia stale.
 */
export function ensureIsolatedMigrationsLayout() {
  fs.mkdirSync(ISOLATED_MIGRATIONS, { recursive: true });
  fs.mkdirSync(ISOLATED_CLI_SUPABASE_DIR, { recursive: true });

  const linked = [];
  const errors = [];
  const canonical = buildCanonicalMigrationManifest();
  errors.push(...canonical.errors);

  // 1) Config legacy → CLI
  let configSynced = false;
  if (fs.existsSync(ISOLATED_CONFIG)) {
    try {
      copyFileNoLink(ISOLATED_CONFIG, ISOLATED_CLI_CONFIG);
      configSynced = true;
      linked.push({ file: 'config.toml', dest: ISOLATED_CLI_CONFIG, mode: 'copied' });
    } catch (err) {
      errors.push(`config.toml@cli:${err.message}`);
    }
  } else {
    errors.push('LEGACY_CONFIG_MISSING');
  }

  // 2) Wipe + rebuild CLI migrations from canonical sources
  const wiped = wipeCliMigrationsMirror();
  linked.push({ file: '_cli_migrations_wipe', mode: 'wiped', removed: wiped });

  for (const entry of canonical.files) {
    try {
      const cliDest = path.join(ISOLATED_CLI_MIGRATIONS, entry.name);
      copyFileNoLink(entry.source, cliDest);
      linked.push({ file: entry.name, dest: cliDest, mode: 'copied_to_cli', origin: entry.origin });

      // Legacy mirror (compat): app files refresh; bootstrap is the source itself — skip self-copy.
      if (entry.origin === 'app') {
        const legacyDest = path.join(ISOLATED_MIGRATIONS, entry.name);
        copyFileNoLink(entry.source, legacyDest);
        linked.push({ file: entry.name, dest: legacyDest, mode: 'copied_to_legacy', origin: entry.origin });
      }
    } catch (err) {
      errors.push(`${entry.name}:${err.message}`);
    }
  }

  const checksum = verifyIsolatedMigrationChecksums();
  if (checksum.status !== 'ISOLATED_MIGRATION_CHECKSUM_OK') {
    errors.push(checksum.status);
  }

  const cliMigrationCount = listSqlNames(ISOLATED_CLI_MIGRATIONS).length;
  const legacyMigrationCount = listSqlNames(ISOLATED_MIGRATIONS).length;
  const bootstrapLegacy = path.join(ISOLATED_MIGRATIONS, LOCAL_BOOTSTRAP_MIGRATION);
  const bootstrapCli = path.join(ISOLATED_CLI_MIGRATIONS, LOCAL_BOOTSTRAP_MIGRATION);

  return {
    isolatedDir: ISOLATED_DIR,
    migrationsDir: ISOLATED_MIGRATIONS,
    cliSupabaseDir: ISOLATED_CLI_SUPABASE_DIR,
    cliMigrationsDir: ISOLATED_CLI_MIGRATIONS,
    cliConfigPath: ISOLATED_CLI_CONFIG,
    legacyConfigPath: ISOLATED_CONFIG,
    canonicalSource: {
      appMigrations: APP_MIGRATIONS,
      bootstrap: bootstrapLegacy,
    },
    configSynced,
    appMigrationCount: canonical.files.filter((f) => f.origin === 'app').length,
    legacyMigrationCount,
    cliMigrationCount,
    linkedCount: linked.length,
    linked,
    errors,
    wiped,
    checksum,
    bootstrapPresent: fs.existsSync(bootstrapLegacy) || fs.existsSync(bootstrapCli),
    bootstrapPresentLegacy: fs.existsSync(bootstrapLegacy),
    bootstrapPresentCli: fs.existsSync(bootstrapCli),
    linkedProjectUntouched: fs.existsSync(LINKED_PROJECT_PATH)
      ? readLinkedProjectMeta().present
      : true,
  };
}

/**
 * Compara fonte canônica × espelho CLI (nomes + SHA-256).
 * Status: ISOLATED_MIGRATION_CHECKSUM_OK | ISOLATED_MIGRATION_CHECKSUM_MISMATCH
 */
export function verifyIsolatedMigrationChecksums() {
  const canonical = buildCanonicalMigrationManifest();
  const mismatches = [];
  const missing = [];
  const unexpected = [];

  if (canonical.errors.length) {
    return {
      status: 'ISOLATED_MIGRATION_CHECKSUM_MISMATCH',
      reason: 'CANONICAL_INCOMPLETE',
      canonicalErrors: canonical.errors,
      mismatches,
      missing,
      unexpected,
      canonicalCount: canonical.count,
      cliCount: listSqlNames(ISOLATED_CLI_MIGRATIONS).length,
    };
  }

  const cliNames = new Set(listSqlNames(ISOLATED_CLI_MIGRATIONS));
  const canonicalNames = new Set(canonical.files.map((f) => f.name));

  for (const entry of canonical.files) {
    const cliPath = path.join(ISOLATED_CLI_MIGRATIONS, entry.name);
    if (!fs.existsSync(cliPath)) {
      missing.push(entry.name);
      continue;
    }
    const cliHash = sha256File(cliPath);
    if (cliHash !== entry.sha256) {
      mismatches.push({
        name: entry.name,
        canonical: entry.sha256,
        cli: cliHash,
      });
    }
  }

  for (const name of cliNames) {
    if (!canonicalNames.has(name)) unexpected.push(name);
  }

  const ok = missing.length === 0 && mismatches.length === 0 && unexpected.length === 0
    && canonical.count === cliNames.size;

  return {
    status: ok ? 'ISOLATED_MIGRATION_CHECKSUM_OK' : 'ISOLATED_MIGRATION_CHECKSUM_MISMATCH',
    canonicalCount: canonical.count,
    cliCount: cliNames.size,
    missing,
    mismatches,
    unexpected,
    files: canonical.files.map((f) => ({ name: f.name, sha256: f.sha256, origin: f.origin })),
  };
}

export function evaluateIsolation(env = process.env) {
  void env;
  const config = readConfigSnippet();
  const linkedMeta = readLinkedProjectMeta();
  const layout = {
    isolatedDirExists: fs.existsSync(ISOLATED_DIR),
    legacyMigrationsExists: fs.existsSync(ISOLATED_MIGRATIONS),
    cliMigrationsExists: fs.existsSync(ISOLATED_CLI_MIGRATIONS),
    cliConfigExists: fs.existsSync(ISOLATED_CLI_CONFIG),
    config,
  };

  return {
    strategy: 'OPTION_1_ISOLATED_WORKDIR',
    workdir: ISOLATED_DIR,
    cliLayout: {
      supabaseDir: ISOLATED_CLI_SUPABASE_DIR,
      config: ISOLATED_CLI_CONFIG,
      migrations: ISOLATED_CLI_MIGRATIONS,
    },
    legacyLayout: {
      config: ISOLATED_CONFIG,
      migrations: ISOLATED_MIGRATIONS,
    },
    neverUseDefaultSupabaseWorkdirForDryRun: true,
    appLinkedMetadataPath: linkedMeta.path,
    appLinkedMetadataPresent: linkedMeta.present,
    appLinkedRef: linkedMeta.data?.ref || null,
    metadataRemovalForbidden: true,
    config,
    layout,
    status: config.status === 'CONFIG_LOCAL_OK' && layout.isolatedDirExists
      ? 'ISOLATION_READY'
      : 'ISOLATION_INCOMPLETE',
  };
}
