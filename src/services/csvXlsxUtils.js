/**
 * Utilitários para parse e geração de CSV/XLSX.
 * Usado por import/export de pacientes.
 * XLSX é carregado dinamicamente para evitar crash/travamento ao abrir o modal.
 */

/** Normaliza string de cabeçalho para comparação: minúsculo, sem acentos, espaços simples */
export function normalizeHeader(str) {
  if (str == null) return '';
  let s = String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/[ºª°nºn\.]/g, 'n').replace(/\./g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Aliases: cada chave canônica tem lista de variações normalizadas que mapeiam para ela */
export const HEADER_ALIASES = {
  nome_completo: ['nome completo', 'nome', 'paciente', 'nome do paciente', 'full name', 'nome completo do paciente', 'nome do titular'],
  nome_social: ['nome social'],
  apelido: ['apelido', 'nickname'],
  sexo: ['sexo', 'genero', 'gênero', 'sex'],
  cpf: ['cpf', 'documento cpf', 'cpf do titular', 'doc cpf'],
  rg: ['rg', 'identidade'],
  email: ['email', 'e-mail', 'e mail', 'mail'],
  telefone: ['telefone', 'fone', 'tel', 'telefone fixo', 'phone'],
  celular: ['celular', 'whatsapp', 'cel', 'mobile', 'telefone celular'],
  data_nascimento: ['data de nascimento', 'nascimento', 'dt nascimento', 'birth date', 'data nascimento', 'dtnasc', 'dt_nascimento'],
  numero_prontuario: ['n prontuario', 'numero prontuario', 'prontuario', 'nº prontuário', 'nr prontuario', 'num prontuario'],
  endereco: ['endereco', 'endereço', 'logradouro', 'rua', 'street'],
  bairro: ['bairro', 'neighborhood'],
  cidade: ['cidade', 'city', 'municipio'],
  cep: ['cep'],
  estado: ['estado', 'uf', 'state'],
  estado_civil: ['estado civil'],
  escolaridade: ['escolaridade', 'escolarida'],
  profissao: ['profissao', 'profissão', 'occupation'],
  local_nascimento: ['local de nascimento', 'local nascimento'],
  nacionalidade: ['nacionalidade'],
  nome_responsavel: ['nome responsavel', 'responsavel', 'nome do responsável'],
  preferencia_dentista: ['preferencia dentista', 'dentista preferido', 'dentista'],
  nome_convenio: ['nome convenio', 'convenio', 'plano', 'insurance'],
  convenio_cartao: ['convenio cartao', 'numero carteirinha', 'carteirinha'],
  convenio_obs: ['convenio obs', 'obs convenio'],
  data_cadastro: ['data cadastro', 'cadastro'],
  indicacao: ['indicacao', 'indicação', 'como conheceu'],
  numero_etiqueta: ['numero etiqueta', 'etiqueta', 'tag'],
};

/** Dado um array de cabeçalhos brutos, retorna mapa: rawHeader -> chave canônica */
export function getCanonicalHeaderMap(rawHeaders) {
  const map = {};
  const normalizedToRaw = {};
  for (const raw of rawHeaders) {
    const n = normalizeHeader(raw);
    if (!n) continue;
    if (normalizedToRaw[n]) continue;
    normalizedToRaw[n] = raw;
    let found = false;
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => a === n || n.includes(a) || a.includes(n))) {
        map[raw] = canonical;
        found = true;
        break;
      }
    }
    if (!found) map[raw] = n.replace(/\s+/g, '_');
  }
  return map;
}

/** Converte array de linhas (objetos com chaves brutas) para chaves canônicas. Preferir valor não vazio quando várias colunas mapeiam para a mesma chave. */
export function normalizeParsedRows(rows, headerMap) {
  if (!rows.length) return rows;
  return rows.map((row) => {
    const out = {};
    for (const [rawKey, value] of Object.entries(row)) {
      const canonical = headerMap[rawKey];
      if (!canonical) continue;
      const v = String(value ?? '').trim();
      if (v) out[canonical] = out[canonical] || v;
      else out[canonical] = out[canonical] ?? '';
    }
    return out;
  });
}

/** Colunas do cadastro para CSV (ordem e header) */
export const CSV_HEADERS = [
  'unidade_origem',
  'numero_prontuario',
  'numero_etiqueta',
  'nome_completo',
  'nome_social',
  'apelido',
  'sexo',
  'cpf',
  'rg',
  'email',
  'telefone',
  'celular',
  'endereco',
  'bairro',
  'cidade',
  'cep',
  'estado',
  'estado_civil',
  'escolaridade',
  'profissao',
  'registro_conselho',
  'data_nascimento',
  'local_nascimento',
  'nacionalidade',
  'idade',
  'nome_responsavel',
  'cpf_responsavel',
  'balanca_financeira',
  'preferencia_dentista',
  'nome_convenio',
  'convenio_cartao',
  'convenio_obs',
  'data_cadastro',
  'campanha',
  'captacao',
  'indicacao',
  'indicacao_outros',
  'tipo_sanguineo',
  'cor_pele',
  'cor_cabelos',
  'cor_olhos',
  'formato_rosto',
  'data_ultimo_atendimento',
];

/** Parse string de data DD/MM/AAAA ou AAAA-MM-DD para AAAA-MM-DD */
export function parseDate(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return v;
}

/** Parse CSV texto em array de objetos (header como chaves). maxLines: opcional, só processa as primeiras N linhas (1 header + N-1 dados). */
export function parseCsvText(text, maxLines = 0) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const dataEnd = maxLines > 0 ? Math.min(lines.length, maxLines) : lines.length;
  const rows = [];
  for (let i = 1; i < dataEnd; i++) {
    const values = parseCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    rows.push(obj);
  }
  return rows;
}

/** Prévia rápida: só as primeiras maxDataRows linhas de dados (ex.: 25 = 1 header + 25 linhas). */
export function parseCsvTextFirstLines(text, maxDataRows = 25) {
  return parseCsvText(text, maxDataRows + 1);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/** Parse arquivo XLSX em array de objetos (carrega xlsx só quando necessário). maxRows: opcional, só as primeiras N linhas. */
export async function parseXlsxFile(file, maxRows = 0) {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.Sheets[wb.SheetNames[0]];
  if (!first) return [];
  const all = XLSX.utils.sheet_to_json(first, { defval: '', raw: false });
  if (maxRows > 0 && all.length > maxRows) return all.slice(0, maxRows);
  return all;
}

/** Prévia rápida: só as primeiras maxRows linhas da primeira sheet. */
export async function parseXlsxFileFirstRows(file, maxRows = 25) {
  return parseXlsxFile(file, maxRows);
}

/** Gera CSV a partir de array de objetos */
export function toCsv(rows, headers = CSV_HEADERS) {
  if (rows.length === 0) {
    return headers.join(',');
  }
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headerLine = headers.join(',');
  const dataLines = rows.map((r) => headers.map((h) => escape(r[h] ?? r[h.replace(/_/g, ' ')] ?? '')).join(','));
  return [headerLine, ...dataLines].join('\n');
}
