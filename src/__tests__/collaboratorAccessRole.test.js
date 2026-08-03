import { describe, expect, it } from 'vitest';
import {
  isCollaboratorEmailValid,
  resolveCollaboratorProfileRole,
} from '../utils/collaboratorAccessRole.js';

describe('collaboratorAccessRole', () => {
  it('valida e-mail para provisionamento automático', () => {
    expect(isCollaboratorEmailValid('')).toBe(false);
    expect(isCollaboratorEmailValid('invalido')).toBe(false);
    expect(isCollaboratorEmailValid('colaborador@clinica.com')).toBe(true);
  });

  it('mapeia categoria/cargo para perfil de acesso', () => {
    expect(resolveCollaboratorProfileRole({
      rhCategoria: 'Corpo Clínico',
      cargo: 'Clínico Geral',
    })).toBe('dentista');

    expect(resolveCollaboratorProfileRole({
      rhCategoria: 'Recepção e Atendimento',
      cargo: 'Recepcionista',
    })).toBe('atendimento');

    expect(resolveCollaboratorProfileRole({
      rhCategoria: 'Financeiro e Administrativo',
      cargo: 'Analista Financeiro',
    })).toBe('financeiro');

    expect(resolveCollaboratorProfileRole({
      rhCategoria: 'Diretoria e Gestão',
      cargo: 'Gerente de Clínica',
    })).toBe('gerente');
  });
});
