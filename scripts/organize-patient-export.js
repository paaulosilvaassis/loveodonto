#!/usr/bin/env node
/**
 * Organiza exportação CSV de pacientes no padrão ControleODONTO (XLSX).
 * Uso: node scripts/organize-patient-export.js [caminhoCSV] [caminhoModeloXLSX]
 * Se não passar argumentos, usa: data/pacientes-lote-*.csv e data/ControleODONTO - Pacientes.xlsx
 * Saída: data/pacientes-lote-ORGANIZADO.xlsx, data/pacientes-lote-ORGANIZADO.csv, data/pacientes-lote-ERROS.txt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Padrão de colunas (mesmo do app - ControleODONTO)
const MODEL_HEADERS = [
  'unidade_origem', 'numero_prontuario', 'numero_etiqueta', 'nome_completo', 'nome_social', 'apelido',
  'sexo', 'cpf', 'rg', 'email', 'telefone', 'celular', 'endereco', 'bairro', 'cidade', 'cep', 'estado',
  'estado_civil', 'escolaridade', 'profissao', 'registro_conselho', 'data_nascimento', 'local_nascimento',
  'nacionalidade', 'idade', 'nome_responsavel', 'cpf_responsavel', 'balanca_financeira', 'preferencia_dentista',
  'nome_convenio', 'convenio_cartao', 'convenio_obs', 'data_cadastro', 'campanha', 'captacao', 'indicacao',
  'indicacao_outros', 'tipo_sanguineo', 'cor_pele', 'cor_cabelos', 'cor_olhos', 'formato_rosto', 'data_ultimo_atendimento',
  'observacoes', 'campos_extras',
];

const KEY_TO_LABEL = {
  unidade_origem: 'Unidade Origem',
  numero_prontuario: 'Nº Prontuário',
  numero_etiqueta: 'Nº Etiqueta',
  nome_completo: 'Nome Completo',
  nome_social: 'Nome Social',
  apelido: 'Apelido',
  sexo: 'Sexo',
  cpf: 'CPF',
  rg: 'RG',
  email: 'E-mail',
  telefone: 'Telefone',
  celular: 'Celular',
  endereco: 'Endereço',
  bairro: 'Bairro',
  cidade: 'Cidade',
  cep: 'CEP',
  estado: 'Estado',
  estado_civil: 'Estado Civil',
  escolaridade: 'Escolaridade',
  profissao: 'Profissão',
  registro_conselho: 'Registro Conselho',
  data_nascimento: 'Data Nascimento',
  local_nascimento: 'Local Nascimento',
  nacionalidade: 'Nacionalidade',
  idade: 'Idade',
  nome_responsavel: 'Nome Responsável',
  cpf_responsavel: 'CPF Responsável',
  balanca_financeira: 'Balança Financeira',
  preferencia_dentista: 'Preferência Dentista',
  nome_convenio: 'Nome Convênio',
  convenio_cartao: 'Convênio Cartão',
  convenio_obs: 'Convênio Obs',
  data_cadastro: 'Data Cadastro',
  campanha: 'Campanha',
  captacao: 'Captação',
  indicacao: 'Indicação',
  indicacao_outros: 'Indicação Outros',
  tipo_sanguineo: 'Tipo Sanguíneo',
  cor_pele: 'Cor Pele',
  cor_cabelos: 'Cor Cabelos',
  cor_olhos: 'Cor Olhos',
  formato_rosto: 'Formato Rosto',
  data_ultimo_atendimento: 'Data Último Atendimento',
  observacoes: 'Observações',
  campos_extras: 'Campos Extras',
};

const HEADER_ALIASES = {
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
  preferencia_dentista: ['preferencia dentista', 'dentista preferido', 'dentista', 'preferência dentista'],
  nome_convenio: ['nome convenio', 'convenio', 'plano', 'insurance', 'nome do convênio'],
  convenio_cartao: ['convenio cartao', 'numero carteirinha', 'carteirinha'],
  convenio_obs: ['convenio obs', 'obs convenio'],
  data_cadastro: ['data cadastro', 'cadastro'],
  indicacao: ['indicacao', 'indicação', 'como conheceu'],
  numero_etiqueta: ['numero etiqueta', 'etiqueta', 'tag'],
  observacoes: ['observacoes', 'observações', 'obs', 'observacao'],
};

function normalizeHeader(str) {
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

function getCanonicalKey(rawHeader) {
  const n = normalizeHeader(rawHeader);
  if (!n) return null;
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => a === n || n.includes(a) || a.includes(n))) return canonical;
  }
  if (MODEL_HEADERS.includes(n.replace(/\s+/g, '_'))) return n.replace(/\s+/g, '_');
  return null;
}

function onlyDigits(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function formatCpf(v) {
  const d = onlyDigits(v);
  if (d.length !== 11) return v ? String(v).trim() : '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(v) {
  const d = onlyDigits(v);
  if (d.length < 10) return v ? String(v).trim() : '';
  const ddd = d.length >= 11 ? d.slice(0, 2) : d.slice(0, 2);
  const num = d.length >= 11 ? d.slice(2) : d.slice(2);
  return `(${ddd}) ${num.length === 9 ? num.slice(0, 5) + '-' + num.slice(5) : num}`;
}

function formatCep(v) {
  const d = onlyDigits(v);
  if (d.length !== 8) return v ? String(v).trim() : '';
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatDateDdMmYyyy(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (br) return `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}/${br[3]}`;
  return s;
}

function normalizeSexo(v) {
  const s = String(v ?? '').trim().toUpperCase().slice(0, 1);
  if (s === 'M' || s === 'F') return s;
  if (/^m|masculino|male/i.test(v)) return 'M';
  if (/^f|feminino|female/i.test(v)) return 'F';
  return v ? String(v).trim() : '';
}

function cleanCell(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\u200B|\uFEFF/g, '')
    .trim();
}

function detectDelimiter(firstLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === ',' || c === ';' || c === '\t')) counts[c]++;
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';']) return '\t';
  return ',';
}

function parseCsvRobust(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      current += c;
    } else if ((c === '\n' || (c === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (c === '\r') i++;
      lines.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return { header: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);

  function splitLine(line) {
    const out = [];
    let cell = '';
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQ = !inQ;
        cell += ch;
      } else if ((ch === delimiter || ch === '\r') && !inQ) {
        out.push(cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    out.push(cell.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    return out;
  }

  const header = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    if (vals.every((v) => !v || !String(v).trim())) continue;
    const obj = {};
    header.forEach((h, idx) => {
      const key = h && String(h).trim() ? h : `_col${idx}`;
      obj[key] = vals[idx] ?? '';
    });
    rows.push(obj);
  }
  return { header, rows };
}

async function getModelHeadersFromXlsx(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const mod = await import('xlsx');
    const XLSX = mod.default ?? mod;
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const first = wb.Sheets[wb.SheetNames[0]];
    if (!first) return null;
    const range = XLSX.utils.decode_range(first['!ref'] || 'A1');
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      const cell = first[ref];
      const val = cell && cell.v != null ? String(cell.v).trim() : '';
      headers.push(val || `Col${c}`);
    }
    if (headers.some((h) => h && !h.startsWith('Col'))) return headers;
  } catch (e) {
    console.warn('Não foi possível ler modelo XLSX:', e.message);
  }
  return null;
}

function mapRowToModel(rawRow, headerMap, extraKeys) {
  const out = {};
  MODEL_HEADERS.forEach((h) => { out[h] = ''; });

  const observacoes = [];
  const extras = [];

  for (const [rawKey, value] of Object.entries(rawRow)) {
    const v = cleanCell(value);
    const canonical = headerMap[rawKey] || getCanonicalKey(rawKey);
    if (canonical && MODEL_HEADERS.includes(canonical)) {
      if (v && (!out[canonical] || out[canonical].length < v.length)) out[canonical] = v;
    } else if (rawKey && !rawKey.startsWith('_col')) {
      if (canonical === 'observacoes') observacoes.push(v);
      else if (v) extras.push(`${rawKey}: ${v}`);
    }
  }

  if (observacoes.length) out.observacoes = observacoes.filter(Boolean).join(' | ');
  if (extras.length) out.campos_extras = extras.join(' | ');

  return out;
}

function normalizeRow(row) {
  const r = { ...row };
  if (r.cpf) r.cpf = formatCpf(r.cpf);
  if (r.telefone) r.telefone = formatPhone(r.telefone);
  if (r.celular) r.celular = formatPhone(r.celular);
  if (r.cep) r.cep = formatCep(r.cep);
  if (r.data_nascimento) r.data_nascimento = formatDateDdMmYyyy(r.data_nascimento);
  if (r.data_cadastro) r.data_cadastro = formatDateDdMmYyyy(r.data_cadastro);
  if (r.data_ultimo_atendimento) r.data_ultimo_atendimento = formatDateDdMmYyyy(r.data_ultimo_atendimento);
  if (r.sexo !== undefined) r.sexo = normalizeSexo(r.sexo);
  if (r.cpf_responsavel) r.cpf_responsavel = formatCpf(r.cpf_responsavel);
  return r;
}

function countFilled(row) {
  return MODEL_HEADERS.filter((h) => row[h] && String(row[h]).trim()).length;
}

function deduplicate(rows) {
  const byCpf = new Map();
  const byNameBirth = new Map();
  const noKey = [];

  for (const row of rows) {
    const cpf = onlyDigits(row.cpf || '');
    const nome = cleanCell(row.nome_completo || '');
    const nasc = cleanCell(row.data_nascimento || '');

    if (cpf.length === 11) {
      const existing = byCpf.get(cpf);
      if (!existing || countFilled(row) > countFilled(existing)) byCpf.set(cpf, row);
      continue;
    }
    const key = `${nome}|${nasc}`;
    if (nome && nasc) {
      const existing = byNameBirth.get(key);
      if (!existing || countFilled(row) > countFilled(existing)) byNameBirth.set(key, row);
      continue;
    }
    noKey.push(row);
  }

  const seen = new Set();
  const result = [];
  for (const row of byCpf.values()) {
    result.push(row);
    seen.add(row);
  }
  for (const row of byNameBirth.values()) {
    if (seen.has(row)) continue;
    const cpf = onlyDigits(row.cpf || '');
    if (cpf.length === 11 && byCpf.has(cpf)) continue;
    result.push(row);
    seen.add(row);
  }
  noKey.forEach((row) => result.push(row));
  return result;
}

function buildHeaderMap(csvHeader) {
  const map = {};
  const used = new Set();
  csvHeader.forEach((raw) => {
    const canon = getCanonicalKey(raw);
    if (canon && MODEL_HEADERS.includes(canon) && !used.has(canon)) {
      map[raw] = canon;
      used.add(canon);
    } else if (canon) {
      map[raw] = canon;
    }
  });
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  let csvPath = args[0] || path.join(dataDir, 'pacientes-lote-1771859723533.csv');
  let modeloPath = args[1] || path.join(dataDir, 'ControleODONTO - Pacientes.xlsx');

  if (!fs.existsSync(csvPath)) {
    const alt = path.join(ROOT, 'pacientes-lote-1771859723533.csv');
    if (fs.existsSync(alt)) csvPath = alt;
  }

  if (!fs.existsSync(csvPath)) {
    console.error('CSV não encontrado. Coloque o arquivo em:');
    console.error('  ' + path.join(dataDir, 'pacientes-lote-1771859723533.csv'));
    console.error('Ou passe o caminho: node scripts/organize-patient-export.js <caminho.csv> [modelo.xlsx]');
    process.exit(1);
  }

  let modelColumnKeys = MODEL_HEADERS;
  let modelColumnLabels = MODEL_HEADERS;
  if (fs.existsSync(modeloPath)) {
    const fromXlsx = await getModelHeadersFromXlsx(modeloPath);
    if (fromXlsx && fromXlsx.length > 0) {
      const keys = fromXlsx.map((h) => {
        const k = getCanonicalKey(h);
        return k && MODEL_HEADERS.includes(k) ? k : (normalizeHeader(h).replace(/\s+/g, '_') || null);
      });
      const labels = fromXlsx.map((h, i) => (h && String(h).trim()) || keys[i] || `Col${i}`);
      const validKeys = keys.filter((k) => k && MODEL_HEADERS.includes(k));
      if (validKeys.length > 0) {
        modelColumnKeys = [...validKeys];
        modelColumnLabels = labels.filter((_, i) => keys[i] && MODEL_HEADERS.includes(keys[i]));
        if (!modelColumnKeys.includes('observacoes')) {
          modelColumnKeys.push('observacoes');
          modelColumnLabels.push('Observações');
        }
        if (!modelColumnKeys.includes('campos_extras')) {
          modelColumnKeys.push('campos_extras');
          modelColumnLabels.push('Campos Extras');
        }
      }
    }
  }

  const csvRaw = fs.readFileSync(csvPath, 'utf8');
  const { header: csvHeader, rows: rawRows } = parseCsvRobust(csvRaw);

  const headerMap = buildHeaderMap(csvHeader);
  const extraKeys = csvHeader.filter((h) => !headerMap[h] && h && !h.startsWith('_col'));

  const errors = [];
  const mapped = [];
  for (let i = 0; i < rawRows.length; i++) {
    try {
      const row = mapRowToModel(rawRows[i], headerMap, extraKeys);
      if (MODEL_HEADERS.every((h) => !row[h] || !String(row[h]).trim()) && !row.observacoes && !row.campos_extras) {
        errors.push({ line: i + 2, raw: JSON.stringify(rawRows[i]).slice(0, 200), reason: 'Linha vazia ou sem dados mapeáveis' });
        continue;
      }
      mapped.push(row);
    } catch (e) {
      errors.push({ line: i + 2, raw: JSON.stringify(rawRows[i]).slice(0, 200), reason: e.message });
    }
  }

  const normalized = mapped.map(normalizeRow);
  const deduped = deduplicate(normalized);

  const outDir = path.dirname(csvPath);
  const baseName = path.basename(csvPath, path.extname(csvPath));
  fs.mkdirSync(outDir, { recursive: true });
  const outXlsx = path.join(outDir, `${baseName}-ORGANIZADO.xlsx`);
  const outCsv = path.join(outDir, `${baseName}-ORGANIZADO.csv`);
  const outErros = path.join(outDir, `${baseName}-ERROS.txt`);

  const exportKeys = modelColumnKeys.filter((k) => MODEL_HEADERS.includes(k));
  const exportLabels = exportKeys.map((k) => {
    const fromModel = modelColumnLabels[modelColumnKeys.indexOf(k)];
    if (fromModel && (fromModel.includes(' ') || fromModel.includes('º') || fromModel.includes('ã'))) return fromModel;
    return KEY_TO_LABEL[k] || k.replace(/_/g, ' ');
  });

  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const wsData = [exportLabels];
  deduped.forEach((row) => {
    wsData.push(exportKeys.map((k) => row[k] ?? ''));
  });
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = exportKeys.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
  XLSX.writeFile(wb, outXlsx, { bookSST: true });

  const csvSep = ';';
  const escapeCsv = (v) => {
    const s = String(v ?? '');
    return s.includes(csvSep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvLines = [exportLabels.join(csvSep)];
  deduped.forEach((row) => {
    csvLines.push(exportKeys.map((k) => escapeCsv(row[k])).join(csvSep));
  });
  fs.writeFileSync(outCsv, '\uFEFF' + csvLines.join('\r\n'), 'utf8');

  if (errors.length > 0) {
    const errosContent = errors
      .map((e) => `Linha ${e.line}: ${e.reason}\n  ${e.raw}`)
      .join('\n\n');
    fs.writeFileSync(outErros, errosContent, 'utf8');
    console.log('Erros (linhas não recuperadas):', outErros);
  }

  console.log('Saída XLSX:', outXlsx);
  console.log('Saída CSV:', outCsv);
  console.log('Registros:', deduped.length, '(deduplicados)', '| Linhas originais:', rawRows.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
