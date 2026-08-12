/**
 * PHASE_SECURITY_02B — pre-apply regression for clinic-logos enumeration fix.
 * Não aplica migration; valida o SQL proposto e invariantes do repo (OPTION_B).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const MIGRATION_038 = resolve(
  MIGRATIONS_DIR,
  '038_clinic_logos_storage_enumeration_security_fix.sql',
);
const MIGRATION_013 = resolve(MIGRATIONS_DIR, '013_clinic_logos_storage.sql');
const MIGRATION_036 = resolve(MIGRATIONS_DIR, '036_app_package_manifest_foundation.sql');
const MIGRATION_037 = resolve(MIGRATIONS_DIR, '037_platform_billing_rls_security_fix.sql');
const AUDIT_02A = resolve(
  ROOT,
  'docs/reports/PHASE_SECURITY_02A_CLINIC_LOGOS_STORAGE_SECURITY_AUDIT.md',
);
const UPLOAD_SVC = resolve(ROOT, 'src/services/clinicLogoUploadService.js');
const LOGO_UTILS = resolve(ROOT, 'src/utils/clinicLogo.js');
const HOOK = resolve(ROOT, 'src/hooks/useClinicLogo.js');
const LAYOUT = resolve(ROOT, 'src/components/Layout.jsx');
const CONTRACT_TPL = resolve(
  ROOT,
  'src/components/clinical/contract/professionalContractTemplate.js',
);
const DOCS_SECTION = resolve(ROOT, 'src/components/clinical/DocumentsSection.jsx');
const ROLLOUT_FLAGS = resolve(
  ROOT,
  'src/domain/contracts/rollout/contracts-operational-rollout-flags.ts',
);

function read(path) {
  return readFileSync(path, 'utf8');
}

function selectPolicyBlock(sql) {
  const m = sql.match(
    /create policy clinic_logos_storage_select[\s\S]*?;/i,
  );
  return m ? m[0] : '';
}

describe('PHASE_SECURITY_02B — clinic-logos enumeration remediation (pre-apply)', () => {
  it('migration 038 existe, é aditiva e NÃO deve ser considerada aplicada', () => {
    expect(existsSync(MIGRATION_038)).toBe(true);
    const sql = read(MIGRATION_038);
    expect(sql).toMatch(/NÃO APLICAR|DO NOT APPLY/i);
    expect(sql).toContain('PHASE_SECURITY_02B');
    expect(sql).toContain('OPTION_B');
    // Não edita 013 histórica
    expect(existsSync(MIGRATION_013)).toBe(true);
    expect(read(MIGRATION_013)).toMatch(
      /for select using \(\s*bucket_id = 'clinic-logos'\s*\)/i,
    );
  });

  it('1 — migration NÃO torna bucket private', () => {
    const sql = read(MIGRATION_038);
    expect(sql).toMatch(/public\s*=\s*true/i);
    expect(sql).not.toMatch(/public\s*=\s*false/i);
    expect(sql).toMatch(/on conflict \(id\) do update set public = true/i);
  });

  it('2 — policy SELECT vulnerável é removida/substituída', () => {
    const sql = read(MIGRATION_038);
    expect(sql).toMatch(
      /drop policy if exists clinic_logos_storage_select on storage\.objects/i,
    );
    expect(sql).toMatch(
      /create policy clinic_logos_storage_select on storage\.objects/i,
    );
  });

  it('3 — anon não possui policy SELECT irrestrita na 038', () => {
    const block = selectPolicyBlock(read(MIGRATION_038));
    expect(block).toBeTruthy();
    expect(block).toMatch(/to authenticated/i);
    expect(block).not.toMatch(/to\s+anon/i);
    expect(block).not.toMatch(/to\s+public/i);
    // Não recria o USING aberto da 013
    expect(block).not.toMatch(
      /using\s*\(\s*bucket_id\s*=\s*'clinic-logos'\s*\)\s*;/i,
    );
  });

  it('4 — authenticated LIST/SELECT é tenant-scoped', () => {
    const block = selectPolicyBlock(read(MIGRATION_038));
    expect(block).toMatch(/to authenticated/i);
    // Prod helper is uuid; cast alinhado às writes live (INSERT/UPDATE/DELETE).
    expect(block).toMatch(
      /app_user_can_access_tenant\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/i,
    );
    expect(block).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it('5–7 — INSERT/UPDATE/DELETE da 013 permanecem tenant-scoped (038 não enfraquece)', () => {
    const sql013 = read(MIGRATION_013);
    const sql038 = read(MIGRATION_038);

    for (const name of [
      'clinic_logos_storage_insert',
      'clinic_logos_storage_update',
      'clinic_logos_storage_delete',
    ]) {
      expect(sql013).toContain(name);
      expect(sql013).toMatch(
        new RegExp(
          `${name}[\\s\\S]*app_user_can_access_tenant\\(\\(storage\\.foldername\\(name\\)\\)\\[1\\]\\)`,
          'i',
        ),
      );
      // 038 não dropa writes (menor correção)
      expect(sql038).not.toMatch(
        new RegExp(`drop policy if exists ${name}`, 'i'),
      );
    }
  });

  it('8 — known-object public GET permanece arquitetura (bucket public + getPublicUrl)', () => {
    const sql = read(MIGRATION_038);
    expect(sql).toMatch(/public = true/i);
    expect(sql).toMatch(/GET \/object\/public|known-object|bucket\.public/i);

    const upload = read(UPLOAD_SVC);
    expect(upload).toContain("getPublicUrl");
    expect(upload).toContain("clinic-logos");
    expect(upload).not.toMatch(/createSignedUrl/);
  });

  it('9 — logo_url não muda (038 não toca clinic_profiles)', () => {
    // Comentários podem citar clinic_profiles.logo_url; o SQL executável não.
    const executable = read(MIGRATION_038)
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/clinic_profiles/i);
    expect(executable).not.toMatch(/logo_url/i);
    expect(executable).not.toMatch(/update\s+storage\.objects/i);
    expect(executable).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(executable).not.toMatch(/alter\s+table/i);
  });

  it('10 — sidebar não exige signed URL', () => {
    expect(read(LAYOUT)).toContain('useClinicLogo');
    const hook = read(HOOK);
    expect(hook).toContain('getClinicLogo');
    expect(hook).not.toMatch(/createSignedUrl/);
    const utils = read(LOGO_UTILS);
    expect(utils).toContain('logo_url');
    expect(utils).toContain('logoUrl');
    expect(utils).not.toMatch(/createSignedUrl/);
  });

  it('11 — contracts/PDF/TCLE/documentos continuam URL pública (img src)', () => {
    const contract = read(CONTRACT_TPL);
    expect(contract).toMatch(/clinic\.logoUrl/);
    expect(contract).toMatch(/<img[^>]+src=/);
    expect(contract).not.toMatch(/createSignedUrl/);

    const docs = read(DOCS_SECTION);
    expect(docs).toContain('getClinicLogo');
    expect(docs).toMatch(/clinicLogo/);
  });

  it('12 — migration 036 intacta', () => {
    expect(existsSync(MIGRATION_036)).toBe(true);
    const sql036 = read(MIGRATION_036);
    expect(sql036).toContain('app_package_manifests');
    expect(sql036).toMatch(/NÃO APLICAR|DO NOT APPLY/i);
    const sql038 = read(MIGRATION_038);
    expect(sql038).not.toContain('app_package_manifests');
    expect(sql038).not.toMatch(/036_app_package_manifest/);
  });

  it('13 — contracts rollout intacto (flags de domínio presentes)', () => {
    const flags = read(ROLLOUT_FLAGS);
    expect(flags).toContain('contracts_operational_ux_global_enabled');
    expect(flags).toContain('contracts_operational_ux_enabled');
    const sql038 = read(MIGRATION_038);
    expect(sql038).not.toMatch(/feature_flags/i);
    expect(sql038).not.toMatch(/contracts_operational_ux/i);
  });

  it('número 038 é o próximo livre após 037 (sem colisão)', () => {
    expect(existsSync(MIGRATION_037)).toBe(true);
    const names = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(names).toContain('038_clinic_logos_storage_enumeration_security_fix.sql');
    const collisions = names.filter((f) => /^038_/.test(f));
    expect(collisions).toEqual([
      '038_clinic_logos_storage_enumeration_security_fix.sql',
    ]);
  });

  it('038 não usa USING(true) / WITH CHECK(true) / wildcard aberto', () => {
    const sql = read(MIGRATION_038);
    const policyBlocks = sql.match(/create policy[\s\S]*?;/gi) || [];
    expect(policyBlocks.length).toBe(1);
    for (const block of policyBlocks) {
      expect(block).not.toMatch(/using\s*\(\s*true\s*\)/i);
      expect(block).not.toMatch(/with\s+check\s*\(\s*true\s*\)/i);
    }
  });

  it('audit 02A OPTION_B referenciada e path canônico preservado no upload', () => {
    expect(existsSync(AUDIT_02A)).toBe(true);
    expect(read(AUDIT_02A)).toMatch(/OPTION_B/);
    const upload = read(UPLOAD_SVC);
    expect(upload).toMatch(/\$\{tid\}\/logo\.\$\{ext\}/);
  });
});
