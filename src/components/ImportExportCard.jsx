import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Download, Upload, History } from 'lucide-react';
import ActionCard from './ActionCard.jsx';

const ImportExportModal = lazy(() => import('./ImportExportModal.jsx'));

const TOAST_DURATION_MS = 6000;

export default function ImportExportCard({ patientId, user, canUse }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('exportar');
  const [toastImport, setToastImport] = useState(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

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

  if (!canUse) {
    return (
      <div className="patients-import-export-card">
        <h3 className="patients-actions-card-title">Importar / Exportar</h3>
        <p className="patients-actions-card-subtitle">
          Sem permissão para importar ou exportar dados.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="patients-import-export-card">
        <h3 className="patients-actions-card-title">Importar / Exportar</h3>
        <p className="patients-actions-card-subtitle">
          Importe ou exporte dados de pacientes em lote
        </p>
        <div className="patients-actions-list">
          <ActionCard
            icon={Download}
            title="Exportar"
            subtitle="Exportar paciente(s) em CSV ou JSON completo"
            onClick={() => {
              setInitialTab('exportar');
              setModalOpen(true);
            }}
            gradient="linear-gradient(135deg, #10B981 0%, #059669 100%)"
          />
          <ActionCard
            icon={Upload}
            title="Importar"
            subtitle="Importar pacientes de CSV, XLSX ou JSON"
            onClick={() => {
              setInitialTab('importar');
              setModalOpen(true);
            }}
            gradient="linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)"
          />
        </div>
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
