/**
 * PHASE_10.21Z — Seed mínimo fictício para browser staging (fail-closed).
 * Só roda com STAGING_TEST_MODE. Nunca toca production. Sem comunicação externa.
 */
import { withDb, loadDb } from '../../../db/index.js';
import { createId } from '../../../services/helpers.js';
import {
  PROCEDURE_STATUS,
  PROCEDURE_SEGMENT,
  PRICE_TABLE_TYPE,
  PRICE_RESTRICTION,
} from '../../../services/priceBaseService.js';
import { isStagingTestModeEnabled } from './staging-browser-test-mode.ts';

const STAGING_PRICE_TABLE_ID = 'price-table-staging-1021z';
const STAGING_PROCEDURE_ID = 'procedure-staging-1021z-implante';

/**
 * Garante tabela PARTICULAR + 1 procedimento fictício quando o catálogo está vazio.
 * Necessário para o CTA "Adicionar procedimento" → orçamento → contrato em staging limpo.
 */
export function ensureStagingFictionalPriceBase() {
  if (!isStagingTestModeEnabled()) {
    return { seeded: false, reason: 'staging_test_mode_off' };
  }

  const before = loadDb();
  const tables = Array.isArray(before.priceTables) ? before.priceTables : [];
  const procs = Array.isArray(before.priceTableProcedures) ? before.priceTableProcedures : [];
  if (tables.length > 0 && procs.length > 0) {
    return { seeded: false, reason: 'already_present', tables: tables.length, procedures: procs.length };
  }

  const now = new Date().toISOString();
  withDb((db) => {
    if (!Array.isArray(db.priceTables)) db.priceTables = [];
    if (!Array.isArray(db.priceTableProcedures)) db.priceTableProcedures = [];

    let table = db.priceTables.find((t) => t.id === STAGING_PRICE_TABLE_ID)
      || db.priceTables.find((t) => t.isDefault || t.type === PRICE_TABLE_TYPE.PARTICULAR);

    if (!table) {
      table = {
        id: STAGING_PRICE_TABLE_ID,
        name: 'Particular Staging (fictício)',
        type: PRICE_TABLE_TYPE.PARTICULAR,
        isDefault: true,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      db.priceTables.push(table);
    } else if (!table.isDefault) {
      table.isDefault = true;
      table.updatedAt = now;
    }

    const hasProc = db.priceTableProcedures.some(
      (p) => p.priceTableId === table.id && p.id === STAGING_PROCEDURE_ID,
    );
    if (!hasProc && !db.priceTableProcedures.some((p) => p.priceTableId === table.id)) {
      db.priceTableProcedures.push({
        id: STAGING_PROCEDURE_ID,
        priceTableId: table.id,
        title: 'Implante unitário — TESTE STAGING 1021Z',
        specialty: 'Implantodontia',
        segment: PROCEDURE_SEGMENT.ODONTOLOGIA,
        price: 3500,
        minPrice: 3500,
        maxPrice: 3500,
        status: PROCEDURE_STATUS.ATIVO,
        priceRestriction: PRICE_RESTRICTION.LIVRE,
        tussCode: '',
        internalCode: 'STG-1021Z-IMP',
        notes: 'Procedimento fictício para smoke staging. Não usar em paciente real.',
        createdAt: now,
        updatedAt: now,
      });
    }

    return db;
  });

  const after = loadDb();
  return {
    seeded: true,
    reason: 'seeded',
    tables: (after.priceTables || []).length,
    procedures: (after.priceTableProcedures || []).length,
    seedId: createId('stg-seed'),
  };
}
