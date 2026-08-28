import { useMemo, useState } from 'react';
import { CONTRACT_STATUS } from '../../contracts/contractConstants.js';
import { listContractsByStatus } from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { ReissueContractSecureModal } from '../../components/clinical/contract/ReissueContractSecureModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { formatCeremonyAdminProgress } from '../../contracts/clinicalSignatureCeremony.js';
import { useAuth } from '../../auth/useAuth.js';
import { canPerformLegalHighImpact } from '../../contracts/lifecycle/index.js';
import {
  reissueContract,
  voidSignedContract,
} from '../../services/contractVoidReissueCommandService.js';

export default function ContractsAssinadosPage() {
  const { user } = useAuth();
  const [selectedView, setSelectedView] = useState(null);
  const [legalModal, setLegalModal] = useState({ open: false, mode: 'reissue', contractId: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const canLegal = canPerformLegalHighImpact(user);
  const contracts = useMemo(
    () => listContractsByStatus([CONTRACT_STATUS.SIGNED]),
    [notice],
  );

  const rows = contracts.map((c, index) => ({
    ...c,
    number: formatFriendlyContractNumber(c.contractNumber, index + 1),
    patient: c.patientSnapshotJson?.full_name || c.patientId,
    value: formatCtrCurrency(c.totalValueSnapshot),
    signed: c.signedAt ? new Date(c.signedAt).toLocaleDateString('pt-BR') : '—',
    progress: formatCeremonyAdminProgress(c).label,
  }));

  const handleLegalConfirm = async ({ reason }) => {
    if (!legalModal.contractId || !user) return;
    setBusy(true);
    try {
      if (legalModal.mode === 'void') {
        await voidSignedContract({ user, contractId: legalModal.contractId, reason });
        setNotice('Contrato invalidado. Evidência preservada.');
      } else {
        await reissueContract({ user, contractId: legalModal.contractId, reason });
        setNotice('Contrato reemitido com nova identidade jurídica.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ctr-page">
      {notice ? <p className="ctr-signed-immutable-note" role="status">{notice}</p> : null}
      <ContractTable
        columns={[
          { key: 'number', label: 'Número' },
          { key: 'patient', label: 'Paciente' },
          { key: 'status', label: 'Status', render: (r) => <ContractStatusBadge status={r.status} /> },
          { key: 'progress', label: 'Assinaturas' },
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
                {canLegal ? (
                  <>
                    <button
                      type="button"
                      className="button small secondary"
                      onClick={() => setLegalModal({ open: true, mode: 'void', contractId: r.id })}
                    >
                      Invalidar
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setLegalModal({ open: true, mode: 'reissue', contractId: r.id })}
                    >
                      Reemitir contrato
                    </button>
                  </>
                ) : null}
                <p className="ctr-signed-immutable-note" data-testid="signed-contract-immutable-note">
                  Contratos assinados não podem ser alterados. A reemissão
                  jurídica será feita por um novo contrato.
                </p>
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
      <ReissueContractSecureModal
        open={legalModal.open}
        mode={legalModal.mode}
        busy={busy}
        onOpenChange={(open) => setLegalModal((prev) => ({ ...prev, open }))}
        onConfirm={handleLegalConfirm}
      />
    </div>
  );
}
