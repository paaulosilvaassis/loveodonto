/**
 * @module repositories/clinicProfile/clinicProfileIndexedDbRepository
 * @description Leitura legado IndexedDB — Clinic Profile.
 */

import { loadDb } from '../../db/index.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import type {
  ClinicProfileLegacyRow,
  ClinicProfileSummary,
  IClinicProfileIndexedDbReader,
} from './clinicProfileTypes.js';

function buildSummaryFromDb(db: ReturnType<typeof loadDb>, sessionTenantId = ''): ClinicProfileSummary | null {
  const tid = normalizeTenantId(sessionTenantId);
  const profileTenant = normalizeTenantId(db.clinicProfile?.tenant_id);
  if (tid && profileTenant && profileTenant !== tid) {
    return null;
  }
  const phone = db.clinicPhones.find((item) => item.principal) || db.clinicPhones[0];
  const address = db.clinicAddresses.find((item) => item.principal) || db.clinicAddresses[0];
  return {
    tenant_id: profileTenant || tid || null,
    nomeClinica: db.clinicProfile?.nomeClinica || '',
    nomeFantasia: db.clinicProfile?.nomeFantasia || '',
    cnpj: db.clinicDocumentation?.cnpj || '',
    logoUrl: db.clinicProfile?.logoUrl || '',
    telefonePrincipal: phone ? `${phone.ddd}${phone.numero}` : '',
    enderecoPrincipal: address || null,
  };
}

export const clinicProfileIndexedDbRepository: IClinicProfileIndexedDbReader = {
  getLegacyProfileSync(): ClinicProfileLegacyRow | null {
    const db = loadDb();
    if (!db.clinicProfile) return null;
    return { ...db.clinicProfile } as ClinicProfileLegacyRow;
  },

  getSummarySync(sessionTenantId = ''): ClinicProfileSummary | null {
    const db = loadDb();
    if (!db.clinicProfile) return null;
    return buildSummaryFromDb(db, sessionTenantId);
  },
};

export function getClinicProfileTenantIdSync(): string | null {
  return normalizeTenantId(loadDb().clinicProfile?.tenant_id) || null;
}
