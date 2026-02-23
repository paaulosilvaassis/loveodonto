import { useState, lazy, Suspense } from 'react';
import { Download, Upload, Database, ChevronDown } from 'lucide-react';

const ImportExportModal = lazy(() => import('./ImportExportModal.jsx'));

export default function ImportExportButtons({ patientId, user, canUse }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('exportar');
  const [menuOpen, setMenuOpen] = useState(false);

  const openModal = (tab) => {
    setInitialTab(tab);
    setModalOpen(true);
    setMenuOpen(false);
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
          />
        </Suspense>
      )}
    </>
  );
}
