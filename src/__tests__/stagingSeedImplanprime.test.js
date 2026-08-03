import { describe, expect, it } from 'vitest';
import {
  PROD_IMPLANPRIME_TENANT_ID,
  PROD_PROJECT_REF,
  STAGING_PROJECT_REF,
  EXPORT_LEGACY_IDS,
  DIVERGENT_TENANT_USER_COLLABORATOR_IDS,
  assertNewStagingTenantId,
  assertStagingSupabaseUrl,
  buildSeedPlan,
  extractProjectRef,
} from '../../server/lib/stagingSeedImplanprime.js';

describe('stagingSeedImplanprime', () => {
  it('extractProjectRef reconhece staging', () => {
    expect(extractProjectRef(`https://${STAGING_PROJECT_REF}.supabase.co`)).toBe(STAGING_PROJECT_REF);
  });

  it('assertStagingSupabaseUrl aborta produção', () => {
    expect(() => assertStagingSupabaseUrl(`https://${PROD_PROJECT_REF}.supabase.co`))
      .toThrow(/PRODUÇÃO/);
  });

  it('assertStagingSupabaseUrl aceita staging', () => {
    expect(assertStagingSupabaseUrl(`https://${STAGING_PROJECT_REF}.supabase.co`))
      .toBe(STAGING_PROJECT_REF);
  });

  it('assertNewStagingTenantId bloqueia UUID produção Implanprime', () => {
    expect(() => assertNewStagingTenantId(PROD_IMPLANPRIME_TENANT_ID))
      .toThrow(/produção Implanprime/);
  });

  it('buildSeedPlan monta cenário alinhado e divergente', () => {
    const plan = buildSeedPlan({ tenantId: '11111111-1111-4111-8111-111111111111' });

    const paulo = plan.users.find((u) => u.key === 'paulo');
    const melissa = plan.users.find((u) => u.key === 'melissa');
    const juliana = plan.users.find((u) => u.key === 'juliana');
    const renata = plan.users.find((u) => u.key === 'renata');

    expect(paulo.collaborator_id).toBe(EXPORT_LEGACY_IDS.paulo);
    expect(melissa.collaborator_id).toBe(EXPORT_LEGACY_IDS.melissa);
    expect(juliana.collaborator_id).toBe(DIVERGENT_TENANT_USER_COLLABORATOR_IDS.juliana);
    expect(renata.collaborator_id).toBe(DIVERGENT_TENANT_USER_COLLABORATOR_IDS.renata);
    expect(juliana.export_legacy_id).toBe(EXPORT_LEGACY_IDS.juliana);
    expect(renata.export_legacy_id).toBe(EXPORT_LEGACY_IDS.renata);

    expect(plan.users.every((u) => u.email.endsWith('@implanprime.test'))).toBe(true);
    expect(plan.users.every((u) => u.collaborator_uuid === null)).toBe(true);
    expect(plan.invitations).toHaveLength(3);
    expect(plan.summary.auth_users).toBe(4);
  });
});
