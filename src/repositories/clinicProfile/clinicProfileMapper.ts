/**
 * @module repositories/clinicProfile/clinicProfileMapper
 * @description Mapeamento Admin API / Supabase ↔ core ↔ legado IDB.
 */

import type {
  ClinicProfileCore,
  ClinicProfileLegacyRow,
  ClinicProfileStatus,
  ClinicProfileSummary,
  ClinicProfileUpdateCoreDto,
} from './clinicProfileTypes.js';

function normalizeTenantId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeStatus(value: unknown): ClinicProfileStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'inativo' || raw === 'inactive') return 'inativo';
  return 'ativo';
}

function buildClinicId(tenantId: string): string {
  return `clinic-${tenantId.slice(0, 8)}`;
}

/** @param {Record<string, unknown>|null|undefined} serverProfile */
export function mapServerProfileToCore(serverProfile: Record<string, unknown> | null | undefined): ClinicProfileCore | null {
  if (!serverProfile || typeof serverProfile !== 'object') return null;
  const tenantId = normalizeTenantId(serverProfile.tenant_id ?? serverProfile.tenantId);
  if (!tenantId) return null;

  const name = String(
    serverProfile.name ?? serverProfile.nomeClinica ?? '',
  ).trim();
  const fantasyName = String(
    serverProfile.fantasy_name ?? serverProfile.fantasyName ?? serverProfile.nomeFantasia ?? name,
  ).trim();
  const legalName = String(
    serverProfile.legal_name ?? serverProfile.legalName ?? serverProfile.razaoSocial ?? fantasyName,
  ).trim();
  const logoUrl = String(
    serverProfile.logo_url ?? serverProfile.logoUrl ?? '',
  ).trim() || null;

  return {
    tenantId,
    clinicId: String(serverProfile.clinic_id ?? serverProfile.id ?? buildClinicId(tenantId)).trim(),
    name: name || fantasyName || legalName,
    fantasyName: fantasyName || name || legalName,
    legalName: legalName || fantasyName || name,
    email: String(serverProfile.email ?? serverProfile.emailPrincipal ?? '').trim() || null,
    logoUrl,
    phone: String(serverProfile.phone ?? '').trim() || null,
    cnpj: String(serverProfile.cnpj ?? '').trim() || null,
    status: normalizeStatus(serverProfile.status),
  };
}

export function mapCoreToLegacyRow(core: ClinicProfileCore): ClinicProfileLegacyRow {
  return {
    id: core.clinicId,
    tenant_id: core.tenantId,
    nomeClinica: core.name,
    nomeFantasia: core.fantasyName,
    razaoSocial: core.legalName,
    nomeMarca: core.fantasyName,
    emailPrincipal: core.email || '',
    logoUrl: core.logoUrl || '',
    status: core.status,
  };
}

export function mapLegacyRowToCore(row: ClinicProfileLegacyRow | null): ClinicProfileCore | null {
  if (!row) return null;
  const tenantId = normalizeTenantId(row.tenant_id);
  if (!tenantId) return null;
  return {
    tenantId,
    clinicId: String(row.id || buildClinicId(tenantId)).trim(),
    name: String(row.nomeClinica || '').trim(),
    fantasyName: String(row.nomeFantasia || row.nomeClinica || '').trim(),
    legalName: String(row.razaoSocial || row.nomeFantasia || '').trim(),
    email: String(row.emailPrincipal || '').trim() || null,
    logoUrl: String(row.logoUrl || '').trim() || null,
    phone: null,
    cnpj: null,
    status: normalizeStatus(row.status),
  };
}

export function mapCoreToSummary(
  core: ClinicProfileCore,
  extras: { cnpj?: string; phone?: string; address?: Record<string, unknown> | null } = {},
): ClinicProfileSummary {
  return {
    tenant_id: core.tenantId,
    nomeClinica: core.name,
    nomeFantasia: core.fantasyName,
    cnpj: extras.cnpj ?? core.cnpj ?? '',
    logoUrl: core.logoUrl || '',
    telefonePrincipal: extras.phone ?? core.phone ?? '',
    enderecoPrincipal: extras.address ?? null,
  };
}

export function mapServerProfileToSummary(serverProfile: Record<string, unknown> | null | undefined): ClinicProfileSummary | null {
  const core = mapServerProfileToCore(serverProfile);
  if (!core) return null;
  return mapCoreToSummary(core, {
    cnpj: String(serverProfile?.cnpj ?? '').trim(),
    phone: String(serverProfile?.phone ?? '').trim(),
    address: null,
  });
}

/** Mapeia perfil legado IDB para payload Admin API (core only). */
export function mapLegacyProfileToUpdateDto(
  profile: Record<string, unknown>,
  logoUrl?: string | null,
): ClinicProfileUpdateCoreDto {
  const dto: ClinicProfileUpdateCoreDto = {
    nomeClinica: String(profile.nomeClinica || '').trim(),
    nomeFantasia: String(profile.nomeFantasia || '').trim(),
    razaoSocial: String(profile.razaoSocial || '').trim(),
    emailPrincipal: String(profile.emailPrincipal || '').trim(),
  };
  const resolvedLogo = logoUrl !== undefined ? logoUrl : (profile.logoUrl || null);
  if (resolvedLogo) {
    dto.logoUrl = String(resolvedLogo).trim();
  }
  return dto;
}
