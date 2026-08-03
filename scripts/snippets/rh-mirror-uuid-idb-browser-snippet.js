/**
 * Love Odonto — Espelhar collaborator_uuid no IndexedDB (Ticket 1.13)
 *
 * SOMENTE dev/staging. Cole no Console com app aberto.
 * Escreve apenas campo `uuid` — não altera `id` legado.
 */
(async function loveOdontoRhMirrorUuidIdb() {
  var STAGING_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
  var PROD_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
  var IDB_NAME = 'appgestaoodonto';
  var IDB_STORE = 'data';
  var COLLAB_KEY = 'collaborators';
  var SESSION_KEY = 'appgestaoodonto.session';
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD) {
    console.error('[RH_UUID_MIRROR] Bloqueado em produção.');
    return;
  }

  function readSessionTenantId() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return '';
      var s = JSON.parse(raw);
      return String(s.tenantId || s.tenant_id || '').trim();
    } catch (e) { return ''; }
  }

  function openIdb() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onerror = function() { reject(req.error); };
      req.onsuccess = function() { resolve(req.result); };
    });
  }

  function readCollaboratorsFromIdb(db) {
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var store = tx.objectStore(IDB_STORE);
        var getReq = store.get(COLLAB_KEY);
        getReq.onsuccess = function() {
          var rec = getReq.result;
          if (!rec || rec.v === undefined) return resolve([]);
          try {
            var val = typeof rec.v === 'string' ? JSON.parse(rec.v) : rec.v;
            resolve(Array.isArray(val) ? val : []);
          } catch (e) { resolve([]); }
        };
        getReq.onerror = function() { reject(getReq.error); };
      } catch (e) { reject(e); }
    });
  }

  function writeCollaboratorsToIdb(db, collaborators) {
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        var putReq = store.put({ k: COLLAB_KEY, v: JSON.stringify(collaborators) });
        putReq.onsuccess = function() { resolve(); };
        putReq.onerror = function() { reject(putReq.error); };
      } catch (e) { reject(e); }
    });
  }

  function isUuid(v) {
    return UUID_RE.test(String(v || '').trim());
  }

  var tenantId = readSessionTenantId() || STAGING_TENANT;
  var supabase = window.__LOVE_ODONTO_SUPABASE__ || window.supabase;
  if (!supabase || typeof supabase.from !== 'function') {
    console.error('[RH_UUID_MIRROR] Client Supabase não encontrado.');
    return;
  }

  var supabaseHost = '';
  try {
    supabaseHost = new URL(supabase.supabaseUrl || '').hostname.split('.')[0] || '';
  } catch (e) { /* ignore */ }
  if (supabaseHost === PROD_PROJECT_REF) {
    console.error('[RH_UUID_MIRROR] Produção detectada — abortado.');
    return;
  }

  var report = {
    tag: '[RH_UUID_MIRROR]',
    tenant: tenantId,
    updated: [],
    skipped: [],
    notFound: [],
    conflicts: [],
    errors: [],
    supabaseWritesExecuted: false,
  };

  try {
    var db = await openIdb();
    var localRows = await readCollaboratorsFromIdb(db);

    var remoteRes = await supabase
      .from('collaborators')
      .select('id, legacy_id, tenant_id')
      .eq('tenant_id', tenantId);
    if (remoteRes.error) throw new Error(remoteRes.error.message);
    var remoteRows = remoteRes.data || [];

    var byLegacy = new Map();
    for (var i = 0; i < localRows.length; i++) {
      var row = localRows[i];
      var rowTenant = String(row.tenant_id || row.tenantId || '').trim();
      if (rowTenant && rowTenant !== tenantId) continue;
      var legacyId = String(row.id || '').trim();
      if (!legacyId) continue;
      if (!byLegacy.has(legacyId)) byLegacy.set(legacyId, []);
      byLegacy.get(legacyId).push(i);
    }

    var changed = false;

    for (var r = 0; r < remoteRows.length; r++) {
      var remote = remoteRows[r];
      var rLegacy = String(remote.legacy_id || '').trim();
      var rUuid = String(remote.id || '').trim();
      if (!rLegacy || !isUuid(rUuid)) {
        report.conflicts.push({ legacyId: rLegacy || '?', reason: 'remoto inválido', uuid: rUuid });
        continue;
      }

      var indexes = byLegacy.get(rLegacy) || [];
      if (indexes.length === 0) {
        report.notFound.push({ legacyId: rLegacy, uuid: rUuid });
        continue;
      }
      if (indexes.length > 1) {
        report.conflicts.push({ legacyId: rLegacy, reason: 'legacy_id duplicado local', uuid: rUuid });
        continue;
      }

      var idx = indexes[0];
      var local = localRows[idx];
      if (String(local.id || '').trim() !== rLegacy) {
        report.conflicts.push({ legacyId: rLegacy, reason: 'id legado divergente', uuid: rUuid });
        continue;
      }

      var prevUuid = String(local.uuid || '').trim();
      if (prevUuid === rUuid) {
        report.skipped.push({ legacyId: rLegacy, uuid: rUuid });
        continue;
      }
      if (prevUuid && isUuid(prevUuid) && prevUuid !== rUuid) {
        report.conflicts.push({
          legacyId: rLegacy,
          reason: 'uuid local canônico divergente',
          uuid: rUuid,
          existingUuid: prevUuid,
        });
        continue;
      }

      localRows[idx] = Object.assign({}, local, { uuid: rUuid });
      changed = true;
      report.updated.push({ legacyId: rLegacy, uuid: rUuid, previousUuid: prevUuid || undefined });
    }

    if (changed) {
      await writeCollaboratorsToIdb(db, localRows);
    }
    db.close();

    console.log('[RH_UUID_MIRROR] Concluído');
    console.table({
      updated: report.updated.length,
      skipped: report.skipped.length,
      notFound: report.notFound.length,
      conflicts: report.conflicts.length,
    });
    console.log(report);
    return report;
  } catch (err) {
    report.errors.push({ message: err.message || String(err) });
    console.error('[RH_UUID_MIRROR] Falhou:', err);
    return report;
  }
})();
