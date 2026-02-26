import { useState, useCallback, useRef } from 'react';
import { X, Download, Upload, History, FileText, FileJson, FileSpreadsheet } from 'lucide-react';
import Button from './Button.jsx';
import {
  exportPatientCsv,
  exportPatientJsonFull,
  exportPatientsBatch,
  exportPatientsAll,
} from '../services/exportPatientService.js';
import { canManageAccess } from '../services/accessService.js';
import { CSV_HEADERS } from '../services/csvXlsxUtils.js';
import {
  importFromCsvOrXlsx,
  importFromJson,
  validateRow,
  buildImportReportCsv,
} from '../services/importPatientService.js';
import { parseCsvTextFirstLines, parseXlsxFileFirstRows, getCanonicalHeaderMap, normalizeParsedRows } from '../services/csvXlsxUtils.js';
import { listImportExportLogs } from '../services/importExportLogService.js';

const PREVIEW_MAX_ROWS = 20;
const PENDENCIAS_DISPLAY_MAX = 50;
const FALHAS_DISPLAY_MAX = 50;
const LIVE_LIST_MAX = 50;

export default function ImportExportModal({
  open,
  onClose,
  initialTab = 'exportar',
  patientId,
  user,
  onImportComplete,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  // Exportar
  const [batchFilters, setBatchFilters] = useState({
    createdFrom: '',
    createdTo: '',
    insuranceName: '',
    preferredDentist: '',
    leadSource: '',
    captacao: '',
    city: '',
    state: '',
  });
  const [exportFormat, setExportFormat] = useState('csv');
  const [exportAllFormat, setExportAllFormat] = useState('csv');
  const [exportAllInProgress, setExportAllInProgress] = useState(false);

  // Importar: pendências (avisos, não bloqueiam) e falhas reais (erro de formato)
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importPendencias, setImportPendencias] = useState([]);
  const [importFalhas, setImportFalhas] = useState([]);
  const [importPendenciasTotal, setImportPendenciasTotal] = useState(0);
  const [importFalhasTotal, setImportFalhasTotal] = useState(0);
  const [conflictMode, setConflictMode] = useState('create');
  const [importProgress, setImportProgress] = useState(null);
  const [importLiveItems, setImportLiveItems] = useState([]);
  const [importCounters, setImportCounters] = useState({ created: 0, updated: 0, merged: 0, duplicateSkipped: 0, withPending: 0, ignored: 0, technicalErrors: 0, errors: 0 });
  const [lastImportResult, setLastImportResult] = useState(null);
  const [importNomeColumn, setImportNomeColumn] = useState('');
  const [importNomeWarning, setImportNomeWarning] = useState(false);
  const importCancelRef = useRef(false);

  // Exportar lote: progresso ao vivo
  const [exportProgress, setExportProgress] = useState(null);
  const [exportLiveItems, setExportLiveItems] = useState([]);

  // Histórico
  const [logs, setLogs] = useState([]);

  const clearMessage = useCallback(() => {
    setMessage({ type: '', text: '' });
  }, []);

  const showSuccess = (text) => {
    setMessage({ type: 'success', text });
    setTimeout(clearMessage, 4000);
  };
  const showError = (text) => {
    setMessage({ type: 'error', text });
  };

  const handleExportSingle = async (format) => {
    if (!patientId) {
      showError('Selecione um paciente na busca para exportar.');
      return;
    }
    setLoading(true);
    try {
      if (format === 'csv') {
        const csv = exportPatientCsv(patientId, user?.id);
        downloadBlob(csv, `paciente-${patientId}.csv`, 'text/csv');
        showSuccess('Exportação CSV concluída.');
      } else {
        const json = exportPatientJsonFull(patientId, user?.id);
        downloadBlob(JSON.stringify(json, null, 2), `paciente-${patientId}.json`, 'application/json');
        showSuccess('Exportação JSON completa concluída.');
      }
    } catch (err) {
      showError(err?.message || 'Erro ao exportar.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportBatch = async () => {
    setLoading(true);
    setExportProgress({ current: 0, total: 1, message: 'Iniciando…' });
    setExportLiveItems([]);
    try {
      const { csv, json, count } = await exportPatientsBatch(batchFilters, user?.id, {
        onProgress: (p) => {
          setExportProgress(p);
          if (p.names && p.names.length) {
            setExportLiveItems((prev) => [
              ...prev.slice(-(LIVE_LIST_MAX - p.names.length)),
              ...p.names.map((name) => ({ type: 'exported', name })),
            ].slice(-LIVE_LIST_MAX));
          }
        },
      });
      if (exportFormat === 'csv') {
        downloadBlob(csv, `pacientes-lote-${Date.now()}.csv`, 'text/csv');
      } else {
        downloadBlob(JSON.stringify(json, null, 2), `pacientes-lote-${Date.now()}.json`, 'application/json');
      }
      showSuccess(`Arquivo gerado com sucesso: ${count} paciente(s).`);
      setExportProgress({ current: count, total: count, message: 'Exportação concluída.' });
    } catch (err) {
      showError(err?.message || 'Erro ao exportar em lote.');
      setExportProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportAll = async () => {
    setLoading(true);
    setExportAllInProgress(true);
    setExportProgress({ current: 0, total: 1, message: 'Iniciando…' });
    setExportLiveItems([]);
    try {
      const { csv, json, count } = await exportPatientsAll(user?.id, {
        onProgress: (p) => {
          setExportProgress(p);
          if (p.names && p.names.length) {
            setExportLiveItems((prev) => [
              ...prev.slice(-(LIVE_LIST_MAX - p.names.length)),
              ...p.names.map((name) => ({ type: 'exported', name })),
            ].slice(-LIVE_LIST_MAX));
          }
        },
      });
      if (exportAllFormat === 'csv') {
        downloadBlob(csv, `pacientes-todo-cadastro-${Date.now()}.csv`, 'text/csv');
      } else if (exportAllFormat === 'xlsx') {
        const xlsxMod = await import('xlsx');
        const XLSX = xlsxMod.default ?? xlsxMod;
        const ws = XLSX.utils.json_to_sheet(json, { header: CSV_HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
        XLSX.writeFile(wb, `pacientes-todo-cadastro-${Date.now()}.xlsx`);
      } else {
        downloadBlob(JSON.stringify(json, null, 2), `pacientes-todo-cadastro-${Date.now()}.json`, 'application/json');
      }
      showSuccess(`Exportação concluída: ${count} paciente(s).`);
      setExportProgress({ current: count, total: count, message: 'Exportação concluída.' });
    } catch (err) {
      showError(err?.message || 'Erro ao exportar todo o cadastro.');
      setExportProgress(null);
    } finally {
      setLoading(false);
      setExportAllInProgress(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportPreview([]);
    setImportPendencias([]);
    setImportFalhas([]);
    setImportPendenciasTotal(0);
    setImportFalhasTotal(0);
    setImportNomeColumn('');
    setImportNomeWarning(false);
    setImportProgress(null);
    setImportLiveItems([]);
    const ext = (file.name || '').toLowerCase();
    try {
      if (ext.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        const patient = data.patient || data;
        const fields = patient.fields || patient;
        setImportPreview([{ ...fields, _isJson: true }]);
      } else if (ext.endsWith('.csv')) {
        const text = await file.text();
        const rawRows = parseCsvTextFirstLines(text, PREVIEW_MAX_ROWS + 5);
        const rawHeaders = rawRows.length && typeof rawRows[0] === 'object' ? Object.keys(rawRows[0]) : [];
        const headerMap = getCanonicalHeaderMap(rawHeaders);
        const rows = normalizeParsedRows(rawRows, headerMap);
        const preview = rows.slice(0, PREVIEW_MAX_ROWS);
        const detectedNomeRaw = Object.entries(headerMap).find(([, v]) => v === 'nome_completo')?.[0] || 'nome_completo';
        setImportNomeColumn(detectedNomeRaw);
        const emptyNome = preview.filter((r) => !(r.nome_completo && String(r.nome_completo).trim())).length;
        setImportNomeWarning(preview.length > 0 && emptyNome >= preview.length * 0.8);
        const pendencias = [];
        const falhas = [];
        preview.forEach((row, i) => {
          const { warnings, realErrors } = validateRow(row, i);
          if (warnings.length) pendencias.push({ row: i + 1, messages: warnings });
          if (realErrors.length) falhas.push({ row: i + 1, messages: realErrors });
        });
        setImportPreview(preview);
        setImportPendencias(pendencias);
        setImportFalhas(falhas);
        setImportPendenciasTotal(pendencias.length);
        setImportFalhasTotal(falhas.length);
      } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        const rawRows = await parseXlsxFileFirstRows(file, PREVIEW_MAX_ROWS + 5);
        const rawHeaders = rawRows.length && typeof rawRows[0] === 'object' ? Object.keys(rawRows[0]) : [];
        const headerMap = getCanonicalHeaderMap(rawHeaders);
        const rows = normalizeParsedRows(rawRows, headerMap);
        const preview = rows.slice(0, PREVIEW_MAX_ROWS);
        const detectedNomeRaw = Object.entries(headerMap).find(([, v]) => v === 'nome_completo')?.[0] || 'nome_completo';
        setImportNomeColumn(detectedNomeRaw);
        const emptyNome = preview.filter((r) => !(r.nome_completo && String(r.nome_completo).trim())).length;
        setImportNomeWarning(preview.length > 0 && emptyNome >= preview.length * 0.8);
        const pendencias = [];
        const falhas = [];
        preview.forEach((row, i) => {
          const { warnings, realErrors } = validateRow(row, i);
          if (warnings.length) pendencias.push({ row: i + 1, messages: warnings });
          if (realErrors.length) falhas.push({ row: i + 1, messages: realErrors });
        });
        setImportPreview(preview);
        setImportPendencias(pendencias);
        setImportFalhas(falhas);
        setImportPendenciasTotal(pendencias.length);
        setImportFalhasTotal(falhas.length);
      }
    } catch (err) {
      showError(err?.message || 'Erro ao ler arquivo.');
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile) {
      showError('Selecione um arquivo.');
      return;
    }
    if (!user?.id) {
      showError('Usuário não identificado. Faça login novamente.');
      return;
    }
    importCancelRef.current = false;
    setLoading(true);
    setImportLiveItems([]);
    setImportCounters({ created: 0, updated: 0, merged: 0, duplicateSkipped: 0, withPending: 0, ignored: 0, technicalErrors: 0, errors: 0 });
    setImportProgress({ phase: 'starting', current: 0, total: 1, message: 'Iniciando…' });
    setLastImportResult(null);
    try {
      const ext = (importFile.name || '').toLowerCase();
      if (ext.endsWith('.json')) {
        const result = await importFromJson(importFile, user, conflictMode);
        setImportFile(null);
        setImportPreview([]);
        setImportPendencias([]);
        setImportFalhas([]);
        if (onImportComplete) {
          onImportComplete({ ...result, errors: [], ignored: 0, withPending: 0 });
          onClose();
        } else {
          showSuccess(`Importação concluída: ${result.created} criado(s), ${result.updated} atualizado(s).`);
        }
      } else {
        const result = await importFromCsvOrXlsx(importFile, user, conflictMode, {
          onProgress: (p) => {
            setImportProgress(p);
            if (p.liveItem) {
              setImportLiveItems((prev) => [...prev.slice(-(LIVE_LIST_MAX - 1)), p.liveItem]);
            }
          },
          getCancelRequested: () => importCancelRef.current,
        });
        setImportCounters({
          created: result.created ?? 0,
          updated: result.updated ?? 0,
          merged: result.merged ?? 0,
          duplicateSkipped: result.duplicateSkipped ?? 0,
          withPending: result.withPending ?? 0,
          ignored: result.ignored ?? 0,
          technicalErrors: result.technicalErrors ?? 0,
          errors: (result.errors?.length) ?? 0,
        });
        setLastImportResult({
          totalRowsInFile: result.totalRowsInFile,
          created: result.created ?? 0,
          updated: result.updated ?? 0,
          merged: result.merged ?? 0,
          duplicateSkipped: result.duplicateSkipped ?? 0,
          ignored: result.ignored ?? 0,
          technicalErrors: result.technicalErrors ?? 0,
          reportRows: result.reportRows ?? [],
        });
        setImportFile(null);
        setImportPreview([]);
        setImportPendencias([]);
        setImportFalhas([]);
        if (onImportComplete) {
          onImportComplete(result);
          onClose();
        } else {
          const total = (result.created ?? 0) + (result.updated ?? 0) + (result.merged ?? 0);
          showSuccess(`Importação concluída: ${total} processados. Criados: ${result.created ?? 0} | Atualizados: ${result.updated ?? 0} | Mesclados: ${result.merged ?? 0} | Duplicados ignorados: ${result.duplicateSkipped ?? 0} | Ignorados: ${result.ignored ?? 0} | Erros técnicos: ${result.technicalErrors ?? 0}`);
          setImportProgress({ phase: 'done', current: result.totalRowsInFile ?? 0, total: result.totalRowsInFile ?? 1, message: 'Importação concluída.' });
        }
      }
    } catch (err) {
      showError(err?.message || 'Erro ao importar.');
      setImportProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelImport = () => {
    importCancelRef.current = true;
  };

  const loadLogs = useCallback(() => {
    setLogs(listImportExportLogs(50));
  }, []);

  if (!open) return null;

  const tabs = [
    { id: 'exportar', label: 'Exportar', icon: Download },
    { id: 'importar', label: 'Importar', icon: Upload },
    { id: 'historico', label: 'Histórico', icon: History },
  ];

  return (
    <div
      className="modal-overlay import-export-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-export-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content import-export-modal">
        <div className="import-export-modal-header">
          <h2 id="import-export-modal-title">Importar / Exportar</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="import-export-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`import-export-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'historico') loadLogs();
              }}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {message.text && (
          <div
            className={`import-export-message ${message.type}`}
            role="status"
          >
            {message.text}
          </div>
        )}

        <div className="import-export-content">
          {activeTab === 'exportar' && (
            <div className="import-export-panel">
              <section className="export-section">
                <h4>Exportar 1 paciente</h4>
                {!patientId ? (
                  <p className="muted">Selecione um paciente na busca para exportar.</p>
                ) : (
                  <div className="export-buttons">
                    <Button
                      variant="secondary"
                      icon={FileText}
                      onClick={() => handleExportSingle('csv')}
                      disabled={loading}
                      loading={loading}
                    >
                      CSV (cadastro)
                    </Button>
                    <Button
                      variant="secondary"
                      icon={FileJson}
                      onClick={() => handleExportSingle('json')}
                      disabled={loading}
                      loading={loading}
                    >
                      JSON completo
                    </Button>
                  </div>
                )}
              </section>

              {canManageAccess(user) && (
                <section className="export-section">
                  <h4>Exportar todo o cadastro</h4>
                  <p className="muted">Baixe todos os pacientes cadastrados no sistema.</p>
                  <div className="export-buttons" style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={exportAllFormat}
                      onChange={(e) => setExportAllFormat(e.target.value)}
                      aria-label="Formato da exportação"
                    >
                      <option value="csv">CSV</option>
                      <option value="xlsx">XLSX</option>
                      <option value="json">JSON completo</option>
                    </select>
                    <Button
                      variant="primary"
                      icon={Download}
                      onClick={handleExportAll}
                      disabled={loading || exportAllInProgress}
                      loading={exportAllInProgress}
                    >
                      Exportar tudo
                    </Button>
                  </div>
                  <p className="muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                    Pode demorar dependendo do tamanho do cadastro.
                  </p>
                  {exportAllInProgress && exportProgress && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        {exportProgress.total > 0
                          ? `Exportando ${(exportProgress.current || 0).toLocaleString('pt-BR')} / ${exportProgress.total.toLocaleString('pt-BR')}`
                          : exportProgress.message}
                      </p>
                      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: exportProgress.total ? `${Math.round((100 * exportProgress.current) / exportProgress.total)}%` : '50%',
                            background: 'var(--primary, #2563eb)',
                            transition: 'width 0.2s ease',
                          }}
                        />
                      </div>
                      {exportLiveItems.length > 0 && (
                        <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: '0.5rem' }}>
                          {exportLiveItems.slice(-15).map((item, idx) => (
                            <div key={idx} style={{ fontSize: '0.8rem', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>✅</span>
                              <span>{item.name || 'Sem nome'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              <section className="export-section">
                <h4>Exportar em lote</h4>
                <div className="export-filters">
                  <label>Data Cadastro (de)</label>
                  <input
                    type="date"
                    value={batchFilters.createdFrom}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, createdFrom: e.target.value }))}
                  />
                  <label>Data Cadastro (até)</label>
                  <input
                    type="date"
                    value={batchFilters.createdTo}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, createdTo: e.target.value }))}
                  />
                  <label>Convênio</label>
                  <input
                    type="text"
                    placeholder="Nome do convênio"
                    value={batchFilters.insuranceName}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, insuranceName: e.target.value }))}
                  />
                  <label>Dentista Preferência</label>
                  <input
                    type="text"
                    value={batchFilters.preferredDentist}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, preferredDentist: e.target.value }))}
                  />
                  <label>Campanha</label>
                  <input
                    type="text"
                    placeholder="Ex: Google, Indicação"
                    value={batchFilters.leadSource}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, leadSource: e.target.value }))}
                  />
                  <label>Captação</label>
                  <input
                    type="text"
                    placeholder="Ex: Site, WhatsApp"
                    value={batchFilters.captacao}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, captacao: e.target.value }))}
                  />
                  <label>Cidade</label>
                  <input
                    type="text"
                    value={batchFilters.city}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, city: e.target.value }))}
                  />
                  <label>UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={batchFilters.state}
                    onChange={(e) => setBatchFilters((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="export-buttons">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                  <Button
                    variant="primary"
                    onClick={handleExportBatch}
                    disabled={loading}
                    loading={loading}
                  >
                    Exportar lote
                  </Button>
                </div>
                {exportProgress && !exportAllInProgress && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{exportProgress.message}</p>
                    <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: exportProgress.total ? `${Math.round((100 * exportProgress.current) / exportProgress.total)}%` : '50%',
                          background: 'var(--primary, #2563eb)',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                    {exportLiveItems.length > 0 && (
                      <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: '0.5rem' }}>
                        <p style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem' }}>Exportando</p>
                        {exportLiveItems.slice(-30).map((item, idx) => (
                          <div key={idx} style={{ fontSize: '0.8rem', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>✅</span>
                            <span>{item.name || 'Sem nome'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'importar' && (
            <div className="import-export-panel">
              <p className="muted" style={{ marginBottom: '1rem' }}>
                Formatos aceitos: CSV, XLSX, JSON (completo)
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileSelect}
                className="import-file-input"
              />
              <label htmlFor="import-conflict" style={{ display: 'block', marginTop: '1rem' }}>
                Em caso de conflito:
              </label>
              <select
                id="import-conflict"
                value={conflictMode}
                onChange={(e) => setConflictMode(e.target.value)}
                style={{ marginTop: '0.5rem' }}
              >
                <option value="create">Criar novo</option>
                <option value="update_cpf">Atualizar pelo CPF</option>
                <option value="update_record">Atualizar pelo Nº Prontuário</option>
                <option value="merge">Mesclar (preferir dados mais recentes)</option>
              </select>

              {importProgress && (
                <div className="import-progress-wrap" style={{ marginBottom: '1rem' }}>
                  <p className="import-progress-message">{importProgress.message}</p>
                  <div className="import-progress-bar-wrap" style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: importProgress.total ? `${Math.round((100 * importProgress.current) / importProgress.total)}%` : '50%',
                        background: 'var(--primary, #2563eb)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                  {(importCounters.created > 0 || importCounters.updated > 0 || importCounters.merged > 0 || importCounters.duplicateSkipped > 0 || importCounters.ignored > 0 || importCounters.technicalErrors > 0) && (
                    <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-secondary, #64748b)' }}>
                      Total: {importCounters.created + importCounters.updated + importCounters.merged + importCounters.duplicateSkipped + importCounters.ignored + importCounters.technicalErrors} linhas — Criados: {importCounters.created} | Atualizados: {importCounters.updated} | Mesclados: {importCounters.merged} | Duplicados ignorados: {importCounters.duplicateSkipped} | Ignorados: {importCounters.ignored} | Erros técnicos: {importCounters.technicalErrors}
                    </p>
                  )}
                  {lastImportResult && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8 }}>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Resumo da importação</p>
                      <p style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>Total de linhas no arquivo: <strong>{lastImportResult.totalRowsInFile ?? 0}</strong></p>
                      <p style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>Criados: <strong>{lastImportResult.created}</strong> | Atualizados: <strong>{lastImportResult.updated}</strong> | Mesclados: <strong>{lastImportResult.merged}</strong></p>
                      <p style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>Duplicados ignorados: <strong>{lastImportResult.duplicateSkipped}</strong> | Ignorados (sem dados mínimos): <strong>{lastImportResult.ignored}</strong> | Erros técnicos: <strong>{lastImportResult.technicalErrors}</strong></p>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        onClick={() => {
                          const csv = buildImportReportCsv(lastImportResult.reportRows);
                          downloadBlob(csv, `relatorio-importacao-${Date.now()}.csv`, 'text/csv;charset=utf-8');
                        }}
                        style={{ marginTop: '0.5rem' }}
                      >
                        Baixar relatório (.csv)
                      </Button>
                    </div>
                  )}
                  {importLiveItems.length > 0 && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem', marginTop: '0.5rem', background: '#f8fafc' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: '0.25rem' }}>Ao vivo</p>
                      {importLiveItems.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '0.8rem', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {item.type === 'imported' && <span title="Importado">✅</span>}
                          {item.type === 'imported_pending' && <span title="Com pendências">⚠️</span>}
                          {item.type === 'merged' && <span title="Mesclado">🔀</span>}
                          {item.type === 'duplicate_skipped' && <span title="Duplicado ignorado">⏭️</span>}
                          {item.type === 'ignored' && <span title="Ignorado">⏭️</span>}
                          {item.type === 'error' && <span title="Erro">❌</span>}
                          {item.type === 'imported' && <span>Importado: {item.name || `Linha ${item.line}`}</span>}
                          {item.type === 'imported_pending' && <span>Importado com pendências: {item.name || `Linha ${item.line}`}{item.message ? ` (${item.message})` : ''}</span>}
                          {item.type === 'merged' && <span>Mesclado: {item.name || `Linha ${item.line}`}</span>}
                          {item.type === 'duplicate_skipped' && <span>Duplicado ignorado: {item.name || `Linha ${item.line}`} — {item.message || 'CPF já cadastrado'}</span>}
                          {item.type === 'ignored' && <span>Ignorado: {item.message || `Linha ${item.line}`}</span>}
                          {item.type === 'error' && <span>Erro: Linha {item.line} — {item.message}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {loading && (
                    <Button variant="secondary" size="sm" onClick={handleCancelImport} style={{ marginTop: '0.5rem' }}>
                      Cancelar importação
                    </Button>
                  )}
                </div>
              )}
              {importPreview.length > 0 && (
                <div className="import-preview">
                  {importNomeColumn && (
                    <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary, #64748b)' }}>
                      Coluna usada como Nome: <strong>{importNomeColumn}</strong>
                    </p>
                  )}
                  {importNomeWarning && (
                    <div role="alert" style={{ padding: '0.5rem 0.75rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                      A coluna de Nome não foi detectada ou a maioria das linhas está vazia. Verifique o cabeçalho do arquivo (ex.: &quot;Nome Completo&quot;, &quot;Nome&quot;, &quot;Paciente&quot;).
                    </div>
                  )}
                  <h4>Prévia (até {PREVIEW_MAX_ROWS} linhas)</h4>
                  <div className="import-preview-table-wrap">
                    <table className="import-preview-table">
                      <thead>
                        <tr>
                          {Object.keys(importPreview[0]).filter((k) => !k.startsWith('_')).slice(0, 8).map((k) => (
                            <th key={k}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, PREVIEW_MAX_ROWS).map((row, i) => (
                          <tr
                            key={i}
                            className={
                              importFalhas.some((f) => f.row === i + 1)
                                ? 'has-failure'
                                : importPendencias.some((p) => p.row === i + 1)
                                  ? 'has-pending'
                                  : ''
                            }
                          >
                            {Object.entries(row)
                              .filter(([k]) => !k.startsWith('_'))
                              .slice(0, 8)
                              .map(([k, v]) => (
                                <td key={k}>{String(v ?? '').slice(0, 30)}</td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(importPendenciasTotal > 0 || importFalhasTotal > 0) && (
                    <div className="import-warnings-wrap">
                      {importPendenciasTotal > 0 && (
                        <div className="import-pendencias" role="status">
                          <strong>
                            Pendências: {importPendenciasTotal}
                            {importPendenciasTotal > PENDENCIAS_DISPLAY_MAX && ` (mostrando ${PENDENCIAS_DISPLAY_MAX})`}
                          </strong>
                          <span className="muted" style={{ display: 'block', marginBottom: '0.25rem' }}>Não impedem importação.</span>
                          {importPendencias.slice(0, PENDENCIAS_DISPLAY_MAX).map((p, i) => (
                            <p key={i} className="warning-text">
                              Linha {p.row}: {p.messages.join(', ')}
                            </p>
                          ))}
                        </div>
                      )}
                      {importFalhasTotal > 0 && (
                        <div className="import-falhas" role="alert">
                          <strong>
                            Falhas técnicas: {importFalhasTotal}
                            {importFalhasTotal > FALHAS_DISPLAY_MAX && ` (mostrando ${FALHAS_DISPLAY_MAX})`}
                          </strong>
                          {importFalhas.slice(0, FALHAS_DISPLAY_MAX).map((f, i) => (
                            <p key={i} className="error-text">
                              Linha {f.row}: {f.messages.join(', ')}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    variant="primary"
                    onClick={handleConfirmImport}
                    disabled={loading}
                    loading={loading}
                    style={{ marginTop: '1rem' }}
                  >
                    Confirmar Importação
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="import-export-panel">
              <div className="import-export-logs">
                {logs.length === 0 ? (
                  <p className="muted">Nenhum registro de importação/exportação.</p>
                ) : (
                  <table className="logs-table">
                    <thead>
                      <tr>
                        <th>Data/Hora</th>
                        <th>Tipo</th>
                        <th>Formato</th>
                        <th>Qtd</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td>{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                          <td>{log.type}</td>
                          <td>{log.format}</td>
                          <td>{log.count}</td>
                          <td>{log.success ? 'Sucesso' : 'Erro'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
