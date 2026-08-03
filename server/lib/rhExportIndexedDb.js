/**
 * Exportação RH do IndexedDB/localStorage → collaborators-export.json
 * Somente leitura / transformação — sem mutações.
 */

export const STORAGE_CONFIG = {
  idbDatabase: 'appgestaoodonto',
  idbStore: 'data',
  idbCollaboratorsKey: 'collaborators',
  legacyLocalStorageKey: 'appgestaoodonto.db',
  sessionLocalStorageKey: 'appgestaoodonto.session',
};

export const EXPORT_FORMAT_VERSION = 1;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeLegacyId(value) {
  return String(value || '').trim();
}

export function resolveRowTenantId(row) {
  return String(row?.tenant_id || row?.tenantId || '').trim();
}

export function isBase64Photo(value) {
  const raw = String(value || '').trim();
  return Boolean(raw) && /^data:/i.test(raw);
}

/**
 * Detecta formato do arquivo/dump de entrada.
 */
export function detectInputFormat(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { format: 'unknown', source: 'unknown' };
  }
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && parsed[0]?.k !== undefined && parsed[0]?.v !== undefined) {
      return { format: 'indexeddb_store_dump', source: 'indexeddb_export_file' };
    }
    return { format: 'collaborators_array', source: 'manual_array' };
  }
  if (Array.isArray(parsed.collaborators) && parsed.tenant_id && parsed.exported_at) {
    return { format: 'collaborators_export', source: 'prior_export' };
  }
  if (Array.isArray(parsed.collaborators)) {
    if (parsed.version !== undefined || parsed.patients !== undefined || parsed.clinicProfile !== undefined) {
      return { format: 'full_app_db', source: 'localstorage_legacy_or_db_dump' };
    }
    return { format: 'partial_db', source: 'manual_partial' };
  }
  if (parsed.version !== undefined && (parsed.patients || parsed.users || parsed.clinicProfile)) {
    return { format: 'full_app_db', source: 'localstorage_legacy_or_db_dump' };
  }
  return { format: 'unknown', source: 'unknown' };
}

/**
 * Extrai array bruto de colaboradores de qualquer formato suportado.
 */
export function extractCollaboratorsFromInput(parsed) {
  const detection = detectInputFormat(parsed);

  if (detection.format === 'collaborators_array') {
    return { collaborators: parsed, detection };
  }

  if (detection.format === 'collaborators_export') {
    return { collaborators: parsed.collaborators, detection };
  }

  if (detection.format === 'full_app_db' || detection.format === 'partial_db') {
    return { collaborators: Array.isArray(parsed.collaborators) ? parsed.collaborators : [], detection };
  }

  if (detection.format === 'indexeddb_store_dump') {
    const collabRecord = parsed.find((row) => row?.k === STORAGE_CONFIG.idbCollaboratorsKey);
    let collaborators = [];
    if (collabRecord?.v !== undefined) {
      collaborators = typeof collabRecord.v === 'string' ? JSON.parse(collabRecord.v) : collabRecord.v;
    }
    return { collaborators: Array.isArray(collaborators) ? collaborators : [], detection };
  }

  return { collaborators: [], detection };
}

export function sanitizeCollaboratorForExport(row, { tenantId } = {}) {
  const legacyId = normalizeLegacyId(row?.id);
  const rowTenant = resolveRowTenantId(row);
  const fotoRaw = String(row?.fotoUrl || row?.photo_url || row?.foto_url || '').trim();
  const hasBase64 = isBase64Photo(fotoRaw);

  const sanitized = {
    id: legacyId,
    tenant_id: rowTenant || tenantId || '',
    status: row?.status || 'ativo',
    apelido: String(row?.apelido || '').trim(),
    nomeCompleto: String(row?.nomeCompleto || row?.nome_completo || '').trim(),
    nomeSocial: String(row?.nomeSocial || row?.nome_social || '').trim(),
    sexo: String(row?.sexo || '').trim(),
    dataNascimento: String(row?.dataNascimento || row?.data_nascimento || '').trim(),
    email: normalizeEmail(row?.email) || '',
    fotoUrl: hasBase64 ? '' : fotoRaw,
    has_base64_photo: hasBase64,
    rhCategoria: String(row?.rhCategoria || row?.rh_categoria || '').trim(),
    cargo: String(row?.cargo || '').trim(),
    rhFuncaoDescricao: String(row?.rhFuncaoDescricao || row?.rh_funcao_descricao || '').trim(),
    tipoVinculo: String(row?.tipoVinculo || row?.tipo_vinculo || '').trim(),
    setor: String(row?.setor || '').trim(),
    especialidades: Array.isArray(row?.especialidades) ? row.especialidades.filter(Boolean) : [],
    registroProfissional: String(row?.registroProfissional || row?.registro_profissional || '').trim(),
    conselhoNome: String(row?.conselhoNome || row?.conselho_nome || '').trim(),
    conselhoUf: String(row?.conselhoUf || row?.conselho_uf || '').trim(),
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || null,
  };

  return sanitized;
}

function pushIgnored(ignored, row, reason) {
  ignored.push({
    id: normalizeLegacyId(row?.id),
    email: normalizeEmail(row?.email),
    tenant_id: resolveRowTenantId(row),
    reason,
  });
}

/**
 * Filtra, sanitiza e monta export + relatório.
 */
export function buildRhExportPayload({
  rawCollaborators = [],
  tenantId,
  source = 'unknown',
  sourceFormat = 'unknown',
} = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid) {
    throw new Error('tenant_id é obrigatório.');
  }

  const totalFound = rawCollaborators.length;
  const exported = [];
  const ignored = [];
  const warnings = [];

  const emailsSeen = new Map();
  const legacySeen = new Map();
  const duplicateEmails = [];
  const duplicateLegacyIds = [];

  let missingName = 0;
  let missingCargo = 0;
  let missingCategory = 0;
  let base64Photos = 0;

  for (const raw of rawCollaborators) {
    const rowTenant = resolveRowTenantId(raw);
    if (!rowTenant) {
      pushIgnored(ignored, raw, 'sem tenant_id');
      continue;
    }
    if (rowTenant !== tid) {
      pushIgnored(ignored, raw, `tenant_id diferente (${rowTenant})`);
      continue;
    }

    const item = sanitizeCollaboratorForExport(raw, { tenantId: tid });

    if (!item.apelido && !item.nomeCompleto) {
      missingName += 1;
      pushIgnored(ignored, raw, 'sem apelido e sem nomeCompleto');
      continue;
    }
    if (!item.cargo) missingCargo += 1;
    if (!item.rhCategoria) missingCategory += 1;

    if (item.has_base64_photo) {
      base64Photos += 1;
      warnings.push({
        id: item.id,
        email: item.email,
        message: 'Foto base64 detectada — fotoUrl exportado vazio; migrar para Storage na Fase 2.',
      });
    }

    const email = item.email;
    if (email) {
      if (emailsSeen.has(email)) {
        duplicateEmails.push({ email, ids: [emailsSeen.get(email), item.id] });
        pushIgnored(ignored, raw, `e-mail duplicado no export (${email})`);
        continue;
      }
      emailsSeen.set(email, item.id);
    }

    const legacy = normalizeLegacyId(item.id);
    if (legacy) {
      if (legacySeen.has(legacy)) {
        duplicateLegacyIds.push({ legacy_id: legacy, count: 2 });
        pushIgnored(ignored, raw, `legacy_id duplicado (${legacy})`);
        continue;
      }
      legacySeen.set(legacy, true);
    }

    if (!item.id) {
      pushIgnored(ignored, raw, 'sem id (legacy_id)');
      continue;
    }

    exported.push(item);
  }

  const payload = {
    format_version: EXPORT_FORMAT_VERSION,
    tenant_id: tid,
    exported_at: new Date().toISOString(),
    source,
    source_format: sourceFormat,
    storage_reference: {
      indexeddb: `${STORAGE_CONFIG.idbDatabase}/${STORAGE_CONFIG.idbStore}/${STORAGE_CONFIG.idbCollaboratorsKey}`,
      legacy_localstorage_key: STORAGE_CONFIG.legacyLocalStorageKey,
    },
    collaborators: exported.map(({ has_base64_photo, ...rest }) => ({
      ...rest,
      ...(has_base64_photo ? { has_base64_photo: true } : {}),
    })),
  };

  const report = {
    generated_at: new Date().toISOString(),
    tenant_id: tid,
    source,
    source_format: sourceFormat,
    summary: {
      total_found: totalFound,
      total_exported: exported.length,
      total_ignored: ignored.length,
      duplicate_emails: duplicateEmails.length,
      duplicate_legacy_ids: duplicateLegacyIds.length,
      missing_name_rejected: missingName,
      missing_cargo_flagged: missingCargo,
      missing_category_flagged: missingCategory,
      base64_photos: base64Photos,
    },
    duplicate_email_groups: duplicateEmails,
    duplicate_legacy_groups: duplicateLegacyIds,
    warnings,
    ignored,
    exported_ids: exported.map((c) => c.id),
  };

  return { payload, report };
}

export function parseInputJson(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`JSON inválido: ${err?.message || err}`);
  }
  const { collaborators, detection } = extractCollaboratorsFromInput(parsed);
  return {
    parsed,
    collaborators,
    detection,
  };
}

/**
 * Gera snippet de navegador (leitura IndexedDB + fallback localStorage).
 */
export function buildBrowserExportSnippet() {
  return `/**
 * Love Odonto — Exportar colaboradores do navegador
 * Como usar:
 * 1) Abra o Love Odonto logado na clínica (Chrome/Edge).
 * 2) Pressione F12 → aba Console.
 * 3) Cole TODO este script e pressione Enter.
 * 4) Informe o tenant_id (UUID) quando solicitado.
 * 5) O arquivo collaborators-export.json será baixado automaticamente.
 */
(async function loveOdontoExportCollaborators() {
  var IDB_NAME = '${STORAGE_CONFIG.idbDatabase}';
  var IDB_STORE = '${STORAGE_CONFIG.idbStore}';
  var COLLAB_KEY = '${STORAGE_CONFIG.idbCollaboratorsKey}';
  var LEGACY_LS_KEY = '${STORAGE_CONFIG.legacyLocalStorageKey}';
  var SESSION_KEY = '${STORAGE_CONFIG.sessionLocalStorageKey}';

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
    if (raw.length > 0) source = 'indexeddb:${STORAGE_CONFIG.idbDatabase}';
    db.close();
  } catch (e) {
    console.warn('IndexedDB indisponível ou vazio:', e);
  }

  if (raw.length === 0) {
    raw = readCollaboratorsFromLegacyLocalStorage();
    if (raw.length > 0) source = 'localstorage:${STORAGE_CONFIG.legacyLocalStorageKey}';
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
    format_version: ${EXPORT_FORMAT_VERSION},
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
})();`;
}
