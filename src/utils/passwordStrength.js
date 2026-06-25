const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/;

export const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: true,
};

export function evaluatePasswordStrength(password) {
  const value = String(password || '');
  const checks = {
    minLength: value.length >= PASSWORD_RULES.minLength,
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    special: SPECIAL_CHAR_REGEX.test(value),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  let level = 'weak';
  let label = 'Senha fraca';

  if (passed >= 4 && value.length >= 10) {
    level = 'strong';
    label = 'Senha forte';
  } else if (passed >= 3) {
    level = 'medium';
    label = 'Senha média';
  }

  return { level, label, checks, isValid: Object.values(checks).every(Boolean) };
}

export function validatePasswordPair(password, confirmPassword) {
  const strength = evaluatePasswordStrength(password);
  if (!strength.isValid) {
    return {
      ok: false,
      message: 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 número e 1 caractere especial.',
    };
  }
  if (password !== confirmPassword) {
    return { ok: false, message: 'Senha e confirmação devem ser iguais.' };
  }
  return { ok: true, strength };
}
