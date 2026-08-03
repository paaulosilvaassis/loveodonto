/**
 * @module repositories/clinicProfile/clinicProfileTypes
 * @description Tipos da Repository Layer Clinic Profile V3 (Phase 5.5 read / 5.6 write).
 */

export type ClinicProfileStatus = 'ativo' | 'inativo';

/** Perfil core normalizado (Admin API / Supabase SSOT). */
export interface ClinicProfileCore {
  tenantId: string;
  clinicId: string;
  name: string;
  fantasyName: string;
  legalName: string;
  email: string | null;
  logoUrl: string | null;
  phone: string | null;
  cnpj: string | null;
  status: ClinicProfileStatus;
}

/** Shape legado IndexedDB (clinicProfile). */
export interface ClinicProfileLegacyRow {
  id: string;
  tenant_id: string | null;
  nomeClinica: string;
  nomeFantasia: string;
  razaoSocial: string;
  nomeMarca?: string;
  emailPrincipal: string;
  logoUrl: string;
  status: ClinicProfileStatus;
  createdAt?: string;
  updatedAt?: string;
}

/** Resumo síncrono para branding/UI. */
export interface ClinicProfileSummary {
  tenant_id: string | null;
  nomeClinica: string;
  nomeFantasia: string;
  cnpj: string;
  logoUrl: string;
  telefonePrincipal: string;
  enderecoPrincipal: Record<string, unknown> | null;
}

export type ClinicProfileReadSource =
  | 'admin-api'
  | 'indexeddb'
  | 'indexeddb-offline'
  | 'cache';

export interface ClinicProfileReadResult {
  core: ClinicProfileCore | null;
  source: ClinicProfileReadSource;
}

export interface IClinicProfileIndexedDbReader {
  getLegacyProfileSync(): ClinicProfileLegacyRow | null;
  getSummarySync(sessionTenantId?: string): ClinicProfileSummary | null;
}

export interface IClinicProfileAdminApiReader {
  fetchProfile(tenantId: string): Promise<Record<string, unknown> | null>;
}

export interface ClinicProfileUpdateCoreDto {
  nomeClinica: string;
  nomeFantasia: string;
  razaoSocial: string;
  emailPrincipal: string;
  logoUrl?: string | null;
}

export interface IClinicProfileAdminApiWriter {
  saveProfile(
    tenantId: string,
    payload: ClinicProfileUpdateCoreDto,
  ): Promise<Record<string, unknown> | null>;
}

export interface IClinicProfileAdminApiClient extends IClinicProfileAdminApiReader, IClinicProfileAdminApiWriter {}

export interface IClinicProfileCache {
  get(tenantId: string): ClinicProfileCore | null;
  set(tenantId: string, core: ClinicProfileCore): void;
  clearTenant(tenantId: string): void;
}

export interface IClinicProfileRepository {
  getProfileSync(sessionTenantId?: string): ClinicProfileLegacyRow | null;
  getSummarySync(sessionTenantId?: string): ClinicProfileSummary | null;
  getCoreAsync(tenantId: string): Promise<ClinicProfileReadResult>;
  updateCore(tenantId: string, dto: ClinicProfileUpdateCoreDto): Promise<ClinicProfileCore>;
  syncCacheFromRemote(tenantId: string): Promise<number>;
  compareIdbVsRemote(tenantId: string): Promise<Record<string, unknown> | null>;
}

export class ClinicProfileRepositoryRemoteWriteDisabledError extends Error {
  readonly code = 'CLINIC_PROFILE_REMOTE_WRITE_DISABLED';

  constructor() {
    super('Escrita remota desabilitada (CLINIC_PROFILE_WRITE=false).');
    this.name = 'ClinicProfileRepositoryRemoteWriteDisabledError';
  }
}

export class ClinicProfileNotFoundError extends Error {
  readonly code = 'CLINIC_PROFILE_NOT_FOUND';

  constructor(tenantId: string) {
    super(`Clinic profile não encontrado para tenant ${tenantId}.`);
    this.name = 'ClinicProfileNotFoundError';
  }
}
