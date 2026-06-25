import { describe, expect, it } from 'vitest';
import {
  IDENTITY_HEALTH_LABELS,
  IDENTITY_STATUS_LABELS,
} from '../services/identityService.js';

describe('identityService labels', () => {
  it('expõe labels em português para status principais', () => {
    expect(IDENTITY_STATUS_LABELS.active).toBe('Ativo');
    expect(IDENTITY_STATUS_LABELS.invitation_pending).toBe('Convite pendente');
    expect(IDENTITY_STATUS_LABELS.broken_link).toBe('Vínculo quebrado');
  });

  it('expõe labels para saúde da identidade', () => {
    expect(IDENTITY_HEALTH_LABELS.healthy).toBe('Saudável');
    expect(IDENTITY_HEALTH_LABELS.auth_missing).toBe('Auth ausente');
    expect(IDENTITY_HEALTH_LABELS.needs_repair).toBe('Precisa de reparo');
  });
});
