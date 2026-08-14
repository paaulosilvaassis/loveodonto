import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { CONTRACT_STATUS } from '../../contracts/contractConstants.js';
import {
  listContractsByStatus,
  createContractNewVersion,
} from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';

export default function ContractsAssinadosPage() {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [selectedView, setSelectedView] = useState(null);
  const [toast, setToast] = useState(null);

  const contracts = useMemo(() => {
    void refresh;
    return listContractsByStatus([CONTRACT_STATUS.SIGNED]);
  }, [refresh]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const rows = contracts.map((c, index) => ({
    ...c,
    number: formatFriendlyContractNumber(c.contractNumber, index + 1),
    patient: c.patientSnapshotJson?.full_name || c.patientId,
    value: formatCtrCurrency(c.totalValueSnapshot),
    signed: c.signedAt ? new Date(c.signedAt).toLocaleDateString('pt-BR') : '—',
  }));

  return (
    <div className="ctr-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <ContractTable
        columns={[
          { key: 'number', label: 'Número' },
          { key: 'patient', label: 'Paciente' },
          { key: 'status', label: 'Status', render: (r) => <ContractStatusBadge status={r.status} /> },
          { key: 'value', label: 'Valor' },
          { key: 'signed', label: 'Assinado em' },
          {
            key: 'actions',
            label: 'Ações',
            render: (r) => (
              <div className="ctr-actions">
                <button
                  type="button"
                  className="button small secondary"
                  onClick={() => setSelectedView(buildContractViewIdentity(r))}
                >
                  Visualizar
                </button>
                <button
                  type="button"
                  className="button small secondary"
                  onClick={() => {
                    try {
                      createContractNewVersion(user, r.id);
                      setRefresh((x) => x + 1);
                      showToast('Nova versão criada em rascunho.');
                    } catch (e) {
                      showToast(e?.message || 'Erro.', 'error');
                    }
                  }}
                >
                  Nova versão
                </button>
              </div>
            ),
          },
        ]}
        rows={rows}
        emptyMessage="Nenhum contrato assinado."
      />
      <ContractDetailModal
        open={Boolean(selectedView?.contractId)}
        onOpenChange={(o) => { if (!o) setSelectedView(null); }}
        contractId={selectedView?.contractId}
        expectedIdentity={selectedView}
      />
    </div>
  );
}
