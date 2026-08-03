import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isUserAlreadyRegisteredError } from '../../server/email/accessEmailHelpers.js';
import { hasSupabaseAuthPublicClient } from '../../server/email/supabasePublicClient.js';

describe('collaborator invite email helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detecta erro de usuário já registrado no Auth', () => {
    expect(isUserAlreadyRegisteredError({ message: 'User already registered', status: 422 })).toBe(true);
    expect(isUserAlreadyRegisteredError({ code: 'email_exists' })).toBe(true);
    expect(isUserAlreadyRegisteredError({ message: 'Invalid email' })).toBe(false);
  });

  it('hasSupabaseAuthPublicClient exige SUPABASE_URL e anon key', () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_APP_ANON_KEY', '');
    vi.stubEnv('VITE_CONSOLE_SUPABASE_ANON_KEY', '');
    expect(hasSupabaseAuthPublicClient()).toBe(false);

    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_APP_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    expect(hasSupabaseAuthPublicClient()).toBe(true);

    vi.stubEnv('VITE_SUPABASE_APP_ANON_KEY', '');
    vi.stubEnv('VITE_CONSOLE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.console');
    expect(hasSupabaseAuthPublicClient()).toBe(true);
  });
});
