import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Download, Upload, Database, ChevronDown, History } from 'lucide-react';

const ImportExportModal = lazy(() => import('./ImportExportModal.jsx'));

const TOAST_DURATION_MS = 6000;

export default function ImportExportButtons({ patientId, user, canUse }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('exportar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastImport, setToastImport] = useState(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const openModal = (tab) => {
    setInitialTab(tab);
    setModalOpen(true);
    setMenuOpen(false);
  };

  const handleImportComplete = (result) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastImport(result);
    setModalOpen(false);
    toastTimeoutRef.current = setTimeout(() => {
      setToastImport(null);
      toastTimeoutRef.current = null;
    }, TOAST_DURATION_MS);
  };

  const openHistorico = () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastImport(null);
    setInitialTab('historico');
    setModalOpen(true);
  };

  if (!canUse) return null;

  return (
    <>
      {/* Desktop: rodapé canto inferior direito */}
      <div className="import-export-footer">
        <button
          type="button"
          className="import-export-footer-btn"
          onClick={() => openModal('exportar')}
          aria-label="Exportar dados"
        >
          <Download size={16} aria-hidden />
          <span>Exportar</span>
        </button>
        <button
          type="button"
          className="import-export-footer-btn"
          onClick={() => openModal('importar')}
          aria-label="Importar dados"
        >
          <Upload size={16} aria-hidden />
          <span>Importar</span>
        </button>
      </div>

      {/* Mobile: botão flutuante único com mini-menu */}
      <div className="import-export-fab-wrap">
        <button
          type="button"
          className="import-export-fab"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Dados"
          aria-expanded={menuOpen}
        >
          <Database size={20} aria-hidden />
          <span>Dados</span>
          <ChevronDown size={14} className={menuOpen ? 'open' : ''} aria-hidden />
        </button>
        {menuOpen && (
          <>
            <div
              className="import-export-fab-backdrop"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="import-export-fab-menu">
              <button type="button" onClick={() => openModal('exportar')}>
                <Download size={16} />
                Exportar
              </button>
              <button type="button" onClick={() => openModal('importar')}>
                <Upload size={16} />
                Importar
              </button>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <Suspense fallback={<div className="import-export-modal-overlay" style={{ alignItems: 'center', justifyContent: 'center' }}>Carregando…</div>}>
          <ImportExportModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            initialTab={initialTab}
            patientId={patientId}
            user={user}
            onImportComplete={handleImportComplete}
          />
        </Suspense>
      )}

      {toastImport && (
        <div
          className="toast import-export-toast success"
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 2000,
            maxWidth: 360,
            padding: '12px 16px',
            borderRadius: 12,
            background: (toastImport.errors?.length > 0 || (toastImport.ignored ?? 0) > 0) ? '#f59e0b' : '#10b981',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <strong>
            {(toastImport.errors?.length > 0 || (toastImport.ignored ?? 0) > 0)
              ? 'Importação concluída com avisos'
              : 'Importação concluída'}
          </strong>
          {(toastImport.errors?.length > 0 || (toastImport.ignored ?? 0) > 0) && (
            <span style={{ fontSize: '0.8125rem', opacity: 0.9 }}>Clique para ver detalhes.</span>
          )}
          <span style={{ fontSize: '0.875rem', opacity: 0.95 }}>
            Importados: {(toastImport.created ?? 0) + (toastImport.updated ?? 0)} · Com pendências: {toastImport.withPending ?? 0} · Ignorados: {toastImport.ignored ?? 0} · Erros: {toastImport.errors?.length ?? 0}
          </span>
          <button
            type="button"
            onClick={openHistorico}
            style={{
              marginTop: 4,
              padding: '6px 12px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.25)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
            }}
          >
            <History size={14} />
            Ver detalhes
          </button>
        </div>
      )}
    </>
  );
}
