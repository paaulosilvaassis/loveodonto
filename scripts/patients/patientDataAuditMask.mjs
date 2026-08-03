/**
 * Mascaramento PII — Phase 9.4A Wave 3A.
 * Nunca retorna CPF/telefone/e-mail/nome completos.
 */

import { createHash } from 'node:crypto';

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function hashId(value, salt = 'love-odonto-wave3a') {
  const raw = String(value ?? '').trim();
  if (!raw) return 'hash:empty';
  return `h:${createHash('sha256').update(`${salt}|${raw}`).digest('hex').slice(0, 12)}`;
}

export function maskName(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const p = parts[0];
    return p.length <= 2 ? `${p[0] || '*'}*` : `${p.slice(0, 1)}***`;
  }
  return `${parts[0].slice(0, 1)}*** ${parts[parts.length - 1].slice(0, 1)}***`;
}

export function maskCpf(value) {
  const d = onlyDigits(value);
  if (!d) return '';
  if (d.length < 5) return '***.***.***-**';
  return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`;
}

export function maskPhone(value) {
  const d = onlyDigits(value);
  if (!d) return '';
  if (d.length < 4) return '(**) ****-****';
  return `(**) *****-${d.slice(-4)}`;
}

export function maskEmail(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const at = raw.indexOf('@');
  if (at <= 0) return '***@***';
  const user = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const u = user.length <= 1 ? '*' : `${user[0]}***`;
  const dParts = domain.split('.');
  const d0 = dParts[0] ? `${dParts[0][0] || '*'}***` : '***';
  const tld = dParts.length > 1 ? dParts[dParts.length - 1] : '***';
  return `${u}@${d0}.${tld}`;
}

/** Remove/mascara campos sensíveis de um objeto superficial (relatório). */
export function sanitizeForReport(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  if ('full_name' in out) out.full_name = maskName(out.full_name);
  if ('name' in out) out.name = maskName(out.name);
  if ('cpf' in out) out.cpf = maskCpf(out.cpf);
  if ('email' in out || 'personal_email' in out || 'access_email' in out) {
    if ('email' in out) out.email = maskEmail(out.email);
    if ('personal_email' in out) out.personal_email = maskEmail(out.personal_email);
    if ('access_email' in out) out.access_email = maskEmail(out.access_email);
  }
  for (const key of Object.keys(out)) {
    if (/phone|telefone|e164/i.test(key) && typeof out[key] === 'string') {
      out[key] = maskPhone(out[key]);
    }
  }
  if ('id' in out) out.idHash = hashId(out.id);
  if ('patient_id' in out) out.patientIdHash = hashId(out.patient_id);
  if ('legacy_id' in out) out.legacyIdHash = hashId(out.legacy_id);
  delete out.id;
  delete out.patient_id;
  delete out.legacy_id;
  delete out.guid;
  return out;
}

/** Garante que texto/JSON não contém CPF de 11 dígitos sequenciais "completos" óbvios. */
export function assertNoRawPiiLeak(text) {
  const s = String(text || '');
  // CPF mascarado ok; sequência \d{11} isolada é risco
  const eleven = s.match(/(?<![\d*.])\d{11}(?![\d])/g) || [];
  const emails = s.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return {
    ok: eleven.length === 0 && emails.length === 0,
    elevenDigitSequences: eleven.length,
    rawEmails: emails.length,
  };
}
