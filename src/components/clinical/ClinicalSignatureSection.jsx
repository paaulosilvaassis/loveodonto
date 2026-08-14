import { useMemo, useState } from 'react';
import { FileText, PenLine, Send, AlertTriangle } from 'lucide-react';
import { ClinicalStageShell, ClinicalBtn } from './ClinicalStageShell.jsx';
import ClinicalDocumentPackagePanel from '../contracts/operational/ClinicalDocumentPackagePanel.jsx';
import ContractSignModal from '../contracts/ContractSignModal.jsx';
import SendContractSignatureModal from '../contracts/SendContractSignatureModal.jsx';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS } from '../../contracts/contractConstants.js';
import {
  evaluateClinicalSignatureReadiness,
  CLINICAL_SIGNATURE_STEP,
} from '../../contracts/clinicalSignatureReadiness.js';
import { prepareClinicalSignaturePackage } from '../../services/clinicalSignaturePackageService.js';
import { getPatient } from '../../services/patientService.js';
import { resolvePatientFullName } from '../../utils/patientIdentity.js';

export function ClinicalSignatureSection({
  appointmentId,
  patientId,
  budgetId = null,
  user,
  professional = null,
  onNavigate = null,
  onWorkflowRefresh = null,
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [signOpen, setSignOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [showPackage, setShowPackage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const readiness = useMemo(
    () => evaluateClinicalSignatureReadiness({
      appointmentId,
      budgetId,
      patientId,
      user,
    }),
    [appointmentId, budgetId, patientId, user, refreshKey],
  );

  const patientName = useMemo(() => {
    const bundle = patientId ? getPatient(patientId) : null;
    return resolvePatientFullName(bundle) || patientId || '—';
  }, [patientId]);

  const bump = () => {
    setRefreshKey((k) => k + 1);
    onWorkflowRefresh?.();
  };

  const showMsg = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  };

  const handlePrepare = async () => {
    setBusy(true);
    try {
      const result = await prepareClinicalSignaturePackage({
        user,
        appointmentId,
        budgetId,
        patientId,
        contractId: readiness.identity?.contractId,
      });
      if (!result.ok) {
        showMsg(result.error || 'Não foi possível preparar o pacote.', 'error');
        return;
      }
      bump();
      showMsg(result.duplicate ? 'Pacote já estava preparado.' : 'Pacote preparado e manifesto congelado.');
    } catch (e) {
      showMsg(e?.message || 'Erro ao preparar pacote.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBlocker = (blocker) => {
    if (blocker.action === 'prepare_package') {
      handlePrepare();
      return;
    }
    if (blocker.ctaSection) onNavigate?.(blocker.ctaSection);
  };

  const contract = readiness.contract;
  const canSign = readiness.canSignNow;
  const canSend = readiness.canSend;

  return (
    <>
      <ClinicalStageShell
        title="Assinatura"
        description="Cerimônia de assinatura do pacote documental deste atendimento."
        secondaryActions={(
          <>
            <ClinicalBtn variant="secondary" icon={FileText} onClick={() => setShowPackage((v) => !v)}>
              Visualizar pacote
            </ClinicalBtn>
            {canSign ? (
              <ClinicalBtn
                variant="secondary"
                icon={PenLine}
                data-testid="clinical-sign-now-cta"
                onClick={() => setSignOpen(true)}
              >
                Assinar agora
              </ClinicalBtn>
            ) : null}
            {canSend ? (
              <ClinicalBtn
                variant="secondary"
                icon={Send}
                data-testid="clinical-send-signature-cta"
                onClick={() => setSendOpen(true)}
              >
                Enviar para assinatura
              </ClinicalBtn>
            ) : null}
          </>
        )}
      >
        {toast ? (
          <div className={`toast ${toast.type}`} role="status">{toast.message}</div>
        ) : null}

        <div className="clinical-signature-summary" data-testid="clinical-signature-step" data-step={readiness.step}>
          <p><strong>Contrato:</strong> {formatFriendlyContractNumber(contract?.contractNumber, 1)}</p>
          <p><strong>Paciente:</strong> {patientName}</p>
          <p><strong>Status do contrato:</strong> {CONTRACT_STATUS_LABELS[contract?.status] || (contract?.status === CONTRACT_STATUS.GENERATED ? 'Finalizado' : contract?.status || 'Ausente')}</p>
          <p><strong>Manifest:</strong> {readiness.manifestFrozen ? 'Pronto / congelado' : 'Não congelado'}</p>
          <p><strong>Status:</strong> {readiness.label}</p>
        </div>

        {readiness.step !== CLINICAL_SIGNATURE_STEP.SIGNED && readiness.blockers.length > 0 ? (
          <ul className="clinical-contract-block-reasons clinical-signature-blockers" data-testid="clinical-signature-blockers">
            {readiness.blockers.map((blocker) => (
              <li key={blocker.code}>
                <AlertTriangle size={16} aria-hidden />
                <span>{blocker.message}</span>
                <ClinicalBtn variant="secondary" onClick={() => handleBlocker(blocker)} disabled={busy}>
                  {blocker.ctaLabel}
                </ClinicalBtn>
              </li>
            ))}
          </ul>
        ) : null}

        {showPackage ? (
          <ClinicalDocumentPackagePanel
            appointmentId={appointmentId}
            budgetId={budgetId || readiness.identity?.budgetId}
            patientId={patientId}
            contractStatus={contract?.status || null}
            compact
          />
        ) : null}
      </ClinicalStageShell>

      <ContractSignModal
        open={signOpen}
        onOpenChange={setSignOpen}
        user={user}
        contract={canSign ? contract : null}
        onSigned={() => {
          setSignOpen(false);
          bump();
          showMsg('Contrato assinado.');
        }}
      />
      <SendContractSignatureModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        user={user}
        contract={canSend ? contract : null}
        budget={null}
        professional={professional}
        treatmentName={readiness.package?.treatmentName}
        onSent={() => {
          setSendOpen(false);
          bump();
          showMsg('Solicitação registrada. Nenhum envio automático extra.');
        }}
      />
    </>
  );
}
