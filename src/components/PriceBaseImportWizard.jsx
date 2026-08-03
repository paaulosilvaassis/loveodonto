import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  COMMISSION_TYPE,
  SPECIALTIES,
  importProceduresBatch,
  listProcedures,
} from '../services/priceBaseService.js';
import {
  detectColumnMapping,
  findBestHeaderRowIndex,
  normalizeImportRow,
  sheetRowsToObjects,
  validateImportRow,
} from '../services/priceBaseImportParse.js';
import { Upload, Download, ChevronRight, ChevronLeft, X, AlertTriangle } from 'lucide-react';

const FIELD_OPTIONS = [
  { key: 'ignore', label: 'Ignorar' },
  { key: 'title', label: 'Título / nome (obrigatório na importação)' },
  { key: 'status', label: 'Situação' },
  { key: 'segment', label: 'Segmento' },
  { key: 'specialty', label: 'Especialidade (opcional)' },
  { key: 'tussCode', label: 'Código TUSS / TISS' },
  { key: 'internalCode', label: 'Código Interno' },
  { key: 'shortcut', label: 'Atalho' },
  { key: 'costPrice', label: 'Preço de Custo' },
  { key: 'price', label: 'Preço (opcional; padrão 0)' },
  { key: 'minPrice', label: 'Preço Mínimo' },
  { key: 'maxPrice', label: 'Preço Máximo' },
  { key: 'priceRestriction', label: 'Restrição de Preço' },
  { key: 'notes', label: 'Observações / descrição' },
];

const STEP_LABELS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Mapeamento + Preview' },
  { id: 3, label: 'Revisão + Importar' },
];

function readSheetAsRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(sheetName ? `Planilha "${sheetName}" não encontrada` : 'Planilha não encontrada');
  }
  const rawRowsArray = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  const headerRowIndex = findBestHeaderRowIndex(rawRowsArray);
  const rows = sheetRowsToObjects(rawRowsArray, headerRowIndex);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, headerRowIndex };
}

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
    return rawRows.map((row) => normalizeImportRow(row, mapping));
  }, [rawRows, mapping]);
  const validationResults = useMemo(() => {
    return normalizedRows.map((normRow, index) => ({
      index,
      ...validateImportRow(rawRows[index] || {}, normRow, mapping),
    }));
  }, [normalizedRows, rawRows, mapping]);

  const previewRows = useMemo(() => normalizedRows.slice(0, 12), [normalizedRows]);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setProcessing(true);
    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const names = workbook.SheetNames || [];
      if (!names.length) {
        throw new Error('Arquivo sem planilhas');
      }
      setSheetNames(names);
      const sheetName = names[0];
      setSelectedSheet(sheetName || '');
      const { rows, columns: cols } = readSheetAsRows(workbook, sheetName);
      setRawRows(rows);
      setColumns(cols);
      setMapping(detectColumnMapping(cols));
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
        const { rows, columns: cols } = readSheetAsRows(workbook, sheetName);
        setRawRows(rows);
        setColumns(cols);
        setMapping(detectColumnMapping(cols));
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
    let empty = 0;
    validationResults.forEach((result) => {
      if (result.emptyRow) {
        empty += 1;
        return;
      }
      if (result.errors.length) {
        errors += 1;
      } else {
        valid += 1;
      }
      if (result.warnings.length) warnings += 1;
    });
    return { errors, warnings, valid, empty, total: validationResults.length };
  }, [validationResults]);

  const errorDetailRows = useMemo(() => {
    return validationResults
      .filter((r) => !r.emptyRow && r.errors.length > 0)
      .slice(0, 40);
  }, [validationResults]);

  const existingIndex = useMemo(() => {
    if (!selectedTableId)
      return {
        byInternal: new Map(),
        byTuss: new Map(),
        byTitleSpecialty: new Map(),
        byTitle: new Map(),
      };
    const existing = listProcedures({ priceTableId: selectedTableId });
    const byInternal = new Map();
    const byTuss = new Map();
    const byTitleSpecialty = new Map();
    const byTitle = new Map();
    existing.forEach((proc) => {
      if (proc.internalCode) byInternal.set(proc.internalCode.toLowerCase(), proc);
      if (proc.tussCode) byTuss.set(proc.tussCode.toLowerCase(), proc);
      byTitleSpecialty.set(`${proc.title.toLowerCase()}::${(proc.specialty || '').toLowerCase()}`, proc);
      const tk = proc.title.toLowerCase();
      if (!byTitle.has(tk)) byTitle.set(tk, proc);
    });
    return { byInternal, byTuss, byTitleSpecialty, byTitle };
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
        if (validation.emptyRow) {
          return;
        }
        if (validation.errors.length) {
          skippedByErrors += 1;
          return;
        }

        const internalKey = row.internalCode?.toLowerCase();
        const tussKey = row.tussCode?.toLowerCase();
        const titleKey = row.title?.toLowerCase();
        const specialtyKey = row.specialty?.toLowerCase();
        const defaultSpecialty = SPECIALTIES[0];

        let match = null;
        if (internalKey && existingIndex.byInternal.has(internalKey)) {
          match = existingIndex.byInternal.get(internalKey);
        } else if (tussKey && existingIndex.byTuss.has(tussKey)) {
          match = existingIndex.byTuss.get(tussKey);
        } else if (titleKey && specialtyKey) {
          const titleSpecialtyKey = `${titleKey}::${specialtyKey}`;
          match = existingIndex.byTitleSpecialty.get(titleSpecialtyKey) || null;
        } else if (titleKey) {
          match = existingIndex.byTitle.get(titleKey) || null;
        }

        const specialtyResolved =
          row.specialty && String(row.specialty).trim()
            ? row.specialty.trim()
            : defaultSpecialty;

        const priceResolved =
          row.price !== null && row.price !== undefined && Number.isFinite(row.price)
            ? row.price
            : 0;

        const data = {
          title: row.title,
          status: row.status,
          segment: row.segment,
          specialty: specialtyResolved,
          tussCode: row.tussCode || null,
          internalCode: row.internalCode || null,
          shortcut: row.shortcut || null,
          costPrice: row.costPrice ?? null,
          price: priceResolved,
          minPrice: row.minPrice ?? null,
          maxPrice: row.maxPrice ?? null,
          priceRestriction: row.priceRestriction,
          commissionType: COMMISSION_TYPE.NENHUMA,
          commissionValue: null,
          notes: row.notes || null,
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
        onComplete?.({
          ...result,
          skippedByErrors,
          skippedByMatch,
          skippedByNoMatch,
        });
      }
      setStep(1);
      setFile(null);
      setRawRows([]);
      setColumns([]);
      setMapping({});
      setSelectedSheet('');
      setSheetNames([]);
    } catch (error) {
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
                        <th>#</th>
                        <th>Título</th>
                        <th>Especialidade</th>
                        <th>Segmento</th>
                        <th>Preço</th>
                        <th>Restrição</th>
                        <th>Validação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => {
                        const v = validationResults[idx];
                        const valCell = v?.emptyRow
                          ? 'Linha em branco (ignorada)'
                          : v?.errors?.length
                            ? v.errors
                                .map(
                                  (e) =>
                                    `${e.field}: ${e.message}` +
                                    (e.columns?.length ? ` [${e.columns.join(', ')}]` : '')
                                )
                                .join('; ')
                            : v?.warnings?.length
                              ? `Alerta: ${v.warnings.map((w) => w.message).join('; ')}`
                              : 'OK';
                        return (
                          <tr key={`preview-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{row.title || '—'}</td>
                            <td>{row.specialty || '—'}</td>
                            <td>{row.segment || '—'}</td>
                            <td>
                              {row.price != null && Number.isFinite(row.price)
                                ? `R$ ${row.price.toFixed(2)}`
                                : '—'}
                            </td>
                            <td>{row.priceRestriction || '—'}</td>
                            <td className={v?.errors?.length ? 'price-base-import-cell-error' : ''}>
                              {valCell}
                            </td>
                          </tr>
                        );
                      })}
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
                <div>
                  <strong>Linhas vazias (ignoradas)</strong>
                  <span>{rowsSummary.empty}</span>
                </div>
              </div>

              {rowsSummary.errors > 0 && (
                <div className="price-base-import-errors">
                  <AlertTriangle size={18} />
                  Existem linhas com erro. Elas não serão importadas.
                </div>
              )}

              {errorDetailRows.length > 0 && (
                <div className="price-base-import-error-details">
                  <h4>Detalhe dos erros (primeiras {errorDetailRows.length} linhas)</h4>
                  <div className="price-base-import-error-details-table-wrap">
                    <table className="price-base-import-error-details-table">
                      <thead>
                        <tr>
                          <th>Linha</th>
                          <th>Campo</th>
                          <th>Motivo</th>
                          <th>Colunas na planilha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorDetailRows.flatMap((r) =>
                          r.errors.map((e, i) => (
                            <tr key={`${r.index}-${e.field}-${i}`}>
                              <td>{r.index + 1}</td>
                              <td>{e.field}</td>
                              <td>{e.message}</td>
                              <td>{e.columns?.length ? e.columns.join(', ') : '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
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
