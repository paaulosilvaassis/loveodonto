/**
 * PHASE_10.21BG — decisão efetiva agenda:view + landing + performance de can().
 * Sem signature evidence. Sem mutar CTR/ORC.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, peekDb, getDbCloneCount, resetDbCloneCount } from '../db/index.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { can } from '../services/accessService.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';
import { ROLE_DEFAULT_PERMISSIONS } from '../permissions/roleDefaults.js';
import { navCategories } from '../navigation/navCategories.js';
import {
  canSeeNavItem,
  resolveCategoryLandingRoute,
  DEFAULT_SAFE_LANDING,
} from '../navigation/navAccess.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';
import { buildResolvedSaasUser } from '../auth/saasSessionResolver.js';
import {
  decideAuthenticatedProfessionalSignature,
} from '../contracts/authenticatedSignerIdentity.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const JULIANA_COL = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-4c3d-4f6c-a0a2-8f6479c0df30';
const PAULO_AUTH = '066dcd98-aecf-4886-8947-a439849e37f7';
const modules = {
  CORE: true, AGENDA: true, CRM: true, FINANCEIRO: true, MARKETING: true, ESTOQUE: true, SUPORTE: true,
};
const category = navCategories.find((c) => c.id === 'gestao-atendimento');

function deltaAllTrueExtras(role) {
  const defaults = new Set(ROLE_DEFAULT_PERMISSIONS[role] || []);
  const sparse = {};
  for (const perm of buildPermissionsCatalog()) {
    if (!defaults.has(perm.id)) sparse[perm.id] = true;
  }
  return sparse;
}

const julianaDelta = deltaAllTrueExtras('profissional');

const julianaSession = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenantId: TENANT,
  isMaster: false,
  has_system_access: true,
  has_custom_permissions: false,
  permissionOverrides: julianaDelta,
  authMode: 'saas',
};

describe('PHASE_10.21BG Juliana effective RBAC', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A profissional default com agenda:view → ALLOW', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.profissional).toBe(ROLE_DEFAULT_PERMISSIONS.dentista);
    expect(ROLE_DEFAULT_PERMISSIONS.profissional.some((id) => id.includes('agenda') && id.endsWith('-view'))).toBe(true);
    const user = { id: 'u-prof', role: 'profissional', has_system_access: true };
    expect(canByPermission(user, 'agenda:view')).toBe(true);
  });

  it('B profissional com explicit agenda:view=false → DENY', () => {
    const user = {
      id: 'u-deny',
      role: 'profissional',
      has_system_access: true,
      has_custom_permissions: true,
      permissionOverrides: { 'perm-agenda-view': false },
    };
    expect(canByPermission(user, 'agenda:view')).toBe(false);
  });

  it('C override não relacionado sem agenda:view mantém fallback da role', () => {
    const user = {
      id: 'u-extra',
      role: 'profissional',
      has_system_access: true,
      has_custom_permissions: true,
      permissionOverrides: { 'perm-admin_base_precos_procedimentos-view': true },
    };
    expect(canByPermission(user, 'agenda:view')).toBe(true);
  });

  it('D explicit true → ALLOW', () => {
    const user = {
      id: 'u-allow',
      role: 'profissional',
      has_system_access: true,
      has_custom_permissions: true,
      permissionOverrides: { 'perm-agenda-view': true },
    };
    expect(canByPermission(user, 'agenda:view')).toBe(true);
  });

  it('E master continua funcionando', () => {
    const master = { id: PAULO_AUTH, role: 'master', isMaster: true, has_system_access: true };
    expect(canByPermission(master, 'agenda:view')).toBe(true);
    expect(canByPermission(master, 'configuracoes:view')).toBe(true);
    expect(resolveCategoryLandingRoute(category, master, modules, {})).toBe('/gestao-atendimento');
  });

  it('F menu e route guard concordam em agenda:view', () => {
    expect(resolveRoutePermission('/gestao-atendimento')).toBe('agenda:view');
    const home = category.items.find((i) => i.route === '/gestao-atendimento');
    const vis = canSeeNavItem(julianaSession, home, modules, {});
    expect(vis.permissionAllowed).toBe(canByPermission(julianaSession, 'agenda:view'));
  });

  it('G categoria com default permitido → defaultRoute', () => {
    expect(canByPermission(julianaSession, 'agenda:view')).toBe(true);
    expect(resolveCategoryLandingRoute(category, julianaSession, modules, {})).toBe('/gestao-atendimento');
  });

  it('H categoria com default negado → primeiro filho permitido', () => {
    const denied = {
      ...julianaSession,
      has_custom_permissions: true,
      permissionOverrides: { 'perm-agenda-view': false },
    };
    const landing = resolveCategoryLandingRoute(category, denied, modules, {});
    expect(landing).not.toBe('/gestao-atendimento');
    expect(['/orcamentos', '/pacientes/busca']).toContain(landing);
  });

  it('I nenhum filho permitido → fail-closed no Dashboard', () => {
    const see = () => ({ allowed: false });
    expect(resolveCategoryLandingRoute(category, julianaSession, modules, {}, { seeNavItem: see }))
      .toBe(DEFAULT_SAFE_LANDING);
  });

  it('J Juliana fixture: delta real sem agenda:view + flag tenant false → ALLOW via role', () => {
    expect(Object.prototype.hasOwnProperty.call(julianaDelta, 'perm-agenda-view')).toBe(false);
    expect(julianaDelta['perm-agenda-create']).toBe(true);
    expect(can(julianaSession, 'agenda', 'view')).toBe(true);
    expect(canByPermission(julianaSession, 'prontuario_orcamentos:view')).toBe(true);
    expect(canByPermission(julianaSession, 'patients:view')).toBe(true);
  });

  it('J2 seed incompleto de profissional no IDB não derruba a matriz oficial', () => {
    withDb((db) => {
      db.rolePermissions = (db.rolePermissions || []).filter((r) => r.role !== 'profissional');
      db.rolePermissions.push({ role: 'profissional', permission_id: 'perm-dashboard-view' });
      return db;
    });
    expect(canByPermission(julianaSession, 'agenda:view')).toBe(true);
  });

  it('J3 catálogo IDB sem agenda ainda resolve pid pelo catálogo oficial', () => {
    withDb((db) => {
      db.permissionsCatalog = [{ id: 'perm-dashboard-view', module_key: 'dashboard', action_key: 'view' }];
      return db;
    });
    expect(canByPermission(julianaSession, 'agenda:view')).toBe(true);
    expect(canByPermission(julianaSession, 'dashboard:view')).toBe(true);
  });

  it('K nenhum redirect loop: landing permitida ≠ Dashboard', () => {
    const landing = resolveCategoryLandingRoute(category, julianaSession, modules, {});
    expect(landing).not.toBe(DEFAULT_SAFE_LANDING);
  });

  it('L can() não clona o DB a cada verificação', () => {
    resetDbCloneCount();
    for (let i = 0; i < 40; i += 1) {
      canByPermission(julianaSession, 'agenda:view');
    }
    expect(getDbCloneCount()).toBe(0);
    expect(peekDb()).toBe(peekDb());
  });

  it('M Paulo não assina como Juliana', () => {
    const master = { id: PAULO_AUTH, role: 'master', isMaster: true, tenantId: TENANT };
    const decided = decideAuthenticatedProfessionalSignature(master, {
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: JULIANA_COL,
    });
    expect(decided.decision).toBe('DENY');
  });

  it('N identidade canônica da Juliana permanece o personId oficial', () => {
    expect(JULIANA_COL).toBe('col-5e1c66f5-342a-4ac8-936c-0eb603df73e8');
    expect(JULIANA_COL.startsWith('col-saas-')).toBe(false);
  });

  it('O bootstrap com tenant_users.has_custom_permissions=false ignora snapshot stale', () => {
    const session = {
      user: {
        id: JULIANA_AUTH,
        email: 'juliana@implanprime.com.br',
        app_metadata: {
          has_custom_permissions: true,
          permission_overrides: julianaDelta,
          custom_permissions: { 'perm-agenda-view': true },
          role: 'profissional',
        },
      },
    };
    const resolved = buildResolvedSaasUser(session, {
      tenantId: TENANT,
      role: 'profissional',
      isActive: true,
      collaboratorId: JULIANA_COL,
      has_custom_permissions: false,
    });
    expect(resolved.has_custom_permissions).toBe(false);
    expect(resolved.permissionOverrides).toEqual({});
    expect(canByPermission(resolved, 'agenda:view')).toBe(true);
  });
});
