/**
 * Helpers de exibição de colaborador — tolerantes a null/registro incompleto.
 * Evita crash de página quando selectedId aponta para linha ainda não hidratada.
 */

export function getCollaboratorInitials(collaborator) {
  const name = collaborator?.nomeCompleto || collaborator?.apelido || '';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'CL';
}

/** Nome principal + subtítulo (nome social ou apelido), sem duplicar o texto principal. */
export function getCollaboratorNameDisplay(collaborator) {
  if (!collaborator || typeof collaborator !== 'object') {
    return { primary: 'Colaborador', subtitle: '' };
  }
  const primaryRaw =
    (collaborator.nomeCompleto || collaborator.apelido || 'Colaborador').trim() || 'Colaborador';
  const social = (collaborator.nomeSocial || '').trim();
  const nick = (collaborator.apelido || '').trim();
  const full = (collaborator.nomeCompleto || '').trim();

  let subtitle = '';
  if (social && social !== primaryRaw) {
    subtitle = social;
  } else if (full && nick && nick !== full) {
    subtitle = nick;
  }

  return { primary: primaryRaw, subtitle };
}

export function getCollaboratorSpecialty(collaborator) {
  if (!collaborator || typeof collaborator !== 'object') return '—';
  if (Array.isArray(collaborator.especialidades) && collaborator.especialidades.length > 0) {
    return collaborator.especialidades.filter(Boolean).join(', ') || '—';
  }
  return '—';
}

/**
 * Resolve a linha de exibição quando a lista ainda não inclui o selectedId
 * (ex.: logo após create, antes do re-fetch).
 */
export function resolveCollaboratorForDisplay(selectedRow, draftProfile, selectedId) {
  if (selectedRow && typeof selectedRow === 'object') return selectedRow;
  if (!selectedId) return null;
  const profile = draftProfile && typeof draftProfile === 'object' ? draftProfile : null;
  if (!profile) return null;
  const profileId = String(profile.id || '').trim();
  if (profileId && profileId !== String(selectedId)) return null;
  return {
    id: selectedId,
    ...profile,
    nomeCompleto: profile.nomeCompleto || profile.apelido || '',
  };
}
