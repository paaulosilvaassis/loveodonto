import { describe, expect, it } from 'vitest';
import {
  isTechnicalId,
  formatFriendlyBudgetNumber,
  formatFriendlyContractNumber,
  formatFriendlyAppointmentNumber,
  formatFriendlyFinancialNumber,
  sanitizeDisplayIdentifier,
} from '../utils/friendlyNumbers.js';

describe('friendlyNumbers', () => {
  it('detecta IDs técnicos', () => {
    expect(isTechnicalId('budget-91a25275-3243-4530-9462-b35a6f276450')).toBe(true);
    expect(isTechnicalId('appt-8f7f7159-e349-4aae-8c1b-6e9015f18345')).toBe(true);
    expect(isTechnicalId('contract-ae8b2c3d-9123-4f55-9d12')).toBe(true);
    expect(isTechnicalId('ORC-002')).toBe(false);
    expect(isTechnicalId('CTR-2026-00001')).toBe(false);
  });

  it('formata orçamento amigável quando raw é técnico', () => {
    expect(formatFriendlyBudgetNumber('budget-abc', 2)).toBe('ORC-002');
    expect(formatFriendlyBudgetNumber('ORC-002', 1)).toBe('ORC-002');
    expect(formatFriendlyBudgetNumber(null, 3)).toBe('ORC-003');
  });

  it('formata contrato, atendimento e financeiro', () => {
    expect(formatFriendlyContractNumber('contract-xyz', 1)).toBe('CTR-001');
    expect(formatFriendlyAppointmentNumber('appt-xyz', 4)).toBe('ATD-004');
    expect(formatFriendlyFinancialNumber(null, 2)).toBe('FIN-002');
  });

  it('sanitizeDisplayIdentifier nunca retorna UUID', () => {
    expect(sanitizeDisplayIdentifier('budget-uuid', 'ORC', 5)).toBe('ORC-005');
    expect(sanitizeDisplayIdentifier('CTR-2026-00001', 'CTR', 1)).toBe('CTR-2026-00001');
  });
});
