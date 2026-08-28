import { useMemo, useState } from 'react';
import { CONTRACT_STATUS } from '../../contracts/contractConstants.js';
import { listContractsByStatus } from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { formatCeremonyAdminProgress } from '../../contracts/clinicalSignatureCeremony.js';

export default function ContractsAssinadosPage() {
  const [selectedView, setSelectedView] = useState(null);
  const contracts = useMemo(
    () => listContractsByStatus([CONTRACT_STATUS.SIGNED]),
    [],
  );

  const rows = contracts.map((c, index) => ({
    ...c,
    number: formatFriendlyContractNumber(c.contractNumber, index + 1),
    patient: c.patientSnapshotJson?.full_name || c.patientId,
    value: formatCtrCurrency(c.totalValueSnapshot),
    signed: c.signedAt ? new Date(c.signedAt).toLocaleDateString('pt-BR') : '—',
    progress: formatCeremonyAdminProgress(c).label,
  }));

  return (
    <div className="ctr-page">
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
    </div>
  );
}
