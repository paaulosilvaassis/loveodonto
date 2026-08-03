/**
 * Love Odonto — Exportar colaboradores do navegador
 * Como usar:
 * 1) Abra o Love Odonto logado na clínica (Chrome/Edge).
 * 2) Pressione F12 → aba Console.
 * 3) Cole TODO este script e pressione Enter.
 * 4) Informe o tenant_id (UUID) quando solicitado.
 * 5) O arquivo collaborators-export.json será baixado automaticamente.
 */
(async function loveOdontoExportCollaborators() {
  var IDB_NAME = 'appgestaoodonto';
  var IDB_STORE = 'data';
  var COLLAB_KEY = 'collaborators';
  var LEGACY_LS_KEY = 'appgestaoodonto.db';
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

  function readCollaboratorsFromLegacyLocalStorage() {
    try {
      var raw = localStorage.getItem(LEGACY_LS_KEY);
      if (!raw) return [];
      var db = JSON.parse(raw);
      return Array.isArray(db.collaborators) ? db.collaborators : [];
    } catch (e) { return []; }
  }

  function isBase64Photo(v) {
    return /^data:/i.test(String(v || '').trim());
  }

  function sanitize(row, tenantId) {
    var foto = String(row.fotoUrl || row.photo_url || '').trim();
    var hasB64 = isBase64Photo(foto);
    return {
      id: String(row.id || '').trim(),
      tenant_id: String(row.tenant_id || row.tenantId || tenantId || '').trim(),
      status: row.status || 'ativo',
      apelido: String(row.apelido || '').trim(),
      nomeCompleto: String(row.nomeCompleto || row.nome_completo || '').trim(),
      nomeSocial: String(row.nomeSocial || '').trim(),
      sexo: String(row.sexo || '').trim(),
      dataNascimento: String(row.dataNascimento || '').trim(),
      email: String(row.email || '').trim().toLowerCase(),
      fotoUrl: hasB64 ? '' : foto,
      has_base64_photo: hasB64,
      rhCategoria: String(row.rhCategoria || '').trim(),
      cargo: String(row.cargo || '').trim(),
      rhFuncaoDescricao: String(row.rhFuncaoDescricao || '').trim(),
      tipoVinculo: String(row.tipoVinculo || '').trim(),
      setor: String(row.setor || '').trim(),
      especialidades: Array.isArray(row.especialidades) ? row.especialidades : [],
      registroProfissional: String(row.registroProfissional || '').trim(),
      conselhoNome: String(row.conselhoNome || '').trim(),
      conselhoUf: String(row.conselhoUf || '').trim(),
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    };
  }

  var tenantId = readSessionTenantId();
  if (!tenantId) {
    tenantId = prompt('Cole o tenant_id (UUID da clínica):');
    tenantId = String(tenantId || '').trim();
  }
  if (!tenantId) {
    console.error('Export cancelado: tenant_id é obrigatório.');
    return;
  }

  var source = 'unknown';
  var raw = [];

  try {
    var db = await openIdb();
    raw = await readCollaboratorsFromIdb(db);
    if (raw.length > 0) source = 'indexeddb:appgestaoodonto';
    db.close();
  } catch (e) {
    console.warn('IndexedDB indisponível ou vazio:', e);
  }

  if (raw.length === 0) {
    raw = readCollaboratorsFromLegacyLocalStorage();
    if (raw.length > 0) source = 'localstorage:appgestaoodonto.db';
  }

  var exported = [];
  var ignored = 0;
  var base64Count = 0;
  var emails = new Set();
  var dupEmail = 0;

  for (var i = 0; i < raw.length; i++) {
    var row = raw[i];
    var rowTenant = String(row.tenant_id || row.tenantId || '').trim();
    if (!rowTenant) { ignored++; continue; }
    if (rowTenant !== tenantId) { ignored++; continue; }
    var item = sanitize(row, tenantId);
    if (!item.id || (!item.apelido && !item.nomeCompleto)) { ignored++; continue; }
    if (item.has_base64_photo) base64Count++;
    if (item.email) {
      if (emails.has(item.email)) { dupEmail++; ignored++; continue; }
      emails.add(item.email);
    }
    exported.push(item);
  }

  var payload = {
    format_version: 1,
    tenant_id: tenantId,
    exported_at: new Date().toISOString(),
    source: source,
    collaborators: exported
  };

  console.log('=== Love Odonto — Export RH ===');
  console.log('Origem:', source || 'nenhum dado encontrado');
  console.log('Encontrados (bruto):', raw.length);
  console.log('Exportados:', exported.length);
  console.log('Ignorados:', ignored);
  console.log('Fotos base64 (fotoUrl vazio):', base64Count);
  console.log('E-mails duplicados ignorados:', dupEmail);

  if (exported.length === 0) {
    console.error('Nenhum colaborador exportado. Verifique tenant_id e se há dados em Colaboradores.');
    return;
  }

  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'collaborators-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log('Download iniciado: collaborators-export.json');
})();