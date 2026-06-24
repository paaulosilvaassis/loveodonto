import { describe, expect, it } from 'vitest';
import {
  looksLikeEmail,
  pickGreetingName,
  resolveAuthUserMetadataName,
  resolveSessionDisplayName,
} from '../utils/userDisplayName.js';

describe('userDisplayName', () => {
  it('detecta e-mail como nome inválido', () => {
    expect(looksLikeEmail('drajuliana@implanprime.com.br')).toBe(true);
    expect(looksLikeEmail('Juliana')).toBe(false);
  });

  it('extrai primeiro nome para saudação', () => {
    expect(pickGreetingName('Juliana Freire')).toBe('Juliana');
    expect(pickGreetingName('drajuliana@implanprime.com.br')).toBe('');
  });

  it('resolve nome do metadata do Auth', () => {
    expect(resolveAuthUserMetadataName({
      user_metadata: { collaborator_name: 'Juliana Freire' },
    })).toBe('Juliana Freire');
  });

  it('prioriza full_name do tenant no bootstrap', () => {
    expect(resolveSessionDisplayName(
      { user_metadata: {}, email: 'drajuliana@implanprime.com.br' },
      { fullName: 'Juliana Freire' },
    )).toBe('Juliana Freire');
  });

  it('não usa e-mail como nome de exibição', () => {
    expect(resolveSessionDisplayName(
      { user_metadata: {}, email: 'drajuliana@implanprime.com.br' },
      {},
    )).toBe('');
  });
});
