/**
 * Identidade fiscal do paciente vs identificador técnico.
 *
 * patient.id é a identidade técnica.
 * CPF é atributo civil/fiscal opcional.
 * Ausência = MISSING / PENDING / NOT_INFORMED — nunca um CPF inventado com checksum válido.
 */

import { isCpfValid, onlyDigits } from './validators.js';

/** Prefixo inequívoco caso algum store ainda exija string não vazia. */
export const NO_CPF_TOKEN_PREFIX = '__NO_CPF__:';
export const INTERNAL_NO_CPF_PREFIX = 'INTERNAL_NO_CPF:';

export function isTechnicalNoCpfToken(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return text.startsWith(NO_CPF_TOKEN_PREFIX) || text.startsWith(INTERNAL_NO_CPF_PREFIX);
}

/** CPF ausente ou token técnico — não é identidade fiscal. */
export function isPlaceholderCpf(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return isTechnicalNoCpfToken(text);
}

/** CPF civil válido (checksum) e não-placeholder. */
export function isRealPatientCpf(value) {
  if (isPlaceholderCpf(value)) return false;
  if (isTechnicalNoCpfToken(value)) return false;
  return isCpfValid(value);
}

export function hasRealPatientCpf(patientOrProfile) {
  if (!patientOrProfile || typeof patientOrProfile !== 'object') return false;
  const cpf = patientOrProfile.cpf ?? patientOrProfile.profile?.cpf ?? '';
  return isRealPatientCpf(cpf);
}

/**
 * Valor persistido quando a planilha/cadastro não informa CPF civil.
 * String vazia: IndexedDB permite; ensureCpfUnique ignora vazio; dois pacientes
 * sem CPF não colidem. Nunca gera dígitos com checksum de CPF.
 */
export function allocateMissingPatientCpf() {
  return '';
}

/** Formata somente CPF civil real. Placeholder/ausente → string vazia (nunca 000.000.000-00). */
export function formatCivilCpf(value) {
  if (!isRealPatientCpf(value)) return '';
  const digits = onlyDigits(value);
  if (digits.length !== 11) return '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
