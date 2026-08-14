import { useMemo, useState } from 'react';
import { FileText, PenLine, Send, AlertTriangle, Printer } from 'lucide-react';
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
import { CLINICAL_SIGNER_ROLE } from '../../contracts/clinicalRequiredSigners.js';
import { addOptionalWitness } from '../../contracts/clinicalSignatureCeremony.js';
import {
  canAuthenticatedUserSignSlot,
  isAuthenticatedIdentityRole,
  isOperatorCollectedRole,
} from '../../contracts/authenticatedSignerIdentity.js';
import { printClinicalContractForManualSignature } from '../../contracts/printClinicalContractForManualSignature.js';
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
  const [signTarget, setSignTarget] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [showPackage, setShowPackage] = useState(true);
  const [witnessName, setWitnessName] = useState('');
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
    if (blocker.action === 'prepare_package') return handlePrepare();
    if (blocker.action === 'add_witness') return null;
    if (blocker.ctaSection) onNavigate?.(blocker.ctaSection);
  };

  const handlePrintManual = (slot) => {
    const result = printClinicalContractForManualSignature({
      user,
      contractId: readiness.identity?.contractId || readiness.contract?.id,
      appointmentId,
      budgetId,
      patientId,
    });
    if (!result.ok) {
      showMsg(result.error || 'Não foi possível imprimir o contrato.', 'error');
      return;
    }
    showMsg('Documento aberto para impressão. Imprimir não registra assinatura.');
  };

  const handleAddWitness = () => {
    try {
      addOptionalWitness({
        user,
        contractId: readiness.identity?.contractId,
        patientId,
        appointmentId,
        budgetId,
        name: witnessName,
      });
      setWitnessName('');
      bump();
      showMsg('Testemunha adicionada. Opcional — não bloqueia a conclusão.');
    } catch (e) {
      showMsg(e?.message || 'Não foi possível adicionar testemunha.', 'error');
    }
  };

  const contract = readiness.contract;
  const ceremony = readiness.ceremony;
  const signers = ceremony?.requiredSigners || [];
  const canOpenCeremony = readiness.canSignNow;

  return (
    <>
      <ClinicalStageShell
        title="Assinatura do contrato"
        description="Cerimônia multi-signer do pacote documental deste atendimento."
        secondaryActions={(
          <ClinicalBtn variant="secondary" icon={FileText} onClick={() => setShowPackage((v) => !v)}>
            Visualizar pacote
          </ClinicalBtn>
        )}
      >
        {toast ? <div className={`toast ${toast.type}`} role="status">{toast.message}</div> : null}

        <div className="clinical-signature-summary" data-testid="clinical-signature-step" data-step={readiness.step}>
          <p><strong>Contrato:</strong> {formatFriendlyContractNumber(contract?.contractNumber, 1)}</p>
          <p><strong>Paciente:</strong> {patientName}</p>
          <p><strong>Status do contrato:</strong> {CONTRACT_STATUS_LABELS[contract?.status] || (contract?.status === CONTRACT_STATUS.GENERATED ? 'Finalizado' : contract?.status || 'Ausente')}</p>
          <p><strong>Manifest:</strong> {readiness.manifestLabel}</p>
          <p><strong>Status:</strong> {readiness.label}</p>
          {ceremony?.requiredCount ? <p data-testid="clinical-signature-progress"><strong>Progresso:</strong> {ceremony.progressLabel}</p> : null}
          {readiness.legacySignedBeforeManifest ? (
            <p className="clinical-signature-legacy">Assinatura anterior ao manifesto/cerimônia multi-signer atual. Evidência histórica preservada.</p>
          ) : null}
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

        <div className="clinical-signer-list" data-testid="clinical-signer-list">
          <h3>Signatários</h3>
          {signers.map((slot) => (
            <article key={`${slot.role}-${slot.personId || slot.name}`} className="clinical-signer-card" data-signer-role={slot.role} data-signer-status={slot.status}>
              <p><strong>{slot.label}</strong> {slot.required ? '' : <span>(opcional)</span>}</p>
              <p>{slot.name || '—'}</p>
              {slot.cro ? <p>CRO{slot.uf ? `-${slot.uf}` : ''} {slot.cro}</p> : null}
              <p>{slot.status === 'signed' ? 'Assinado' : (canAuthenticatedUserSignSlot(user, slot).waitingLabel || 'Pendente')}</p>
              {slot.satisfiedBySameProfessional ? (
                <p>Satisfeito pela mesma assinatura profissional</p>
              ) : null}
              {canOpenCeremony && slot.status !== 'signed' && isOperatorCollectedRole(slot.role) ? (
                <>
                  <ClinicalBtn
                    variant="secondary"
                    icon={PenLine}
                    data-testid={slot.role === CLINICAL_SIGNER_ROLE.PATIENT ? 'clinical-sign-now-cta' : `clinical-sign-${String(slot.role).toLowerCase()}-cta`}
                    onClick={() => setSignTarget(slot)}
                  >
                    Assinar agora
                  </ClinicalBtn>
                  {slot.role === CLINICAL_SIGNER_ROLE.PATIENT && readiness.canSend ? (
                    <ClinicalBtn variant="secondary" icon={Send} data-testid="clinical-send-signature-cta" onClick={() => setSendOpen(true)}>
                      Enviar para assinatura
                    </ClinicalBtn>
                  ) : null}
                </>
              ) : null}
              {canOpenCeremony && slot.status !== 'signed' && isAuthenticatedIdentityRole(slot.role) ? (
                canAuthenticatedUserSignSlot(user, slot).canSignElectronically ? (
                  <ClinicalBtn
                    variant="secondary"
                    icon={PenLine}
                    data-testid={slot.role === CLINICAL_SIGNER_ROLE.PROFESSIONAL
                      ? 'clinical-sign-professional-cta'
                      : 'clinical-sign-clinic-representative-cta'}
                    onClick={() => setSignTarget(slot)}
                  >
                    {slot.role === CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE
                      ? 'Assinar como responsável técnico'
                      : 'Assinar como profissional'}
                  </ClinicalBtn>
                ) : (
                  <ClinicalBtn
                    variant="secondary"
                    icon={Printer}
                    data-testid="clinical-print-manual-signature-cta"
                    onClick={() => handlePrintManual(slot)}
                  >
                    Imprimir para assinatura manual
                  </ClinicalBtn>
                )
              ) : null}
            </article>
          ))}
          <div className="clinical-signer-card" data-signer-role="WITNESS">
            <p><strong>Testemunhas</strong> <span>(opcional)</span></p>
            <input
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              placeholder="Nome da testemunha"
              aria-label="Nome da testemunha"
            />
            <ClinicalBtn variant="secondary" onClick={handleAddWitness} data-testid="clinical-add-witness-cta">
              Adicionar testemunha
            </ClinicalBtn>
          </div>
        </div>

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
        open={Boolean(signTarget)}
        onOpenChange={(next) => { if (!next) setSignTarget(null); }}
        user={user}
        contract={signTarget ? contract : null}
        signerRole={signTarget?.role}
        signerPersonId={signTarget?.personId}
        expectedName={signTarget?.name}
        expectedAppointmentId={appointmentId}
        expectedBudgetId={budgetId}
        expectedPatientId={patientId}
        onSigned={() => {
          setSignTarget(null);
          bump();
          showMsg('Assinatura registrada.');
        }}
      />
      <SendContractSignatureModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        user={user}
        contract={readiness.canSend ? contract : null}
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
