/**
 * Worker que executa JSON.parse + migrateDb fora do thread principal
 * para evitar "Página sem resposta" com bancos grandes.
 */
import { migrateDb } from './migrations.js';
import { DB_VERSION } from './schema.js';

self.onmessage = (e) => {
  const { raw } = e.data || {};
  if (typeof raw !== 'string') {
    self.postMessage({ ok: false, error: 'raw inválido' });
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    let migrated = migrateDb(parsed);
    if (!migrated.clinicalAppointments) migrated.clinicalAppointments = [];
    if (!migrated.clinicalEvents) migrated.clinicalEvents = [];
    if (!migrated.patientJourneyEntries) migrated.patientJourneyEntries = [];
    migrated = { ...migrated, version: migrated.version ?? DB_VERSION };
    self.postMessage({ ok: true, db: migrated });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) });
  }
};
