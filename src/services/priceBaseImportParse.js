import {
  PRICE_RESTRICTION,
  PROCEDURE_SEGMENT,
  PROCEDURE_STATUS,
  SPECIALTIES,
  validateTussCode,
} from './priceBaseService.js';

/** Normaliza rótulo de coluna: acentos, case, hífens/underscores, espaços. */
export function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMoney(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const normalized = cleaned.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Limites opcionais (mín/máx/custo): 0 ou negativo na planilha = sem limite / não informado.
 * Não aplicar ao preço principal (venda), onde 0 é valor válido.
 */
export function nullIfNotPositiveLimit(parsed) {
  if (parsed === null || parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/**
 * TUSS/TISS: Excel manda 0 ou "0" quando não há código — não validar formato.
 */
export function normalizeTussCodeFromImport(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) return null;
    if (Number.isInteger(value)) return String(value);
    return String(value).trim();
  }
  const s = String(value).trim();
  if (s === '' || s === '0') return null;
  if (/^-?0+([.,]0+)?$/.test(s)) return null;
  return s;
}

function normalizeStatus(value) {
  const raw = normalizeHeader(value);
  if (!raw) return PROCEDURE_STATUS.ATIVO;
  if (['ativo', '1', 'sim', 'yes'].includes(raw)) return PROCEDURE_STATUS.ATIVO;
  if (['inativo', '0', 'nao', 'não', 'no'].includes(raw)) return PROCEDURE_STATUS.INATIVO;
  return PROCEDURE_STATUS.ATIVO;
}

function normalizeRestriction(value) {
  const raw = normalizeHeader(value);
  if (!raw) return PRICE_RESTRICTION.LIVRE;
  if (raw.includes('avis')) return PRICE_RESTRICTION.AVISAR;
  if (raw.includes('bloq')) return PRICE_RESTRICTION.BLOQUEAR;
  if (raw.includes('fix')) return PRICE_RESTRICTION.FIXO;
  return PRICE_RESTRICTION.LIVRE;
}

function normalizeSegment(value) {
  const raw = normalizeHeader(value);
  if (!raw) return PROCEDURE_SEGMENT.ODONTOLOGIA;
  if (raw.includes('oro') || raw.includes('orofacial')) return PROCEDURE_SEGMENT.OROFACIAL;
  if (raw.includes('diag') || raw.includes('imagem')) return PROCEDURE_SEGMENT.DIAGNOSTICO_IMAGEM;
  if (raw.includes('odont')) return PROCEDURE_SEGMENT.ODONTOLOGIA;
  return PROCEDURE_SEGMENT.ODONTOLOGIA;
}

/**
 * Pontua uma linha como candidata a cabeçalho (várias colunas curtas com termos conhecidos).
 */
export function scoreRowAsHeader(row) {
  if (!Array.isArray(row)) return -1;
  const cells = row
    .map((c) => normalizeHeader(c))
    .filter((s) => s.length > 0 && s.length < 70);
  if (cells.length < 2) return 0;

  const categories = new Set();
  for (const cell of cells) {
    if (
      cell.includes('procedimento') ||
      cell.includes('titulo') ||
      cell.includes('título') ||
      (cell.includes('nome') && cell.includes('proc'))
    ) {
      categories.add('title');
    }
    if (cell.includes('especial')) categories.add('specialty');
    if (cell.includes('custo')) categories.add('cost');
    if (
      cell === 'preco' ||
      cell === 'preço' ||
      cell === 'valor' ||
      (cell.includes('preco') &&
        !cell.includes('min') &&
        !cell.includes('max') &&
        !cell.includes('custo')) ||
      (cell.includes('preço') &&
        !cell.includes('min') &&
        !cell.includes('max') &&
        !cell.includes('custo'))
    ) {
      categories.add('price');
    }
    if (cell.includes('situacao') || cell.includes('situação') || cell === 'status') {
      categories.add('status');
    }
    if (cell.includes('tuss') || cell.includes('tiss')) categories.add('code');
    if (cell.includes('minimo') || cell.includes('mínimo')) categories.add('min');
    if (cell.includes('maximo') || cell.includes('máximo')) categories.add('max');
    if (cell.includes('restri') || cell.includes('restring')) categories.add('restriction');
    if (
      (cell.includes('codigo') || cell.includes('código')) &&
      cell.includes('interno')
    ) {
      categories.add('internal');
    }
  }

  return categories.size * 10 + Math.min(cells.length, 14);
}

/**
 * Índice da linha de cabeçalho real (0-based). Não assume a primeira linha.
 */
export function findBestHeaderRowIndex(rawRowsArray, options = {}) {
  const maxScan = options.maxScan ?? 45;
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rawRowsArray.length, maxScan); i++) {
    const row = rawRowsArray[i];
    const score = scoreRowAsHeader(row);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore >= 2) {
    return bestIdx;
  }

  for (let i = 0; i < Math.min(rawRowsArray.length, maxScan); i++) {
    const row = rawRowsArray[i];
    if (!Array.isArray(row)) continue;
    const nonEmptyCount = row.filter(
      (c) => c !== undefined && c !== null && String(c).trim() !== ''
    ).length;
    if (nonEmptyCount >= 3) return i;
  }

  return 0;
}

/**
 * Converte matriz da planilha em objetos `{ [cabeçalho]: valor }` a partir da linha de cabeçalho detectada.
 */
export function sheetRowsToObjects(rawRowsArray, headerRowIndex) {
  const headerRow = rawRowsArray[headerRowIndex] || [];
  const dataRows = rawRowsArray.slice(headerRowIndex + 1);

  return dataRows.map((row) => {
    const obj = {};
    headerRow.forEach((header, idx) => {
      const base = String(header ?? '').trim() || `__EMPTY_${idx}`;
      let key = base;
      let n = 1;
      while (Object.prototype.hasOwnProperty.call(obj, key)) {
        key = `${base} (${n})`;
        n += 1;
      }
      const cell = Array.isArray(row) ? row[idx] : undefined;
      obj[key] = cell === undefined || cell === null ? '' : cell;
    });
    return obj;
  });
}

/**
 * Mapeamento automático coluna → campo interno.
 */
export function detectColumnMapping(columns) {
  const mapping = {};
  columns.forEach((col) => {
    const normalized = normalizeHeader(col);
    if (!normalized) {
      mapping[col] = 'ignore';
      return;
    }
    if (normalized.includes('referencia') || normalized.includes('referência')) {
      mapping[col] = 'ignore';
      return;
    }
    if (normalized.includes('titulo') || normalized.includes('título')) {
      mapping[col] = 'title';
      return;
    }
    if (
      normalized.includes('procedimento') &&
      !normalized.includes('referencia') &&
      !normalized.includes('referência')
    ) {
      const hasTitle = Object.values(mapping).includes('title');
      if (!hasTitle) {
        mapping[col] = 'title';
        return;
      }
    }
    if (normalized.includes('nome')) {
      const hasTitle = Object.values(mapping).includes('title');
      if (
        !hasTitle &&
        (normalized.includes('proc') || normalized.includes('trat'))
      ) {
        mapping[col] = 'title';
        return;
      }
    }
    if (
      normalized.includes('situacao') ||
      normalized.includes('situação') ||
      normalized === 'status'
    ) {
      mapping[col] = 'status';
      return;
    }
    if (
      (normalized.includes('codigo') || normalized.includes('código')) &&
      normalized.includes('interno')
    ) {
      mapping[col] = 'internalCode';
      return;
    }
    if (normalized.includes('tuss') || normalized.includes('tiss')) {
      mapping[col] = 'tussCode';
      return;
    }
    if (normalized.includes('custo')) {
      mapping[col] = 'costPrice';
      return;
    }
    if (
      (normalized.includes('observ') ||
        normalized.includes('nota') ||
        normalized.includes('descricao') ||
        normalized.includes('descrição')) &&
      !normalized.includes('situacao') &&
      !normalized.includes('situação')
    ) {
      mapping[col] = 'notes';
      return;
    }
    if (
      (normalized.includes('padrao') || normalized.includes('padrão')) &&
      (normalized.includes('preco') ||
        normalized.includes('preço') ||
        normalized.includes('valor'))
    ) {
      mapping[col] = 'price';
      return;
    }
    if (
      normalized.includes('venda') &&
      (normalized.includes('preco') || normalized.includes('preço'))
    ) {
      mapping[col] = 'price';
      return;
    }
    if (
      (normalized.includes('minimo') ||
        normalized.includes('mínimo') ||
        normalized.includes('min')) &&
      (normalized.includes('valor') ||
        normalized.includes('preco') ||
        normalized.includes('preço'))
    ) {
      mapping[col] = 'minPrice';
      return;
    }
    if (
      (normalized.includes('maximo') ||
        normalized.includes('máximo') ||
        normalized.includes('max')) &&
      (normalized.includes('valor') ||
        normalized.includes('preco') ||
        normalized.includes('preço'))
    ) {
      mapping[col] = 'maxPrice';
      return;
    }
    if (normalized.includes('restri') || normalized.includes('restring')) {
      mapping[col] = 'priceRestriction';
      return;
    }
    if (normalized.includes('comissao') || normalized.includes('comissão')) {
      mapping[col] = 'ignore';
      return;
    }
    if (
      normalized === 'preco' ||
      normalized === 'preço' ||
      normalized === 'valor'
    ) {
      mapping[col] = 'price';
      return;
    }
    if (
      (normalized.includes('preco') || normalized.includes('preço')) &&
      !normalized.includes('min') &&
      !normalized.includes('max') &&
      !normalized.includes('comissao') &&
      !normalized.includes('comissão')
    ) {
      mapping[col] = 'price';
      return;
    }
    if (normalized.includes('especial')) {
      mapping[col] = 'specialty';
      return;
    }
    if (normalized.includes('segment')) {
      mapping[col] = 'segment';
      return;
    }
    mapping[col] = 'ignore';
  });
  return mapping;
}

export function normalizeImportRow(row, mapping) {
  const result = {};
  let titleProcessed = false;

  Object.entries(mapping).forEach(([column, field]) => {
    if (field === 'ignore') return;
    if (field === 'title') {
      if (titleProcessed) return;
      titleProcessed = true;
    }

    let value = row[column];
    if (value === undefined || value === null || value === '') {
      const normalizedCol = normalizeHeader(column);
      for (const [key, val] of Object.entries(row)) {
        if (normalizeHeader(key) === normalizedCol) {
          value = val;
          break;
        }
      }
    }

    switch (field) {
      case 'title':
        result.title = String(value ?? '').trim();
        break;
      case 'status':
        result.status = normalizeStatus(value);
        break;
      case 'segment':
        result.segment = normalizeSegment(value);
        break;
      case 'specialty':
        result.specialty = String(value ?? '').trim();
        break;
      case 'tussCode':
        result.tussCode = normalizeTussCodeFromImport(value);
        break;
      case 'internalCode':
        result.internalCode = String(value ?? '').trim();
        break;
      case 'shortcut':
        result.shortcut = String(value ?? '').trim();
        break;
      case 'costPrice':
        result.costPrice = nullIfNotPositiveLimit(parseMoney(value));
        break;
      case 'price': {
        const parsed = parseMoney(value);
        result.price = parsed;
        break;
      }
      case 'minPrice':
        result.minPrice = nullIfNotPositiveLimit(parseMoney(value));
        break;
      case 'maxPrice':
        result.maxPrice = nullIfNotPositiveLimit(parseMoney(value));
        break;
      case 'priceRestriction':
        result.priceRestriction = normalizeRestriction(value);
        break;
      case 'notes':
        result.notes = String(value ?? '').trim() || null;
        break;
      default:
        break;
    }
  });

  if (!result.status) result.status = PROCEDURE_STATUS.ATIVO;
  if (!result.segment) result.segment = PROCEDURE_SEGMENT.ODONTOLOGIA;
  if (!result.priceRestriction) result.priceRestriction = PRICE_RESTRICTION.LIVRE;
  return result;
}

export function buildFieldToColumnsMap(mapping) {
  const map = {};
  Object.entries(mapping).forEach(([col, field]) => {
    if (field === 'ignore') return;
    if (!map[field]) map[field] = [];
    map[field].push(col);
  });
  return map;
}

export function isRowBlankForImport(row, mapping) {
  const fields = Object.entries(mapping).filter(([, f]) => f !== 'ignore');
  if (fields.length === 0) {
    return !Object.values(row).some((v) => String(v ?? '').trim() !== '');
  }
  return fields.every(([col]) => String(row[col] ?? '').trim() === '');
}

/**
 * Validação para importação: obrigatório apenas título. Preço 0 permitido.
 * @param {object} rawRow - linha bruta da planilha
 * @param {object} normalizedRow - resultado de normalizeImportRow
 * @param {object} mapping - mapeamento coluna → campo
 */
export function validateImportRow(rawRow, normalizedRow, mapping) {
  const errors = [];
  const warnings = [];
  const fieldToColumns = buildFieldToColumnsMap(mapping);

  if (isRowBlankForImport(rawRow, mapping)) {
    return { errors, warnings, emptyRow: true };
  }

  if (!normalizedRow.title?.trim()) {
    errors.push({
      field: 'title',
      message: 'Título/nome do procedimento é obrigatório (mapeie a coluna ou preencha o valor).',
      columns: fieldToColumns.title ?? [],
    });
  }

  const price = normalizedRow.price;
  if (price !== null && price !== undefined) {
    if (!Number.isFinite(price)) {
      errors.push({
        field: 'price',
        message: 'Preço não é um número válido.',
        columns: fieldToColumns.price ?? [],
      });
    } else if (price < 0) {
      errors.push({
        field: 'price',
        message: 'Preço não pode ser negativo.',
        columns: fieldToColumns.price ?? [],
      });
    }
  }

  if (
    normalizedRow.minPrice != null &&
    normalizedRow.maxPrice != null &&
    normalizedRow.minPrice > normalizedRow.maxPrice
  ) {
    errors.push({
      field: 'minMax',
      message: 'Preço mínimo maior que o máximo.',
      columns: [...(fieldToColumns.minPrice ?? []), ...(fieldToColumns.maxPrice ?? [])],
    });
  }

  const effPrice =
    price !== null && price !== undefined && Number.isFinite(price) ? price : null;
  if (effPrice !== null && normalizedRow.minPrice != null && effPrice < normalizedRow.minPrice) {
    errors.push({
      field: 'price',
      message: 'Preço menor que o mínimo informado.',
      columns: fieldToColumns.price ?? [],
    });
  }
  if (effPrice !== null && normalizedRow.maxPrice != null && effPrice > normalizedRow.maxPrice) {
    errors.push({
      field: 'price',
      message: 'Preço maior que o máximo informado.',
      columns: fieldToColumns.price ?? [],
    });
  }

  if (normalizedRow.tussCode) {
    const validation = validateTussCode(normalizedRow.tussCode);
    if (!validation.valid) {
      errors.push({
        field: 'tussCode',
        message: validation.error,
        columns: fieldToColumns.tussCode ?? [],
      });
    }
  }

  if (normalizedRow.specialty?.trim() && !SPECIALTIES.includes(normalizedRow.specialty)) {
    warnings.push({
      field: 'specialty',
      message: 'Especialidade fora da lista padrão do sistema (o valor será gravado como informado).',
      columns: fieldToColumns.specialty ?? [],
    });
  }

  return { errors, warnings, emptyRow: false };
}
