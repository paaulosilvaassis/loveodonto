import { describe, expect, it } from 'vitest';
import { raceWithTimeout } from '../utils/async.js';

describe('raceWithTimeout', () => {
  it('resolve quando a promise termina antes do timeout', async () => {
    const result = await raceWithTimeout(Promise.resolve('ok'), 500, 'timeout');
    expect(result).toBe('ok');
  });

  it('rejeita com mensagem customizada ao estourar o tempo', async () => {
    await expect(
      raceWithTimeout(new Promise(() => {}), 20, 'Tempo limite excedido'),
    ).rejects.toThrow('Tempo limite excedido');
  });
});

describe('imports de raceWithTimeout', () => {
  it('TenantContext importa helper sem ReferenceError', async () => {
    await expect(import('../tenant/TenantContext.jsx')).resolves.toBeDefined();
  });
});
