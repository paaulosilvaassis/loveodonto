import { useState, lazy, Suspense } from 'react';
import { Download, Upload } from 'lucide-react';
import ActionCard from './ActionCard.jsx';

const ImportExportModal = lazy(() => import('./ImportExportModal.jsx'));

export default function ImportExportCard({ patientId, user, canUse }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState('exportar');

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
          />
        </Suspense>
      )}
    </>
  );
}
