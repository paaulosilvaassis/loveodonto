import { loadDb, loadDbAsync, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';
import { isCepValid, isCnpjValid, isPhoneValid, onlyDigits } from '../utils/validators.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

export const getClinic = () => {
  const db = loadDb();
  return {
    profile: db.clinicProfile,
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

const buildClinicSummaryFromDb = (db) => {
  const phone = db.clinicPhones.find((item) => item.principal) || db.clinicPhones[0];
  const address = db.clinicAddresses.find((item) => item.principal) || db.clinicAddresses[0];
  return {
    nomeClinica: db.clinicProfile.nomeClinica,
    nomeFantasia: db.clinicProfile.nomeFantasia,
    cnpj: db.clinicDocumentation.cnpj,
    logoUrl: db.clinicProfile.logoUrl,
    telefonePrincipal: phone ? `${phone.ddd}${phone.numero}` : '',
    enderecoPrincipal: address || null,
  };
};

export const getClinicSummary = () => {
  const db = loadDb();
  return buildClinicSummaryFromDb(db);
};

/** Versão assíncrona para não bloquear o thread (usa loadDbAsync). */
export const getClinicSummaryAsync = () => loadDbAsync().then(buildClinicSummaryFromDb);

export const updateClinicProfile = (user, payload) => {
  requirePermission(user, 'team:write');
  assertRequired(payload.nomeClinica, 'Nome da clínica é obrigatório.');
  return withDb((db) => {
    const before = { ...db.clinicProfile };
    db.clinicProfile = {
      ...db.clinicProfile,
      ...payload,
      nomeClinica: normalizeText(payload.nomeClinica),
      nomeFantasia: normalizeText(payload.nomeFantasia),
      razaoSocial: normalizeText(payload.razaoSocial),
      emailPrincipal: normalizeText(payload.emailPrincipal),
      updatedAt: new Date().toISOString(),
    };
    logAction('clinic:update-profile', { before, after: db.clinicProfile, userId: user.id });
    return db.clinicProfile;
  });
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
  const ddd = onlyDigits(payload.ddd);
  const numero = onlyDigits(payload.numero);
  if (!isPhoneValid(`${ddd}${numero}`)) {
    throw new Error('Telefone inválido.');
  }
  const phone = {
    id: createId('phone'),
    clinicId: 'clinic-1',
    tipo: normalizeText(payload.tipo),
    ddd,
    numero,
    principal: Boolean(payload.principal),
  };
  return withDb((db) => {
    if (phone.principal) {
      db.clinicPhones.forEach((item) => {
        item.principal = false;
      });
    }
    db.clinicPhones.push(phone);
    logAction('clinic:add-phone', { phoneId: phone.id, userId: user.id });
    return db.clinicPhones;
  });
};

export const removeClinicPhone = (user, phoneId) => {
  requirePermission(user, 'team:write');
  return withDb((db) => {
    db.clinicPhones = db.clinicPhones.filter((item) => item.id !== phoneId);
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
