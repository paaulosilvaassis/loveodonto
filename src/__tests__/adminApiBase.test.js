import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getAdminApiBaseConfigError,
  getConfiguredAdminApiBaseUrl,
  isLocalhostBackendUrl,
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
});
