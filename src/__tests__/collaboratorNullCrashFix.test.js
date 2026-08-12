import { describe, expect, it } from 'vitest';
import {
  getCollaboratorInitials,
  getCollaboratorNameDisplay,
  getCollaboratorSpecialty,
  resolveCollaboratorForDisplay,
} from '../utils/collaboratorDisplay.js';
import { mapCollaboratorToProfessionalOption } from '../utils/avatarUtils.js';

describe('PHASE collaborator null crash fix', () => {
  it('getCollaboratorNameDisplay não crasha com null/undefined', () => {
    expect(getCollaboratorNameDisplay(null)).toEqual({ primary: 'Colaborador', subtitle: '' });
    expect(getCollaboratorNameDisplay(undefined)).toEqual({ primary: 'Colaborador', subtitle: '' });
    expect(getCollaboratorNameDisplay({ nomeCompleto: 'Dra. Ana' }).primary).toBe('Dra. Ana');
  });

  it('getCollaboratorSpecialty e initials toleram null', () => {
    expect(getCollaboratorSpecialty(null)).toBe('—');
    expect(getCollaboratorInitials(null)).toBe('CL');
    expect(getCollaboratorSpecialty({ especialidades: ['Ortodontia'] })).toBe('Ortodontia');
  });

  it('resolveCollaboratorForDisplay usa draft quando lista ainda não tem a linha', () => {
    const draft = { id: 'col-1', nomeCompleto: 'Dr. Piloto', cargo: 'Dentista' };
    expect(resolveCollaboratorForDisplay(null, draft, 'col-1')?.nomeCompleto).toBe('Dr. Piloto');
    expect(resolveCollaboratorForDisplay(null, draft, 'col-other')).toBeNull();
    expect(resolveCollaboratorForDisplay({ id: 'col-1', nomeCompleto: 'Lista' }, draft, 'col-1')?.nomeCompleto)
      .toBe('Lista');
  });

  it('mapCollaboratorToProfessionalOption não crasha com null', () => {
    const option = mapCollaboratorToProfessionalOption(null);
    expect(option.name).toBe('Profissional');
    expect(option.collaborator).toBeNull();
  });
});
