/**
 * Utilitários para parse e geração de CSV/XLSX.
 * Usado por import/export de pacientes.
 * XLSX é carregado dinamicamente para evitar crash/travamento ao abrir o modal.
 */

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

/** Parse CSV texto em array de objetos (header como chaves) */
export function parseCsvText(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    rows.push(obj);
  }
  return rows;
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

/** Parse arquivo XLSX em array de objetos (carrega xlsx só quando necessário) */
export async function parseXlsxFile(file) {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.Sheets[wb.SheetNames[0]];
  if (!first) return [];
  return XLSX.utils.sheet_to_json(first, { defval: '', raw: false });
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
