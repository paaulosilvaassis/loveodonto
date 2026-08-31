import { useMemo, useState } from 'react';
import { normalizeContract } from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { ReissueContractSecureModal } from '../../components/clinical/contract/ReissueContractSecureModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { useAuth } from '../../auth/useAuth.js';
import {
  deriveCeremonyProgress,
  describeContractLineage,
  getContractLifecycleUiPolicy,
  listLifecycleArchiveContracts,
  mapLifecycleUiError,
  normalizeContractLifecycleStatus,
} from '../../contracts/lifecycle/index.js';
import {
  reissueContract,
  voidSignedContract,
} from '../../services/contractVoidReissueCommandService.js';

function legalNote(state) {
  if (state === 'voided') {
    return 'Documento histórico. Permanece como evidência, mas não deve ser usado como acordo vigente.';
  }
  if (state === 'superseded') {
    return 'Contrato substituído. Consulte a reemissão para o acordo vigente.';
  }
  if (state === 'cancelled') {
    return 'Contrato cancelado. Não está disponível para assinatura.';
  }
  return 'Contratos assinados não podem ser alterados. A reemissão jurídica será feita por um novo contrato.';
}

export default function ContractsAssinadosPage() {
  const { user } = useAuth();
  const [selectedView, setSelectedView] = useState(null);
  const [legalModal, setLegalModal] = useState({ open: false, mode: 'reissue', contractId: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const contracts = useMemo(
    () => listLifecycleArchiveContracts().map(normalizeContract).filter(Boolean),
    [notice],
  );

  const rows = contracts.map((c, index) => {
    const state = normalizeContractLifecycleStatus(c.status);
    const policy = getContractLifecycleUiPolicy({ contract: c, actor: user });
    const lineage = describeContractLineage(c);
    return {
      ...c,
      number: formatFriendlyContractNumber(c.contractNumber, index + 1),
      patient: c.patientSnapshotJson?.full_name || c.patientId,
      value: formatCtrCurrency(c.totalValueSnapshot),
      signed: c.signedAt ? new Date(c.signedAt).toLocaleDateString('pt-BR') : '—',
      progress: deriveCeremonyProgress({ contract: c }).label,
      policy,
      lineage,
      state,
    };
  });

  const handleLegalConfirm = async ({ reason }) => {
    if (!legalModal.contractId || !user || busy) return;
    setBusy(true);
    setErrorNotice('');
    try {
      if (legalModal.mode === 'void') {
        const result = await voidSignedContract({ user, contractId: legalModal.contractId, reason });
        setNotice('Contrato invalidado.');
        return result;
      }
      const result = await reissueContract({ user, contractId: legalModal.contractId, reason });
      const successor = result.newContract;
      setNotice(successor
        ? `Novo contrato criado: ${formatFriendlyContractNumber(successor.contractNumber, 1)}.`
        : 'Novo contrato criado.');
      if (successor?.id) setSelectedView(buildContractViewIdentity(successor));
      return result;
    } catch (err) {
      const mapped = mapLifecycleUiError(err);
      err.mappedMessage = mapped;
      setErrorNotice(mapped);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ctr-page">
      {notice ? <p className="ctr-signed-immutable-note" role="status">{notice}</p> : null}
      {errorNotice ? <p className="clinical-inline-error" role="alert">{errorNotice}</p> : null}
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
              <div className="ctr-actions ctr-actions--lifecycle">
                <button
                  type="button"
                  className="button small secondary"
                  onClick={() => setSelectedView(buildContractViewIdentity(r))}
                >
                  Visualizar
                </button>
                {r.policy.canVoidSigned ? (
                  <button
                    type="button"
                    className="button small secondary"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => setLegalModal({ open: true, mode: 'void', contractId: r.id })}
                  >
                    Invalidar contrato
                  </button>
                ) : null}
                {r.policy.canReissue ? (
                  <button
                    type="button"
                    className="button small"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => setLegalModal({ open: true, mode: 'reissue', contractId: r.id })}
                  >
                    Reemitir contrato
                  </button>
                ) : null}
                {r.lineage.successor ? (
                  <p className="ctr-signed-immutable-note">
                    Substituído pelo contrato {r.lineage.successor.number}
                  </p>
                ) : null}
                {r.lineage.predecessor ? (
                  <p className="ctr-signed-immutable-note">
                    Reemissão do contrato {r.lineage.predecessor.number}
                  </p>
                ) : null}
                {r.state === 'voided' && r.voidReason ? (
                  <p className="ctr-signed-immutable-note">
                    Invalidado{r.voidedAt ? ` em ${new Date(r.voidedAt).toLocaleDateString('pt-BR')}` : ''}.
                  </p>
                ) : null}
                <p className="ctr-signed-immutable-note" data-testid="signed-contract-immutable-note">
                  {legalNote(r.state)}
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
