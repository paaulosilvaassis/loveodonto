/**
 * SSOT de identidade do paciente para documentos clínicos/contratuais.
 * Nunca preferir nickname/apelido quando houver nome completo.
 * Aceita tanto o shape flat (db.patients) quanto getPatient() ({ profile }).
 */

import { isRealPatientCpf } from './patientCpfIdentity.js';

function pickNonEmpty(...candidates) {
  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (text && !isPatientMetadataName(text)) return text;
  }
  return '';
}

/**
 * Texto de escopo/filtro de planilha — nunca é nome civil.
 * Ex.: "Escopo: Todos os pacientes (sem filtro)".
 */
export function isPatientMetadataName(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  const folded = foldPatientSearchText(text);
  if (!folded) return false;
  if (folded.startsWith('escopo')) return true;
  if (folded.includes('sem filtro') && folded.includes('paciente')) return true;
  if (folded === 'todos os pacientes' || folded.startsWith('todos os pacientes ')) return true;
  return false;
}

/** Normaliza texto de busca: trim, minúsculo, sem acentos. */
export function foldPatientSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Campos pesquisáveis: nome civil + social + apelido (apelido só para achar, nunca para título). */
export function patientSearchNameCandidates(patientOrBundle) {
  if (!patientOrBundle || typeof patientOrBundle !== 'object') return [];
  const profile = patientOrBundle.profile && typeof patientOrBundle.profile === 'object'
    ? patientOrBundle.profile
    : patientOrBundle;
  const values = [
    profile.full_name,
    patientOrBundle.full_name,
    profile.nomeCompleto,
    patientOrBundle.nomeCompleto,
    profile.name,
    patientOrBundle.name,
    profile.social_name,
    patientOrBundle.social_name,
    profile.nickname,
    patientOrBundle.nickname,
  ];
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text || isPatientMetadataName(text)) continue;
    const key = foldPatientSearchText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  return unique;
}

/**
 * Nome completo canônico — sem truncar, sem first/last inventado.
 * Nunca promove texto de escopo/filtro a nome civil.
 */
export function resolvePatientFullName(patientOrBundle, fallback = 'Paciente') {
  if (!patientOrBundle || typeof patientOrBundle !== 'object') {
    return fallback;
  }

  const profile = patientOrBundle.profile && typeof patientOrBundle.profile === 'object'
    ? patientOrBundle.profile
    : patientOrBundle;

  // Ordem: nome civil completo → social → name legado → apelido (último recurso).
  const full = pickNonEmpty(
    profile.full_name,
    patientOrBundle.full_name,
    profile.nomeCompleto,
    patientOrBundle.nomeCompleto,
    profile.name,
    patientOrBundle.name,
    profile.social_name,
    patientOrBundle.social_name,
    profile.nickname,
    patientOrBundle.nickname,
  );

  return full || fallback;
}

export function resolvePatientCpf(patientOrBundle) {
  if (!patientOrBundle || typeof patientOrBundle !== 'object') return '';
  const profile = patientOrBundle.profile && typeof patientOrBundle.profile === 'object'
    ? patientOrBundle.profile
    : patientOrBundle;
  const candidates = [profile.cpf, patientOrBundle.cpf, patientOrBundle.documents?.cpf];
  for (const value of candidates) {
    if (isRealPatientCpf(value)) return String(value).trim();
  }
  return '';
}

export function resolvePatientBirthDate(patientOrBundle) {
  if (!patientOrBundle || typeof patientOrBundle !== 'object') return '';
  const profile = patientOrBundle.profile && typeof patientOrBundle.profile === 'object'
    ? patientOrBundle.profile
    : patientOrBundle;
  return pickNonEmpty(
    profile.birth_date,
    patientOrBundle.birth_date,
    patientOrBundle.birth?.birth_date,
  );
}

/**
 * CRO profissional canônico — não inventa valor.
 */
export function resolveProfessionalCro(professional) {
  if (!professional || typeof professional !== 'object') {
    return { cro: '', uf: '', display: '' };
  }
  const cro = pickNonEmpty(
    professional.conselhoNumero,
    professional.registroProfissional,
    professional.cro,
    professional.croNumber,
    professional.registroCRO,
    professional.councilNumber,
    professional.profile?.conselhoNumero,
    professional.profile?.registroProfissional,
  );
  const uf = pickNonEmpty(
    professional.conselhoUf,
    professional.croUf,
    professional.ufConselho,
    professional.profile?.conselhoUf,
  ).toUpperCase();

  let display = cro;
  if (cro && uf && !new RegExp(uf, 'i').test(cro)) {
    display = `CRO-${uf} ${cro}`;
  } else if (cro && !/^CRO/i.test(cro) && uf) {
    display = `CRO-${uf} ${cro}`;
  } else if (cro && !/^CRO/i.test(cro)) {
    display = `CRO ${cro}`;
  }

  return { cro, uf, display };
}

export function resolveProfessionalFullName(professional, fallback = 'Profissional') {
  if (!professional || typeof professional !== 'object') return fallback;
  return pickNonEmpty(
    professional.nomeCompleto,
    professional.name,
    professional.apelido,
    professional.full_name,
    professional.profile?.nomeCompleto,
    professional.profile?.name,
  ) || fallback;
}
