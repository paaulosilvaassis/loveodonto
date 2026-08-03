/**
 * Love Odonto — RH Shadow Read QA (Ticket 1.10)
 *
 * Compara IndexedDB (local) vs Supabase staging (remote) — SOMENTE LEITURA.
 * Cole no Console com o app aberto em staging/dev.
 *
 * Pré-requisitos (.env.local ou build staging):
 *   VITE_RH_SUPABASE_READ=true
 *   VITE_RH_SHADOW_READ=true
 *   VITE_RH_COMPARE_IDB_SUPABASE=true
 *   VITE_RH_SUPABASE_READ_PRIMARY=false
 *   VITE_RH_SUPABASE_WRITE=false
 */
(async function loveOdontoRhShadowReadQa() {
  var STAGING_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
  var IDB_NAME = 'appgestaoodonto';
  var IDB_STORE = 'data';
  var COLLAB_KEY = 'collaborators';
  var SESSION_KEY = 'appgestaoodonto.session';

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

  function norm(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v).trim();
  }

  function isAgendaProfessional(collaborator) {
    if (!collaborator) return false;
    if (String(collaborator.rhCategoria || '') === 'Corpo Clínico') return true;
    var c = String(collaborator.cargo || '').toLowerCase();
    return /dentista|ortodontista|cirurgião|cirurgiao|implant|endodont|periodont|protesista|odon|clínico geral|clinico geral|radiologista|bucomaxilo|estomatologista|odontopediatra|harmoniza|reabilita/i.test(c);
  }

  function resolveCollaboratorAgendaEnabled(row) {
    if (typeof row.agendaEnabled === 'boolean') return row.agendaEnabled;
    if (typeof row.agenda_enabled === 'boolean') return row.agenda_enabled;
    return isAgendaProfessional({
      rhCategoria: row.rhCategoria || row.rh_categoria || '',
      cargo: row.cargo || '',
    });
  }

  function mapLocal(row, tenantId) {
    var legacyId = String(row.id || '').trim();
    return {
      uuid: String(row.uuid || legacyId).trim(),
      legacyId: legacyId,
      tenantId: String(row.tenant_id || row.tenantId || tenantId).trim(),
      status: row.status || 'ativo',
      nomeCompleto: row.nomeCompleto || '',
      email: row.email != null ? row.email : null,
      rhCategoria: row.rhCategoria || '',
      cargo: row.cargo || '',
      agendaEnabled: resolveCollaboratorAgendaEnabled({
        rhCategoria: row.rhCategoria || '',
        cargo: row.cargo || '',
        agendaEnabled: row.agendaEnabled,
        agenda_enabled: row.agenda_enabled,
      }),
      updatedAt: row.updatedAt || row.updated_at || '',
    };
  }

  function mapRemote(row) {
    return {
      uuid: String(row.id || '').trim(),
      legacyId: String(row.legacy_id || row.id || '').trim(),
      tenantId: String(row.tenant_id || '').trim(),
      status: row.status || 'ativo',
      nomeCompleto: row.nome_completo || '',
      email: row.email != null ? row.email : null,
      rhCategoria: row.rh_categoria || '',
      cargo: row.cargo || '',
      agendaEnabled: Boolean(row.agenda_enabled || false),
      updatedAt: row.updated_at || '',
    };
  }

  var fields = [
    ['uuid', function(c) { return c.uuid; }],
    ['legacy_id', function(c) { return c.legacyId; }],
    ['tenant_id', function(c) { return c.tenantId; }],
    ['email', function(c) { return c.email; }],
    ['nome', function(c) { return c.nomeCompleto; }],
    ['status', function(c) { return c.status; }],
    ['cargo', function(c) { return c.cargo; }],
    ['categoria', function(c) { return c.rhCategoria; }],
    ['agenda_enabled', function(c) { return c.agendaEnabled; }],
    ['updated_at', function(c) { return c.updatedAt; }],
  ];

  function compareFields(local, remote) {
    var diffs = [];
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i][0];
      var read = fields[i][1];
      var lv = read(local);
      var rv = read(remote);
      if (norm(lv) !== norm(rv)) {
        diffs.push({ field: field, localValue: lv, remoteValue: rv });
      }
    }
    return diffs;
  }

  function compare(localItems, remoteItems, tenantId) {
    var localMap = new Map();
    var remoteMap = new Map();
    localItems.forEach(function(item) {
      if (item.legacyId) localMap.set(item.legacyId, item);
    });
    remoteItems.forEach(function(item) {
      if (item.legacyId) remoteMap.set(item.legacyId, item);
    });

    var match = [];
    var missing_local = [];
    var missing_remote = [];
    var field_diff = [];

    var keys = new Set([].concat(Array.from(localMap.keys()), Array.from(remoteMap.keys())));
    keys.forEach(function(legacyId) {
      var l = localMap.get(legacyId);
      var r = remoteMap.get(legacyId);
      if (l && !r) { missing_remote.push({ legacyId: legacyId }); return; }
      if (r && !l) { missing_local.push({ legacyId: legacyId }); return; }
      var diffs = compareFields(l, r);
      if (diffs.length === 0) match.push({ legacyId: legacyId });
      else field_diff.push({ legacyId: legacyId, diffs: diffs });
    });

    return {
      tenantId: tenantId,
      localCount: localItems.length,
      remoteCount: remoteItems.length,
      matchCount: match.length,
      missing_local: missing_local,
      missing_remote: missing_remote,
      field_diff: field_diff,
    };
  }

  var sessionTenant = readSessionTenantId();
  var tenantId = sessionTenant || STAGING_TENANT;
  if (!sessionTenant) {
    console.warn('[RH_SHADOW] tenant da sessão não encontrado — usando staging default:', STAGING_TENANT);
  }

  var db = await openIdb();
  var idbRows = await readCollaboratorsFromIdb(db);
  db.close();

  var localAll = idbRows.map(function(row) { return mapLocal(row, tenantId); });
  var localItems = localAll.filter(function(c) { return norm(c.tenantId) === norm(tenantId); });

  var supabase = window.__LOVE_ODONTO_SUPABASE__ || window.supabase;
  if (!supabase || typeof supabase.from !== 'function') {
    console.error('[RH_SHADOW] Client Supabase não encontrado. Use build staging com VITE_RH_SUPABASE_READ=true.');
    return;
  }

  var started = Date.now();
  var { data: remoteRows, error } = await supabase
    .from('collaborators')
    .select('id, legacy_id, tenant_id, email, nome_completo, status, cargo, rh_categoria, agenda_enabled, updated_at')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[RH_SHADOW] Erro leitura Supabase (read-only):', error.message);
    return;
  }

  var remoteItems = (remoteRows || []).map(mapRemote);
  var details = compare(localItems, remoteItems, tenantId);
  var diffCount = details.missing_local.length + details.missing_remote.length + details.field_diff.length
    + (details.localCount !== details.remoteCount ? 1 : 0);
  var denominator = Math.max(details.localCount, details.remoteCount, 1);
  var matchPercent = Math.round((details.matchCount / denominator) * 10000) / 100;

  var report = {
    tag: '[RH_SHADOW]',
    tenant: tenantId,
    durationMs: Date.now() - started,
    localCount: details.localCount,
    remoteCount: details.remoteCount,
    matchPercent: matchPercent,
    diffCount: diffCount,
    missing_local: details.missing_local.length,
    missing_remote: details.missing_remote.length,
    field_diff: details.field_diff.length,
    writesExecuted: false,
    details: details,
    flags: {
      RH_SUPABASE_READ: true,
      RH_SHADOW_READ: true,
      RH_COMPARE_IDB_SUPABASE: true,
      RH_SUPABASE_READ_PRIMARY: false,
      RH_SUPABASE_WRITE: false,
    },
  };

  console.log('[RH_SHADOW] QA Report');
  console.table({
    localCount: report.localCount,
    remoteCount: report.remoteCount,
    matchPercent: report.matchPercent,
    diffCount: report.diffCount,
    missing_local: report.missing_local,
    missing_remote: report.missing_remote,
    field_diff: report.field_diff,
    durationMs: report.durationMs,
  });
  console.log('[RH_SHADOW] Detalhes:', report);

  if (diffCount > 0) {
    console.warn('[RH_SHADOW] Divergências — inspecione report.details');
  } else {
    console.log('[RH_SHADOW] OK — 100% match');
  }

  return report;
})();
