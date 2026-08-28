import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  DEV_BACKEND_NOT_RUNNING_MSG,
  buildAdminApiUrl,
  formatAdminApiNetworkError,
  getAdminApiBaseConfigError,
  getConfiguredAdminApiBaseUrl,
  isDevBackendUnreachableError,
  isLocalhostBackendUrl,
  shouldUseSameOriginAdminApi,
  PROD_BACKEND_MISCONFIGURED_MSG,
  PROD_BACKEND_ENV_EMPTY_MSG,
} from '../config/adminApiBase.js';

describe('adminApiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detecta localhost', () => {
    expect(isLocalhostBackendUrl('http://127.0.0.1:3001')).toBe(true);
    expect(isLocalhostBackendUrl('http://localhost:3001')).toBe(true);
    expect(isLocalhostBackendUrl('https://api.exemplo.com')).toBe(false);
  });

  it('em produção sem env retorna erro de configuração', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_APP_ADMIN_API_BASE_URL', '');
    vi.stubEnv('VITE_PLATFORM_API_BASE_URL', '');
    expect(getConfiguredAdminApiBaseUrl()).toBe('');
    expect(getAdminApiBaseConfigError()).toBe(PROD_BACKEND_ENV_EMPTY_MSG);
  });

  it('em produção com 127.0.0.1 bloqueia', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_PLATFORM_API_BASE_URL', 'http://127.0.0.1:3001');
    expect(getAdminApiBaseConfigError()).toBe(PROD_BACKEND_MISCONFIGURED_MSG);
  });

  it('aceita VITE_APP_ADMIN_API_BASE_URL como alias', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_APP_ADMIN_API_BASE_URL', 'https://api.loveodonto.app');
    expect(getConfiguredAdminApiBaseUrl()).toBe('https://api.loveodonto.app');
    expect(getAdminApiBaseConfigError()).toBeNull();
  });

  it('em produção no domínio público usa path relativo (proxy Vercel)', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_APP_ADMIN_API_BASE_URL', 'https://appgestaoodonto-production.up.railway.app');
    expect(shouldUseSameOriginAdminApi('https://loveodonto.com.br')).toBe(true);
    expect(shouldUseSameOriginAdminApi('https://www.loveodonto.com.br')).toBe(true);
    expect(shouldUseSameOriginAdminApi('https://preview.vercel.app')).toBe(false);
    expect(buildAdminApiUrl('/internal/app/contracts/signature-invite-email', 'https://loveodonto.com.br'))
      .toBe('/internal/app/contracts/signature-invite-email');
    expect(buildAdminApiUrl('/internal/app/contracts/signature-invite-email', 'https://preview.vercel.app'))
      .toBe('https://appgestaoodonto-production.up.railway.app/internal/app/contracts/signature-invite-email');
  });

  it('em dev retorna mensagem clara quando backend local está offline', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('DEV', true);
    expect(formatAdminApiNetworkError()).toBe(DEV_BACKEND_NOT_RUNNING_MSG);
    expect(isDevBackendUnreachableError(new Error(DEV_BACKEND_NOT_RUNNING_MSG))).toBe(true);
    expect(isDevBackendUnreachableError(new Error('Failed to fetch'))).toBe(true);
  });
});
