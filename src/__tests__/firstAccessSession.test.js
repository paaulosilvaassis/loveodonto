import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetFirstAccessSessionForTests,
  buildPrimeiroAcessoPathWithAuth,
  captureAuthCallbackFromUrl,
  classifyFirstAccessError,
  hasSupabaseAuthCallback,
  isAbortError,
  parseAuthCallbackFromUrl,
  resolvePrimeiroAcessoRedirect,
} from '../utils/firstAccessSession.js';

describe('firstAccessSession', () => {
  beforeEach(() => {
    __resetFirstAccessSessionForTests();
  });

  it('detecta tokens no hash', () => {
    const parsed = parseAuthCallbackFromUrl({
      href: 'https://loveodonto.com.br/primeiro-acesso#access_token=abc&refresh_token=def&type=invite',
      search: '',
      hash: '#access_token=abc&refresh_token=def&type=invite',
    });
    expect(parsed.accessToken).toBe('abc');
    expect(parsed.refreshToken).toBe('def');
    expect(parsed.type).toBe('invite');
    expect(hasSupabaseAuthCallback({
      href: parsed.href,
      search: parsed.search,
      hash: parsed.hash,
    })).toBe(true);
  });

  it('detecta PKCE code na query', () => {
    const parsed = parseAuthCallbackFromUrl({
      href: 'https://loveodonto.com.br/primeiro-acesso?code=pkce-code',
      search: '?code=pkce-code',
      hash: '',
    });
    expect(parsed.code).toBe('pkce-code');
    expect(buildPrimeiroAcessoPathWithAuth({
      href: parsed.href,
      search: parsed.search,
      hash: parsed.hash,
    })).toBe('/primeiro-acesso?code=pkce-code');
  });

  it('preserva hash ao montar rota de primeiro acesso', () => {
    const path = buildPrimeiroAcessoPathWithAuth({
      href: 'https://loveodonto.com.br/aceitar-termos?token=x#access_token=a&refresh_token=b',
      search: '?token=x',
      hash: '#access_token=a&refresh_token=b',
    });
    expect(path).toBe('/primeiro-acesso#access_token=a&refresh_token=b');
  });

  it('retorna null sem callback Supabase', () => {
    expect(buildPrimeiroAcessoPathWithAuth({
      href: 'https://loveodonto.com.br/aceitar-termos?token=x',
      search: '?token=x',
      hash: '',
    })).toBeNull();
  });

  it('redireciona /login com hash para /primeiro-acesso', () => {
    const location = {
      pathname: '/login',
      search: '',
      hash: '#access_token=a&refresh_token=b&type=invite',
      href: 'https://loveodonto.com.br/login#access_token=a&refresh_token=b&type=invite',
    };
    expect(resolvePrimeiroAcessoRedirect(location)).toBe('/primeiro-acesso#access_token=a&refresh_token=b&type=invite');
  });

  it('classifica token de usuário inexistente', () => {
    const result = classifyFirstAccessError(new Error('User from sub claim in JWT does not exist'));
    expect(result.code).toBe('stale_auth_user');
    expect(result.message).toContain('usuário antigo');
  });

  it('classifica link expirado', () => {
    const result = classifyFirstAccessError(new Error('Email link is invalid or has expired'));
    expect(result.code).toBe('expired_link');
    expect(result.message).toContain('expirou');
  });

  it('classifica AbortError como transitório (não mostra signal is aborted)', () => {
    const abort = new Error('signal is aborted without reason');
    abort.name = 'AbortError';
    expect(isAbortError(abort)).toBe(true);
    const result = classifyFirstAccessError(abort);
    expect(result.code).toBe('aborted');
    expect(result.transient).toBe(true);
    expect(result.message.toLowerCase()).not.toContain('signal is aborted');
  });

  it('preserva tokens do hash na segunda leitura sem hash (StrictMode)', () => {
    const first = captureAuthCallbackFromUrl({
      href: 'http://localhost:5176/primeiro-acesso#access_token=tok&refresh_token=ref&type=recovery',
      search: '',
      hash: '#access_token=tok&refresh_token=ref&type=recovery',
    });
    expect(first.accessToken).toBe('tok');
    expect(first.refreshToken).toBe('ref');

    const second = captureAuthCallbackFromUrl({
      href: 'http://localhost:5176/primeiro-acesso',
      search: '',
      hash: '',
    });
    expect(second.accessToken).toBe('tok');
    expect(second.refreshToken).toBe('ref');
    expect(second.type).toBe('recovery');
  });
});
