import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  PROD_PROJECT_REF,
  STAGING_PROJECT_REF,
  extractSupabaseProjectRef,
  isProductionSupabaseProject,
  isQaToolsRouteEnabled,
  isStagingSupabaseProject,
} from '../config/qaToolsGuard.js';

describe('qaToolsGuard', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv);
  });

  it('extractSupabaseProjectRef parseia host staging', () => {
    expect(extractSupabaseProjectRef(`https://${STAGING_PROJECT_REF}.supabase.co`))
      .toBe(STAGING_PROJECT_REF);
  });

  it('bloqueia produção via project ref', () => {
    import.meta.env.VITE_SUPABASE_APP_URL = `https://${PROD_PROJECT_REF}.supabase.co`;
    import.meta.env.PROD = true;
    import.meta.env.DEV = false;
    expect(isProductionSupabaseProject()).toBe(true);
    expect(isQaToolsRouteEnabled()).toBe(false);
  });

  it('permite DEV mesmo sem staging ref explícito', () => {
    import.meta.env.VITE_SUPABASE_APP_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
    import.meta.env.PROD = false;
    import.meta.env.DEV = true;
    expect(isQaToolsRouteEnabled()).toBe(true);
  });

  it('permite build staging com ref staging', () => {
    import.meta.env.VITE_SUPABASE_APP_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
    import.meta.env.PROD = true;
    import.meta.env.DEV = false;
    expect(isStagingSupabaseProject()).toBe(true);
    expect(isQaToolsRouteEnabled()).toBe(true);
  });
});
