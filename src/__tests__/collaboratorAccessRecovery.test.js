import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateDb } from '../db/migrations.js';
import { DB_VERSION } from '../db/schema.js';
import { initDb, resetDb } from '../db/index.js';
import { createCollaborator } from '../services/collaboratorService.js';
import {
  getCollaboratorAccessLink,
  syncCollaboratorAccessFromTenantUser,
} from '../services/collaboratorAccessRecoveryService.js';

const admin = { id: 'user-admin', role: 'admin', tenantId: 'tenant-1' };

describe('collaboratorAccessRecoveryService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    await migrateDb(DB_VERSION);
  });

  it('cria collaboratorAccess a partir de tenant_user', () => {
    const collaborator = createCollaborator(admin, {
      apelido: 'Juliana',
      nomeCompleto: 'Juliana Silva',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      tipoVinculo: 'CLT',
      setor: 'Clínico',
      conselhoNome: 'CRO',
      conselhoUf: 'SP',
      registroProfissional: '12345',
      email: 'drajuliana@clinica.com',
      status: 'ativo',
    });

    const access = syncCollaboratorAccessFromTenantUser(collaborator.id, {
      user_id: 'auth-user-123',
      email: 'drajuliana@clinica.com',
      role: 'profissional',
      has_system_access: true,
      full_name: 'Juliana Silva',
    }, {
      collaborator,
      tenantId: 'tenant-1',
      currentUser: admin,
    });

    expect(access?.userId).toBe('auth-user-123');
    expect(getCollaboratorAccessLink(collaborator.id)?.userId).toBe('auth-user-123');
    expect(getCollaboratorAccessLink(collaborator.id)?.role).toBe('profissional');
  });

  it('atualiza vínculo existente sem duplicar', () => {
    const collaborator = createCollaborator(admin, {
      apelido: 'Ana',
      nomeCompleto: 'Ana Costa',
      rhCategoria: 'Administrativo',
      cargo: 'Gerente',
      tipoVinculo: 'CLT',
      setor: 'Administrativo',
      email: 'ana@clinica.com',
      status: 'ativo',
    });

    syncCollaboratorAccessFromTenantUser(collaborator.id, {
      user_id: 'auth-1',
      email: 'ana@clinica.com',
      role: 'gerente',
      has_system_access: true,
    }, { tenantId: 'tenant-1', currentUser: admin });

    syncCollaboratorAccessFromTenantUser(collaborator.id, {
      user_id: 'auth-1',
      email: 'ana@clinica.com',
      role: 'atendimento',
      has_system_access: true,
    }, { tenantId: 'tenant-1', currentUser: admin });

    const link = getCollaboratorAccessLink(collaborator.id);
    expect(link?.role).toBe('atendimento');
  });
});
