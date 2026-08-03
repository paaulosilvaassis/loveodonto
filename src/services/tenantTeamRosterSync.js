/**
 * Sincroniza colaboradores mínimos a partir do roster do tenant (Supabase tenant_users)
 * para o IndexedDB local — necessário quando o usuário entra em browser/dispositivo novo.
 */
import { loadDb, withDb } from '../db/index.js';
import { normalizeTenantId } from './tenantIsolation.js';
import { createId } from './helpers.js';
import { isAgendaProfessional } from '../constants/collaboratorRhCatalog.js';

const SAAS_COLLAB_PREFIX = 'col-saas-';

/** Mapeia role_slug do tenant para perfil RH mínimo (agenda, filtros, etc.). */
export function roleToMinimalRhProfile(roleSlug) {
  const role = String(roleSlug || '').trim().toLowerCase();
  if (['dentista', 'profissional', 'doctor', 'dentist'].includes(role)) {
    return {
      rhCategoria: 'Corpo Clínico',
      cargo: 'Dentista',
      tipoVinculo: 'PJ',
      setor: 'Clínico',
    };
  }
  if (['ortodontista'].includes(role)) {
    return {
      rhCategoria: 'Corpo Clínico',
      cargo: 'Ortodontista',
      tipoVinculo: 'PJ',
      setor: 'Clínico',
    };
  }
  if (['gerente', 'manager'].includes(role)) {
    return {
      rhCategoria: 'Diretoria e Gestão',
      cargo: 'Gerente de Clínica',
      tipoVinculo: 'CLT',
      setor: 'Administrativo',
    };
  }
  if (['financeiro', 'finance', 'financial'].includes(role)) {
    return {
      rhCategoria: 'Financeiro',
      cargo: 'Analista Financeiro',
      tipoVinculo: 'CLT',
      setor: 'Financeiro',
    };
  }
  if (['comercial', 'sales', 'commercial'].includes(role)) {
    return {
      rhCategoria: 'Comercial',
      cargo: 'Consultor Comercial',
      tipoVinculo: 'CLT',
      setor: 'Comercial',
    };
  }
  return {
    rhCategoria: 'Recepção e Atendimento',
    cargo: 'Recepcionista',
    tipoVinculo: 'CLT',
    setor: 'Administrativo',
  };
}

function resolveCollaboratorId(member) {
  const fromServer = String(member?.collaborator_id || member?.collaboratorId || '').trim();
  if (fromServer) return fromServer;
  const email = String(member?.email || '').trim().toLowerCase();
  if (!email) return createId('col');
  return `${SAAS_COLLAB_PREFIX}${email.replace(/[^a-z0-9]/g, '-').slice(0, 48)}`;
}

function isSaasSyntheticCollaboratorId(id) {
  return String(id || '').startsWith(SAAS_COLLAB_PREFIX);
}

/**
 * @param {Array<object>} teamRoster — linhas de tenant_users vindas do tenant-context
 * @param {string} tenantId
 */
export function reconcileSaasTeamRoster(teamRoster, tenantId) {
  const tid = normalizeTenantId(tenantId);
  if (!tid || !Array.isArray(teamRoster) || teamRoster.length === 0) return 0;

  const now = new Date().toISOString();
  let changed = 0;

  withDb((db) => {
    db.collaborators = db.collaborators || [];
    db.collaboratorAccess = db.collaboratorAccess || [];

    for (const member of teamRoster) {
      const email = String(member?.email || '').trim().toLowerCase();
      if (!email) continue;

      const collabId = resolveCollaboratorId(member);
      const fullName = String(member?.full_name || member?.fullName || email.split('@')[0]).trim();
      const rhStub = roleToMinimalRhProfile(member?.role || member?.role_slug);
      const userId = String(member?.user_id || member?.userId || '').trim();

      const byIdIdx = db.collaborators.findIndex((c) => c.id === collabId);
      const byEmailIdx = db.collaborators.findIndex(
        (c) => (c.email || '').trim().toLowerCase() === email,
      );
      const idx = byIdIdx >= 0 ? byIdIdx : byEmailIdx;

      const baseRecord = {
        id: collabId,
        tenant_id: tid,
        status: member?.is_active === false || member?.status === 'inactive' ? 'inativo' : 'ativo',
        apelido: fullName.split(' ')[0] || fullName,
        nomeCompleto: fullName,
        nomeSocial: '',
        sexo: '',
        dataNascimento: '',
        fotoUrl: '',
        email,
        especialidades: [],
        registroProfissional: '',
        conselhoNome: '',
        conselhoUf: '',
        rhFuncaoDescricao: '',
        createdAt: now,
        updatedAt: now,
        ...rhStub,
      };

      if (idx >= 0) {
        const prev = db.collaborators[idx];
        const keepClinicalProfile = isAgendaProfessional(prev) && !isAgendaProfessional({ ...rhStub, rhCategoria: rhStub.rhCategoria, cargo: rhStub.cargo });
        db.collaborators[idx] = {
          ...baseRecord,
          ...prev,
          id: String(prev.id || collabId).startsWith('col-') ? prev.id : collabId,
          tenant_id: tid,
          email,
          nomeCompleto: prev.nomeCompleto || fullName,
          apelido: prev.apelido || baseRecord.apelido,
          fotoUrl: prev.fotoUrl || prev.foto_url || '',
          status: baseRecord.status,
          updatedAt: now,
          rhCategoria: keepClinicalProfile ? prev.rhCategoria : (prev.rhCategoria || rhStub.rhCategoria),
          cargo: keepClinicalProfile ? prev.cargo : (prev.cargo || rhStub.cargo),
          tipoVinculo: prev.tipoVinculo || rhStub.tipoVinculo,
          setor: keepClinicalProfile ? prev.setor : (prev.setor || rhStub.setor),
        };
      } else {
        db.collaborators.push(baseRecord);
      }

      if (userId) {
        const linkedId = db.collaborators[idx >= 0 ? idx : db.collaborators.length - 1]?.id || collabId;
        db.collaboratorAccess = db.collaboratorAccess.filter(
          (a) => a.userId !== userId || a.collaboratorId === linkedId,
        );
        const accessIdx = db.collaboratorAccess.findIndex(
          (a) => a.collaboratorId === linkedId && a.userId === userId,
        );
        const accessRecord = {
          collaboratorId: linkedId,
          userId,
          tenant_id: tid,
          role: String(member?.role || member?.role_slug || 'atendimento').trim(),
          permissions: [],
          lastLoginAt: accessIdx >= 0 ? (db.collaboratorAccess[accessIdx].lastLoginAt || '') : '',
        };
        if (accessIdx >= 0) {
          db.collaboratorAccess[accessIdx] = { ...db.collaboratorAccess[accessIdx], ...accessRecord };
        } else {
          db.collaboratorAccess.push(accessRecord);
        }
      }

      changed += 1;
    }

    const rosterEmails = new Set(
      teamRoster.map((m) => String(m?.email || '').trim().toLowerCase()).filter(Boolean),
    );
    db.collaborators = db.collaborators.filter((c) => {
      const email = (c.email || '').trim().toLowerCase();
      if (!email || !rosterEmails.has(email)) return true;
      const realId = db.collaborators.find(
        (x) => (x.email || '').trim().toLowerCase() === email && !isSaasSyntheticCollaboratorId(x.id),
      )?.id;
      if (!realId) return true;
      return !isSaasSyntheticCollaboratorId(c.id) || c.id === realId;
    });

    return db;
  });

  return changed;
}

/** Backfill tenant_id em colaboradores legados da clínica ativa. */
export function backfillCollaboratorTenantIds(tenantId) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return 0;
  const db = loadDb();
  const missing = (db.collaborators || []).filter(
    (c) => !normalizeTenantId(c.tenant_id || c.tenantId),
  );
  if (missing.length === 0) return 0;
  withDb((d) => {
    d.collaborators = (d.collaborators || []).map((c) => {
      if (normalizeTenantId(c.tenant_id || c.tenantId)) return c;
      return { ...c, tenant_id: tid, updatedAt: new Date().toISOString() };
    });
    return d;
  });
  return missing.length;
}
