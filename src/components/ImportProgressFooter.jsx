import { useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Download, X } from 'lucide-react';
import { ImportJobContext, ImportJobStatus } from '../context/ImportJobContext.jsx';

const LIVE_MAX = 50;

function LiveItem({ item }) {
  if (!item) return null;
  const { type, line, name, message } = item;
  const labels = {
    imported: { icon: '✅', text: `Importado: ${name || `Linha ${line}`}` },
    imported_pending: { icon: '⚠️', text: `Com pendências: ${name || `Linha ${line}`}${message ? ` (${message})` : ''}` },
    merged: { icon: '🔀', text: `Mesclado: ${name || `Linha ${line}`}` },
    duplicate_skipped: { icon: '⏭️', text: `Duplicado ignorado: ${name || `Linha ${line}`} — ${message || 'CPF já cadastrado'}` },
    ignored: { icon: '⏭️', text: `Ignorado: ${message || `Linha ${line}`}` },
    error: { icon: '❌', text: `Erro: Linha ${line} — ${message}` },
  };
  const l = labels[type] || { icon: '•', text: String(message || line) };
  return (
    <div className="import-footer-live-item">
      <span title={l.text}>{l.icon}</span>
      <span>{l.text}</span>
    </div>
  );
}

export default function ImportProgressFooter() {
  const { job, expanded, setExpanded, requestCancel, dismissFooter, downloadReport, didScrollRef } = useContext(ImportJobContext);
  const footerRef = useRef(null);
  const [highlight, setHighlight] = useState(false);
  const autoMinimizeTimerRef = useRef(null);

  const isRunning = job.status === ImportJobStatus.RUNNING;
  const isDone = job.status === ImportJobStatus.DONE;
  const visible = isRunning || isDone;
  const percent = job.total > 0 ? Math.round((100 * job.processed) / job.total) : 0;

  // Auto-scroll só quando a importação iniciar (uma vez)
  useEffect(() => {
    if (!visible || !isRunning) return;
    if (didScrollRef?.current) return;
    didScrollRef.current = true;
    footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setHighlight(true);
    const t = setTimeout(() => setHighlight(false), 1000);
    return () => clearTimeout(t);
  }, [visible, isRunning, didScrollRef]);

  // Ao finalizar: auto-minimizar após 10s
  useEffect(() => {
    if (!isDone) return;
    if (autoMinimizeTimerRef.current) clearTimeout(autoMinimizeTimerRef.current);
    autoMinimizeTimerRef.current = setTimeout(() => {
      setExpanded(false);
      autoMinimizeTimerRef.current = null;
    }, 10000);
    return () => {
      if (autoMinimizeTimerRef.current) clearTimeout(autoMinimizeTimerRef.current);
    };
  }, [isDone, setExpanded]);

  if (!visible) return null;

  return (
    <div
      ref={footerRef}
      className={`import-progress-footer ${expanded ? 'import-progress-footer--expanded' : 'import-progress-footer--minimized'} ${highlight ? 'import-progress-footer--highlight' : ''}`}
      role="region"
      aria-label="Progresso da importação"
    >
      <div className="import-progress-footer-inner">
        {/* Linha sempre visível (minimizada ou primeira linha do expandido) */}
        <div className="import-progress-footer-head">
          <div className="import-progress-footer-title">
            {isDone ? (
              <>
                <CheckCircle2 size={20} className="import-progress-footer-done-icon" />
                <span>Importação concluída</span>
              </>
            ) : (
              <>
                <span className="import-progress-footer-spinner" aria-hidden />
                <span>Importando… {Number(job.processed).toLocaleString('pt-BR')}/{Number(job.total).toLocaleString('pt-BR')}</span>
              </>
            )}
          </div>
          <div className="import-progress-footer-bar-wrap import-progress-footer-bar-wrap--small">
            <div
              className="import-progress-footer-bar-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="import-progress-footer-actions-head">
            {isDone ? (
              <>
                <button type="button" className="import-progress-footer-btn import-progress-footer-btn--primary" onClick={downloadReport}>
                  <Download size={16} />
                  Ver relatório
                </button>
                <button type="button" className="import-progress-footer-btn import-progress-footer-btn--secondary" onClick={dismissFooter}>
                  <X size={16} />
                  Fechar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="import-progress-footer-btn import-progress-footer-btn--secondary"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                {expanded ? 'Recolher' : 'Expandir'}
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo expandido */}
        {expanded && (
          <div className="import-progress-footer-body">
            <div className="import-progress-footer-bar-wrap import-progress-footer-bar-wrap--large">
              <div className="import-progress-footer-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            {job.message && <p className="import-progress-footer-message">{job.message}</p>}
            {(job.counts.created > 0 || job.counts.updated > 0 || job.counts.merged > 0 || job.counts.duplicateSkipped > 0 || job.counts.ignored > 0 || job.counts.technicalErrors > 0) && (
              <p className="import-progress-footer-counts">
                Criados: {job.counts.created} | Atualizados: {job.counts.updated} | Mesclados: {job.counts.merged} | Duplicados ignorados: {job.counts.duplicateSkipped} | Ignorados: {job.counts.ignored} | Erros técnicos: {job.counts.technicalErrors}
              </p>
            )}
            {job.liveItems && job.liveItems.length > 0 && (
              <div className="import-progress-footer-live">
                <p className="import-progress-footer-live-title">Ao vivo</p>
                <div className="import-progress-footer-live-list">
                  {job.liveItems.slice(-LIVE_MAX).map((item, idx) => (
                    <LiveItem key={`${idx}-${item?.line}-${item?.name}`} item={item} />
                  ))}
                </div>
              </div>
            )}
            {isRunning && (
              <button type="button" className="import-progress-footer-btn import-progress-footer-btn--danger" onClick={requestCancel}>
                Cancelar importação
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
