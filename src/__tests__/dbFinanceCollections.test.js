import { describe, expect, it } from 'vitest';
import { DB_VERSION, defaultDbState } from '../db/schema.js';
import { migrateDb } from '../db/migrations.js';

describe('DB financeiro - coleções estruturais', () => {
  it('expõe coleções financeiras no estado padrão', () => {
    const db = defaultDbState();
    expect(Array.isArray(db.financings)).toBe(true);
    expect(Array.isArray(db.financingInstallments)).toBe(true);
    expect(Array.isArray(db.boletoCharges)).toBe(true);
    expect(Array.isArray(db.financingEvents)).toBe(true);
    expect(Array.isArray(db.boletoReminderEvents)).toBe(true);
    expect(Array.isArray(db.financingRenegotiations)).toBe(true);
    expect(Array.isArray(db.financingPaymentAllocations)).toBe(true);
    expect(Array.isArray(db.boletoChargeStatusHistory)).toBe(true);
    expect(db.version).toBe(DB_VERSION);
  });

  it('migra base legada e preserva consistência financeira mínima', () => {
    const migrated = migrateDb({
      version: 35,
      financings: [{ id: 'fin-1' }],
      financingInstallments: [{ id: 'ins-1', original_amount: 100, paid_amount: 25 }],
      boletoCharges: [{ id: 'bol-1' }],
      financingEvents: [{ id: 'evt-1' }],
    });

    expect(migrated.version).toBe(DB_VERSION);
    expect(migrated.financings[0].status).toBeTruthy();
    expect(migrated.financingInstallments[0].status).toBeTruthy();
    expect(migrated.financingInstallments[0].remaining_amount).toBe(75);
    expect(migrated.boletoCharges[0].status).toBeTruthy();
    expect(Array.isArray(migrated.financingPaymentAllocations)).toBe(true);
    expect(Array.isArray(migrated.boletoChargeStatusHistory)).toBe(true);
  });
});
