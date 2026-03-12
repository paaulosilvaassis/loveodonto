import { createContext, useCallback, useRef, useState } from 'react';
import { importFromCsvOrXlsx, importFromJson, buildImportReportCsv } from '../services/importPatientService.js';

const LIVE_ITEMS_MAX = 50;

export const ImportJobStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  DONE: 'done',
};

const initialState = {
  status: ImportJobStatus.IDLE,
  processed: 0,
  total: 0,
  message: '',
  liveItems: [],
  counts: {
    created: 0,
    updated: 0,
    merged: 0,
    duplicateSkipped: 0,
    withPending: 0,
    ignored: 0,
    technicalErrors: 0,
    errors: 0,
  },
  lastResult: null,
};

export const ImportJobContext = createContext(null);

export function ImportJobProvider({ children, onToast }) {
  const [job, setJob] = useState(initialState);
  const [expanded, setExpanded] = useState(true);
  const cancelRequestedRef = useRef(false);
  const didScrollRef = useRef(false);

  const showToast = useCallback((message, type = 'success') => {
    if (onToast) onToast(message, type);
    else if (typeof window !== 'undefined' && window.__showAppToast) {
      window.__showAppToast(message, type);
    }
  }, [onToast]);

  const updateProgress = useCallback((partial) => {
    setJob((prev) => {
      const mapped = { ...partial };
      if (partial.current !== undefined) mapped.processed = partial.current;
      if (partial.total !== undefined) mapped.total = partial.total;
      const next = { ...prev, ...mapped };
      if (partial.liveItem && Array.isArray(prev.liveItems)) {
        const list = [...prev.liveItems.slice(-(LIVE_ITEMS_MAX - 1)), partial.liveItem];
        next.liveItems = list.slice(-LIVE_ITEMS_MAX);
      }
      if (partial.counts) next.counts = { ...prev.counts, ...partial.counts };
      return next;
    });
  }, []);

  const startImport = useCallback(async (file, user, conflictMode) => {
    if (!file || !user?.id) return;
    cancelRequestedRef.current = false;
    didScrollRef.current = false;
    setJob({
      ...initialState,
      status: ImportJobStatus.RUNNING,
      processed: 0,
      total: 1,
      message: 'Iniciando…',
      liveItems: [],
      counts: initialState.counts,
    });
    setExpanded(true);

    const ext = (file.name || '').toLowerCase();
    try {
      if (ext.endsWith('.json')) {
        const result = await importFromJson(file, user, conflictMode);
        setJob((prev) => ({
          ...prev,
          status: ImportJobStatus.DONE,
          processed: 1,
          total: 1,
          message: 'Importação concluída.',
          lastResult: {
            totalRowsInFile: 1,
            created: result.created ?? 0,
            updated: result.updated ?? 0,
            merged: 0,
            duplicateSkipped: 0,
            ignored: 0,
            technicalErrors: 0,
            reportRows: [],
          },
        }));
        showToast(`Importação concluída: ${result.created} criado(s), ${result.updated} atualizado(s).`);
        return;
      }

      const result = await importFromCsvOrXlsx(file, user, conflictMode, {
        onProgress: (p) => {
          updateProgress({
            phase: p.phase,
            processed: p.current ?? 0,
            total: p.total ?? 1,
            message: p.message ?? '',
            liveItem: p.liveItem ?? null,
          });
        },
        getCancelRequested: () => cancelRequestedRef.current,
      });

      const counts = {
        created: result.created ?? 0,
        updated: result.updated ?? 0,
        merged: result.merged ?? 0,
        duplicateSkipped: result.duplicateSkipped ?? 0,
        withPending: result.withPending ?? 0,
        ignored: result.ignored ?? 0,
        technicalErrors: result.technicalErrors ?? 0,
        errors: (result.errors?.length) ?? 0,
      };

      setJob((prev) => ({
        ...prev,
        status: ImportJobStatus.DONE,
        processed: result.totalRowsInFile ?? prev.processed,
        total: result.totalRowsInFile ?? prev.total,
        message: 'Importação concluída.',
        counts,
        lastResult: {
          totalRowsInFile: result.totalRowsInFile,
          created: result.created ?? 0,
          updated: result.updated ?? 0,
          merged: result.merged ?? 0,
          duplicateSkipped: result.duplicateSkipped ?? 0,
          ignored: result.ignored ?? 0,
          technicalErrors: result.technicalErrors ?? 0,
          reportRows: result.reportRows ?? [],
        },
      }));

      const total = (result.created ?? 0) + (result.updated ?? 0) + (result.merged ?? 0);
      showToast(
        `Importação concluída: Criados ${result.created ?? 0} | Atualizados ${result.updated ?? 0} | Mesclados ${result.merged ?? 0} | Duplicados ignorados ${result.duplicateSkipped ?? 0} | Ignorados ${result.ignored ?? 0} | Erros técnicos ${result.technicalErrors ?? 0}`,
        'success'
      );
    } catch (err) {
      setJob((prev) => ({ ...prev, status: ImportJobStatus.DONE, message: 'Erro na importação.' }));
      showToast(err?.message || 'Erro ao importar.', 'error');
    }
  }, [updateProgress, showToast]);

  const requestCancel = useCallback(() => {
    cancelRequestedRef.current = true;
  }, []);

  const dismissFooter = useCallback(() => {
    setJob(initialState);
    setExpanded(true);
    cancelRequestedRef.current = false;
    didScrollRef.current = false;
  }, []);

  const setExpandedFooter = useCallback((value) => {
    setExpanded(value);
  }, []);

  const downloadReport = useCallback(() => {
    setJob((prev) => {
      if (!prev.lastResult?.reportRows) return prev;
      const csv = buildImportReportCsv(prev.lastResult.reportRows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-importacao-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return prev;
    });
  }, []);

  const value = {
    job,
    expanded,
    setExpanded: setExpandedFooter,
    updateProgress,
    startImport,
    requestCancel,
    dismissFooter,
    downloadReport,
    didScrollRef,
  };

  return (
    <ImportJobContext.Provider value={value}>
      {children}
    </ImportJobContext.Provider>
  );
}
