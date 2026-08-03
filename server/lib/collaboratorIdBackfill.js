/**
 * Lógica de reconciliação de collaborator_id (Supabase).
 * LEGACY_RC01: RC-01.4 — remoção planejada RC-03.
 * Dry-run por padrão; mutações apenas via applyBackfillPlan().
 */

export const SAAS_SYNTHETIC_PREFIX = 'col-saas-';

export const ACTIONS = {
  OK: 'OK',
  UPDATE_PROPOSED: 'UPDATE_PROPOSED',
  AMBIGUOUS: 'AMBIGUOUS',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
};

export const COLLABORATOR_ID_TABLES = [
  'tenant_users',
  'invitations',
  'identities',
  'identity_events',
];

/** Tabelas apenas no IndexedDB local — documentadas para auditoria, não alteradas por este script. */
export const LOCAL_ONLY_COLLABORATOR_REFS = [
  'collaborators',
  'collaboratorAccess',
  'collaboratorWorkHours',
  'collaboratorDocuments',
  'userPermissions (local overrides)',
  'professional_settings / schedule_settings (agenda local)',
];

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeCollaboratorId(value) {
  return String(value || '').trim();
}

export function isSyntheticCollaboratorId(value) {
  const id = normalizeCollaboratorId(value);
  return Boolean(id) && id.startsWith(SAAS_SYNTHETIC_PREFIX);
}

export function isRealCollaboratorId(value) {
  const id = normalizeCollaboratorId(value);
  return Boolean(id) && !isSyntheticCollaboratorId(id);
}

function tenantEmailKey(tenantId, email) {
  return `${String(tenantId || '').trim()}::${normalizeEmail(email)}`;
}

/**
 * @param {Array<{ id?: string, tenant_id?: string, tenantId?: string, email?: string }>} collaborators
 */
export function buildRhLookup(collaborators = []) {
  const byKey = new Map();
  for (const row of collaborators) {
    const email = normalizeEmail(row?.email);
    const tenantId = String(row?.tenant_id || row?.tenantId || '').trim();
    const id = normalizeCollaboratorId(row?.id);
    if (!email || !tenantId || !id) continue;
    const key = tenantEmailKey(tenantId, email);
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(id);
  }
  return byKey;
}

/**
 * Agrupa collaborator_id por tenant+email a partir de convites.
 * Preferência: accepted > sent > demais; mais recente primeiro.
 */
export function buildInvitationLookup(invitations = []) {
  const byKey = new Map();
  const sorted = [...invitations].sort((a, b) => {
    const rank = (s) => {
      const v = String(s || '').toLowerCase();
      if (v === 'accepted') return 0;
      if (v === 'sent') return 1;
      if (v === 'pending') return 2;
      return 3;
    };
    const diff = rank(a?.status) - rank(b?.status);
    if (diff !== 0) return diff;
    return String(b?.updated_at || b?.created_at || '').localeCompare(String(a?.updated_at || a?.created_at || ''));
  });

  for (const inv of sorted) {
    const email = normalizeEmail(inv?.email);
    const tenantId = String(inv?.tenant_id || '').trim();
    const id = normalizeCollaboratorId(inv?.collaborator_id);
    if (!email || !tenantId || !id) continue;
    const key = tenantEmailKey(tenantId, email);
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(id);
  }
  return byKey;
}

export function buildIdentityLookup(identities = []) {
  const byKey = new Map();
  for (const row of identities) {
    const email = normalizeEmail(row?.email);
    const tenantId = String(row?.tenant_id || '').trim();
    const id = normalizeCollaboratorId(row?.collaborator_id);
    if (!email || !tenantId || !id) continue;
    const key = tenantEmailKey(tenantId, email);
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(id);
  }
  return byKey;
}

function pickUniqueRealId(candidateSet) {
  if (!candidateSet || candidateSet.size === 0) return { id: null, ambiguous: false };
  const real = [...candidateSet].filter(isRealCollaboratorId);
  const unique = [...new Set(real)];
  if (unique.length === 1) return { id: unique[0], ambiguous: false };
  if (unique.length > 1) return { id: null, ambiguous: true };
  return { id: null, ambiguous: false };
}

/**
 * Resolve o collaborator_id canônico para tenant+email.
 * Prioridade: RH export > convites > identities (somente IDs reais, não col-saas-*).
 */
export function resolveRealCollaboratorId({
  tenantId,
  email,
  rhLookup,
  invitationLookup,
  identityLookup,
}) {
  const key = tenantEmailKey(tenantId, email);
  const sources = { rh: [], invitation: [], identity: [] };

  const rhSet = rhLookup?.get(key);
  if (rhSet) sources.rh = [...rhSet].filter(isRealCollaboratorId);

  const invSet = invitationLookup?.get(key);
  if (invSet) sources.invitation = [...invSet].filter(isRealCollaboratorId);

  const idSet = identityLookup?.get(key);
  if (idSet) sources.identity = [...idSet].filter(isRealCollaboratorId);

  if (sources.rh.length > 0) {
    const unique = [...new Set(sources.rh)];
    if (unique.length === 1) {
      return { resolvedId: unique[0], source: 'rh_export', sources, ambiguous: false };
    }
    return { resolvedId: null, source: 'rh_export', sources, ambiguous: true };
  }

  const invPick = pickUniqueRealId(invSet);
  if (invPick.ambiguous) {
    return { resolvedId: null, source: 'invitation', sources, ambiguous: true };
  }
  if (invPick.id) {
    return { resolvedId: invPick.id, source: 'invitation', sources, ambiguous: false };
  }

  const idPick = pickUniqueRealId(idSet);
  if (idPick.ambiguous) {
    return { resolvedId: null, source: 'identity', sources, ambiguous: true };
  }
  if (idPick.id) {
    return { resolvedId: idPick.id, source: 'identity', sources, ambiguous: false };
  }

  return { resolvedId: null, source: null, sources, ambiguous: false };
}

/**
 * @param {object} tenantUser — linha de tenant_users
 * @param {object} resolution — saída de resolveRealCollaboratorId
 * @param {Map<string, { id: string, email: string }>} collaboratorOwnerByTenant — colaborator_id → tenant_user
 */
export function classifyTenantUserRow(tenantUser, resolution, collaboratorOwnerByTenant) {
  const currentId = normalizeCollaboratorId(tenantUser?.collaborator_id);
  const email = normalizeEmail(tenantUser?.email);
  const tenantId = String(tenantUser?.tenant_id || '').trim();
  const roleSlug = String(tenantUser?.role_slug || tenantUser?.role || '').trim();
  const status = String(tenantUser?.status || (tenantUser?.is_active === false ? 'inactive' : 'active')).trim();

  const base = {
    email,
    tenant_id: tenantId,
    tenant_user_id: tenantUser?.id || null,
    collaborator_id_current: currentId || null,
    collaborator_id_resolved: resolution.resolvedId || null,
    user_id: tenantUser?.user_id || null,
    role_slug: roleSlug,
    status,
    resolution_source: resolution.source,
    resolution_sources: resolution.sources,
  };

  if (resolution.ambiguous) {
    return { ...base, action: ACTIONS.AMBIGUOUS, reason: 'Múltiplos collaborator_id reais para o mesmo tenant+email.' };
  }

  if (!resolution.resolvedId) {
    if (currentId && isRealCollaboratorId(currentId)) {
      return { ...base, action: ACTIONS.OK, reason: 'Sem fonte externa; ID atual é real (não sintético).' };
    }
    if (!currentId) {
      return { ...base, action: ACTIONS.NOT_FOUND, reason: 'Sem collaborator_id e sem fonte RH/convite.' };
    }
    return { ...base, action: ACTIONS.NOT_FOUND, reason: 'Apenas ID sintético (col-saas-*) sem RH/convite correspondente.' };
  }

  if (currentId === resolution.resolvedId) {
    return { ...base, action: ACTIONS.OK, reason: 'collaborator_id já alinhado.' };
  }

  const ownerKey = `${tenantId}::${resolution.resolvedId}`;
  const owner = collaboratorOwnerByTenant?.get(ownerKey);
  if (owner && owner.id !== tenantUser?.id && normalizeEmail(owner.email) !== email) {
    return {
      ...base,
      action: ACTIONS.CONFLICT,
      reason: `collaborator_id ${resolution.resolvedId} já pertence a outro e-mail (${owner.email}).`,
    };
  }

  if (isSyntheticCollaboratorId(currentId) || !currentId || currentId !== resolution.resolvedId) {
    return {
      ...base,
      action: ACTIONS.UPDATE_PROPOSED,
      reason: isSyntheticCollaboratorId(currentId)
        ? 'Substituir ID sintético col-saas-* pelo RH/convite.'
        : 'Atualizar collaborator_id divergente.',
    };
  }

  return { ...base, action: ACTIONS.OK, reason: 'Sem alteração necessária.' };
}

export function buildCollaboratorOwnerMap(tenantUsers = []) {
  const map = new Map();
  for (const row of tenantUsers) {
    const tenantId = String(row?.tenant_id || '').trim();
    const collabId = normalizeCollaboratorId(row?.collaborator_id);
    if (!tenantId || !collabId) continue;
    map.set(`${tenantId}::${collabId}`, { id: row.id, email: row.email });
  }
  return map;
}

export function buildBackfillPlan({
  tenantUsers = [],
  invitations = [],
  identities = [],
  rhCollaborators = [],
}) {
  const rhLookup = buildRhLookup(rhCollaborators);
  const invitationLookup = buildInvitationLookup(invitations);
  const identityLookup = buildIdentityLookup(identities);
  const ownerMap = buildCollaboratorOwnerMap(tenantUsers);

  const rows = tenantUsers.map((tu) => {
    const resolution = resolveRealCollaboratorId({
      tenantId: tu.tenant_id,
      email: tu.email,
      rhLookup,
      invitationLookup,
      identityLookup,
    });
    return classifyTenantUserRow(tu, resolution, ownerMap);
  });

  const summary = rows.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    mode: 'dry-run',
    tables_in_scope: COLLABORATOR_ID_TABLES,
    local_only_refs: LOCAL_ONLY_COLLABORATOR_REFS,
    summary,
    rows,
  };
}

/**
 * Lista linhas relacionadas que seriam atualizadas no --apply.
 */
export function buildTableImpactPreview(plan, { invitations = [], identities = [], identityEvents = [] }) {
  const updates = (plan.rows || []).filter((r) => r.action === ACTIONS.UPDATE_PROPOSED);
  const impacts = [];

  for (const row of updates) {
    const oldId = row.collaborator_id_current;
    const newId = row.collaborator_id_resolved;
    const tenantId = row.tenant_id;
    const email = row.email;

    const invRows = invitations.filter(
      (i) => String(i.tenant_id) === tenantId
        && normalizeEmail(i.email) === email
        && normalizeCollaboratorId(i.collaborator_id) !== newId,
    );
    const idRows = identities.filter(
      (i) => String(i.tenant_id) === tenantId
        && (normalizeEmail(i.email) === email || i.tenant_user_id === row.tenant_user_id)
        && normalizeCollaboratorId(i.collaborator_id) !== newId,
    );
    const evRows = identityEvents.filter(
      (e) => String(e.tenant_id) === tenantId
        && normalizeCollaboratorId(e.collaborator_id) === oldId,
    );

    impacts.push({
      email,
      tenant_id: tenantId,
      old_collaborator_id: oldId,
      new_collaborator_id: newId,
      tenant_users: 1,
      invitations: invRows.length,
      identities: idRows.length,
      identity_events: evRows.length,
    });
  }

  return impacts;
}

export async function applyBackfillPlan(supabase, plan, {
  invitations = [],
  identities = [],
  identityEvents = [],
  onProgress,
} = {}) {
  const applicable = (plan.rows || []).filter((r) => r.action === ACTIONS.UPDATE_PROPOSED);
  if (applicable.length === 0) {
    return { applied: 0, skipped: plan.rows?.length || 0, backup: [], errors: [] };
  }

  const backup = [];
  const errors = [];
  let applied = 0;
  const now = new Date().toISOString();

  for (const row of applicable) {
    const {
      tenant_user_id: tenantUserId,
      tenant_id: tenantId,
      email,
      collaborator_id_current: oldId,
      collaborator_id_resolved: newId,
    } = row;

    try {
      const { data: tuBefore } = await supabase
        .from('tenant_users')
        .select('*')
        .eq('id', tenantUserId)
        .maybeSingle();
      if (tuBefore) backup.push({ table: 'tenant_users', id: tenantUserId, before: tuBefore });

      const { error: tuErr } = await supabase
        .from('tenant_users')
        .update({ collaborator_id: newId, updated_at: now })
        .eq('id', tenantUserId);
      if (tuErr) throw tuErr;

      const invMatches = invitations.filter(
        (i) => String(i.tenant_id) === tenantId && normalizeEmail(i.email) === email,
      );
      for (const inv of invMatches) {
        if (normalizeCollaboratorId(inv.collaborator_id) === newId) continue;
        backup.push({ table: 'invitations', id: inv.id, before: { ...inv } });
        const { error: invErr } = await supabase
          .from('invitations')
          .update({ collaborator_id: newId, updated_at: now })
          .eq('id', inv.id);
        if (invErr) throw invErr;
      }

      const idMatches = identities.filter(
        (i) => String(i.tenant_id) === tenantId
          && (normalizeEmail(i.email) === email || i.tenant_user_id === tenantUserId),
      );
      for (const ident of idMatches) {
        if (normalizeCollaboratorId(ident.collaborator_id) === newId) continue;
        backup.push({ table: 'identities', id: ident.id, before: { ...ident } });
        const { error: idErr } = await supabase
          .from('identities')
          .update({ collaborator_id: newId, updated_at: now })
          .eq('id', ident.id);
        if (idErr && !isMissingTableError(idErr)) throw idErr;
      }

      if (oldId) {
        const { data: evRows } = await supabase
          .from('identity_events')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('collaborator_id', oldId);
        for (const ev of evRows || []) {
          backup.push({ table: 'identity_events', id: ev.id, before: { ...ev } });
          const { error: evErr } = await supabase
            .from('identity_events')
            .update({ collaborator_id: newId })
            .eq('id', ev.id);
          if (evErr && !isMissingTableError(evErr)) throw evErr;
        }
      }

      applied += 1;
      onProgress?.({ email, status: 'applied', oldId, newId });
    } catch (err) {
      errors.push({ email, message: err?.message || String(err) });
      onProgress?.({ email, status: 'error', error: err?.message });
    }
  }

  return { applied, skipped: (plan.rows?.length || 0) - applicable.length, backup, errors };
}

export async function rollbackFromBackup(supabase, backupEntries = []) {
  const restored = [];
  const errors = [];
  for (const entry of [...backupEntries].reverse()) {
    try {
      const { table, id, before } = entry;
      if (!table || !id || !before) continue;
      const { error } = await supabase.from(table).update(before).eq('id', id);
      if (error) throw error;
      restored.push({ table, id });
    } catch (err) {
      errors.push({ table: entry.table, id: entry.id, message: err?.message || String(err) });
    }
  }
  return { restored, errors };
}

export function isMissingTableError(err) {
  const code = String(err?.code || '').toUpperCase();
  const msg = String(err?.message || '').toLowerCase();
  return code === 'PGRST205' || code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'));
}

export function formatReportTable(rows) {
  const headers = [
    'action',
    'email',
    'tenant_id',
    'collaborator_id_current',
    'collaborator_id_resolved',
    'user_id',
    'role_slug',
    'status',
    'reason',
  ];
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? '').replace(/\t/g, ' ')).join('\t'));
  }
  return lines.join('\n');
}
