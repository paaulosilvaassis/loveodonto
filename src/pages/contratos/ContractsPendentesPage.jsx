import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { PENDING_STATUSES } from '../../contracts/contractConstants.js';
import {
  listContractsByStatus,
  sendContractForSignature,
  finalizeGeneratedContract,
} from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractSignModal from '../../components/contracts/ContractSignModal.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { CancelContractSecureModal } from '../../components/clinical/contract/CancelContractSecureModal.jsx';
import { SigningAccessSecureModal } from '../../components/clinical/contract/SigningAccessSecureModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { cancelContractSecure } from '../../services/cancelContractSecureService.js';
import {
  resendSigningAccess,
  rotateSigningAccess,
} from '../../services/contractSigningAccessCommandService.js';
import { revokeSigningAccess } from '../../services/contractLifecycleCommandService.js';
import {
  deriveCeremonyProgress,
  getContractLifecycleUiPolicy,
  getSigningAccessSnapshot,
  mapLifecycleUiError,
} from '../../contracts/lifecycle/index.js';

export default function ContractsPendentesPage() {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [signContract, setSignContract] = useState(null);
  const [selectedView, setSelectedView] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [cancelModal, setCancelModal] = useState({ open: false, contract: null, variant: 'cancel' });
  const [accessModal, setAccessModal] = useState({ open: false, mode: 'resend', contract: null, requestId: null });

  const contracts = useMemo(() => {
    void refresh;
    return listContractsByStatus(PENDING_STATUSES);
  }, [refresh]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const rows = contracts.map((c, index) => {
    const snapshot = getSigningAccessSnapshot(c.id);
    const policy = getContractLifecycleUiPolicy({
      contract: c,
      actor: user,
      request: snapshot.request,
      link: snapshot.link,
    });
    const progress = deriveCeremonyProgress({ contract: c });
    return {
      ...c,
      number: formatFriendlyContractNumber(c.contractNumber, index + 1),
      patient: c.patientSnapshotJson?.full_name || c.patientId,
      value: formatCtrCurrency(c.totalValueSnapshot),
      generated: c.generatedAt ? new Date(c.generatedAt).toLocaleDateString('pt-BR') : '—',
      progress: progress.requiredCount ? progress.label : '—',
      accessLabel: policy.access.label,
      policy,
      snapshot,
    };
  });

  const runBusy = async (contractId, fn, successMessage) => {
    if (busyId) return;
    setBusyId(contractId);
    try {
      await fn();
      setRefresh((x) => x + 1);
      showToast(successMessage);
    } catch (e) {
      showToast(mapLifecycleUiError(e), 'error');
      throw e;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ctr-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <ContractTable
        columns={[
          { key: 'number', label: 'Número' },
          { key: 'patient', label: 'Paciente' },
          { key: 'status', label: 'Contrato', render: (r) => <ContractStatusBadge status={r.status} /> },
          {
            key: 'access',
            label: 'Acesso remoto',
            render: (r) => <span className="ctr-badge ctr-badge--muted">{r.accessLabel}</span>,
          },
          { key: 'progress', label: 'Assinaturas' },
          { key: 'value', label: 'Valor' },
          { key: 'generated', label: 'Gerado em' },
          {
            key: 'actions',
            label: 'Ações',
            render: (r) => {
              const pending = busyId === r.id;
              return (
                <div className="ctr-actions ctr-actions--lifecycle">
                  <button type="button" className="button small secondary" onClick={() => setSelectedView(buildContractViewIdentity(r))}>
                    Visualizar
                  </button>
                  {r.policy.canGenerate ? (
                    <button
                      type="button"
                      className="button small primary"
                      disabled={pending}
                      aria-busy={pending}
                      onClick={() => runBusy(r.id, () => finalizeGeneratedContract(user, r.id), 'Contrato finalizado.')}
                    >
                      Finalizar
                    </button>
                  ) : null}
                  {r.policy.canSignOnScreen ? (
                    <button type="button" className="button small primary" disabled={pending} onClick={() => setSignContract(r)}>
                      Assinar agora
                    </button>
                  ) : null}
                  {r.policy.canSendForSignature ? (
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={pending}
                      aria-busy={pending}
                      onClick={() => runBusy(r.id, async () => {
                        sendContractForSignature(user, r.id);
                      }, 'Solicitação de assinatura criada.')}
                    >
                      Enviar para assinatura
                    </button>
                  ) : null}
                  {r.policy.canResendAccess ? (
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={pending}
                      onClick={() => setAccessModal({
                        open: true, mode: 'resend', contract: r, requestId: r.snapshot.request?.id,
                      })}
                    >
                      Reenviar acesso
                    </button>
                  ) : null}
                  {r.policy.canRotateAccess ? (
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={pending}
                      onClick={() => setAccessModal({
                        open: true, mode: 'rotate', contract: r, requestId: r.snapshot.request?.id,
                      })}
                    >
                      Gerar novo acesso
                    </button>
                  ) : null}
                  {r.policy.canRevokeAccess ? (
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={pending}
                      onClick={() => setAccessModal({
                        open: true, mode: 'revoke', contract: r, requestId: r.snapshot.request?.id,
                      })}
                    >
                      Revogar acesso
                    </button>
                  ) : null}
                  {r.policy.canCancelUnsigned || r.policy.canAbortPartial ? (
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={pending}
                      onClick={() => setCancelModal({
                        open: true,
                        contract: r,
                        variant: r.policy.canAbortPartial ? 'abort' : 'cancel',
                      })}
                    >
                      {r.policy.canAbortPartial ? 'Cancelar cerimônia/contrato' : 'Cancelar contrato'}
                    </button>
                  ) : null}
                </div>
              );
            },
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
      <CancelContractSecureModal
        open={cancelModal.open}
        variant={cancelModal.variant}
        busy={Boolean(busyId)}
        onOpenChange={(open) => setCancelModal((prev) => ({ ...prev, open }))}
        onConfirm={async ({ password, reason, confirmPhrase, financialAction }) => {
          const contract = cancelModal.contract;
          if (!contract) return;
          await runBusy(contract.id, async () => {
            await cancelContractSecure(user, contract.id, {
              password,
              reason,
              confirmPhrase,
              financialAction,
            });
          }, cancelModal.variant === 'abort' ? 'Cerimônia cancelada. Evidências preservadas.' : 'Contrato cancelado.');
        }}
      />
      <SigningAccessSecureModal
        open={accessModal.open}
        mode={accessModal.mode}
        busy={Boolean(busyId)}
        onOpenChange={(open) => setAccessModal((prev) => ({ ...prev, open }))}
        onConfirm={async ({ reason }) => {
          const contract = accessModal.contract;
          if (!contract) return;
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          if (accessModal.mode === 'resend') {
            await runBusy(contract.id, () => resendSigningAccess({
              user, contractId: contract.id, requestId: accessModal.requestId, origin, deliverEmail: false,
            }), 'Acesso reenviado.');
            return;
          }
          if (accessModal.mode === 'rotate') {
            await runBusy(contract.id, () => rotateSigningAccess({
              user, contractId: contract.id, requestId: accessModal.requestId, reason,
            }), 'Novo acesso de assinatura gerado.');
            return;
          }
          await runBusy(contract.id, () => revokeSigningAccess({
            user, contractId: contract.id, requestId: accessModal.requestId, reason,
          }), 'Acesso revogado.');
        }}
      />
    </div>
  );
}
