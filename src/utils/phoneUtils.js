import { onlyDigits, formatPhone } from './validators.js';

/**
 * Normaliza DDD e número brasileiros, removendo DDD duplicado no campo número.
 * @returns {{ ddd: string, numero: string }}
 */
export function normalizeBrazilianPhoneParts(dddInput, numeroInput) {
  let ddd = onlyDigits(dddInput).slice(0, 2);
  let numero = onlyDigits(numeroInput);

  if (ddd && numero.startsWith(ddd) && (numero.length === ddd.length + 8 || numero.length === ddd.length + 9)) {
    numero = numero.slice(ddd.length);
  }

  if (!ddd && (numero.length === 10 || numero.length === 11)) {
    ddd = numero.slice(0, 2);
    numero = numero.slice(2);
  }

  if (numero.length > 9) {
    const tail = numero.slice(-9);
    const prefix = numero.slice(0, -9);
    if (prefix.length === 2) {
      ddd = ddd || prefix;
      numero = tail;
    } else if (prefix.length === 0 && numero.length === 10) {
      ddd = numero.slice(0, 2);
      numero = numero.slice(2);
    }
  }

  return { ddd, numero };
}

export function isBrazilianPhonePartsValid(ddd, numero) {
  if (!/^\d{2}$/.test(onlyDigits(ddd))) return false;
  const n = onlyDigits(numero);
  return n.length === 8 || n.length === 9;
}

export function formatBrazilianPhoneDisplay(ddd, numero) {
  const { ddd: d, numero: n } = normalizeBrazilianPhoneParts(ddd, numero);
  if (!d && !n) return '';
  return formatPhone(`${d}${n}`);
}

/** Máscara apenas do número (sem DDD) — fixo 8 ou celular 9 dígitos. */
export function formatPhoneNumberOnly(value) {
  const digits = onlyDigits(value).slice(0, 9);
  if (!digits) return '';
  if (digits.length <= 8) {
    return digits.replace(/(\d{4})(\d{1,4})/, '$1-$2').replace(/-$/, '');
  }
  return digits.replace(/(\d{5})(\d{1,4})/, '$1-$2').replace(/-$/, '');
}

/** Extrai só os dígitos do número, removendo DDD duplicado se informado. */
export function sanitizePhoneNumberInput(value, ddd = '') {
  const area = onlyDigits(ddd).slice(0, 2);
  let digits = onlyDigits(value);
  if (area && digits.startsWith(area) && digits.length > area.length) {
    digits = digits.slice(area.length);
  }
  return digits.slice(0, 9);
}

export function phonePartsToKey(ddd, numero) {
  const { ddd: d, numero: n } = normalizeBrazilianPhoneParts(ddd, numero);
  return `${d}${n}`;
}

export const CLINIC_PHONE_TYPES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'fixo', label: 'Fixo' },
  { value: 'emergencia', label: 'Emergência' },
  { value: 'outros', label: 'Outros' },
];

export function getClinicPhoneTypeLabel(tipo) {
  return CLINIC_PHONE_TYPES.find((t) => t.value === tipo)?.label || tipo || 'Telefone';
}
