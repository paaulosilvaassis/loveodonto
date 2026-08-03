/**
 * Session bridge Platform → App (mesmo projeto) — testes unitários sem rede.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSupabaseSessionBridgeForTests,
  areClientsSameSupabaseProject,
  clearAppClientSessionIfSameProject,
  extractSupabaseProjectRefFromUrl,
  propagatePlatformSessionToAppClient,
  startSupabaseSessionBridge,
} from '../lib/supabaseSessionBridge.js';

function makeClient(url, { session = null, setSessionImpl, signOutImpl, onAuth } = {}) {
  return {
    supabaseUrl: url,
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      setSession: vi.fn(async (payload) => {
        if (setSessionImpl) return setSessionImpl(payload);
        return { data: { session: payload }, error: null };
      }),
      signOut: vi.fn(async () => {
        if (signOutImpl) return signOutImpl();
        return { error: null };
      }),
      onAuthStateChange: vi.fn((cb) => {
        if (onAuth) onAuth(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  };
}

describe('supabaseSessionBridge', () => {
  beforeEach(() => {
    __resetSupabaseSessionBridgeForTests();
  });

  it('extractSupabaseProjectRefFromUrl lê o ref do host', () => {
    expect(extractSupabaseProjectRefFromUrl('https://uoepkwhqztmsjnzirpev.supabase.co')).toBe(
      'uoepkwhqztmsjnzirpev',
    );
    expect(extractSupabaseProjectRefFromUrl('https://tckdjyunwmdpqmewrwvt.supabase.co')).toBe(
      'tckdjyunwmdpqmewrwvt',
    );
  });

  it('areClientsSameSupabaseProject exige mesmo ref', () => {
    const prodA = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    const prodB = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    const staging = makeClient('https://tckdjyunwmdpqmewrwvt.supabase.co');
    expect(areClientsSameSupabaseProject(prodA, prodB)).toBe(true);
    expect(areClientsSameSupabaseProject(prodA, staging)).toBe(false);
  });

  it('não sincroniza tokens entre projetos diferentes', async () => {
    const platform = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co', {
      session: { access_token: 'a', refresh_token: 'r' },
    });
    const app = makeClient('https://tckdjyunwmdpqmewrwvt.supabase.co');
    const result = await propagatePlatformSessionToAppClient({
      platformClient: platform,
      appClient: app,
      reason: 'test',
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('different_project');
    expect(app.auth.setSession).not.toHaveBeenCalled();
  });

  it('sincroniza setSession quando mesmo projeto e sessão válida', async () => {
    const session = { access_token: 'tok-1', refresh_token: 'ref-1' };
    const platform = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co', { session });
    const app = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    const result = await propagatePlatformSessionToAppClient({
      platformClient: platform,
      appClient: app,
      session,
      reason: 'test',
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(app.auth.setSession).toHaveBeenCalledWith({
      access_token: 'tok-1',
      refresh_token: 'ref-1',
    });
  });

  it('é idempotente para o mesmo access_token', async () => {
    const session = { access_token: 'tok-2', refresh_token: 'ref-2' };
    const platform = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co', { session });
    const app = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    await propagatePlatformSessionToAppClient({
      platformClient: platform,
      appClient: app,
      session,
      reason: 'first',
    });
    const second = await propagatePlatformSessionToAppClient({
      platformClient: platform,
      appClient: app,
      session,
      reason: 'second',
    });
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_synced');
    expect(app.auth.setSession).toHaveBeenCalledTimes(1);
  });

  it('startSupabaseSessionBridge ignora hosts divergentes', () => {
    const platform = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    const app = makeClient('https://tckdjyunwmdpqmewrwvt.supabase.co');
    const started = startSupabaseSessionBridge({ platformClient: platform, appClient: app });
    expect(started.skipped).toBe(true);
    expect(platform.auth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('clearAppClientSessionIfSameProject faz signOut local no app', async () => {
    const platform = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    const app = makeClient('https://uoepkwhqztmsjnzirpev.supabase.co');
    await clearAppClientSessionIfSameProject({
      platformClient: platform,
      appClient: app,
      reason: 'test',
    });
    expect(app.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
