/**
 * PHASE_10.21BH — sidebar × dashboard × route guard no mesmo effective RBAC.
 * Sem signature evidence. Sem mutar CTR/ORC. Sem conceder permissão.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, peekDb, getDbCloneCount, resetDbCloneCount } from '../db/index.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { ROLE_DEFAULT_PERMISSIONS } from '../permissions/roleDefaults.js';
import { permissionId } from '../permissions/catalog.js';
import { navCategories } from '../navigation/navCategories.js';
import { DASHBOARD_QUICK_ACTIONS } from '../navigation/dashboardQuickActions.js';
import { canSeeNavItem, canSeeQuickAction } from '../navigation/navAccess.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';
import { isRoutePermissionAllowed } from '../utils/rbacHelpers.js';
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

const julianaDelta = { 'perm-agenda-create': true, 'perm-agenda-edit': true };

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

const AUDIT_ITEMS = [
  { label: 'Dashboard', permission: 'dashboard:view', route: '/gestao/dashboard', dashboardId: null },
  { label: 'Agenda', permission: 'agenda:view', route: '/gestao/agenda', dashboardId: 'agenda' },
  { label: 'Pacientes', permission: 'patients:view', route: '/pacientes/busca', dashboardId: 'pacientes' },
  { label: 'Orçamentos', permission: 'prontuario_orcamentos:view', route: '/orcamentos', dashboardId: 'orcamentos' },
  {
    label: 'Odontograma/Prontuário',
    permission: 'prontuario_atendimento:view',
    route: '/pacientes/busca',
    dashboardId: 'odontograma',
    dedicatedSidebar: false,
  },
  { label: 'Financeiro', permission: 'financeiro_relatorios:view', route: '/financeiro/contas-receber', dashboardId: 'financeiro' },
  { label: 'Relatórios', permission: 'financeiro_relatorios:view', route: '/financeiro/relatorios', dashboardId: 'relatorios' },
  { label: 'Gestão de Atendimento', permission: 'agenda:view', route: '/gestao-atendimento', dashboardId: null },
];

function roleDefaultFor(role, permissionKey) {
  const [mod, action] = permissionKey.split(':');
  const pid = permissionId(mod, action);
  return (ROLE_DEFAULT_PERMISSIONS[role] || []).includes(pid);
}

function explicitOverrideFor(user, permissionKey) {
  if (user.has_custom_permissions !== true) return null;
  const [mod, action] = permissionKey.split(':');
  const pid = permissionId(mod, action);
  const overrides = user.permissionOverrides || {};
  if (!Object.prototype.hasOwnProperty.call(overrides, pid)) return null;
  return overrides[pid];
}

function sidebarVisible(user, route) {
  return navCategories.some((category) => category.items.some((item) => (
    item.route === route && canSeeNavItem(user, item, modules, {}).allowed
  )));
}

function dashboardVisible(user, dashboardId) {
  if (!dashboardId) return null;
  const action = DASHBOARD_QUICK_ACTIONS.find((row) => row.id === dashboardId);
  return canSeeQuickAction(user, action, modules, {}).allowed;
}

function routeAllowed(user, route) {
  return isRoutePermissionAllowed(user, resolveRoutePermission(route), canByPermission);
}

function auditRow(user, item) {
  const roleDefault = roleDefaultFor(user.role, item.permission);
  const explicitOverride = explicitOverrideFor(user, item.permission);
  const effective = canByPermission(user, item.permission);
  const dash = dashboardVisible(user, item.dashboardId);
  const side = item.dedicatedSidebar === false ? false : sidebarVisible(user, item.route);
  const route = routeAllowed(user, item.route);
  return {
    label: item.label,
    permission: item.permission,
    roleDefault,
    explicitOverride,
    effective,
    dashboardVisible: dash,
    sidebarVisible: side,
    routeAllowed: route,
  };
}

describe('PHASE_10.21BH Juliana sidebar effective RBAC', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A profissional com has_custom_permissions=false usa a matriz oficial', () => {
    expect(julianaSession.has_custom_permissions).toBe(false);
    expect(ROLE_DEFAULT_PERMISSIONS.profissional).toBe(ROLE_DEFAULT_PERMISSIONS.dentista);
    expect(canByPermission(julianaSession, 'patients:view')).toBe(true);
    expect(canByPermission(julianaSession, 'agenda:view')).toBe(true);
    expect(canByPermission(julianaSession, 'financeiro_relatorios:view')).toBe(false);
  });

  it('B DELTA com agenda:view ausente não é DENY', () => {
    expect(Object.prototype.hasOwnProperty.call(julianaDelta, 'perm-agenda-view')).toBe(false);
    expect(canByPermission(julianaSession, 'agenda:view')).toBe(true);
  });

  it('C catálogo IDB incompleto/stale (pid errado) ainda resolve o pid oficial', () => {
    withDb((db) => {
      db.permissionsCatalog = [
        { id: 'perm-dashboard-view', module_key: 'dashboard', action_key: 'view' },
        { id: 'patients.view-LEGACY', module_key: 'patients', action_key: 'view' },
        { id: 'agenda.read-stale', module_key: 'agenda', action_key: 'view' },
      ];
      db.rolePermissions = [{ role: 'profissional', permission_id: 'perm-dashboard-view' }];
      return db;
    });
    expect(canByPermission(julianaSession, 'patients:view')).toBe(true);
    expect(canByPermission(julianaSession, 'agenda:view')).toBe(true);
    expect(sidebarVisible(julianaSession, '/pacientes/busca')).toBe(true);
    expect(sidebarVisible(julianaSession, '/gestao/agenda')).toBe(true);
  });

  it('D sidebar e route guard concordam', () => {
    for (const item of AUDIT_ITEMS) {
      if (item.dedicatedSidebar === false) continue;
      expect(sidebarVisible(julianaSession, item.route)).toBe(routeAllowed(julianaSession, item.route));
    }
  });

  it('E Dashboard e sidebar concordam quando usam a mesma permission', () => {
    const samePermission = AUDIT_ITEMS.filter((item) => item.dashboardId && item.dedicatedSidebar !== false);
    for (const item of samePermission) {
      const dash = dashboardVisible(julianaSession, item.dashboardId);
      const side = sidebarVisible(julianaSession, item.route);
      expect(dash).toBe(side);
      expect(dash).toBe(canByPermission(julianaSession, item.permission));
    }
  });

  it('F nenhum item admin aparece por acidente', () => {
    const adminRoutes = ['/admin/colaboradores', '/configuracoes/usuarios', '/admin/dados-clinica', '/admin/base-precos'];
    for (const route of adminRoutes) {
      expect(sidebarVisible(julianaSession, route)).toBe(false);
      expect(routeAllowed(julianaSession, route)).toBe(false);
    }
  });

  it('G false explícito continua DENY com custom oficialmente habilitado', () => {
    const denied = {
      ...julianaSession,
      has_custom_permissions: true,
      permissionOverrides: { 'perm-agenda-view': false },
    };
    expect(canByPermission(denied, 'agenda:view')).toBe(false);
    expect(sidebarVisible(denied, '/gestao/agenda')).toBe(false);
    expect(routeAllowed(denied, '/gestao/agenda')).toBe(false);
    expect(dashboardVisible(denied, 'agenda')).toBe(false);
  });

  it('H master/admin não sofre regressão', () => {
    const master = { id: PAULO_AUTH, role: 'master', isMaster: true, has_system_access: true };
    expect(canByPermission(master, 'agenda:view')).toBe(true);
    expect(canByPermission(master, 'configuracoes:view')).toBe(true);
    expect(sidebarVisible(master, '/admin/colaboradores')).toBe(true);
    expect(sidebarVisible(master, '/gestao/agenda')).toBe(true);
    expect(dashboardVisible(master, 'financeiro')).toBe(true);
  });

  it('I zero clone pesado por nav item', () => {
    resetDbCloneCount();
    for (const category of navCategories) {
      for (const item of category.items) {
        canSeeNavItem(julianaSession, item, modules, {});
      }
    }
    for (const action of DASHBOARD_QUICK_ACTIONS) {
      canSeeQuickAction(julianaSession, action, modules, {});
    }
    expect(getDbCloneCount()).toBe(0);
    expect(peekDb()).toBe(peekDb());
  });

  it('J identidade canônica da Juliana permanece intacta', () => {
    expect(JULIANA_COL).toBe('col-5e1c66f5-342a-4ac8-936c-0eb603df73e8');
    expect(JULIANA_COL.startsWith('col-saas-')).toBe(false);
    const master = { id: PAULO_AUTH, role: 'master', isMaster: true, tenantId: TENANT };
    const decided = decideAuthenticatedProfessionalSignature(master, {
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: JULIANA_COL,
    });
    expect(decided.decision).toBe('DENY');
  });

  it('K userPermissions stale no IDB não participam com has_custom_permissions=false', () => {
    withDb((db) => {
      db.users = db.users || [];
      db.users.push({
        id: JULIANA_AUTH,
        name: 'Juliana de Oliveira Freire',
        role: 'profissional',
        active: true,
        has_system_access: true,
        has_custom_permissions: true,
      });
      db.userPermissions = [
        { user_id: JULIANA_AUTH, permission_id: 'perm-financeiro_relatorios-view', allowed: true },
        { user_id: JULIANA_AUTH, permission_id: 'perm-relatorios-view', allowed: true },
      ];
      return db;
    });
    expect(canByPermission(julianaSession, 'financeiro_relatorios:view')).toBe(false);
    expect(dashboardVisible(julianaSession, 'financeiro')).toBe(false);
    expect(canByPermission(julianaSession, 'patients:view')).toBe(true);
  });

  it('L imprime a matriz efetiva item a item', () => {
    const rows = AUDIT_ITEMS.map((item) => auditRow(julianaSession, item));
    // eslint-disable-next-line no-console
    console.log('JULIANA_EFFECTIVE_PERMISSION_MATRIX\n', rows);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));

    expect(byLabel.Dashboard).toMatchObject({
      roleDefault: true, explicitOverride: null, effective: true,
      sidebarVisible: true, routeAllowed: true,
    });
    expect(byLabel.Agenda).toMatchObject({
      roleDefault: true, explicitOverride: null, effective: true,
      dashboardVisible: true, sidebarVisible: true, routeAllowed: true,
    });
    expect(byLabel.Pacientes).toMatchObject({
      roleDefault: true, explicitOverride: null, effective: true,
      dashboardVisible: true, sidebarVisible: true, routeAllowed: true,
    });
    expect(byLabel.Orçamentos).toMatchObject({
      roleDefault: true, explicitOverride: null, effective: true,
      dashboardVisible: true, sidebarVisible: true, routeAllowed: true,
    });
    expect(byLabel['Odontograma/Prontuário']).toMatchObject({
      roleDefault: true, explicitOverride: null, effective: true,
      dashboardVisible: true, sidebarVisible: false, routeAllowed: true,
    });
    expect(byLabel.Financeiro).toMatchObject({
      roleDefault: false, explicitOverride: null, effective: false,
      dashboardVisible: false, sidebarVisible: false, routeAllowed: false,
    });
    expect(byLabel.Relatórios).toMatchObject({
      roleDefault: false, explicitOverride: null, effective: false,
      dashboardVisible: false, sidebarVisible: false, routeAllowed: false,
    });
    expect(byLabel['Gestão de Atendimento']).toMatchObject({
      roleDefault: true, explicitOverride: null, effective: true,
      dashboardVisible: null, sidebarVisible: true, routeAllowed: true,
    });
  });
});
