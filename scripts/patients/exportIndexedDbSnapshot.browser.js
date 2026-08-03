/**
 * Colar no DevTools Console da app local (somente leitura).
 * Exporta IndexedDB `appgestaoodonto` / store `data` (registros { k, v }).
 * NÃO altera dados. NÃO envia rede.
 *
 * Depois:
 *   LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY \
 *     node scripts/patients/auditIndexedDbPatientData.mjs --snapshot <arquivo>
 */
(async function exportLoveOdontoIdbSnapshotReadOnly() {
  const CONFIRM = 'LOCAL_READ_ONLY';
  const typed = window.prompt(
    'Wave 3A audit export (READ ONLY). Digite LOCAL_READ_ONLY para continuar:',
    '',
  );
  if (typed !== CONFIRM) {
    console.warn('[wave3a] export abortado — confirmação inválida');
    return { aborted: true, remoteActionsExecuted: false };
  }

  const DB_NAME = 'appgestaoodonto';
  const STORE = 'data';

  const idb = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });

  const rows = await new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const os = tx.objectStore(STORE);
    const req = os.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
  idb.close();

  const db = {};
  for (const row of rows) {
    if (!row || row.k === undefined) continue;
    let value = row.v;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        /* keep string */
      }
    }
    db[row.k] = value;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    remoteActionsExecuted: false,
    db,
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `love-odonto-idb-snapshot-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[wave3a] snapshot exportado (read-only). keys=', Object.keys(db).length);
  return { ok: true, keys: Object.keys(db), remoteActionsExecuted: false };
})();
