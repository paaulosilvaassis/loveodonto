import { readTenantAccessSnapshot } from './platformAccessService.js';
import { isModuleEnabled } from '../tenant/tenantAccess.js';

export async function assertTenantActive(tenantId) {
  const context = await readTenantAccessSnapshot(tenantId);
  if (context.isTenantBlocked && context.tenantStatus === 'blocked') {
    throw new Error('Clínica bloqueada pela plataforma.');
  }
  if (context.isTenantBlocked && context.tenantStatus === 'suspended') {
    throw new Error('Clínica suspensa pela plataforma.');
  }
  return context;
}

export async function assertTenantModuleEnabled(tenantId, moduleName) {
  const context = await assertTenantActive(tenantId);
  if (!isModuleEnabled(context.modules, moduleName)) {
    throw new Error(`Módulo ${moduleName} não liberado para esta clínica.`);
  }
  return context;
}

export async function assertTenantFeatureFlagEnabled(tenantId, flagKey) {
  const context = await assertTenantActive(tenantId);
  const enabled = context?.flags?.[flagKey];
  if (enabled === false) {
    throw new Error(`Funcionalidade ${flagKey} não liberada para esta clínica.`);
  }
  return context;
}
