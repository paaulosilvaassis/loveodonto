/**
 * UUID mirror plan — port Node (Ticket 1.13). LEGACY_RC01 — RC-03 remove.
 * Paridade com collaboratorUuidMirror.ts.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^col(-saas)?-/i;

function norm(value) {
  return String(value ?? '').trim();
}

function isUuid(ref) {
  return UUID_RE.test(norm(ref));
}

function isLegacy(ref) {
  return LEGACY_RE.test(norm(ref));
}

function indexLocalByLegacy(localRows, tenantId) {
  const normalizedTenant = norm(tenantId);
  const byLegacy = new Map();
  const uuidOwners = new Map();

  for (const row of localRows || []) {
    const rowTenant = norm(row.tenant_id ?? row.tenantId);
    if (rowTenant && rowTenant !== normalizedTenant) continue;

    const legacyId = norm(row.id);
    if (!legacyId) continue;

    const list = byLegacy.get(legacyId) ?? [];
    list.push(row);
    byLegacy.set(legacyId, list);

    const localUuid = norm(row.uuid);
    if (localUuid && isUuid(localUuid)) {
      const owners = uuidOwners.get(localUuid) ?? [];
      owners.push(legacyId);
      uuidOwners.set(localUuid, owners);
    }
  }

  return { byLegacy, uuidOwners };
}

export function buildCollaboratorUuidMirrorPlan(tenantId, localRows, remoteRows) {
  const plan = [];
  const { byLegacy, uuidOwners } = indexLocalByLegacy(localRows, tenantId);

  for (const remote of remoteRows || []) {
    const legacyId = norm(remote.legacy_id);
    const uuid = norm(remote.id);

    if (!legacyId || !isLegacy(legacyId)) {
      plan.push({
        action: 'conflict',
        legacyId: legacyId || '(missing)',
        uuid,
        reason: 'legacy_id remoto ausente ou inválido.',
      });
      continue;
    }

    if (!uuid || !isUuid(uuid)) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: 'UUID canônico remoto ausente ou inválido.',
      });
      continue;
    }

    const locals = byLegacy.get(legacyId) ?? [];
    if (locals.length === 0) {
      plan.push({ action: 'notFound', legacyId, uuid });
      continue;
    }

    if (locals.length > 1) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: `legacy_id duplicado no IndexedDB local (${locals.length} registros).`,
      });
      continue;
    }

    const local = locals[0];
    const previousUuid = norm(local.uuid);
    const localLegacyId = norm(local.id);

    if (localLegacyId !== legacyId) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: 'id legado local divergente — espelhamento abortado.',
      });
      continue;
    }

    if (previousUuid === uuid) {
      plan.push({ action: 'skip', legacyId, uuid, previousUuid });
      continue;
    }

    if (previousUuid && isUuid(previousUuid) && previousUuid !== uuid) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        previousUuid,
        reason: 'UUID local canônico divergente do remoto — conflito não resolvido automaticamente.',
      });
      continue;
    }

    const owners = uuidOwners.get(uuid) ?? [];
    if (owners.length > 0 && !owners.includes(legacyId)) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: `UUID canônico já pertence a outro legacy_id local (${owners.join(', ')}).`,
      });
      continue;
    }

    plan.push({ action: 'update', legacyId, uuid, previousUuid: previousUuid || undefined });
  }

  return plan;
}

export function applyUuidMirrorToExportRows(exportRows, remoteRows) {
  const byLegacy = new Map();
  for (const remote of remoteRows || []) {
    const legacyId = norm(remote.legacy_id);
    const uuid = norm(remote.id);
    if (legacyId && uuid && isUuid(uuid)) {
      byLegacy.set(legacyId, uuid);
    }
  }

  return (exportRows || []).map((row) => {
    const legacyId = norm(row.id);
    const uuid = byLegacy.get(legacyId);
    if (!uuid) return row;
    return { ...row, uuid };
  });
}

export function mergeUuidMirrorPlanIntoReport(tenantId, plan) {
  const report = {
    tenantId,
    mirroredAt: new Date().toISOString(),
    updated: [],
    skipped: [],
    notFound: [],
    conflicts: [],
    errors: [],
    supabaseWritesExecuted: false,
  };

  for (const item of plan) {
    switch (item.action) {
      case 'update':
        break;
      case 'skip':
        report.skipped.push({ legacyId: item.legacyId, uuid: item.uuid });
        break;
      case 'notFound':
        report.notFound.push({ legacyId: item.legacyId, uuid: item.uuid });
        break;
      case 'conflict':
        report.conflicts.push({
          legacyId: item.legacyId,
          reason: item.reason || 'conflito',
          uuid: item.uuid,
          existingUuid: item.previousUuid,
        });
        break;
      default:
        break;
    }
  }

  return report;
}

export function summarizeMirrorPlanForExport(plan) {
  const summary = { wouldUpdate: 0, wouldSkip: 0, notFound: 0, conflicts: 0 };
  for (const item of plan) {
    if (item.action === 'update') summary.wouldUpdate += 1;
    else if (item.action === 'skip') summary.wouldSkip += 1;
    else if (item.action === 'notFound') summary.notFound += 1;
    else if (item.action === 'conflict') summary.conflicts += 1;
  }
  return summary;
}
