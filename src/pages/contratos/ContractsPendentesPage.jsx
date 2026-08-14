import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import {
  PENDING_STATUSES,
  CONTRACT_STATUS,
} from '../../contracts/contractConstants.js';
import {
  listContractsByStatus,
  sendContractForSignature,
  finalizeGeneratedContract,
} from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractSignModal from '../../components/contracts/ContractSignModal.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';

export default function ContractsPendentesPage() {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [signContract, setSignContract] = useState(null);
  const [selectedView, setSelectedView] = useState(null);
  const [toast, setToast] = useState(null);

  const contracts = useMemo(() => {
    void refresh;
    return listContractsByStatus(PENDING_STATUSES);
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
    generated: c.generatedAt ? new Date(c.generatedAt).toLocaleDateString('pt-BR') : '—',
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
          { key: 'generated', label: 'Gerado em' },
          {
            key: 'actions',
            label: 'Ações',
            render: (r) => (
              <div className="ctr-actions">
                <button type="button" className="button small secondary" onClick={() => setSelectedView(buildContractViewIdentity(r))}>
                  Visualizar
                </button>
                {r.status === CONTRACT_STATUS.DRAFT && (
                  <button
                    type="button"
                    className="button small primary"
                    onClick={() => {
                      try {
                        finalizeGeneratedContract(user, r.id);
                        setRefresh((x) => x + 1);
                        showToast('Contrato finalizado.');
                      } catch (e) {
                        showToast(e?.message || 'Erro.', 'error');
                      }
                    }}
                  >
                    Finalizar
                  </button>
                )}
                {r.status !== CONTRACT_STATUS.SIGNED && r.status !== CONTRACT_STATUS.DRAFT && (
                  <>
                    <button type="button" className="button small primary" onClick={() => setSignContract(r)}>
                      Assinar agora
                    </button>
                    <button
                      type="button"
                      className="button small secondary"
                      onClick={() => {
                        try {
                          const { signUrl } = sendContractForSignature(user, r.id);
                          setRefresh((x) => x + 1);
                          showToast(`Link gerado: ${signUrl}`);
                        } catch (e) {
                          showToast(e?.message || 'Erro.', 'error');
                        }
                      }}
                    >
                      Enviar assinatura
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
        rows={rows}
        emptyMessage="Nenhum contrato pendente."
      />
      <ContractSignModal
        open={!!signContract}
        onOpenChange={(o) => !o && setSignContract(null)}
        user={user}
        contract={signContract}
        onSigned={() => {
          setRefresh((x) => x + 1);
          showToast('Contrato assinado com sucesso.');
        }}
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
