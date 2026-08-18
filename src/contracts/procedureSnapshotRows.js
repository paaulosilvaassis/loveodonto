/**
 * SSOT de linhas de procedimento para resumo público.
 * Não recalcula valores — só copia snapshot ou parseia HTML legado.
 */

import {
  looksLikeHtml,
  looksLikeEscapedHtml,
  parseLegacyProcedureHtml,
} from './legacyProcedureHtmlParser.js';

const GENERIC_TREATMENT_NAMES = new Set([
  'contrato profissional odontológico',
  'contrato',
  'tratamento odontológico',
  'tratamento',
  'documento para assinatura',
  'plano de tratamento',
]);

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function regionFrom(item) {
  if (!item || typeof item !== 'object') return '';
  if (Array.isArray(item.teeth)) return item.teeth.filter(Boolean).join(', ');
  return String(
    item.toothRegion || item.tooth || item.region || item.dente || item.regiao || '',
  ).trim();
}

export function freezeProcedureRow(item, index = 0) {
  if (typeof item === 'string') {
    const name = item.trim();
    if (!name || looksLikeHtml(name) || looksLikeEscapedHtml(name)) return null;
    return {
      name,
      toothRegion: '',
      quantity: null,
      unitValue: null,
      totalValue: null,
      source: 'string',
      index,
    };
  }
  if (!item || typeof item !== 'object') return null;
  const name = String(
    item.name || item.procedureName || item.description || item.title || '',
  ).trim();
  if (!name || looksLikeHtml(name)) return null;
  const quantity = firstFiniteNumber(item.quantity, item.qty, item.qtd);
  return {
    name,
    toothRegion: regionFrom(item),
    quantity,
    unitValue: firstFiniteNumber(item.unitValue, item.unitPrice, item.unit),
    totalValue: firstFiniteNumber(item.totalValue, item.total, item.lineTotal),
    source: item.source || 'structured',
    index,
  };
}

export function freezeProcedureRows(procedures) {
  if (!Array.isArray(procedures)) return [];
  return procedures
    .map((item, index) => freezeProcedureRow(item, index))
    .filter(Boolean);
}

function htmlBlobFrom(value) {
  if (typeof value === 'string' && (looksLikeHtml(value) || looksLikeEscapedHtml(value))) {
    return value;
  }
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return htmlBlobFrom(value[0]);
  }
  return '';
}

function fromStructuredLists(clinical) {
  const lists = [
    clinical.procedures,
    clinical.procedureRows,
    clinical.approvedProcedures,
  ];
  for (const list of lists) {
    if (!Array.isArray(list) || !list.length) continue;
    const rows = freezeProcedureRows(list);
    if (rows.length) return rows;
  }
  return [];
}

/**
 * Preferência: procedures estruturados do snapshot; fallback: HTML legado.
 */
export function collectStructuredProcedureRows(clinical = {}) {
  const structured = fromStructuredLists(clinical);
  if (structured.length) {
    return { rows: structured, source: 'structured', fallback: false, professionalNameFromHtml: '' };
  }

  const raw = clinical.procedimentos;
  const html = htmlBlobFrom(raw);
  if (html) {
    const parsed = parseLegacyProcedureHtml(html);
    if (parsed.ok && parsed.rows.length) {
      return {
        rows: parsed.rows.map((row, index) => ({ ...row, index })),
        source: 'legacy-html',
        fallback: false,
        professionalNameFromHtml: parsed.professionalName || '',
      };
    }
    return {
      rows: [],
      source: 'legacy-html',
      fallback: true,
      professionalNameFromHtml: parsed.professionalName || '',
    };
  }

  if (Array.isArray(raw) && raw.length) {
    const rows = freezeProcedureRows(raw);
    if (rows.length) {
      return { rows, source: 'string-list', fallback: false, professionalNameFromHtml: '' };
    }
  }

  if (typeof raw === 'string' && raw.trim()) {
    const rows = freezeProcedureRows([raw]);
    if (rows.length) {
      return { rows, source: 'string-list', fallback: false, professionalNameFromHtml: '' };
    }
  }

  return { rows: [], source: 'empty', fallback: true, professionalNameFromHtml: '' };
}

export function isGenericTreatmentName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return true;
  if (/^ctr[-_\s]?\d/i.test(normalized)) return true;
  return GENERIC_TREATMENT_NAMES.has(normalized);
}

export function resolveTreatmentDisplayName({ title, planName, procedureName } = {}) {
  if (!isGenericTreatmentName(planName)) return String(planName).trim();
  if (!isGenericTreatmentName(procedureName)) return String(procedureName).trim();
  if (!isGenericTreatmentName(title)) return String(title).trim();
  return '';
}

export function formatProfessionalCroLabel(professional = {}) {
  const cro = String(
    professional.cro
    || professional.conselhoNumero
    || professional.registroProfissional
    || professional.professionalCro
    || '',
  ).trim();
  if (!cro) return '';
  if (/^cro[\s-]/i.test(cro) && /\d/.test(cro)) return cro.replace(/\s+/g, ' ');
  const uf = String(professional.conselhoUf || professional.croUf || professional.uf || '')
    .trim()
    .toUpperCase()
    .replace(/^CRO-?/, '');
  const number = cro.replace(/^CRO[\s-]*/i, '').trim();
  if (uf.length === 2 && number) return `CRO-${uf} ${number}`;
  return cro;
}
