import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  COMMISSION_TYPE,
  PRICE_RESTRICTION,
  PROCEDURE_SEGMENT,
  PROCEDURE_STATUS,
  SPECIALTIES,
  validateTussCode,
  importProceduresBatch,
  listProcedures,
} from '../services/priceBaseService.js';
import { Upload, Download, ChevronRight, ChevronLeft, X, AlertTriangle } from 'lucide-react';

const FIELD_OPTIONS = [
  { key: 'ignore', label: 'Ignorar' },
  { key: 'title', label: 'Título (obrigatório)' },
  { key: 'status', label: 'Situação' },
  { key: 'segment', label: 'Segmento' },
  { key: 'specialty', label: 'Especialidade (obrigatório)' },
  { key: 'tussCode', label: 'Código TUSS' },
  { key: 'internalCode', label: 'Código Interno' },
  { key: 'shortcut', label: 'Atalho' },
  { key: 'costPrice', label: 'Preço de Custo' },
  { key: 'price', label: 'Preço (obrigatório)' },
  { key: 'minPrice', label: 'Preço Mínimo' },
  { key: 'maxPrice', label: 'Preço Máximo' },
  { key: 'priceRestriction', label: 'Restrição de Preço' },
];

const STEP_LABELS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Mapeamento + Preview' },
  { id: 3, label: 'Revisão + Importar' },
];

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parseMoney = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
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
};

const normalizeStatus = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return PROCEDURE_STATUS.ATIVO;
  if (['ativo', '1', 'sim', 'yes'].includes(raw)) return PROCEDURE_STATUS.ATIVO;
  if (['inativo', '0', 'nao', 'não', 'no'].includes(raw)) return PROCEDURE_STATUS.INATIVO;
  return PROCEDURE_STATUS.ATIVO;
};

const normalizeRestriction = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return PRICE_RESTRICTION.LIVRE;
  if (raw.includes('avis')) return PRICE_RESTRICTION.AVISAR;
  if (raw.includes('bloq')) return PRICE_RESTRICTION.BLOQUEAR;
  if (raw.includes('fix')) return PRICE_RESTRICTION.FIXO;
  return PRICE_RESTRICTION.LIVRE;
};

const normalizeSegment = (value) => {
  const raw = normalizeHeader(value);
  if (!raw) return PROCEDURE_SEGMENT.ODONTOLOGIA;
  if (raw.includes('oro') || raw.includes('orofacial')) return PROCEDURE_SEGMENT.OROFACIAL;
  if (raw.includes('diag') || raw.includes('imagem')) return PROCEDURE_SEGMENT.DIAGNOSTICO_IMAGEM;
  if (raw.includes('odont')) return PROCEDURE_SEGMENT.ODONTOLOGIA;
  return PROCEDURE_SEGMENT.ODONTOLOGIA;
};

const detectMapping = (columns) => {
  const mapping = {};
  columns.forEach((col) => {
    const normalized = normalizeHeader(col);
    if (!normalized) {
      mapping[col] = 'ignore';
      return;
    }
    // Detecção de título: priorizar "titulo" e excluir "referencia"
    // "Procedimento de Referência" não deve ser mapeado para title
    if (normalized.includes('referencia') || normalized.includes('referência')) {
      mapping[col] = 'ignore';
      return;
    }
    // Priorizar colunas que contêm "titulo" explicitamente
    if (normalized.includes('titulo') || normalized.includes('título')) {
      mapping[col] = 'title';
      return;
    }
    // Se contém "procedimento" mas não é "referência", pode ser título
    if (normalized.includes('procedimento') && !normalized.includes('referencia') && !normalized.includes('referência')) {
      // Verificar se já existe um título mapeado
      const hasTitle = Object.values(mapping).includes('title');
      if (!hasTitle) {
        mapping[col] = 'title';
        return;
      }
    }
    // Fallback para "nome" apenas se não houver título ainda
    if (normalized.includes('nome')) {
      const hasTitle = Object.values(mapping).includes('title');
      if (!hasTitle) {
        mapping[col] = 'title';
        return;
      }
    }
    if (normalized.includes('status') || normalized.includes('situacao') || normalized.includes('situação')) {
      mapping[col] = 'status';
      return;
    }
    if (normalized.includes('tuss')) {
      mapping[col] = 'tussCode';
      return;
    }
    if (normalized.includes('codigo interno') || normalized.includes('codigo_interno') || normalized.includes('cod interno')) {
      mapping[col] = 'internalCode';
      return;
    }
    if (normalized.includes('custo')) {
      mapping[col] = 'costPrice';
      return;
    }
    // Verificar campos específicos ANTES do genérico "preço/valor"
    // "Valor Mínimo" → "valor minimo" → deve mapear para minPrice
    if ((normalized.includes('minimo') || normalized.includes('mínimo') || normalized.includes('min')) && 
        (normalized.includes('valor') || normalized.includes('preco') || normalized.includes('preço'))) {
      mapping[col] = 'minPrice';
      return;
    }
    // "Valor Máximo" → "valor maximo" → deve mapear para maxPrice
    if ((normalized.includes('maximo') || normalized.includes('máximo') || normalized.includes('max')) && 
        (normalized.includes('valor') || normalized.includes('preco') || normalized.includes('preço'))) {
      mapping[col] = 'maxPrice';
      return;
    }
    // "Restringir Preço" → "restringir preco" → deve mapear para priceRestriction
    if (normalized.includes('restri') || normalized.includes('restring')) {
      mapping[col] = 'priceRestriction';
      return;
    }
    // Verificar comissão antes de mapear para defaultPrice
    if (normalized.includes('comissao') || normalized.includes('comissão')) {
      mapping[col] = 'ignore';
      return;
    }
    // Mapear "Preço" ou "Valor" (sem qualificadores min/max/comissão) para price
    // Exemplo: "Preço" → "preco", "Valor" → "valor"
    if (normalized === 'preco' || normalized === 'preço' || normalized === 'valor') {
      mapping[col] = 'price';
      return;
    }
    // Se contém "preco" ou "preço" mas não contém min/max/comissão
    if ((normalized.includes('preco') || normalized.includes('preço')) && 
        !normalized.includes('min') && !normalized.includes('max') && 
        !normalized.includes('comissao') && !normalized.includes('comissão')) {
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
};

const normalizeRow = (row, mapping) => {
  const result = {};
  // Encontrar a primeira coluna mapeada para "title" (prioridade)
  const titleColumns = Object.entries(mapping).filter(([col, field]) => field === 'title');
  let titleProcessed = false;
  
  Object.entries(mapping).forEach(([column, field]) => {
    if (field === 'ignore') return;
    
    // Para "title", processar apenas a primeira coluna encontrada
    if (field === 'title') {
      if (titleProcessed) return; // Já processamos um título, ignorar os demais
      titleProcessed = true;
    }
    
    // Tentar encontrar o valor mesmo se a chave tiver espaços extras ou diferenças de case
    let value = row[column];
    if (value === undefined || value === null || value === '') {
      // Tentar encontrar por chave normalizada
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
        result.title = String(value || '').trim();
        break;
      case 'status':
        result.status = normalizeStatus(value);
        break;
      case 'segment':
        result.segment = normalizeSegment(value);
        break;
      case 'specialty':
        result.specialty = String(value || '').trim();
        break;
      case 'tussCode':
        result.tussCode = String(value || '').trim();
        break;
      case 'internalCode':
        result.internalCode = String(value || '').trim();
        break;
      case 'shortcut':
        result.shortcut = String(value || '').trim();
        break;
      case 'costPrice':
        result.costPrice = parseMoney(value);
        break;
      case 'price': {
        const parsed = parseMoney(value);
        result.price = parsed;
        break;
      }
      case 'minPrice':
        result.minPrice = parseMoney(value);
        break;
      case 'maxPrice':
        result.maxPrice = parseMoney(value);
        break;
      case 'priceRestriction':
        result.priceRestriction = normalizeRestriction(value);
        break;
      default:
        break;
    }
  });
  if (!result.status) result.status = PROCEDURE_STATUS.ATIVO;
  if (!result.segment) result.segment = PROCEDURE_SEGMENT.ODONTOLOGIA;
  if (!result.priceRestriction) result.priceRestriction = PRICE_RESTRICTION.LIVRE;
  return result;
};

const validateRow = (row) => {
  const errors = [];
  const warnings = [];

  if (!row.title) errors.push('Título obrigatório');
  if (!row.specialty) errors.push('Especialidade obrigatória');
  if (!row.price || row.price <= 0) errors.push('Preço inválido');

  if (row.minPrice !== null && row.maxPrice !== null && row.minPrice > row.maxPrice) {
    errors.push('Preço mínimo maior que máximo');
  }
  if (row.minPrice !== null && row.price !== null && row.price < row.minPrice) {
    errors.push('Preço menor que mínimo');
  }
  if (row.maxPrice !== null && row.price !== null && row.price > row.maxPrice) {
    errors.push('Preço maior que máximo');
  }

  if (row.tussCode) {
    const validation = validateTussCode(row.tussCode);
    if (!validation.valid) errors.push(validation.error);
  }


  if (row.specialty && !SPECIALTIES.includes(row.specialty)) {
    warnings.push('Especialidade fora da lista padrão');
  }

  return { errors, warnings };
};

export default function PriceBaseImportWizard({
  open,
  onClose,
  onComplete,
  selectedTableId,
  user,
}) {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [importMode, setImportMode] = useState('upsert');
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const normalizedRows = useMemo(() => {
    const normalized = rawRows.map((row) => normalizeRow(row, mapping));
    return normalized;
  }, [rawRows, mapping]);
  const validationResults = useMemo(() => {
    const results = normalizedRows.map((row, index) => ({ index, ...validateRow(row) }));
    return results;
  }, [normalizedRows]);

  const previewRows = useMemo(() => normalizedRows.slice(0, 12), [normalizedRows]);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setProcessing(true);
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const names = workbook.SheetNames || [];
      setSheetNames(names);
      const sheetName = names[0];
      setSelectedSheet(sheetName || '');
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error('Planilha não encontrada no arquivo');
      }
      // Tentar detectar se a primeira linha é cabeçalho ou título
      const rawRowsArray = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
      // Procurar a primeira linha que tenha pelo menos 3 valores não-vazios (provavelmente o cabeçalho)
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(rawRowsArray.length, 10); i++) {
        const row = rawRowsArray[i];
        if (Array.isArray(row)) {
          const nonEmptyCount = row.filter(c => c && String(c).trim()).length;
          // Se encontramos uma linha com pelo menos 3 valores não-vazios, usar como cabeçalho
          if (nonEmptyCount >= 3) {
            headerRowIndex = i;
            break;
          }
        }
      }
      // Converter usando o cabeçalho correto
      let rows;
      if (headerRowIndex > 0) {
        // Se precisamos pular linhas antes do cabeçalho, converter manualmente usando a linha correta como cabeçalho
        const headerRow = rawRowsArray[headerRowIndex];
        const dataRows = rawRowsArray.slice(headerRowIndex + 1);
        rows = dataRows.map((row) => {
          const obj = {};
          headerRow.forEach((header, idx) => {
            obj[String(header || '').trim() || `__EMPTY_${idx}`] = row[idx] || '';
          });
          return obj;
        });
      } else {
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }
      const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
      setRawRows(rows);
      setColumns(cols);
      setMapping(detectMapping(cols));
      setStep(2);
      setError(null);
    } catch (error) {
      console.error('Erro ao ler arquivo:', error);
      const errorMessage = error?.message || 'Erro desconhecido ao carregar planilha';
      setError(errorMessage);
      alert(`Erro ao carregar planilha: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleSheetChange = (sheetName) => {
    if (!sheetName || !file) return;
    setSelectedSheet(sheetName);
    setProcessing(true);
    setError(null);
    file.arrayBuffer()
      .then((data) => {
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          throw new Error(`Planilha "${sheetName}" não encontrada`);
        }
        // Tentar detectar se a primeira linha é cabeçalho ou título
        const rawRowsArray = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
        // Procurar a primeira linha que tenha pelo menos 3 valores não-vazios (provavelmente o cabeçalho)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawRowsArray.length, 10); i++) {
          const row = rawRowsArray[i];
          if (Array.isArray(row)) {
            const nonEmptyCount = row.filter(c => c && String(c).trim()).length;
            // Se encontramos uma linha com pelo menos 3 valores não-vazios, usar como cabeçalho
            if (nonEmptyCount >= 3) {
              headerRowIndex = i;
              break;
            }
          }
        }
        let rows;
        if (headerRowIndex > 0) {
          // Se precisamos pular a primeira linha, converter manualmente usando a segunda linha como cabeçalho
          const headerRow = rawRowsArray[headerRowIndex];
          const dataRows = rawRowsArray.slice(headerRowIndex + 1);
          rows = dataRows.map((row) => {
            const obj = {};
            headerRow.forEach((header, idx) => {
              obj[String(header || '').trim() || `__EMPTY_${idx}`] = row[idx] || '';
            });
            return obj;
          });
        } else {
          rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        }
        const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
        setRawRows(rows);
        setColumns(cols);
        setMapping(detectMapping(cols));
      })
      .catch((err) => {
        console.error('Erro ao trocar planilha:', err);
        setError(err?.message || 'Erro ao carregar planilha');
      })
      .finally(() => setProcessing(false));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer?.files?.[0];
    handleFileSelect(dropped);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Título',
      'Situação',
      'Segmento',
      'Especialidade',
      'Código TUSS',
      'Código Interno',
      'Preço',
      'Preço Mínimo',
      'Preço Máximo',
      'Restrição',
    ];
    const example = [
      {
        Título: 'Limpeza Profissional',
        Situação: 'Ativo',
        Segmento: 'Odontologia',
        Especialidade: 'Clínica Geral',
        'Código TUSS': '81000065',
        'Código Interno': 'LIMP001',
        'Preço': '150,00',
        'Preço Mínimo': '120,00',
        'Preço Máximo': '200,00',
        Restrição: 'LIVRE',
      },
      {
        Título: 'Aplicação de Flúor',
        Situação: 'Ativo',
        Segmento: 'Odontologia',
        Especialidade: 'Clínica Geral',
        'Código TUSS': '81000066',
        'Código Interno': 'FLU001',
        Preço: '80,00',
        'Preço Mínimo': '60,00',
        'Preço Máximo': '120,00',
        Restrição: 'AVISAR',
      },
    ];
    const worksheet = XLSX.utils.json_to_sheet(example, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo');
    XLSX.writeFile(workbook, 'base-preco-modelo.xlsx');
  };

  const rowsSummary = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let valid = 0;
    validationResults.forEach((result) => {
      if (result.errors.length) {
        errors += 1;
      } else {
        valid += 1;
      }
      if (result.warnings.length) warnings += 1;
    });
    return { errors, warnings, valid, total: validationResults.length };
  }, [validationResults]);

  const existingIndex = useMemo(() => {
    if (!selectedTableId) return { byInternal: new Map(), byTuss: new Map(), byTitleSpecialty: new Map() };
    const existing = listProcedures({ priceTableId: selectedTableId });
    const byInternal = new Map();
    const byTuss = new Map();
    const byTitleSpecialty = new Map();
    existing.forEach((proc) => {
      if (proc.internalCode) byInternal.set(proc.internalCode.toLowerCase(), proc);
      if (proc.tussCode) byTuss.set(proc.tussCode.toLowerCase(), proc);
      byTitleSpecialty.set(`${proc.title.toLowerCase()}::${proc.specialty.toLowerCase()}`, proc);
    });
    return { byInternal, byTuss, byTitleSpecialty };
  }, [selectedTableId]);

  const handleImport = () => {
    setProcessing(true);
    try {
      const createItems = [];
      const updateItems = [];
      const overrideItems = [];

      let skippedByErrors = 0;
      let skippedByMatch = 0;
      let skippedByNoMatch = 0;
      let addedToCreate = 0;
      let addedToUpdate = 0;

      normalizedRows.forEach((row, index) => {
        const validation = validationResults[index];
        if (validation.errors.length) {
          skippedByErrors += 1;
          return;
        }

        const internalKey = row.internalCode?.toLowerCase();
        const tussKey = row.tussCode?.toLowerCase();
        const titleKey = row.title?.toLowerCase();
        const specialtyKey = row.specialty?.toLowerCase();

        let match = null;
        let matchType = null;
        if (internalKey && existingIndex.byInternal.has(internalKey)) {
          match = existingIndex.byInternal.get(internalKey);
          matchType = 'internal';
        } else if (tussKey && existingIndex.byTuss.has(tussKey)) {
          match = existingIndex.byTuss.get(tussKey);
          matchType = 'tuss';
        } else if (titleKey && specialtyKey) {
          const titleSpecialtyKey = `${titleKey}::${specialtyKey}`;
          match = existingIndex.byTitleSpecialty.get(titleSpecialtyKey) || null;
          matchType = match ? 'titleSpecialty' : null;
        }

        const data = {
          title: row.title,
          status: row.status,
          segment: row.segment,
          specialty: row.specialty,
          tussCode: row.tussCode || null,
          internalCode: row.internalCode || null,
          shortcut: row.shortcut || null,
          costPrice: row.costPrice ?? null,
          price: row.price,
          minPrice: row.minPrice ?? null,
          maxPrice: row.maxPrice ?? null,
          priceRestriction: row.priceRestriction,
          commissionType: COMMISSION_TYPE.NENHUMA,
          commissionValue: null,
          notes: null,
        };

        if (match && importMode === 'create') {
          skippedByMatch += 1;
          return;
        }
        if (!match && importMode === 'update') {
          skippedByNoMatch += 1;
          return;
        }
        // Modo 'upsert': criar se não existe, atualizar se existe (não pula nada)

        if (match) {
          updateItems.push({
            id: match.id,
            data,
            override: selectedTableId && row.overridePrice
              ? {
                  priceTableId: selectedTableId,
                  overridePrice: row.overridePrice,
                }
              : null,
          });
          addedToUpdate += 1;
        } else {
          const tempId = `tmp-${index}`;
          createItems.push({ ...data, __tempId: tempId });
          addedToCreate += 1;
          if (selectedTableId && row.overridePrice) {
            overrideItems.push({
              procedureId: tempId,
              priceTableId: selectedTableId,
              overridePrice: row.overridePrice,
            });
          }
        }
      });

      if (!selectedTableId) {
        throw new Error('Selecione uma tabela de preço antes de importar');
      }

      const result = importProceduresBatch({
        user,
        priceTableId: selectedTableId,
        createItems,
        updateItems,
        overrideItems,
        audit: {
          mode: importMode,
          totalRows: normalizedRows.length,
          selectedTableId,
          fileName: file?.name || '',
        },
      });

      if (result) {
        onComplete?.(result);
        alert(`Importação concluída: ${result.createdCount || 0} criados, ${result.updatedCount || 0} atualizados`);
      }
      setStep(1);
      setFile(null);
      setRawRows([]);
      setColumns([]);
      setMapping({});
      setSelectedSheet('');
      setSheetNames([]);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriceBaseImportWizard.jsx:handleImport',message:'Erro capturado',data:{errorMessage:error?.message,errorStack:error?.stack,errorName:error?.name,selectedTableId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.error('Erro ao importar:', error);
      alert(`Erro ao importar: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-content-large price-base-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Importar Excel</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="price-base-import-steps">
          {STEP_LABELS.map((item) => (
            <div key={item.id} className={`price-base-import-step ${step >= item.id ? 'active' : ''}`}>
              <span>{item.id}</span>
              {item.label}
            </div>
          ))}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <div className="price-base-import-upload">
              {error && (
                <div className="price-base-modal-errors">
                  <div className="error-message">{error}</div>
                </div>
              )}
              <div
                className="price-base-import-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload size={32} />
                <strong>Arraste e solte o arquivo aqui</strong>
                <span>ou</span>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processing}
                >
                  {processing ? 'Processando...' : 'Selecionar arquivo'}
                </button>
                <small>Aceita .xlsx, .xls, .csv</small>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    setError(null);
                    handleFileSelect(e.target.files?.[0]);
                  }}
                  hidden
                />
              </div>

              <div className="price-base-import-footer">
                {file ? (
                  <div className="price-base-import-file">
                    <strong>{file.name}</strong>
                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                ) : (
                  <div className="price-base-import-file muted">Nenhum arquivo selecionado.</div>
                )}
                <button type="button" className="button secondary" onClick={handleDownloadTemplate}>
                  <Download size={16} />
                  Baixar modelo Excel
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="price-base-import-mapping">
              <div className="price-base-import-mapping-header">
                <div>
                  <h3>Mapeamento de colunas</h3>
                  <p>Confirme o mapeamento e ajuste se necessário.</p>
                </div>
                {sheetNames.length > 1 && (
                  <div className="form-field">
                    <label>Planilha</label>
                    <select value={selectedSheet} onChange={(e) => handleSheetChange(e.target.value)}>
                      {sheetNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="price-base-import-mapping-grid">
                {columns.map((col) => (
                  <div key={col} className="price-base-import-mapping-item">
                    <div className="price-base-import-column">{col}</div>
                    <select
                      value={mapping[col] || 'ignore'}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                    >
                      {FIELD_OPTIONS.map((field) => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="price-base-import-preview">
                <h4>Preview (até 12 linhas)</h4>
                <div className="price-base-import-preview-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Título</th>
                        <th>Especialidade</th>
                        <th>Segmento</th>
                        <th>Preço</th>
                        <th>Restrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={`${row.title}-${idx}`}>
                          <td>{row.title || '—'}</td>
                          <td>{row.specialty || '—'}</td>
                          <td>{row.segment || '—'}</td>
                          <td>{row.price ? `R$ ${(row.price || 0).toFixed(2)}` : '—'}</td>
                          <td>{row.priceRestriction || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="price-base-import-review">
              <div className="price-base-import-summary">
                <div>
                  <strong>Total de linhas</strong>
                  <span>{rowsSummary.total}</span>
                </div>
                <div>
                  <strong>Válidas</strong>
                  <span>{rowsSummary.valid}</span>
                </div>
                <div>
                  <strong>Com alertas</strong>
                  <span>{rowsSummary.warnings}</span>
                </div>
                <div>
                  <strong>Com erros</strong>
                  <span>{rowsSummary.errors}</span>
                </div>
              </div>

              {rowsSummary.errors > 0 && (
                <div className="price-base-import-errors">
                  <AlertTriangle size={18} />
                  Existem linhas com erro. Elas não serão importadas.
                </div>
              )}

              <div className="price-base-import-mode">
                <label>Modo de importação</label>
                <div className="price-base-import-mode-options">
                  <label>
                    <input
                      type="radio"
                      value="create"
                      checked={importMode === 'create'}
                      onChange={() => setImportMode('create')}
                    />
                    Criar novos
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="update"
                      checked={importMode === 'update'}
                      onChange={() => setImportMode('update')}
                    />
                    Atualizar existentes
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="upsert"
                      checked={importMode === 'upsert'}
                      onChange={() => setImportMode('upsert')}
                    />
                    Criar ou atualizar (recomendado)
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          {step > 1 && (
            <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={16} />
              Voltar
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              className="button primary"
              disabled={processing || (step === 1 && !file)}
              onClick={() => setStep(step + 1)}
            >
              Próximo
              <ChevronRight size={16} />
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="button primary"
              disabled={processing || rowsSummary.valid === 0}
              onClick={handleImport}
            >
              {processing ? 'Importando...' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
