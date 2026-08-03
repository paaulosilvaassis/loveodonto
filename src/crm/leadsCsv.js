import { LEAD_SOURCE, LEAD_SOURCE_LABELS, LEAD_INTEREST_LABELS } from '../services/crmService.js';
import { getStatusLabel } from '../utils/timelineLabels.js';
import { onlyDigits } from '../utils/validators.js';

const CSV_SEPARATOR = ';';
const MIN_PHONE_DIGITS = 10;

const EXPORT_HEADERS = [
  'Nome', 'Telefone', 'Origem', 'Interesse', 'Estágio', 'Tags',
  'Responsável', 'Último contato', 'Criado em', 'Observações',
];

const escapeCsvValue = (value) => {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const formatDateBr = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
};

/**
 * Gera o conteúdo CSV (separador ";", padrão pt-BR/Excel) da lista de leads.
 * @param {Array} leads - Leads enriquecidos com tagList
 * @param {Object} options - { stageLabelByKey, userNameById }
 */
export const buildLeadsCsv = (leads, { stageLabelByKey = {}, userNameById = {} } = {}) => {
  const rows = leads.map((lead) => [
    lead.name || '',
    lead.phone || '',
    LEAD_SOURCE_LABELS[lead.source] || lead.source || '',
    LEAD_INTEREST_LABELS[lead.interest] || lead.interest || '',
    stageLabelByKey[lead.stageKey] || getStatusLabel(lead.stageKey),
    (lead.tagList || []).map((t) => t.name).join(', '),
    lead.assignedToUserId ? userNameById[lead.assignedToUserId] || '' : '',
    formatDateBr(lead.lastContactAt),
    formatDateBr(lead.createdAt),
    lead.notes || '',
  ]);
  return [EXPORT_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvValue).join(CSV_SEPARATOR))
    .join('\r\n');
};

/** Dispara o download do CSV no navegador (BOM UTF-8 para Excel). */
export const downloadCsv = (csvContent, filename) => {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// ─── Importação ──────────────────────────────────────────────────────────────

const normalizeHeader = (header) =>
  String(header || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const HEADER_ALIASES = {
  nome: 'name',
  name: 'name',
  telefone: 'phone',
  celular: 'phone',
  whatsapp: 'phone',
  phone: 'phone',
  origem: 'source',
  source: 'source',
  interesse: 'interest',
  interest: 'interest',
  observacoes: 'notes',
  notas: 'notes',
  notes: 'notes',
};

const SOURCE_BY_LABEL = Object.fromEntries(
  Object.entries(LEAD_SOURCE_LABELS).map(([key, label]) => [normalizeHeader(label), key])
);

const INTEREST_BY_LABEL = Object.fromEntries(
  Object.entries(LEAD_INTEREST_LABELS).map(([key, label]) => [normalizeHeader(label), key])
);

const resolveSource = (raw) => {
  const value = normalizeHeader(raw);
  if (!value) return LEAD_SOURCE.MANUAL;
  if (Object.values(LEAD_SOURCE).includes(value)) return value;
  return SOURCE_BY_LABEL[value] || LEAD_SOURCE.MANUAL;
};

const resolveInterest = (raw) => {
  const value = normalizeHeader(raw);
  if (!value) return '';
  if (LEAD_INTEREST_LABELS[value]) return value;
  return INTEREST_BY_LABEL[value] || '';
};

/** Divide o CSV em linhas/células respeitando aspas duplas. */
const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => { pushCell(); rows.push(row); row = []; };
  const separator = text.split('\n', 1)[0]?.includes(';') ? ';' : ',';

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else if (char === '"') inQuotes = true;
    else if (char === separator) pushCell();
    else if (char === '\n') pushRow();
    else if (char !== '\r') cell += char;
  }
  if (cell !== '' || row.length > 0) pushRow();
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
};

/**
 * Interpreta um CSV de leads (colunas aceitas: Nome, Telefone, Origem, Interesse, Observações).
 * @returns {{ leads: Array, errors: Array<string> }}
 */
export const parseLeadsCsv = (text) => {
  const rows = parseCsvRows(String(text || '').replace(/^\uFEFF/, ''));
  if (rows.length < 2) {
    return { leads: [], errors: ['Arquivo vazio ou sem linhas de dados. Inclua o cabeçalho e ao menos um lead.'] };
  }

  const headers = rows[0].map((h) => HEADER_ALIASES[normalizeHeader(h)] || null);
  if (!headers.includes('name') || !headers.includes('phone')) {
    return { leads: [], errors: ['Cabeçalho inválido. As colunas "Nome" e "Telefone" são obrigatórias.'] };
  }

  const leads = [];
  const errors = [];
  rows.slice(1).forEach((cells, index) => {
    const lineNumber = index + 2;
    const record = {};
    headers.forEach((field, col) => {
      if (field) record[field] = String(cells[col] ?? '').trim();
    });
    const name = record.name || '';
    const phone = onlyDigits(record.phone || '');
    if (!name) {
      errors.push(`Linha ${lineNumber}: nome obrigatório.`);
      return;
    }
    if (phone.length < MIN_PHONE_DIGITS) {
      errors.push(`Linha ${lineNumber}: telefone inválido (informe DDD + número).`);
      return;
    }
    leads.push({
      name,
      phone,
      source: resolveSource(record.source),
      interest: resolveInterest(record.interest),
      notes: record.notes || '',
    });
  });

  return { leads, errors };
};
