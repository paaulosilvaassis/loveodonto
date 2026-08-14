/**
 * Reparo fail-closed de pacientes importados: UPDATE por CPF, nunca CREATE.
 * Não usar importFromCsvOrXlsx('update_cpf') — aquele caminho cria quando o CPF não existe.
 */
import { isPatientMetadataName } from '../utils/patientIdentity.js';
import { isCpfValid, onlyDigits } from '../utils/validators.js';

function maskCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return '';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

function sameTenant(patient, tenantId) {
  if (!tenantId) return false;
  return !patient.tenant_id || patient.tenant_id === tenantId;
}

/**
 * @param {{ patients: Array, sheetRows: Array<{cpf:string, full_name:string}>, tenantId: string }} input
 */
export function dryRunPatientCpfRepair({ patients, sheetRows, tenantId }) {
  const list = Array.isArray(patients) ? patients : [];
  const rows = Array.isArray(sheetRows) ? sheetRows : [];
  const scoped = list.filter((p) => sameTenant(p, tenantId));

  const byCpf = new Map();
  for (const patient of scoped) {
    const cpf = onlyDigits(patient.cpf);
    if (!cpf) continue;
    const bucket = byCpf.get(cpf) || [];
    bucket.push(patient);
    byCpf.set(cpf, bucket);
  }

  const sheetCpfCount = new Map();
  for (const row of rows) {
    const cpf = onlyDigits(row.cpf);
    if (!cpf || !isCpfValid(cpf)) continue;
    sheetCpfCount.set(cpf, (sheetCpfCount.get(cpf) || 0) + 1);
  }

  const summary = {
    TOTAL_PLANILHA: rows.length,
    MATCH_EXACT_BY_CPF: 0,
    WOULD_UPDATE: 0,
    WOULD_CREATE: 0,
    WOULD_SKIP: 0,
    CPF_CONFLICTS: 0,
    CORRUPTED_NAMES_FOUND: scoped.filter((p) => isPatientMetadataName(p.full_name)
      || String(p.full_name || '').includes('IP Odontologia')
      || String(p.full_name || '') === 'Unidade de Origem'
      || String(p.full_name || '') === 'Filtros aplicados').length,
    DUPLICATES_FOUND: [...byCpf.values()].filter((b) => b.length > 1).length,
    missingCpf: 0,
    invalidCpf: 0,
    sheetDuplicateCpf: [...sheetCpfCount.values()].filter((n) => n > 1).length,
  };

  const updates = [];
  const skips = [];
  const conflicts = [];

  for (const row of rows) {
    const cpf = onlyDigits(row.cpf);
    const fullName = String(row.full_name || '').trim();
    if (!cpf) {
      summary.missingCpf += 1;
      summary.WOULD_SKIP += 1;
      skips.push({ reason: 'MISSING_CPF' });
      continue;
    }
    if (!isCpfValid(cpf)) {
      summary.invalidCpf += 1;
      summary.WOULD_SKIP += 1;
      skips.push({ reason: 'INVALID_CPF', cpfMasked: maskCpf(cpf) });
      continue;
    }
    if ((sheetCpfCount.get(cpf) || 0) > 1) {
      summary.CPF_CONFLICTS += 1;
      summary.WOULD_SKIP += 1;
      conflicts.push({ reason: 'SHEET_DUPLICATE_CPF', cpfMasked: maskCpf(cpf) });
      continue;
    }
    const matches = byCpf.get(cpf) || [];
    if (matches.length === 1) {
      summary.MATCH_EXACT_BY_CPF += 1;
      const patient = matches[0];
      if (patient.full_name === fullName) {
        summary.WOULD_SKIP += 1;
        skips.push({ reason: 'ALREADY_CURRENT', id: patient.id, cpfMasked: maskCpf(cpf) });
      } else {
        summary.WOULD_UPDATE += 1;
        updates.push({
          id: patient.id,
          tenantId: patient.tenant_id || tenantId,
          previousName: patient.full_name || '',
          nextName: fullName,
          cpfMasked: maskCpf(cpf),
        });
      }
      continue;
    }
    if (matches.length > 1) {
      summary.CPF_CONFLICTS += 1;
      summary.WOULD_SKIP += 1;
      conflicts.push({
        reason: 'IDB_DUPLICATE_CPF',
        cpfMasked: maskCpf(cpf),
        count: matches.length,
      });
      continue;
    }
    summary.WOULD_SKIP += 1;
    skips.push({ reason: 'NOT_FOUND', cpfMasked: maskCpf(cpf) });
  }

  return { summary, updates, skips, conflicts };
}
