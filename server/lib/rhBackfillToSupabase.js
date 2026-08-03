/**
 * Backfill RH IndexedDB → Supabase (collaborators + tenant_users.collaborator_uuid).
 * Lógica pura testável; mutações via script scripts/rh-backfill-to-supabase.mjs.
 */
import { isAgendaProfessional } from '../../src/constants/collaboratorRhCatalog.js';

export const ACTIONS = {
  OK: 'OK',
  INSERT_PROPOSED: 'INSERT_PROPOSED',
  UPDATE_PROPOSED: 'UPDATE_PROPOSED',
  LINK_PROPOSED: 'LINK_PROPOSED',
  SKIP_BASE64_PHOTO: 'SKIP_BASE64_PHOTO',
  NOT_FOUND: 'NOT_FOUND',
  AMBIGUOUS: 'AMBIGUOUS',
  CONFLICT: 'CONFLICT',
  ERROR: 'ERROR',
};

/** Migrations Fase 1 exigidas (checks estruturais equivalentes). */
export const REQUIRED_SCHEMA_CHECKS = [
  { migration: '014_clinic_profiles_rls', label: 'clinic_profiles', table: 'clinic_profiles', columns: 'id, tenant_id' },
  { migration: '015_permission_catalog_seed', label: 'permission_catalog', table: 'permission_catalog', columns: 'id' },
  { migration: '015_permission_catalog_seed', label: 'role_permission_defaults', table: 'role_permission_defaults', columns: 'role_slug, permission_id' },
  { migration: '016_collaborators_core', label: 'collaborators', table: 'collaborators', columns: 'id, tenant_id, legacy_id, foto_url, agenda_enabled, deleted_at' },
  { migration: '017_tenant_users_collaborator_uuid', label: 'tenant_users', table: 'tenant_users', columns: 'collaborator_uuid, has_custom_permissions, collaborator_id' },
  { migration: '019_collaborators_rls', label: 'collaborators_rls', table: 'collaborators', columns: 'id' },
];

export const APPLY_BLOCKING_ACTIONS = new Set([ACTIONS.AMBIGUOUS, ACTIONS.CONFLICT, ACTIONS.ERROR]);

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeLegacyId(value) {
  return String(value || '').trim();
}

export function parseTimestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function isBase64Photo(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^data:/i.test(raw)) return true;
  return false;
}

export function resolveExportTenantId(row) {
  return String(row?.tenant_id || row?.tenantId || '').trim();
}

export function validateExportTenant(rows, expectedTenantId) {
  const tid = String(expectedTenantId || '').trim();
  const errors = [];
  const mismatches = [];
  for (const row of rows) {
    const rowTenant = resolveExportTenantId(row);
    if (!rowTenant) {
      mismatches.push({ legacy_id: normalizeLegacyId(row?.id), reason: 'tenant_id ausente no export' });
      continue;
    }
    if (rowTenant !== tid) {
      mismatches.push({ legacy_id: normalizeLegacyId(row?.id), rowTenant, reason: 'tenant_id divergente do --tenant-id' });
    }
  }
  if (mismatches.length > 0) {
    errors.push(`${mismatches.length} colaborador(es) com tenant_id inválido ou ausente.`);
  }
  return { ok: mismatches.length === 0, errors, mismatches };
}

export function findDuplicateKeys(rows) {
  const emailMap = new Map();
  const legacyMap = new Map();
  const emailDups = [];
  const legacyDups = [];

  for (const row of rows) {
    const legacyId = normalizeLegacyId(row?.id);
    const email = normalizeEmail(row?.email);

    if (legacyId) {
      if (legacyMap.has(legacyId)) {
        legacyDups.push({ legacy_id: legacyId, rows: [legacyMap.get(legacyId), legacyId] });
      } else {
        legacyMap.set(legacyId, legacyId);
      }
    }

    if (email) {
      if (emailMap.has(email)) {
        emailDups.push({ email, legacy_ids: [emailMap.get(email), legacyId] });
      } else {
        emailMap.set(email, legacyId);
      }
    }
  }

  return { emailDups, legacyDups };
}

export function mapExportRowToCollaboratorPayload(row, tenantId) {
  const legacyId = normalizeLegacyId(row?.id);
  const email = normalizeEmail(row?.email);
  const fotoRaw = String(row?.fotoUrl || row?.photo_url || row?.foto_url || '').trim();
  const skipBase64 = isBase64Photo(fotoRaw);
  const fotoUrl = skipBase64 ? null : (fotoRaw || null);
  const specialties = Array.isArray(row?.especialidades)
    ? row.especialidades.filter(Boolean).map(String)
    : [];

  const payload = {
    tenant_id: tenantId,
    legacy_id: legacyId || null,
    status: String(row?.status || 'ativo').toLowerCase() === 'inativo' ? 'inativo' : 'ativo',
    apelido: String(row?.apelido || '').trim(),
    nome_completo: String(row?.nomeCompleto || row?.nome_completo || '').trim(),
    nome_social: String(row?.nomeSocial || row?.nome_social || '').trim() || null,
    sexo: String(row?.sexo || '').trim() || null,
    data_nascimento: String(row?.dataNascimento || row?.data_nascimento || '').trim() || null,
    email: email || null,
    foto_url: fotoUrl,
    rh_categoria: String(row?.rhCategoria || row?.rh_categoria || '').trim(),
    cargo: String(row?.cargo || '').trim(),
    rh_funcao_descricao: String(row?.rhFuncaoDescricao || row?.rh_funcao_descricao || '').trim() || null,
    tipo_vinculo: String(row?.tipoVinculo || row?.tipo_vinculo || '').trim(),
    setor: String(row?.setor || '').trim(),
    especialidades: specialties,
    registro_profissional: String(row?.registroProfissional || row?.registro_profissional || '').trim() || null,
    conselho_nome: String(row?.conselhoNome || row?.conselho_nome || '').trim() || null,
    conselho_uf: String(row?.conselhoUf || row?.conselho_uf || '').trim().toUpperCase().slice(0, 2) || null,
    agenda_enabled: typeof row?.agenda_enabled === 'boolean'
      ? row.agenda_enabled
      : isAgendaProfessional(row),
    updated_at: row?.updatedAt || row?.updated_at || null,
    created_at: row?.createdAt || row?.created_at || null,
  };

  const validationErrors = [];
  if (!payload.apelido) validationErrors.push('apelido obrigatório');
  if (!payload.nome_completo) validationErrors.push('nome_completo obrigatório');
  if (!payload.rh_categoria) validationErrors.push('rh_categoria obrigatório');
  if (!payload.cargo) validationErrors.push('cargo obrigatório');
  if (!payload.tipo_vinculo) validationErrors.push('tipo_vinculo obrigatório');
  if (!payload.setor) validationErrors.push('setor obrigatório');

  return { payload, skipBase64, validationErrors };
}

function buildRemoteLookup(remoteCollaborators = []) {
  const byLegacy = new Map();
  const byEmail = new Map();

  for (const row of remoteCollaborators) {
    const legacy = normalizeLegacyId(row?.legacy_id);
    const email = normalizeEmail(row?.email);
    if (legacy) {
      if (!byLegacy.has(legacy)) byLegacy.set(legacy, []);
      byLegacy.get(legacy).push(row);
    }
    if (email) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(row);
    }
  }
  return { byLegacy, byEmail };
}

function resolveRemoteMatch(payload, lookup) {
  const legacy = normalizeLegacyId(payload.legacy_id);
  const email = normalizeEmail(payload.email);
  const matches = new Map();

  if (legacy && lookup.byLegacy.has(legacy)) {
    for (const row of lookup.byLegacy.get(legacy)) matches.set(row.id, row);
  }
  if (email && lookup.byEmail.has(email)) {
    for (const row of lookup.byEmail.get(email)) matches.set(row.id, row);
  }

  const list = [...matches.values()];
  if (list.length > 1) return { ambiguous: true, remote: null, matches: list };
  if (list.length === 1) return { ambiguous: false, remote: list[0], matches: list };
  return { ambiguous: false, remote: null, matches: [] };
}

export function payloadDiffers(localPayload, remote) {
  const keys = [
    'status', 'apelido', 'nome_completo', 'nome_social', 'sexo', 'email',
    'rh_categoria', 'cargo', 'rh_funcao_descricao', 'tipo_vinculo', 'setor',
    'registro_profissional', 'conselho_nome', 'conselho_uf', 'agenda_enabled', 'foto_url',
  ];
  for (const key of keys) {
    const a = localPayload[key];
    const b = remote?.[key];
    if (key === 'especialidades') continue;
    if (String(a ?? '') !== String(b ?? '')) return true;
  }
  const locSpec = (localPayload.especialidades || []).join('|');
  const remSpec = (remote?.especialidades || []).join('|');
  return locSpec !== remSpec;
}

export function classifyCollaboratorRow(exportRow, tenantId, remoteCollaborators = []) {
  const legacyId = normalizeLegacyId(exportRow?.id);
  const email = normalizeEmail(exportRow?.email);
  const base = {
    entity: 'collaborator',
    legacy_id: legacyId || null,
    email: email || null,
    tenant_id: tenantId,
  };

  const { payload, skipBase64, validationErrors } = mapExportRowToCollaboratorPayload(exportRow, tenantId);
  if (validationErrors.length > 0) {
    return {
      ...base,
      action: ACTIONS.ERROR,
      reason: validationErrors.join('; '),
      payload: null,
      remote_id: null,
      skip_base64_photo: skipBase64,
    };
  }

  const lookup = buildRemoteLookup(remoteCollaborators);
  const { ambiguous, remote, matches } = resolveRemoteMatch(payload, lookup);

  if (ambiguous) {
    return {
      ...base,
      action: ACTIONS.AMBIGUOUS,
      reason: `Múltiplos registros Supabase para legacy_id/email (${matches.map((m) => m.id).join(', ')})`,
      payload,
      remote_id: null,
      skip_base64_photo: skipBase64,
    };
  }

  const localUpdated = parseTimestamp(payload.updated_at);
  const remoteUpdated = parseTimestamp(remote?.updated_at);

  if (!remote) {
    return {
      ...base,
      action: skipBase64 ? ACTIONS.SKIP_BASE64_PHOTO : ACTIONS.INSERT_PROPOSED,
      reason: skipBase64
        ? 'Novo colaborador; foto base64 ignorada (não persistida).'
        : 'Colaborador ausente no Supabase.',
      payload,
      remote_id: null,
      skip_base64_photo: skipBase64,
    };
  }

  if (remoteUpdated > localUpdated && payloadDiffers(payload, remote)) {
    return {
      ...base,
      action: ACTIONS.CONFLICT,
      reason: `Supabase mais recente (remote=${remote.updated_at}, local=${payload.updated_at}).`,
      payload,
      remote_id: remote.id,
      remote_updated_at: remote.updated_at,
      local_updated_at: payload.updated_at,
      skip_base64_photo: skipBase64,
    };
  }

  if (!payloadDiffers(payload, remote)) {
    return {
      ...base,
      action: skipBase64 && isBase64Photo(exportRow?.fotoUrl) ? ACTIONS.SKIP_BASE64_PHOTO : ACTIONS.OK,
      reason: skipBase64 ? 'Sincronizado; foto base64 local ignorada.' : 'Já sincronizado.',
      payload,
      remote_id: remote.id,
      skip_base64_photo: skipBase64,
    };
  }

  const action = skipBase64 ? ACTIONS.SKIP_BASE64_PHOTO : ACTIONS.UPDATE_PROPOSED;
  return {
    ...base,
    action,
    reason: skipBase64
      ? 'Atualização proposta; foto base64 ignorada.'
      : 'Atualização proposta (local mais recente ou igual).',
    payload,
    remote_id: remote.id,
    skip_base64_photo: skipBase64,
  };
}

export function buildLegacyToUuidMap(collaboratorRows, remoteCollaborators = []) {
  const map = new Map();
  for (const row of remoteCollaborators) {
    const legacy = normalizeLegacyId(row?.legacy_id);
    if (legacy && row?.id) map.set(legacy, row.id);
  }
  for (const row of collaboratorRows) {
    const legacy = normalizeLegacyId(row?.legacy_id);
    if (!legacy) continue;
    if (row?.remote_id) {
      map.set(legacy, row.remote_id);
    } else if ([ACTIONS.INSERT_PROPOSED, ACTIONS.SKIP_BASE64_PHOTO].includes(row.action)) {
      map.set(legacy, `pending:${legacy}`);
    }
  }
  return map;
}

/**
 * Índice e-mail → colaborador (Supabase + export pendente) para vínculo tenant_users.
 * Match por e-mail só é válido quando há exatamente um candidato no tenant.
 */
export function buildEmailCollaboratorIndex({
  exportRows = [],
  collaboratorRows = [],
  remoteCollaborators = [],
} = {}) {
  /** @type {Map<string, Map<string, { type: 'remote'|'pending', id?: string, legacy_id?: string }>>} */
  const byEmail = new Map();

  const addEntry = (email, dedupeKey, entry) => {
    if (!email || !dedupeKey) return;
    if (!byEmail.has(email)) byEmail.set(email, new Map());
    byEmail.get(email).set(dedupeKey, entry);
  };

  for (const remote of remoteCollaborators || []) {
    if (remote?.deleted_at) continue;
    const email = normalizeEmail(remote.email);
    if (!email || !remote.id) continue;
    addEntry(email, `remote:${remote.id}`, { type: 'remote', id: remote.id, legacy_id: normalizeLegacyId(remote.legacy_id) });
  }

  for (const row of collaboratorRows || []) {
    if (row.action === ACTIONS.ERROR) continue;
    const email = normalizeEmail(row.email || row.payload?.email);
    const legacy = normalizeLegacyId(row.legacy_id);
    if (!email) continue;
    if (row.remote_id) {
      addEntry(email, `remote:${row.remote_id}`, { type: 'remote', id: row.remote_id, legacy_id: legacy });
    } else if ([ACTIONS.INSERT_PROPOSED, ACTIONS.SKIP_BASE64_PHOTO].includes(row.action) && legacy) {
      addEntry(email, `pending:${legacy}`, { type: 'pending', legacy_id: legacy });
    }
  }

  for (const row of exportRows || []) {
    const email = normalizeEmail(row?.email);
    const legacy = normalizeLegacyId(row?.id);
    if (!email || !legacy) continue;
    const collRow = (collaboratorRows || []).find((c) => normalizeLegacyId(c.legacy_id) === legacy);
    if (collRow && collRow.action !== ACTIONS.ERROR) continue;
    addEntry(email, `pending:${legacy}`, { type: 'pending', legacy_id: legacy });
  }

  return byEmail;
}

export function resolveEmailCollaboratorMatch(email, emailIndex) {
  const key = normalizeEmail(email);
  if (!key || !emailIndex) return { status: 'not_found' };

  const entries = emailIndex.get(key);
  if (!entries || entries.size === 0) return { status: 'not_found' };
  if (entries.size > 1) return { status: 'ambiguous', count: entries.size };

  const match = [...entries.values()][0];
  if (match.type === 'remote' && match.id) {
    return { status: 'found', id: match.id, legacy_id: match.legacy_id || null, match_source: 'email' };
  }
  if (match.type === 'pending' && match.legacy_id) {
    return {
      status: 'pending',
      legacy_id: match.legacy_id,
      match_source: 'email_pending_insert',
    };
  }
  return { status: 'not_found' };
}

export function classifyTenantUserLink(
  tenantUser,
  legacyToUuid,
  remoteCollaborators = [],
  emailIndex = null,
) {
  const base = {
    entity: 'tenant_user_link',
    tenant_user_id: tenantUser?.id || null,
    email: normalizeEmail(tenantUser?.email),
    collaborator_id_text: normalizeLegacyId(tenantUser?.collaborator_id) || null,
    collaborator_uuid_current: tenantUser?.collaborator_uuid || null,
  };

  const email = base.email;
  const legacyText = base.collaborator_id_text;

  let targetUuid = null;
  let matchSource = null;

  if (legacyText && legacyToUuid.has(legacyText)) {
    const mapped = legacyToUuid.get(legacyText);
    if (String(mapped).startsWith('pending:')) {
      return {
        ...base,
        action: ACTIONS.LINK_PROPOSED,
        reason: 'Vínculo proposto após insert do colaborador (legacy_id no export). collaborator_id text preservado.',
        collaborator_uuid_proposed: null,
        pending_legacy_id: legacyText,
        match_source: 'legacy_id_pending_insert',
      };
    }
    targetUuid = mapped;
    matchSource = 'legacy_id';
  } else if (email) {
    const index = emailIndex || buildEmailCollaboratorIndex({ collaboratorRows: [], remoteCollaborators });
    const resolved = resolveEmailCollaboratorMatch(email, index);
    if (resolved.status === 'ambiguous') {
      return {
        ...base,
        action: ACTIONS.AMBIGUOUS,
        reason: `Múltiplos colaboradores com e-mail ${email} no export/Supabase.`,
        collaborator_uuid_proposed: null,
        match_source: 'email',
      };
    }
    if (resolved.status === 'pending') {
      return {
        ...base,
        action: ACTIONS.LINK_PROPOSED,
        reason: 'Vínculo proposto após insert do colaborador (e-mail único no export). collaborator_id text preservado.',
        collaborator_uuid_proposed: null,
        pending_legacy_id: resolved.legacy_id,
        match_source: resolved.match_source,
      };
    }
    if (resolved.status === 'found') {
      targetUuid = resolved.id;
      matchSource = resolved.match_source;
    }
  }

  if (!targetUuid) {
    return {
      ...base,
      action: ACTIONS.NOT_FOUND,
      reason: 'Sem match seguro por legacy_id ou e-mail (RH sem vínculo ou colaborador não migrado).',
      collaborator_uuid_proposed: null,
    };
  }

  if (base.collaborator_uuid_current === targetUuid) {
    return {
      ...base,
      action: ACTIONS.OK,
      reason: 'collaborator_uuid já correto.',
      collaborator_uuid_proposed: targetUuid,
      match_source: matchSource,
    };
  }

  if (base.collaborator_uuid_current && base.collaborator_uuid_current !== targetUuid) {
    return {
      ...base,
      action: ACTIONS.CONFLICT,
      reason: `collaborator_uuid já preenchido (${base.collaborator_uuid_current}) ≠ proposto (${targetUuid}).`,
      collaborator_uuid_proposed: targetUuid,
      match_source: matchSource,
    };
  }

  return {
    ...base,
    action: ACTIONS.LINK_PROPOSED,
    reason: `Vínculo proposto via ${matchSource}. collaborator_id text legado não será alterado.`,
    collaborator_uuid_proposed: targetUuid,
    match_source: matchSource,
  };
}

export function summarizePlan(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});
}

export function buildRhBackfillPlan({
  tenantId,
  exportRows = [],
  remoteCollaborators = [],
  tenantUsers = [],
} = {}) {
  const tid = String(tenantId || '').trim();
  const tenantValidation = validateExportTenant(exportRows, tid);
  const { emailDups, legacyDups } = findDuplicateKeys(exportRows);

  const duplicateErrors = [];
  if (emailDups.length > 0) duplicateErrors.push(`e-mails duplicados no export: ${emailDups.length}`);
  if (legacyDups.length > 0) duplicateErrors.push(`legacy_id duplicados no export: ${legacyDups.length}`);

  const collaboratorRows = [];
  if (!tenantValidation.ok || duplicateErrors.length > 0) {
    for (const row of exportRows) {
      collaboratorRows.push({
        entity: 'collaborator',
        legacy_id: normalizeLegacyId(row?.id),
        email: normalizeEmail(row?.email),
        tenant_id: tid,
        action: ACTIONS.ERROR,
        reason: [...tenantValidation.errors, ...duplicateErrors].join('; '),
      });
    }
  } else {
    for (const row of exportRows) {
      collaboratorRows.push(classifyCollaboratorRow(row, tid, remoteCollaborators));
    }
  }

  const legacyToUuid = buildLegacyToUuidMap(collaboratorRows, remoteCollaborators);
  const emailIndex = buildEmailCollaboratorIndex({ exportRows, collaboratorRows, remoteCollaborators });
  const linkRows = (tenantUsers || []).map((tu) => classifyTenantUserLink(
    tu,
    legacyToUuid,
    remoteCollaborators,
    emailIndex,
  ));

  const allRows = [...collaboratorRows, ...linkRows];
  const summary = summarizePlan(allRows);
  const collaboratorSummary = summarizePlan(collaboratorRows);
  const linkSummary = summarizePlan(linkRows);

  return {
    tenant_id: tid,
    generated_at: new Date().toISOString(),
    mode: 'dry-run',
    export_rows: exportRows.length,
    remote_collaborators: remoteCollaborators.length,
    tenant_users: tenantUsers.length,
    duplicate_email_groups: emailDups,
    duplicate_legacy_groups: legacyDups,
    tenant_validation: tenantValidation,
    summary,
    collaborator_summary: collaboratorSummary,
    link_summary: linkSummary,
    collaborator_rows: collaboratorRows,
    link_rows: linkRows,
    not_found_documentation: {
      collaborator_NOT_FOUND: 'Não usado em collaborators; inserts usam INSERT_PROPOSED.',
      link_NOT_FOUND: 'tenant_user sem colaborador correspondente no export/Supabase — válido para RH sem cadastro ou e-mail divergente.',
    },
  };
}

export function canApplyPlan(plan) {
  const allRows = [...(plan?.collaborator_rows || []), ...(plan?.link_rows || [])];
  const blocking = allRows.filter((r) => APPLY_BLOCKING_ACTIONS.has(r.action));
  const byAction = summarizePlan(blocking);
  return {
    ok: blocking.length === 0,
    blocking_count: blocking.length,
    blocking_actions: byAction,
    blocking_rows: blocking,
    allowed_skip: {
      SKIP_BASE64_PHOTO: plan?.summary?.[ACTIONS.SKIP_BASE64_PHOTO] || 0,
      NOT_FOUND: plan?.summary?.[ACTIONS.NOT_FOUND] || 0,
    },
  };
}

export function shouldApplyCollaboratorRow(row, remoteCollaborators = []) {
  if ([ACTIONS.INSERT_PROPOSED, ACTIONS.UPDATE_PROPOSED].includes(row.action)) return true;
  if (row.action !== ACTIONS.SKIP_BASE64_PHOTO) return false;
  if (!row.remote_id) return true;
  const remote = remoteCollaborators.find((c) => c.id === row.remote_id);
  return payloadDiffers(row.payload, remote);
}

export function stripPayloadForWrite(payload) {
  if (!payload) return null;
  const {
    updated_at: _u,
    created_at: _c,
    ...rest
  } = payload;
  const out = { ...rest };
  if (out.data_nascimento === '') out.data_nascimento = null;
  return out;
}

export async function validateSchemaReady(supabase, checks = REQUIRED_SCHEMA_CHECKS) {
  const errors = [];
  const passed = [];

  for (const check of checks) {
    const { error } = await supabase.from(check.table).select(check.columns).limit(0);
    if (error) {
      errors.push({
        migration: check.migration,
        label: check.label,
        message: error.message,
        code: error.code,
      });
    } else {
      passed.push(check.migration);
    }
  }

  const uniqueMigrations = [...new Set(REQUIRED_SCHEMA_CHECKS.map((c) => c.migration))];
  const failedMigrations = [...new Set(errors.map((e) => e.migration))];
  const missingMigrations = uniqueMigrations.filter((m) => failedMigrations.includes(m));

  return {
    ok: errors.length === 0,
    errors,
    passed_migrations: [...new Set(passed)],
    missing_migrations: missingMigrations,
  };
}

export async function applyRhBackfillPlan(supabase, plan, { onProgress } = {}) {
  const gate = canApplyPlan(plan);
  if (!gate.ok) {
    throw new Error(
      `Plano bloqueado: ${gate.blocking_count} linha(s) AMBIGUOUS/CONFLICT/ERROR. Corrija antes do --apply.`,
    );
  }

  const backup = [];
  const errors = [];
  let inserts = 0;
  let updates = 0;
  let links = 0;

  for (const row of plan.collaborator_rows || []) {
    if (!shouldApplyCollaboratorRow(row, [])) {
      continue;
    }

    const isInsert = !row.remote_id;
    const writePayload = stripPayloadForWrite(row.payload);
    if (!writePayload) continue;

    try {
      if (isInsert) {
        const { data, error } = await supabase
          .from('collaborators')
          .insert(writePayload)
          .select('*')
          .single();
        if (error) throw error;
        backup.push({ table: 'collaborators', id: data.id, operation: 'insert', before: null, after: data });
        row.proposed_id = data.id;
        row.remote_id = data.id;
        inserts += 1;
        onProgress?.({ type: 'collaborator', action: 'insert', legacy_id: row.legacy_id, id: data.id });
      } else {
        const { data: before } = await supabase
          .from('collaborators')
          .select('*')
          .eq('id', row.remote_id)
          .maybeSingle();

        const { data, error } = await supabase
          .from('collaborators')
          .update(writePayload)
          .eq('id', row.remote_id)
          .select('*')
          .single();
        if (error) throw error;
        backup.push({ table: 'collaborators', id: row.remote_id, operation: 'update', before, after: data });
        updates += 1;
        onProgress?.({ type: 'collaborator', action: 'update', legacy_id: row.legacy_id, id: row.remote_id });
      }
    } catch (err) {
      errors.push({ legacy_id: row.legacy_id, message: err?.message || String(err) });
      onProgress?.({ type: 'collaborator', action: 'error', legacy_id: row.legacy_id, error: err?.message });
    }
  }

  const { data: refreshedCollaborators } = await supabase
    .from('collaborators')
    .select('id, tenant_id, legacy_id, email, updated_at, deleted_at')
    .eq('tenant_id', plan.tenant_id);

  const legacyToUuid = buildLegacyToUuidMap(plan.collaborator_rows, refreshedCollaborators || []);

  for (const link of plan.link_rows || []) {
    if (link.action !== ACTIONS.LINK_PROPOSED) continue;

    let targetUuid = link.collaborator_uuid_proposed;
    if (!targetUuid && link.pending_legacy_id) {
      targetUuid = legacyToUuid.get(link.pending_legacy_id) || null;
      if (targetUuid && String(targetUuid).startsWith('pending:')) {
        targetUuid = null;
      }
    }
    if (!targetUuid && link.email && String(link.match_source || '').startsWith('email')) {
      const emailMatches = (refreshedCollaborators || []).filter(
        (c) => !c.deleted_at && normalizeEmail(c.email) === normalizeEmail(link.email),
      );
      if (emailMatches.length === 1) {
        targetUuid = emailMatches[0].id;
      }
    }
    if (!targetUuid && link.collaborator_id_text) {
      const mapped = legacyToUuid.get(link.collaborator_id_text);
      if (mapped && !String(mapped).startsWith('pending:')) {
        targetUuid = mapped;
      }
    }

    if (!targetUuid) {
      errors.push({ tenant_user_id: link.tenant_user_id, message: 'LINK sem UUID resolvido após inserts.' });
      continue;
    }

    try {
      const { data: before } = await supabase
        .from('tenant_users')
        .select('*')
        .eq('id', link.tenant_user_id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('tenant_users')
        .update({ collaborator_uuid: targetUuid })
        .eq('id', link.tenant_user_id)
        .select('*')
        .single();

      if (error) throw error;
      backup.push({
        table: 'tenant_users',
        id: link.tenant_user_id,
        operation: 'link',
        before,
        after: data,
        note: 'collaborator_id text legado preservado',
      });
      links += 1;
      onProgress?.({ type: 'link', tenant_user_id: link.tenant_user_id, collaborator_uuid: targetUuid });
    } catch (err) {
      errors.push({ tenant_user_id: link.tenant_user_id, message: err?.message || String(err) });
    }
  }

  return { backup, errors, inserts, updates, links };
}

export async function rollbackRhBackfillFromBackup(supabase, backupEntries = []) {
  const restored = [];
  const errors = [];

  for (const entry of [...backupEntries].reverse()) {
    try {
      const { table, id, operation, before } = entry;
      if (!table || !id) continue;

      if (operation === 'insert') {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        restored.push({ table, id, operation: 'delete_insert' });
      } else if (operation === 'update' || operation === 'link') {
        if (!before) throw new Error('backup.before ausente');
        const { error } = await supabase.from(table).update(before).eq('id', id);
        if (error) throw error;
        restored.push({ table, id, operation: 'restore' });
      }
    } catch (err) {
      errors.push({ table: entry.table, id: entry.id, message: err?.message || String(err) });
    }
  }

  return { restored, errors };
}

export const POST_APPLY_VALIDATION_SQL = `-- Substitua :tenant_id
-- 1) Órfãos collaborator_uuid
select tu.id, tu.email, tu.collaborator_uuid
from public.tenant_users tu
where tu.tenant_id = :tenant_id
  and tu.collaborator_uuid is not null
  and not exists (
    select 1 from public.collaborators c
    where c.id = tu.collaborator_uuid and c.tenant_id = tu.tenant_id and c.deleted_at is null
  );

-- 2) Cross-tenant
select tu.id, tu.email, tu.collaborator_uuid, c.tenant_id as collab_tenant
from public.tenant_users tu
join public.collaborators c on c.id = tu.collaborator_uuid
where tu.tenant_id = :tenant_id and tu.tenant_id <> c.tenant_id;

-- 3) Duplicidade de vínculo
select collaborator_uuid, count(*) from public.tenant_users
where tenant_id = :tenant_id and collaborator_uuid is not null
group by 1 having count(*) > 1;

-- 4) Fotos base64 (deve ser 0)
select id, legacy_id, left(foto_url, 40) from public.collaborators
where tenant_id = :tenant_id and foto_url ~* '^data:';

-- 5) VALIDATE FK (018) quando queries acima retornarem 0 linhas
-- alter table public.tenant_users validate constraint tenant_users_collaborator_uuid_fkey;
`;

export function formatPlanTable(rows) {
  const headers = ['entity', 'action', 'legacy_id', 'email', 'remote_id', 'reason'];
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? row.collaborator_uuid_proposed ?? '').replace(/\t/g, ' ')).join('\t'));
  }
  return lines.join('\n');
}
