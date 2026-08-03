/**
 * @module repositories/collaborator/collaboratorSupabaseRepository
 * @description Adapter Supabase `public.collaborators`.
 * **Ticket:** Sprint 1A — 1.4 internal wiring
 */

import { supabaseAppClient } from '../../lib/supabaseClients.js';
import { mapCoreToSupabaseUpsert, mapSupabaseRowToCore } from './collaboratorMapper.js';
import { requireRepositoryTenantId } from './collaboratorRepositoryGuards.js';
import type {
  CollaboratorCore,
  CollaboratorListFilters,
  CollaboratorSupabaseRow,
  CollaboratorSupabaseUpsertDto,
  ICollaboratorSupabaseRepository,
} from './collaboratorTypes.js';
import { CollaboratorRepositorySupabaseUnavailableError } from './collaboratorTypes.js';

export const COLLABORATORS_TABLE = 'collaborators';

function getClient() {
  if (!supabaseAppClient) {
    throw new CollaboratorRepositorySupabaseUnavailableError();
  }
  return supabaseAppClient;
}

function applyListFilters(
  items: CollaboratorCore[],
  filters?: CollaboratorListFilters,
): CollaboratorCore[] {
  if (!filters) return items;
  let result = items;
  if (filters.status) {
    result = result.filter((item) => item.status === filters.status);
  }
  if (filters.agendaEnabled !== undefined) {
    result = result.filter((item) => item.agendaEnabled === filters.agendaEnabled);
  }
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (item) =>
        item.apelido.toLowerCase().includes(q)
        || item.nomeCompleto.toLowerCase().includes(q)
        || String(item.email || '').toLowerCase().includes(q),
    );
  }
  if (!filters.includeDeleted) {
    result = result.filter((item) => !item.deletedAt && item.status !== 'inativo');
  }
  return result;
}

function mapRows(rows: CollaboratorSupabaseRow[]): CollaboratorCore[] {
  return (rows || []).map((row) => mapSupabaseRowToCore(row));
}

export class CollaboratorSupabaseRepository implements ICollaboratorSupabaseRepository {
  async findByUuid(tenantId: string, uuid: string): Promise<CollaboratorCore | null> {
    requireRepositoryTenantId(tenantId);
    const id = String(uuid || '').trim();
    if (!id) return null;
    const client = getClient();
    const { data, error } = await client
      .from(COLLABORATORS_TABLE)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapSupabaseRowToCore(data as CollaboratorSupabaseRow) : null;
  }

  async findByLegacyId(tenantId: string, legacyId: string): Promise<CollaboratorCore | null> {
    requireRepositoryTenantId(tenantId);
    const legacy = String(legacyId || '').trim();
    if (!legacy) return null;
    const client = getClient();
    const { data, error } = await client
      .from(COLLABORATORS_TABLE)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('legacy_id', legacy)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapSupabaseRowToCore(data as CollaboratorSupabaseRow) : null;
  }

  async list(tenantId: string, filters?: CollaboratorListFilters): Promise<CollaboratorCore[]> {
    requireRepositoryTenantId(tenantId);
    const client = getClient();
    const { data, error } = await client
      .from(COLLABORATORS_TABLE)
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    return applyListFilters(mapRows((data || []) as CollaboratorSupabaseRow[]), filters);
  }

  async upsert(tenantId: string, dto: CollaboratorSupabaseUpsertDto): Promise<CollaboratorCore> {
    requireRepositoryTenantId(tenantId);
    requireRepositoryTenantId(dto?.tenant_id);
    const client = getClient();
    const payload = { ...dto, tenant_id: tenantId };
    const { data, error } = await client
      .from(COLLABORATORS_TABLE)
      .upsert(payload)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return mapSupabaseRowToCore(data as CollaboratorSupabaseRow);
  }

  async softDelete(tenantId: string, uuid: string): Promise<void> {
    requireRepositoryTenantId(tenantId);
    const client = getClient();
    const { error } = await client
      .from(COLLABORATORS_TABLE)
      .update({ deleted_at: new Date().toISOString(), status: 'inativo' })
      .eq('tenant_id', tenantId)
      .eq('id', uuid);
    if (error) throw new Error(error.message);
  }
}

/** Permite injeção de client em testes via factory. */
export function createCollaboratorSupabaseRepository(): ICollaboratorSupabaseRepository {
  return new CollaboratorSupabaseRepository();
}

export const collaboratorSupabaseRepository: ICollaboratorSupabaseRepository =
  new CollaboratorSupabaseRepository();
