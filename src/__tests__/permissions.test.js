import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb, withDb } from '../db/index.js';
import { can } from '../permissions/permissions.js';
import { can as canAccess } from '../services/accessService.js';

describe('Permissões', () => {
  beforeEach(() => {
    localStorage.clear();
    loadDb();
  });

  it('admin pode tudo', () => {
    const admin = { id: 'user-admin', role: 'admin' };
    expect(can(admin, 'finance:write')).toBe(true);
  });

  it('profissional não acessa financeiro', () => {
    const prof = { id: 'user-prof', role: 'profissional' };
    expect(can(prof, 'finance:write')).toBe(false);
  });

  describe('RBAC can(module, action)', () => {
    it('admin tem acesso a qualquer módulo/ação', () => {
      const admin = { id: 'user-admin', role: 'admin' };
      expect(canAccess(admin, 'agenda', 'edit')).toBe(true);
      expect(canAccess(admin, 'patients', 'delete')).toBe(true);
    });

    it('usuário sem acesso ao sistema não tem permissão', () => {
      withDb((db) => {
        db.users.push({ id: 'u1', name: 'Test', role: 'atendimento', active: true, has_system_access: false });
        return db;
      });
      const user = { id: 'u1', role: 'atendimento', has_system_access: false };
      expect(canAccess(user, 'agenda', 'view')).toBe(false);
    });

    it('usuário null retorna false', () => {
      expect(canAccess(null, 'agenda', 'view')).toBe(false);
    });
  });
});
