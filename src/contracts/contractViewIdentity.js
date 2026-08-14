/**
 * Identidade explícita para visualizar um contrato.
 * Fail-closed: nunca cair para “último contrato”, primeiro da lista, último budget ou último paciente.
 */

function hasValue(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return s !== '' && s !== 'undefined' && s !== 'null';
}

export function buildContractViewIdentity(row) {
  if (!row || !hasValue(row.id)) return null;
  return {
    contractId: String(row.id),
    tenantId: hasValue(row.tenant_id) ? String(row.tenant_id) : (hasValue(row.tenantId) ? String(row.tenantId) : null),
    patientId: hasValue(row.patientId) ? String(row.patientId) : null,
    appointmentId: hasValue(row.appointmentId)
      ? String(row.appointmentId)
      : (hasValue(row.quoteId) ? String(row.quoteId) : null),
    budgetId: hasValue(row.budgetId) ? String(row.budgetId) : null,
  };
}

export function resolveContractViewIdentity(contract) {
  if (!contract || !hasValue(contract.id)) return null;
  return {
    contractId: String(contract.id),
    tenantId: hasValue(contract.tenant_id)
      ? String(contract.tenant_id)
      : (hasValue(contract.tenantId) ? String(contract.tenantId) : null),
    patientId: hasValue(contract.patientId) ? String(contract.patientId) : null,
    appointmentId: hasValue(contract.appointmentId)
      ? String(contract.appointmentId)
      : (hasValue(contract.quoteId) ? String(contract.quoteId) : null),
    budgetId: hasValue(contract.budgetId) ? String(contract.budgetId) : null,
  };
}

/**
 * Compara identidade esperada (linha/clique) com o contrato carregado.
 * Campos omitidos no expected não são exigidos; campos presentes devem bater.
 */
export function matchesContractViewIdentity(contract, expected) {
  if (!contract || !expected || !hasValue(expected.contractId)) return false;
  const actual = resolveContractViewIdentity(contract);
  if (!actual) return false;
  if (actual.contractId !== String(expected.contractId)) return false;

  const keys = ['patientId', 'appointmentId', 'budgetId'];
  for (const key of keys) {
    if (!hasValue(expected[key])) continue;
    if (!hasValue(actual[key])) return false;
    if (actual[key] !== String(expected[key])) return false;
  }

  if (hasValue(expected.tenantId) && hasValue(actual.tenantId)) {
    if (actual.tenantId !== String(expected.tenantId)) return false;
  }

  return true;
}
