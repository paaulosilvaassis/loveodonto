import { describe, expect, it } from 'vitest';
import { evaluatePasswordStrength, validatePasswordPair } from '../utils/passwordStrength.js';

describe('passwordStrength', () => {
  it('identifica senha fraca', () => {
    const result = evaluatePasswordStrength('abc');
    expect(result.level).toBe('weak');
    expect(result.isValid).toBe(false);
  });

  it('identifica senha média', () => {
    const result = evaluatePasswordStrength('Abcdef1!');
    expect(result.level).toBe('medium');
    expect(result.isValid).toBe(true);
  });

  it('identifica senha forte', () => {
    const result = evaluatePasswordStrength('Abcdef12!@');
    expect(result.level).toBe('strong');
    expect(result.isValid).toBe(true);
  });

  it('rejeita confirmação diferente', () => {
    const result = validatePasswordPair('Abcdef1!', 'Abcdef2!');
    expect(result.ok).toBe(false);
  });
});
