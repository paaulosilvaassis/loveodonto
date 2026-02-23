import { useState, useCallback } from 'react';
import { X, Download, Upload, History, FileText, FileJson, FileSpreadsheet } from 'lucide-react';
import Button from './Button.jsx';
import {
  exportPatientCsv,
  exportPatientJsonFull,
  exportPatientsBatch,
} from '../services/exportPatientService.js';
import {
  importFromCsvOrXlsx,
  importFromJson,
  validateRow,
} from '../services/importPatientService.js';
import { parseCsvText, parseXlsxFile } from '../services/csvXlsxUtils.js';
import { listImportExportLogs } from '../services/importExportLogService.js';

export default function ImportExportModal({
  open,
  onClose,
  initialTab = 'exportar',
  patientId,
  user,
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

  // Importar: pendências (avisos, não bloqueiam) e falhas reais (erro de formato)
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importPendencias, setImportPendencias] = useState([]);
  const [importFalhas, setImportFalhas] = useState([]);
  const [conflictMode, setConflictMode] = useState('create');

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
    try {
      const { csv, json, count } = exportPatientsBatch(batchFilters, user?.id);
      if (exportFormat === 'csv') {
        downloadBlob(csv, `pacientes-lote-${Date.now()}.csv`, 'text/csv');
      } else {
        downloadBlob(JSON.stringify(json, null, 2), `pacientes-lote-${Date.now()}.json`, 'application/json');
      }
      showSuccess(`${count} paciente(s) exportado(s).`);
    } catch (err) {
      showError(err?.message || 'Erro ao exportar em lote.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportPreview([]);
    setImportPendencias([]);
    setImportFalhas([]);
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
        const rows = parseCsvText(text);
        const preview = rows.slice(0, 10);
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
      } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        const rows = await parseXlsxFile(file);
        const preview = rows.slice(0, 10);
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
      }
    } catch (err) {
      showError(err?.message || 'Erro ao ler arquivo.');
    }
  };

  const handleConfirmImport = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'ImportExportModal.jsx:handleConfirmImport',message:'import confirm entry',data:{hasFile:!!importFile,fileName:importFile?.name,user:!!user,userId:user?.id},timestamp:Date.now(),runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (!importFile) {
      showError('Selecione um arquivo.');
      return;
    }
    if (!user?.id) {
      showError('Usuário não identificado. Faça login novamente.');
      return;
    }
    setLoading(true);
    try {
      const ext = (importFile.name || '').toLowerCase();
      if (ext.endsWith('.json')) {
        const result = await importFromJson(importFile, user, conflictMode);
        showSuccess(`Importação concluída: ${result.created} criado(s), ${result.updated} atualizado(s).`);
      } else {
        const result = await importFromCsvOrXlsx(importFile, user, conflictMode);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'ImportExportModal.jsx:handleConfirmImport',message:'after importFromCsvOrXlsx',data:{hasResult:!!result,created:result?.created,updated:result?.updated},timestamp:Date.now(),runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        const total = result.created + result.updated;
        const msg =
          `Importados: ${total} | Com pendências: ${result.withPending ?? 0} | Falhas reais: ${result.errors?.length ?? 0}`;
        showSuccess(msg);
      }
      setImportFile(null);
      setImportPreview([]);
      setImportPendencias([]);
      setImportFalhas([]);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'ImportExportModal.jsx:handleConfirmImport',message:'import catch',data:{errMsg:err?.message,errName:err?.name,stack:String(err?.stack||'').slice(0,300)},timestamp:Date.now(),runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      showError(err?.message || 'Erro ao importar.');
    } finally {
      setLoading(false);
    }
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

              {importPreview.length > 0 && (
                <div className="import-preview">
                  <h4>Prévia (até 10 linhas)</h4>
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
                        {importPreview.map((row, i) => (
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
                  {(importPendencias.length > 0 || importFalhas.length > 0) && (
                    <div className="import-warnings-wrap">
                      {importPendencias.length > 0 && (
                        <div className="import-pendencias" role="status">
                          <strong>Pendências encontradas (não impedem importação)</strong>
                          {importPendencias.map((p, i) => (
                            <p key={i} className="warning-text">
                              Linha {p.row}: {p.messages.join(', ')}
                            </p>
                          ))}
                        </div>
                      )}
                      {importFalhas.length > 0 && (
                        <div className="import-falhas" role="alert">
                          <strong>Falhas (erro de formato)</strong>
                          {importFalhas.map((f, i) => (
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
