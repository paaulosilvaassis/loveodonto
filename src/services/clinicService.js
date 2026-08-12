import { loadDb, loadDbAsync, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';
import { isCepValid, isCnpjValid, onlyDigits } from '../utils/validators.js';
import {
  normalizeBrazilianPhoneParts,
  isBrazilianPhonePartsValid,
  phonePartsToKey,
} from '../utils/phoneUtils.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { normalizeTenantId, requireSessionTenantId } from './tenantIsolation.js';
import { isSaasModeEnabled } from './saasAuthService.js';
import { saveClinicProfileRemote } from './clinicProfileApi.js';
import { resolveClinicLogoUrlForSave, assertLogoUrlSafeForApi } from './clinicLogoUploadService.js';
import { syncTenantClinicProfileToLocalDb } from './tenantClinicProfileSync.js';
import {
  readGetClinicProfile,
  readGetClinicSummary,
} from './clinicProfileServiceReadAdapter.js';
import { scheduleClinicProfileDualWriteUpdate } from './clinicProfileServiceWriteAdapter.js';
import { shouldUseClinicProfileRepositoryWrite } from './clinicProfileServiceRepositoryBridge.js';

export const getClinic = () => {
  const db = loadDb();
  const profile = readGetClinicProfile() ?? db.clinicProfile;
  return {
    profile,
    documentation: db.clinicDocumentation,
    phones: db.clinicPhones,
    addresses: db.clinicAddresses,
    businessHours: db.clinicBusinessHours,
    files: db.clinicFiles,
    mailServers: db.clinicMailServers.map((item) => ({
      ...item,
      smtpPassword: decryptSecret(item.smtpPassword),
    })),
    correspondence: db.clinicCorrespondence,
    additional: db.clinicAdditional,
    tax: db.clinicTax || null,
    nfse: db.clinicNfse,
    integrations: db.clinicIntegrations,
    webPresence: db.clinicWebPresence,
    license: db.clinicLicense,
    pricing: db.clinicPricing,
  };
};

const buildClinicSummaryFromDb = (db, sessionTenantId = '') => {
  const tid = normalizeTenantId(sessionTenantId);
  const profileTenant = normalizeTenantId(db.clinicProfile?.tenant_id);
  if (tid && profileTenant && profileTenant !== tid) {
    return null;
  }
  const phone = db.clinicPhones.find((item) => item.principal) || db.clinicPhones[0];
  const address = db.clinicAddresses.find((item) => item.principal) || db.clinicAddresses[0];
  return {
    tenant_id: profileTenant || tid || null,
    nomeClinica: db.clinicProfile.nomeClinica,
    nomeFantasia: db.clinicProfile.nomeFantasia,
    cnpj: db.clinicDocumentation.cnpj,
    logoUrl: db.clinicProfile.logoUrl,
    telefonePrincipal: phone ? `${phone.ddd}${phone.numero}` : '',
    enderecoPrincipal: address || null,
  };
};

export const getClinicSummary = (sessionTenantId = '') => {
  const fromRepository = readGetClinicSummary(sessionTenantId);
  if (fromRepository !== null) return fromRepository;
  const db = loadDb();
  return buildClinicSummaryFromDb(db, sessionTenantId);
};

/** Versão assíncrona para não bloquear o thread (usa loadDbAsync). */
export const getClinicSummaryAsync = (sessionTenantId = '') => {
  const fromRepository = readGetClinicSummary(sessionTenantId);
  if (fromRepository !== null) return Promise.resolve(fromRepository);
  return loadDbAsync().then((db) => buildClinicSummaryFromDb(db, sessionTenantId));
};

export const updateClinicProfile = async (user, payload, options = {}) => {
  requirePermission(user, 'team:write');
  assertRequired(payload.nomeClinica, 'Nome da clínica é obrigatório.');
  const tenantId = isSaasModeEnabled() ? requireSessionTenantId(user) : normalizeTenantId(user?.tenantId);
  const updated = withDb((db) => {
    const before = { ...db.clinicProfile };
    db.clinicProfile = {
      ...db.clinicProfile,
      ...payload,
      tenant_id: tenantId || db.clinicProfile?.tenant_id || null,
      nomeClinica: normalizeText(payload.nomeClinica),
      nomeFantasia: normalizeText(payload.nomeFantasia),
      razaoSocial: normalizeText(payload.razaoSocial),
      emailPrincipal: normalizeText(payload.emailPrincipal),
      updatedAt: new Date().toISOString(),
    };
    logAction('clinic:update-profile', { before, after: db.clinicProfile, userId: user.id });
    return db.clinicProfile;
  });

  const notifyClinicProfileSynced = () => {
    try {
      sessionStorage.removeItem('clinic.summary.cache');
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('saas:clinic-profile-synced', {
        detail: { tenantId: tenantId || null },
      }));
    }
  };

  if (isSaasModeEnabled() && tenantId) {
    const resolvedLogo = await resolveClinicLogoUrlForSave(
      tenantId,
      updated.logoUrl,
      { logoFile: options.logoFile || null },
    );
    const safeLogoUrl = assertLogoUrlSafeForApi(resolvedLogo ?? (updated.logoUrl || null));

    if (safeLogoUrl && safeLogoUrl !== updated.logoUrl) {
      withDb((db) => {
        db.clinicProfile = {
          ...db.clinicProfile,
          logoUrl: safeLogoUrl,
          updatedAt: new Date().toISOString(),
        };
        return db.clinicProfile;
      });
      updated.logoUrl = safeLogoUrl;
    }

    const remotePayload = {
      tenant_id: tenantId,
      nomeClinica: updated.nomeClinica,
      nomeFantasia: updated.nomeFantasia,
      razaoSocial: updated.razaoSocial,
      emailPrincipal: updated.emailPrincipal,
    };
    if (safeLogoUrl) {
      remotePayload.logoUrl = safeLogoUrl;
    }

    if (shouldUseClinicProfileRepositoryWrite()) {
      scheduleClinicProfileDualWriteUpdate(user, updated, tenantId, safeLogoUrl);
      notifyClinicProfileSynced();
      return { profile: updated, clinicProfile: null };
    }

    const res = await saveClinicProfileRemote(remotePayload);
    if (res?.clinicProfile) {
      syncTenantClinicProfileToLocalDb(res.clinicProfile, tenantId);
    } else {
      notifyClinicProfileSynced();
    }
    return { profile: updated, clinicProfile: res?.clinicProfile || null };
  }

  notifyClinicProfileSynced();
  return updated;
};

export const updateClinicDocumentation = (user, payload) => {
  requirePermission(user, 'team:write');
  if (payload.cnpj && !isCnpjValid(payload.cnpj)) {
    throw new Error('CNPJ inválido.');
  }
  return withDb((db) => {
    const before = { ...db.clinicDocumentation };
    db.clinicDocumentation = {
      ...db.clinicDocumentation,
      ...payload,
      cnpj: normalizeText(payload.cnpj),
      ie: normalizeText(payload.ie),
      cnes: normalizeText(payload.cnes),
      nire: normalizeText(payload.nire),
      conselhoRegionalNumero: normalizeText(payload.conselhoRegionalNumero),
      responsavelTecnico: normalizeText(payload.responsavelTecnico),
      croResponsavelTecnico: normalizeText(payload.croResponsavelTecnico),
      alvaraPrefeituraNumero: normalizeText(payload.alvaraPrefeituraNumero),
      alvaraAutorizacao: normalizeText(payload.alvaraAutorizacao),
      observacoes: normalizeText(payload.observacoes),
    };
    logAction('clinic:update-documentation', { before, after: db.clinicDocumentation, userId: user.id });
    return db.clinicDocumentation;
  });
};

export const addClinicPhone = (user, payload) => {
  requirePermission(user, 'team:write');
  const tipo = normalizeText(payload.tipo);
  if (!tipo) throw new Error('Selecione o tipo do telefone.');

  const { ddd, numero } = normalizeBrazilianPhoneParts(payload.ddd, payload.numero);
  if (!ddd) throw new Error('Informe o DDD com 2 dígitos.');
  if (!numero) throw new Error('Informe o número do telefone.');
  if (!isBrazilianPhonePartsValid(ddd, numero)) {
    throw new Error('Telefone inválido. Use 8 dígitos (fixo) ou 9 dígitos (celular).');
  }

  const phoneKey = phonePartsToKey(ddd, numero);
  const phone = {
    id: createId('phone'),
    clinicId: 'clinic-1',
    tipo,
    ddd,
    numero,
    principal: Boolean(payload.principal),
  };

  return withDb((db) => {
    const duplicate = (db.clinicPhones || []).some(
      (item) => phonePartsToKey(item.ddd, item.numero) === phoneKey && item.id !== payload.id,
    );
    if (duplicate) throw new Error('Este telefone já está cadastrado.');

    if (!db.clinicPhones.length) {
      phone.principal = true;
    } else if (phone.principal) {
      db.clinicPhones.forEach((item) => {
        item.principal = false;
      });
    }

    db.clinicPhones.push(phone);
    logAction('clinic:add-phone', { phoneId: phone.id, userId: user.id });
    return db.clinicPhones;
  });
};

export const updateClinicPhone = (user, phoneId, payload) => {
  requirePermission(user, 'team:write');
  const tipo = normalizeText(payload.tipo);
  if (!tipo) throw new Error('Selecione o tipo do telefone.');

  const { ddd, numero } = normalizeBrazilianPhoneParts(payload.ddd, payload.numero);
  if (!ddd) throw new Error('Informe o DDD com 2 dígitos.');
  if (!numero) throw new Error('Informe o número do telefone.');
  if (!isBrazilianPhonePartsValid(ddd, numero)) {
    throw new Error('Telefone inválido. Use 8 dígitos (fixo) ou 9 dígitos (celular).');
  }

  const phoneKey = phonePartsToKey(ddd, numero);

  return withDb((db) => {
    const idx = (db.clinicPhones || []).findIndex((item) => item.id === phoneId);
    if (idx < 0) throw new Error('Telefone não encontrado.');

    const duplicate = db.clinicPhones.some(
      (item) => item.id !== phoneId && phonePartsToKey(item.ddd, item.numero) === phoneKey,
    );
    if (duplicate) throw new Error('Este telefone já está cadastrado.');

    const principal = Boolean(payload.principal);
    if (principal) {
      db.clinicPhones.forEach((item) => {
        item.principal = false;
      });
    }

    db.clinicPhones[idx] = {
      ...db.clinicPhones[idx],
      tipo,
      ddd,
      numero,
      principal: principal || db.clinicPhones.length === 1,
    };

    if (!db.clinicPhones.some((item) => item.principal)) {
      db.clinicPhones[0].principal = true;
    }

    logAction('clinic:update-phone', { phoneId, userId: user.id });
    return db.clinicPhones;
  });
};

export const removeClinicPhone = (user, phoneId) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    const removed = (db.clinicPhones || []).find((item) => item.id === phoneId);
    db.clinicPhones = db.clinicPhones.filter((item) => item.id !== phoneId);
    if (removed?.principal && db.clinicPhones.length) {
      db.clinicPhones[0].principal = true;
    }
    logAction('clinic:remove-phone', { phoneId, userId: user.id });
    return db.clinicPhones;
  });
};

export const addClinicAddress = (user, payload) => {
  requirePermission(user, 'team:write');
  if (payload.cep && !isCepValid(payload.cep)) {
    throw new Error('CEP inválido.');
  }
  const address = {
    id: createId('addr'),
    clinicId: 'clinic-1',
    tipo: normalizeText(payload.tipo),
    cep: normalizeText(payload.cep),
    logradouro: normalizeText(payload.logradouro),
    numero: normalizeText(payload.numero),
    complemento: normalizeText(payload.complemento),
    bairro: normalizeText(payload.bairro),
    cidade: normalizeText(payload.cidade),
    uf: normalizeText(payload.uf),
    principal: Boolean(payload.principal),
  };
  return withDb((db) => {
    if (address.principal) {
      db.clinicAddresses.forEach((item) => {
        item.principal = false;
      });
    }
    db.clinicAddresses.push(address);
    logAction('clinic:add-address', { addressId: address.id, userId: user.id });
    return db.clinicAddresses;
  });
};

export const removeClinicAddress = (user, addressId) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicAddresses = db.clinicAddresses.filter((item) => item.id !== addressId);
    logAction('clinic:remove-address', { addressId, userId: user.id });
    return db.clinicAddresses;
  });
};

export const updateBusinessHours = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicBusinessHours = payload.map((item) => ({
      ...item,
      clinicId: 'clinic-1',
    }));
    logAction('clinic:update-hours', { userId: user.id });
    return db.clinicBusinessHours;
  });
};

export const addClinicFile = (user, payload) => {
  requirePermission(user, 'team:write');
  const file = {
    id: createId('file'),
    clinicId: 'clinic-1',
    categoria: normalizeText(payload.categoria),
    nomeArquivo: normalizeText(payload.nomeArquivo),
    fileUrl: payload.fileUrl || '',
    validade: normalizeText(payload.validade),
    createdAt: new Date().toISOString(),
  };
  return withDb((db) => {
    db.clinicFiles.push(file);
    logAction('clinic:add-file', { fileId: file.id, userId: user.id });
    return db.clinicFiles;
  });
};

export const removeClinicFile = (user, fileId) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicFiles = db.clinicFiles.filter((item) => item.id !== fileId);
    logAction('clinic:remove-file', { fileId, userId: user.id });
    return db.clinicFiles;
  });
};

export const updateCorrespondence = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicCorrespondence = { ...db.clinicCorrespondence, ...payload };
    logAction('clinic:update-correspondence', { userId: user.id });
    return db.clinicCorrespondence;
  });
};

export const updateAdditional = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicAdditional = { ...db.clinicAdditional, ...payload };
    logAction('clinic:update-additional', { userId: user.id });
    return db.clinicAdditional;
  });
};

export const updateClinicTax = (user, payload) => {
  requirePermission(user, 'team:write');
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dados de tributação inválidos.');
  }
  return withDb((db) => {
    const base = db.clinicTax || { clinicId: 'clinic-1' };
    db.clinicTax = {
      ...base,
      ...payload,
      clinicId: base.clinicId || 'clinic-1',
    };
    logAction('clinic:update-tax', { userId: user.id });
    return db.clinicTax;
  });
};

export const updateClinicPricing = (user, payload) => {
  requirePermission(user, 'team:write');
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dados de precificação inválidos.');
  }
  return withDb((db) => {
    const before = db.clinicPricing || null;
    const { taxConfig: _omit, ...rest } = payload;
    db.clinicPricing = {
      ...db.clinicPricing,
      ...rest,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.id || null,
    };
    logAction('clinic:update-pricing', { before, after: db.clinicPricing, userId: user.id });
    return db.clinicPricing;
  });
};

export const addMailServer = (user, payload) => {
  requirePermission(user, 'team:write');
  const server = {
    id: createId('smtp'),
    clinicId: 'clinic-1',
    provider: normalizeText(payload.provider),
    smtpHost: normalizeText(payload.smtpHost),
    smtpPort: Number(payload.smtpPort || 0),
    smtpUser: normalizeText(payload.smtpUser),
    smtpPassword: encryptSecret(payload.smtpPassword),
    fromName: normalizeText(payload.fromName),
    fromEmail: normalizeText(payload.fromEmail),
    testStatus: 'pendente',
    lastTestAt: '',
  };
  return withDb((db) => {
    db.clinicMailServers.push(server);
    logAction('clinic:add-mail-server', { serverId: server.id, userId: user.id });
    return db.clinicMailServers;
  });
};

export const testMailServer = (user, serverId) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    const server = db.clinicMailServers.find((item) => item.id === serverId);
    if (!server) throw new Error('Servidor não encontrado.');
    server.testStatus = 'ok';
    server.lastTestAt = new Date().toISOString();
    logAction('clinic:test-mail-server', { serverId, userId: user.id });
    return server;
  });
};

export const removeMailServer = (user, serverId) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicMailServers = db.clinicMailServers.filter((item) => item.id !== serverId);
    logAction('clinic:remove-mail-server', { serverId, userId: user.id });
    return db.clinicMailServers;
  });
};

export const updateNfse = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicNfse = { ...db.clinicNfse, ...payload };
    logAction('clinic:update-nfse', { userId: user.id });
    return db.clinicNfse;
  });
};

export const updateIntegrations = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicIntegrations = { ...db.clinicIntegrations, ...payload };
    logAction('clinic:update-integrations', { userId: user.id });
    return db.clinicIntegrations;
  });
};

export const updateWebPresence = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicWebPresence = { ...db.clinicWebPresence, ...payload };
    logAction('clinic:update-web', { userId: user.id });
    return db.clinicWebPresence;
  });
};

export const updateLicense = (user, payload) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicLicense = { ...db.clinicLicense, ...payload };
    logAction('clinic:update-license', { userId: user.id });
    return db.clinicLicense;
  });
};
