/**
 * Parser somente-leitura do HTML legado de procedimentos (#procedimentos).
 * Sem innerHTML ao vivo, sem scripts, sem event handlers.
 */

const PROFESSIONAL_LABEL = /profissional\s+respons[aá]vel/i;

export const LEGACY_PROCEDURES_UNAVAILABLE =
  'Os procedimentos estão disponíveis no documento completo.';

export function looksLikeHtml(value) {
  return typeof value === 'string' && /<[a-z][\s\S]*>/i.test(value);
}

export function looksLikeEscapedHtml(value) {
  return typeof value === 'string' && /&lt;[a-z]/i.test(value);
}

export function stripDangerousHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 32) return ' ';
  if (code === 60 || code === 62) return ' ';
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

export function textFromHtmlFragment(fragment) {
  let text = stripDangerousHtml(fragment);
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  if (/</.test(text)) text = text.replace(/<[^>]+>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function decodeOnceIfEscaped(html) {
  const raw = String(html || '');
  if (!looksLikeEscapedHtml(raw)) return raw;
  return decodeEntities(raw);
}

function extractTableHtml(html) {
  const match = String(html || '').match(/<table\b[\s\S]*?<\/table>/i);
  return match ? match[0] : '';
}

function extractRows(tableHtml) {
  const body = tableHtml.match(/<tbody\b[\s\S]*?<\/tbody>/i)?.[0] || tableHtml;
  return [...body.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
}

function extractCells(rowHtml) {
  return [...rowHtml.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => textFromHtmlFragment(m[2]));
}

function headerIndex(headers, aliases) {
  const normalized = headers.map((h) => h.toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseSnapshotNumber(raw) {
  const text = String(raw || '').trim();
  if (!text || text === '—' || text === '-') return null;
  if (/^-?\d+\.\d{1,2}$/.test(text) || /^-?\d+$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  const cleaned = text.replace(/[R$\s]/gi, '');
  if (cleaned.includes(',')) {
    const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractProfessionalName(html) {
  const block = String(html || '').match(
    /<(p|div|span)\b[^>]*>[\s\S]*?profissional\s+respons[aá]vel[\s\S]*?<\/\1>/i,
  );
  const source = block ? block[0] : String(html || '');
  if (!PROFESSIONAL_LABEL.test(source)) return '';
  const stripped = textFromHtmlFragment(source);
  const match = stripped.match(/profissional\s+respons[aá]vel\s*[:\-–]?\s*(.+)$/i);
  const name = String(match?.[1] || '').trim();
  if (!name || PROFESSIONAL_LABEL.test(name) && name.length < 4) return '';
  return name;
}

function parseWithDomParser(html) {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(stripDangerousHtml(html), 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,link,style,noscript').forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  const table = doc.querySelector('table');
  if (!table) return { rows: [], professionalName: extractProfessionalName(html) };
  const headerCells = [...(table.querySelector('thead tr')?.children || [])]
    .map((cell) => textFromHtmlFragment(cell.textContent || ''));
  const bodyRows = [...table.querySelectorAll('tbody tr')];
  const sourceRows = bodyRows.length ? bodyRows : [...table.querySelectorAll('tr')].slice(headerCells.length ? 1 : 0);
  const rows = sourceRows.map((tr) => (
    [...tr.children].map((cell) => textFromHtmlFragment(cell.textContent || ''))
  ));
  return {
    headers: headerCells,
    cellRows: rows,
    professionalName: extractProfessionalName(html) || extractProfessionalName(doc.body?.textContent || ''),
  };
}

function parseWithRegex(html) {
  const tableHtml = extractTableHtml(html);
  if (!tableHtml) {
    return { headers: [], cellRows: [], professionalName: extractProfessionalName(html) };
  }
  const allRows = extractRows(tableHtml);
  const hasThead = /<thead/i.test(tableHtml);
  const headerHtml = hasThead
    ? (tableHtml.match(/<thead\b[\s\S]*?<\/thead>/i)?.[0] || '')
    : (allRows[0] || '');
  const headers = extractCells(headerHtml);
  const dataHtml = hasThead
    ? tableHtml.replace(/<thead\b[\s\S]*?<\/thead>/i, '')
    : allRows.slice(1).join('');
  const cellRows = extractRows(dataHtml || '')
    .map(extractCells)
    .filter((cells) => cells.some(Boolean));
  return {
    headers,
    cellRows,
    professionalName: extractProfessionalName(html),
  };
}

function mapRow(cells, headers) {
  const idxName = headerIndex(headers, ['procedimento', 'descrição', 'descricao']);
  const idxRegion = headerIndex(headers, ['dente', 'região', 'regiao']);
  const idxQty = headerIndex(headers, ['qtd', 'quant']);
  const idxUnit = headerIndex(headers, ['unit']);
  const idxTotal = headerIndex(headers, ['total']);
  const name = cells[idxName >= 0 ? idxName : 0] || '';
  if (!name || PROFESSIONAL_LABEL.test(name)) return null;
  if (/^procedimento$/i.test(name)) return null;
  const region = cells[idxRegion >= 0 ? idxRegion : 1] || '';
  const qtyRaw = cells[idxQty >= 0 ? idxQty : 2];
  const unitRaw = cells[idxUnit >= 0 ? idxUnit : 3];
  const totalRaw = cells[idxTotal >= 0 ? idxTotal : 4];
  return {
    name,
    toothRegion: region === '—' ? '' : region,
    quantity: parseSnapshotNumber(qtyRaw),
    unitValue: parseSnapshotNumber(unitRaw),
    totalValue: parseSnapshotNumber(totalRaw),
    source: 'legacy-html',
  };
}

function parseProcItemParagraphs(html) {
  const matches = [...String(html || '').matchAll(/<p\b[^>]*proc-item[^>]*>([\s\S]*?)<\/p>/gi)];
  return matches.map((m) => {
    const text = textFromHtmlFragment(m[1]).replace(/^[IVXLCDM]+\s*[—–-]\s*/i, '').trim();
    if (!text) return null;
    return {
      name: text.replace(/\s*\(\d+\s+unidade[s]?\)\s*$/i, '').trim(),
      toothRegion: '',
      quantity: null,
      unitValue: null,
      totalValue: null,
      source: 'legacy-html',
    };
  }).filter(Boolean);
}

/**
 * Extrai linhas de procedimento de HTML legado. Nunca devolve tags.
 */
export function parseLegacyProcedureHtml(html) {
  const decoded = decodeOnceIfEscaped(html);
  const cleaned = stripDangerousHtml(decoded);
  if (!looksLikeHtml(cleaned) && !looksLikeHtml(decoded)) {
    return { rows: [], professionalName: '', ok: false };
  }

  const domParsed = parseWithDomParser(cleaned);
  const parsed = domParsed || parseWithRegex(cleaned);
  const headers = parsed.headers || [];
  const mapped = (parsed.cellRows || []).map((cells) => mapRow(cells, headers)).filter(Boolean);
  if (mapped.length) {
    return {
      rows: mapped,
      professionalName: parsed.professionalName || '',
      ok: true,
    };
  }

  const paragraphs = parseProcItemParagraphs(cleaned);
  if (paragraphs.length) {
    return {
      rows: paragraphs,
      professionalName: parsed.professionalName || extractProfessionalName(cleaned),
      ok: true,
    };
  }

  return {
    rows: [],
    professionalName: parsed.professionalName || extractProfessionalName(cleaned),
    ok: false,
  };
}
