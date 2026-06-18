/**
 * Identificadores amigáveis — somente exibição na interface.
 *
 * Regra de estabilidade do fluxo comercial (orçamento ↔ contrato ↔ financeiro):
 *
 * - Navegação ("Ver orçamento", query `budgetId`, estado React) usa sempre o
 *   id interno real do registro (`budget.id`), resolvido por budgetNavigationService.
 * - Navegação ("Abrir contrato") usa sempre o id interno real (`contract.id`).
 * - `budgetNumber` (ORC-XXX) e `contractNumber` (CTR-XXX) são rótulos sequenciais
 *   para humanos; podem ser usados para localizar um registro, mas nunca substituem
 *   o id interno na rota nem nos vínculos com financeiro/contrato.
 *
 * UUIDs, hashes e prefixos técnicos (`budget-`, `contract-`, etc.) nunca devem
 * aparecer na UI — use as funções deste módulo antes de renderizar.
 */

const FRIENDLY_PREFIX = /^(ORC|CTR|ATD|FIN)-\d+/i;
const TECHNICAL_PREFIX = /^(budget|appt|appointment|contract|clinical|fin|proc|planned|recv|receivable|event|financing)-/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTechnicalId(value) {
  const s = String(value || '').trim();
  if (!s) return true;
  if (FRIENDLY_PREFIX.test(s)) return false;
  if (TECHNICAL_PREFIX.test(s)) return true;
  if (UUID_PATTERN.test(s)) return true;
  if (s.length > 22 && /^[0-9a-f-]+$/i.test(s)) return true;
  return false;
}

function formatFriendlyNumber(prefix, raw, sequence, pad = 3) {
  const value = String(raw || '').trim();
  if (value && !isTechnicalId(value)) {
    const upper = value.toUpperCase();
    if (upper.startsWith(`${prefix}-`)) return upper;
    return value;
  }
  return `${prefix}-${String(sequence).padStart(pad, '0')}`;
}

export function formatFriendlyBudgetNumber(raw, sequence = 1) {
  return formatFriendlyNumber('ORC', raw, sequence);
}

export function formatFriendlyContractNumber(raw, sequence = 1) {
  return formatFriendlyNumber('CTR', raw, sequence);
}

export function formatFriendlyAppointmentNumber(raw, sequence = 1) {
  return formatFriendlyNumber('ATD', raw, sequence);
}

export function formatFriendlyFinancialNumber(raw, sequence = 1) {
  return formatFriendlyNumber('FIN', raw, sequence);
}

/**
 * Resolve número amigável de orçamento a partir do objeto e posição no histórico do paciente.
 */
export function resolveBudgetDisplayNumber(budget, sequence = 1) {
  return formatFriendlyBudgetNumber(budget?.budgetNumber, sequence);
}

/**
 * Resolve número amigável de contrato.
 */
export function resolveContractDisplayNumber(contract, sequence = 1) {
  return formatFriendlyContractNumber(contract?.contractNumber, sequence);
}

/**
 * Garante que um valor de exibição nunca seja um ID técnico.
 */
export function sanitizeDisplayIdentifier(value, fallbackPrefix, sequence = 1) {
  if (!value || isTechnicalId(value)) {
    return formatFriendlyNumber(fallbackPrefix, null, sequence);
  }
  return String(value).trim();
}
