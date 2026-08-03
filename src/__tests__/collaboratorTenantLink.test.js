import { describe, expect, it } from 'vitest';
import {
  buildCollaboratorLookupMaps,
  formatCollaboratorLinkLabel,
  resolveCollaboratorForTenantUser,
} from '../utils/collaboratorTenantLink.js';

describe('collaboratorTenantLink', () => {
  const collaborators = [
    { id: 'col-1', nomeCompleto: 'PAULO ASSIS', email: 'admin1@loveodonto.com' },
    { id: 'col-2', nomeCompleto: 'Paulo Henrique', email: 'paaulosilvaassis@hotmail.com' },
  ];
  const maps = buildCollaboratorLookupMaps(collaborators);

  it('resolve colaborador por collaborator_id', () => {
    const match = resolveCollaboratorForTenantUser(
      { collaborator_id: 'col-1', email: 'admin1@loveodonto.com' },
      maps,
    );
    expect(match?.id).toBe('col-1');
  });

  it('resolve colaborador por e-mail quando collaborator_id ausente', () => {
    const match = resolveCollaboratorForTenantUser(
      { id: 'tu-1', email: 'admin1@loveodonto.com' },
      maps,
    );
    expect(match?.nomeCompleto).toBe('PAULO ASSIS');
  });

  it('formata rótulo de vínculo', () => {
    expect(formatCollaboratorLinkLabel(null)).toBe('Não vinculado');
    expect(formatCollaboratorLinkLabel(collaborators[0])).toBe('PAULO ASSIS');
  });
});
