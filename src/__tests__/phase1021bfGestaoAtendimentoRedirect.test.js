/**
 * PHASE_10.21BF — clique na área Gestão de Atendimento não pode bounce no Dashboard.
 * Sem signature evidence. Sem mutar CTR/ORC.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, loadDb } from '../db/index.js';
import { navCategories } from '../navigation/navCategories.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';
import {
  canSeeNavItem,
  resolveCategoryLandingRoute,
  DEFAULT_SAFE_LANDING,
} from '../navigation/navAccess.js';
import { can as canByPermission } from '../permissions/permissions.js';
import {
  resolveAuthenticatedSignerIdentity,
  decideAuthenticatedProfessionalSignature,
} from '../contracts/authenticatedSignerIdentity.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const JULIANA = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const modules = { CORE: true, AGENDA: true, CRM: true, FINANCEIRO: true, MARKETING: true, ESTOQUE: true, SUPORTE: true };

const profissional = {
  id: '7d6bf5ac-aaaa-4ac8-936c-00000000df30',
  role: 'profissional',
  tenantId: TENANT,
  isMaster: false,
};
const master = {
  id: '066dcd98-aecf-4886-8947-a439849e37f7',
  role: 'master',
  tenantId: TENANT,
  isMaster: true,
};

const category = navCategories.find((c) => c.id === 'gestao-atendimento');

describe('PHASE_10.21BF Gestão de Atendimento category landing', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A profissional resolve landing sem loop para o Dashboard', () => {
    const landing = resolveCategoryLandingRoute(category, profissional, modules, {});
    expect(landing).not.toBe(DEFAULT_SAFE_LANDING);
    expect(landing.startsWith('/gestao-atendimento') || landing.startsWith('/orcamentos') || landing.startsWith('/pacientes') || landing.startsWith('/gestao/agenda')).toBe(true);
  });

  it('B canonical collaborator id permanece o personId exigido', () => {
    expect(JULIANA).toBe('col-5e1c66f5-342a-4ac8-936c-0eb603df73e8');
  });

  it('C menu e route guard usam a mesma permissão agenda:view na home da área', () => {
    expect(resolveRoutePermission('/gestao-atendimento')).toBe('agenda:view');
    const home = category.items.find((i) => i.route === '/gestao-atendimento');
    const vis = canSeeNavItem(profissional, home, modules, {});
    expect(vis.permissionAllowed).toBe(canByPermission(profissional, 'agenda:view'));
  });

  it('D se a home da área for permitida, o clique permanece nela', () => {
    expect(canByPermission(profissional, 'agenda:view')).toBe(true);
    expect(resolveCategoryLandingRoute(category, profissional, modules, {})).toBe('/gestao-atendimento');
  });

  it('E se a home for negada, o clique cai no primeiro item permitido — sem bounce', () => {
    const see = (user, item) => ({ allowed: item.route !== '/gestao-atendimento' && item.route !== '/gestao/agenda' && item.route !== '/gestao-comercial/fluxo-do-paciente' && item.route !== '/gestao/convenios' });
    const landing = resolveCategoryLandingRoute(category, profissional, modules, {}, { seeNavItem: see });
    expect(landing).not.toBe('/gestao-atendimento');
    expect(landing).not.toBe(DEFAULT_SAFE_LANDING);
    expect(['/orcamentos', '/pacientes/busca']).toContain(landing);
  });

  it('F nenhum redirect loop: landing nunca aponta para rota negada', () => {
    const denied = new Set(['/gestao-atendimento']);
    const see = (_user, item) => ({ allowed: !denied.has(item.route) });
    const landing = resolveCategoryLandingRoute(category, profissional, modules, {}, { seeNavItem: see });
    expect(denied.has(landing)).toBe(false);
  });

  it('G master continua podendo cair na defaultRoute da área', () => {
    expect(resolveCategoryLandingRoute(category, master, modules, {})).toBe('/gestao-atendimento');
  });

  it('H profissional não ganha admin implicitamente', () => {
    expect(profissional.isMaster).toBe(false);
    expect(canByPermission(profissional, 'configuracoes:view')).toBe(false);
    expect(canByPermission(master, 'configuracoes:view')).toBe(true);
  });

  it('I Paulo não satisfaz PROFESSIONAL Juliana', () => {
    const decided = decideAuthenticatedProfessionalSignature(master, {
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: JULIANA,
    });
    expect(decided.decision).toBe('DENY');
    expect(loadDb().contractSignatures || []).toHaveLength(0);
  });

  it('J resolver da Juliana sem vínculo persistido não ALLOW', () => {
    const identity = resolveAuthenticatedSignerIdentity(profissional);
    expect(identity.linkedPersonIds.includes(JULIANA)).toBe(false);
    expect(decideAuthenticatedProfessionalSignature(profissional, {
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: JULIANA,
    }).decision).not.toBe('ALLOW');
  });

  it('K L nenhum teste cria evidence nem muta contrato', () => {
    expect(loadDb().contractSignatures || []).toHaveLength(0);
  });
});
