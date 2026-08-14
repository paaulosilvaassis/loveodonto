/**
 * PHASE_10.21AH — static guards for production private storage migration 040.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContractStoragePathBuilder } from '../domain/contracts/files/contract-storage-path.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MIG_040 = path.join(ROOT, 'supabase/migrations/040_app_contract_private_storage_production.sql');
const STORAGE_ADAPTER = path.join(ROOT, 'src/domain/contracts/files/supabase-contract-private-storage.ts');

describe('PHASE_10.21AH production private storage (STATIC)', () => {
  it('040 creates production bucket only (not staging/local)', () => {
    const sql = fs.readFileSync(MIG_040, 'utf8');
    expect(sql).toContain("'contracts-v2-private-production'");
    expect(sql).toContain('public = false');
    expect(sql).not.toMatch(/insert into storage\.buckets[\s\S]{0,400}'contracts-v2-private-staging'/);
    expect(sql).not.toMatch(/insert into storage\.buckets[\s\S]{0,400}'contracts-v2-private-local'/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).toMatch(/for select/);
    expect(sql).toMatch(/app_user_can_access_tenant/);
  });

  it('canonical path is tenants/{tenantId}/contracts/.../versions/...', () => {
    const pathStr = createContractStoragePathBuilder().build({
      tenantId: 'b721c2c9-d924-41ee-8911-dc00c8208326',
      contractId: 'contract-1',
      versionId: 'version-1',
      fileType: 'GENERATED_PDF',
      fileId: 'file-1',
      mimeType: 'application/pdf',
    });
    expect(pathStr.startsWith('tenants/b721c2c9-d924-41ee-8911-dc00c8208326/contracts/')).toBe(true);
    expect(pathStr).toContain('/versions/');
    expect(pathStr).not.toContain('..');
  });

  it('public signature must not use a public bucket; adapter uses signed URL', () => {
    const adapter = fs.readFileSync(STORAGE_ADAPTER, 'utf8');
    expect(adapter).toContain('createSignedUrl');
    expect(adapter).not.toMatch(/getPublicUrl/);
  });
});
