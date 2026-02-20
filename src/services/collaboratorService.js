import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';
import { isCepValid, isCpfValid, isPhoneValid, onlyDigits, validateFileMeta } from '../utils/validators.js';

const normalizeCargo = (value) => normalizeText(value);

const ensureUnique = (db, { cpf, email, registro }) => {
  if (cpf) {
    const exists = db.collaboratorDocuments.some((doc) => onlyDigits(doc.cpf) === onlyDigits(cpf));
    if (exists) throw new Error('CPF já cadastrado.');
  }
  if (email) {
    const exists = db.collaborators.some((item) => item.email === email);
    if (exists) throw new Error('E-mail já cadastrado.');
  }
  if (registro) {
    const exists = db.collaborators.some((item) => item.registroProfissional === registro);
    if (exists) throw new Error('Registro profissional já cadastrado.');
  }
};

export const listCollaborators = (filters = {}) => {
  const db = loadDb();
  return db.collaborators.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.cargo && item.cargo !== filters.cargo) return false;
    if (filters.especialidade && !item.especialidades?.includes(filters.especialidade)) return false;
    return true;
  });
};

/** Normaliza o objeto de acesso para expor sempre userId (vínculo com auth user). */
function normalizeAccess(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const userId = (raw.userId ?? raw.user_id ?? '').toString().trim();
  return { ...raw, userId: userId || undefined };
}

export const getCollaborator = (collaboratorId) => {
  const db = loadDb();
  const base = db.collaborators.find((item) => item.id === collaboratorId);
  if (!base) return null;
  const rawAccess = db.collaboratorAccess.find((item) => item.collaboratorId === collaboratorId) || {};
  const access = normalizeAccess(rawAccess);
  return {
    profile: base,
    documents: db.collaboratorDocuments.find((item) => item.collaboratorId === collaboratorId) || {},
    education: db.collaboratorEducation.filter((item) => item.collaboratorId === collaboratorId),
    nationality: db.collaboratorNationality.find((item) => item.collaboratorId === collaboratorId) || {},
    phones: db.collaboratorPhones.filter((item) => item.collaboratorId === collaboratorId),
    addresses: db.collaboratorAddresses.filter((item) => item.collaboratorId === collaboratorId),
    relationships: db.collaboratorRelationships.find((item) => item.collaboratorId === collaboratorId) || {},
    characteristics: db.collaboratorCharacteristics.find((item) => item.collaboratorId === collaboratorId) || {},
    additional: db.collaboratorAdditional.find((item) => item.collaboratorId === collaboratorId) || { notes: '' },
    insurances: db.collaboratorInsurances.filter((item) => item.collaboratorId === collaboratorId),
    access,
    workHours: db.collaboratorWorkHours.filter((item) => item.collaboratorId === collaboratorId),
    finance: db.collaboratorFinance.find((item) => item.collaboratorId === collaboratorId) || {},
  };
};

export const createCollaborator = (user, payload) => {
  requirePermission(user, 'collaborators:write');
  const collaborator = {
    id: createId('col'),
    status: payload.status || 'ativo',
    apelido: normalizeText(payload.apelido),
    nomeCompleto: normalizeText(payload.nomeCompleto),
    nomeSocial: normalizeText(payload.nomeSocial),
    sexo: normalizeText(payload.sexo),
    dataNascimento: normalizeText(payload.dataNascimento),
    fotoUrl: payload.fotoUrl || '',
    cargo: normalizeCargo(payload.cargo),
    especialidades: payload.especialidades || [],
    registroProfissional: normalizeText(payload.registroProfissional),
    email: normalizeText(payload.email),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assertRequired(collaborator.apelido, 'Apelido é obrigatório.');
  assertRequired(collaborator.nomeCompleto, 'Nome completo é obrigatório.');
  assertRequired(collaborator.cargo, 'Cargo é obrigatório.');

  withDb((db) => {
    ensureUnique(db, {
      cpf: payload.cpf,
      email: collaborator.email,
      registro: collaborator.registroProfissional,
    });
    db.collaborators.push(collaborator);
    logAction('collaborator:create', { collaboratorId: collaborator.id, userId: user.id });
    return db;
  });
  return collaborator;
};

export const updateCollaborator = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    const index = db.collaborators.findIndex((item) => item.id === collaboratorId);
    if (index < 0) throw new Error('Colaborador não encontrado.');
    const next = {
      ...db.collaborators[index],
      ...payload,
      apelido: normalizeText(payload.apelido ?? db.collaborators[index].apelido),
      nomeCompleto: normalizeText(payload.nomeCompleto ?? db.collaborators[index].nomeCompleto),
      cargo: normalizeCargo(payload.cargo ?? db.collaborators[index].cargo),
      registroProfissional: normalizeText(payload.registroProfissional ?? db.collaborators[index].registroProfissional),
      email: normalizeText(payload.email ?? db.collaborators[index].email),
      updatedAt: new Date().toISOString(),
    };
    ensureUnique(db, {
      email: next.email,
      registro: next.registroProfissional,
    });
    db.collaborators[index] = next;
    logAction('collaborator:update', { collaboratorId, userId: user.id });
    return next;
  });
};

export const uploadCollaboratorPhoto = (user, collaboratorId, file) => {
  requirePermission(user, 'collaborators:write');
  const validation = validateFileMeta(file, ['image/png', 'image/jpeg']);
  if (!validation.ok) throw new Error(validation.message);
  return updateCollaborator(user, collaboratorId, { fotoUrl: file.dataUrl });
};

export const updateCollaboratorDocuments = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  if (payload.cpf && !isCpfValid(payload.cpf)) {
    throw new Error('CPF inválido.');
  }
  return withDb((db) => {
    ensureUnique(db, { cpf: payload.cpf });
    const next = {
      collaboratorId,
      cpf: normalizeText(payload.cpf),
      rg: normalizeText(payload.rg),
      pisPasep: normalizeText(payload.pisPasep),
      ctps: normalizeText(payload.ctps),
      cnpj: normalizeText(payload.cnpj),
      tipoContratacao: normalizeText(payload.tipoContratacao),
      dataAdmissao: normalizeText(payload.dataAdmissao),
      dataDemissao: normalizeText(payload.dataDemissao),
      observacoes: normalizeText(payload.observacoes),
    };
    db.collaboratorDocuments = db.collaboratorDocuments.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorDocuments.push(next);
    logAction('collaborator:update-documents', { collaboratorId, userId: user.id });
    return next;
  });
};

export const addCollaboratorEducation = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const education = {
    id: createId('edu'),
    collaboratorId,
    formacao: normalizeText(payload.formacao),
    instituicao: normalizeText(payload.instituicao),
    anoConclusao: normalizeText(payload.anoConclusao),
    cursos: normalizeText(payload.cursos),
  };
  return withDb((db) => {
    db.collaboratorEducation.push(education);
    logAction('collaborator:add-education', { collaboratorId, userId: user.id });
    return education;
  });
};

export const removeCollaboratorEducation = (user, educationId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorEducation = db.collaboratorEducation.filter((item) => item.id !== educationId);
    logAction('collaborator:remove-education', { educationId, userId: user.id });
    return db.collaboratorEducation;
  });
};

export const updateCollaboratorNationality = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    naturalidadeCidade: normalizeText(payload.naturalidadeCidade),
    naturalidadeUf: normalizeText(payload.naturalidadeUf),
    nacionalidade: normalizeText(payload.nacionalidade),
  };
  return withDb((db) => {
    db.collaboratorNationality = db.collaboratorNationality.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorNationality.push(next);
    logAction('collaborator:update-nationality', { collaboratorId, userId: user.id });
    return next;
  });
};

export const addCollaboratorPhone = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const ddd = onlyDigits(payload.ddd);
  const numero = onlyDigits(payload.numero);
  if (!isPhoneValid(`${ddd}${numero}`)) throw new Error('Telefone inválido.');
  const phone = {
    id: createId('phone'),
    collaboratorId,
    tipo: normalizeText(payload.tipo),
    ddd,
    numero,
    principal: Boolean(payload.principal),
  };
  return withDb((db) => {
    if (phone.principal) {
      db.collaboratorPhones.forEach((item) => {
        if (item.collaboratorId === collaboratorId) item.principal = false;
      });
    }
    db.collaboratorPhones.push(phone);
    logAction('collaborator:add-phone', { collaboratorId, userId: user.id });
    return phone;
  });
};

export const removeCollaboratorPhone = (user, phoneId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorPhones = db.collaboratorPhones.filter((item) => item.id !== phoneId);
    logAction('collaborator:remove-phone', { phoneId, userId: user.id });
    return db.collaboratorPhones;
  });
};

export const addCollaboratorAddress = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  if (payload.cep && !isCepValid(payload.cep)) throw new Error('CEP inválido.');
  const address = {
    id: createId('addr'),
    collaboratorId,
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
      db.collaboratorAddresses.forEach((item) => {
        if (item.collaboratorId === collaboratorId) item.principal = false;
      });
    }
    db.collaboratorAddresses.push(address);
    logAction('collaborator:add-address', { collaboratorId, userId: user.id });
    return address;
  });
};

export const removeCollaboratorAddress = (user, addressId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorAddresses = db.collaboratorAddresses.filter((item) => item.id !== addressId);
    logAction('collaborator:remove-address', { addressId, userId: user.id });
    return db.collaboratorAddresses;
  });
};

export const updateCollaboratorRelationships = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    estadoCivil: normalizeText(payload.estadoCivil),
    dependentes: payload.dependentes || [],
    contatoEmergenciaNome: normalizeText(payload.contatoEmergenciaNome),
    contatoEmergenciaTelefone: normalizeText(payload.contatoEmergenciaTelefone),
  };
  return withDb((db) => {
    db.collaboratorRelationships = db.collaboratorRelationships.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorRelationships.push(next);
    logAction('collaborator:update-relationships', { collaboratorId, userId: user.id });
    return next;
  });
};

export const updateCollaboratorCharacteristics = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    observacoesGerais: normalizeText(payload.observacoesGerais),
  };
  return withDb((db) => {
    db.collaboratorCharacteristics = db.collaboratorCharacteristics.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorCharacteristics.push(next);
    logAction('collaborator:update-characteristics', { collaboratorId, userId: user.id });
    return next;
  });
};

export const updateCollaboratorAdditional = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    notes: normalizeText(payload.notes),
  };
  return withDb((db) => {
    db.collaboratorAdditional = db.collaboratorAdditional.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorAdditional.push(next);
    logAction('collaborator:update-additional', { collaboratorId, userId: user.id });
    return next;
  });
};

export const addCollaboratorInsurance = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const insurance = {
    id: createId('ins'),
    collaboratorId,
    convenioNome: normalizeText(payload.convenioNome),
    detalhes: normalizeText(payload.detalhes),
    validade: normalizeText(payload.validade),
  };
  return withDb((db) => {
    db.collaboratorInsurances.push(insurance);
    logAction('collaborator:add-insurance', { collaboratorId, userId: user.id });
    return insurance;
  });
};

export const removeCollaboratorInsurance = (user, insuranceId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorInsurances = db.collaboratorInsurances.filter((item) => item.id !== insuranceId);
    logAction('collaborator:remove-insurance', { insuranceId, userId: user.id });
    return db.collaboratorInsurances;
  });
};

export const updateCollaboratorAccess = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:access');
  const next = {
    collaboratorId,
    userId: normalizeText(payload.userId),
    role: normalizeText(payload.role),
    permissions: payload.permissions || [],
    lastLoginAt: payload.lastLoginAt || '',
  };
  return withDb((db) => {
    db.collaboratorAccess = db.collaboratorAccess.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorAccess.push(next);
    logAction('collaborator:update-access', { collaboratorId, userId: user.id });
    return next;
  });
};

export const updateCollaboratorWorkHours = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorWorkHours = db.collaboratorWorkHours.filter((item) => item.collaboratorId !== collaboratorId);
    payload.forEach((item) => {
      db.collaboratorWorkHours.push({
        ...item,
        collaboratorId,
      });
    });
    logAction('collaborator:update-hours', { collaboratorId, userId: user.id });
    return db.collaboratorWorkHours.filter((item) => item.collaboratorId === collaboratorId);
  });
};

export const updateCollaboratorFinance = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:finance');
  const next = {
    collaboratorId,
    tipoRemuneracao: normalizeText(payload.tipoRemuneracao),
    percentualComissao: Number(payload.percentualComissao || 0),
    valorFixo: Number(payload.valorFixo || 0),
    proLabore: Number(payload.proLabore || 0),
    contaBancaria: normalizeText(payload.contaBancaria),
    observacoes: normalizeText(payload.observacoes),
  };
  return withDb((db) => {
    db.collaboratorFinance = db.collaboratorFinance.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorFinance.push(next);
    logAction('collaborator:update-finance', { collaboratorId, userId: user.id });
    return next;
  });
};

export const getProfessionalOptions = () => {
  const db = loadDb();
  const collaborators = db.collaborators
    .filter((item) => item.status === 'ativo')
    .filter((item) => /dentista|ortodontista|profissional/i.test(item.cargo || ''));
  return collaborators.map((item) => ({
    id: item.id,
    name: item.nomeCompleto,
    specialty: item.especialidades?.[0] || item.cargo || '',
    avatarUrl: item.fotoUrl || '',
  }));
};
