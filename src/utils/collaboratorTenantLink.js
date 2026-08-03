export function buildCollaboratorLookupMaps(collaborators = []) {
  const byId = {};
  const byEmail = {};
  for (const collaborator of collaborators) {
    if (!collaborator?.id) continue;
    byId[collaborator.id] = collaborator;
    const emailKey = String(collaborator.email || '').trim().toLowerCase();
    if (emailKey) byEmail[emailKey] = collaborator;
  }
  return { byId, byEmail };
}

export function resolveCollaboratorForTenantUser(tenantUser, maps = { byId: {}, byEmail: {} }) {
  if (!tenantUser) return null;
  if (tenantUser.collaborator_id && maps.byId[tenantUser.collaborator_id]) {
    return maps.byId[tenantUser.collaborator_id];
  }
  const emailKey = String(tenantUser.email || '').trim().toLowerCase();
  if (emailKey && maps.byEmail[emailKey]) {
    return maps.byEmail[emailKey];
  }
  return null;
}

export function formatCollaboratorLinkLabel(collaborator) {
  if (!collaborator) return 'Não vinculado';
  return (collaborator.nomeCompleto || collaborator.apelido || 'Colaborador').trim() || 'Vinculado';
}
