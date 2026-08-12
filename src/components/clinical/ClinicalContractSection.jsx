import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSignature,
  FileText,
  Send,
  XCircle,
  ChevronDown,
  User,
  Building2,
  Stethoscope,
  DollarSign,
  Scale,
  Shield,
  PenLine,
  History,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import GenerateContractModal from '../contracts/GenerateContractModal.jsx';
import { ClinicalStageShell, ClinicalBtn } from './ClinicalStageShell.jsx';
import { ContractBlockModal } from './contract/ContractBlockModal.jsx';
import { formatContractEventLabel } from './contract/contractEventLabels.js';
import { linkFinancingToClinicalContract } from '../../services/clinicalBudgetFinancingIntegration.js';
import { markBudgetContractGenerated } from '../../services/clinicalBudgetLockService.js';
import { notifyClinicalBudgetUpdated } from '../../services/clinicalBudgetApprovedService.js';
import { cancelContractSecure } from '../../services/cancelContractSecureService.js';
import { can } from '../../permissions/permissions.js';
import { loadDb } from '../../db/index.js';
import { getPatient, PENDING_FIELDS_MAP } from '../../services/patientService.js';
import {
  getContractStatusForQuote,
  getContractDetails,
} from '../../services/contractModuleService.js';
import SendContractSignatureModal from '../contracts/SendContractSignatureModal.jsx';
import { canSendContractForSignature, resolveBudgetForContractSend } from '../../services/contractSignatureFlowService.js';
import { CancelContractSecureModal } from './contract/CancelContractSecureModal.jsx';
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
} from '../../contracts/contractConstants.js';
import { formatCurrencyBRL } from '../../utils/currency.js';
import { formatCpf, formatCnpj } from '../../utils/validators.js';
import {
  resolveBudgetFinancials,
} from './budget/budgetUtils.js';
import { getPaymentOptionTitle } from './budget/budgetEventLabels.js';
import { contractHtmlWithSignatures } from '../../services/contractPdfService.js';
import { composeProfessionalClinicalContractHtml } from './contract/composeProfessionalClinicalContract.js';
import { getClinicForumCityFromDb } from './contract/buildProfessionalContractContext.js';
import { CLINIC_FORUM_VALIDATION_MESSAGE } from './contract/professionalContractClauses.js';
import { ContractReadinessChecklist } from '../contracts/ContractReadinessChecklist.jsx';
import { getContractReadinessChecklist } from '../../services/contractValidationService.js';
import {
  buildPrerequisiteDestination,
  isSafeClinicalReturnUrl,
} from '../../contracts/contractPrerequisitesResolution.js';
import { getBudgetLockContext, getBudgetLockContextForBudget } from '../../services/clinicalBudgetLockService.js';
import { generateProfessionalContractPdf } from './contract/generateProfessionalContractPdf.js';
import { buildFinancialSection } from './contract/clinicalContractSchedule.js';
import { LINKED_DOCUMENTS, LEGAL_CONTRACT_TEXTS } from './contract/professionalContractClauses.js';
import { detectTreatmentType, getTreatmentTypeLabel } from './contract/detectTreatmentType.js';
import { canAccessContract, getContractAccessBlockReasons } from './contract/contractAccessUtils.js';
import { resolveAttachedTcleIdsFromClinicalDocuments } from '../../services/clinicalTcleAttachmentService.js';
import ClinicalDocumentPackagePanel from '../contracts/operational/ClinicalDocumentPackagePanel.jsx';

const CLAUSE_GROUPS = [
  { title: 'Qualificação das partes', items: ['Texto corrido com clínica e paciente'] },
  { title: 'Objeto', items: [LEGAL_CONTRACT_TEXTS.object] },
  { title: 'Dos serviços', items: ['Lista de procedimentos contratados'] },
  { title: 'Da duração do tratamento', items: [LEGAL_CONTRACT_TEXTS.duration] },
  { title: 'Do pagamento', items: ['Valor por extenso, entrada, parcelas e financiamento'] },
  { title: 'Cronograma de pagamento', items: ['Parcelas no formato CTR-XXX NN/TT'] },
  { title: 'Da inadimplência', items: [LEGAL_CONTRACT_TEXTS.default] },
  { title: 'Da rescisão', items: LEGAL_CONTRACT_TEXTS.rescission },
  { title: 'Das garantias', items: [LEGAL_CONTRACT_TEXTS.warrantiesGeneral, ...LEGAL_CONTRACT_TEXTS.warranties] },
  { title: 'Obrigações do paciente', items: LEGAL_CONTRACT_TEXTS.patientObligations },
  { title: 'Obrigações da clínica', items: LEGAL_CONTRACT_TEXTS.clinicObligations },
  { title: 'Do abandono de tratamento', items: [LEGAL_CONTRACT_TEXTS.abandonment] },
  { title: 'LGPD e uso de imagem', items: [LEGAL_CONTRACT_TEXTS.lgpd, LEGAL_CONTRACT_TEXTS.imageUse] },
  { title: 'Do foro', items: [LEGAL_CONTRACT_TEXTS.forum] },
];

const LINKED_TERMS = LINKED_DOCUMENTS.map((label, index) => ({
  id: `doc-${index}`,
  label,
}));

function ContractAccordionSection({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`clinical-contract-section${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="clinical-contract-section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="clinical-contract-section-title">
          {Icon ? <Icon size={16} /> : null}
          {title}
        </span>
        <ChevronDown size={16} className="clinical-contract-section-chevron" />
      </button>
      {open ? <div className="clinical-contract-section-body">{children}</div> : null}
    </section>
  );
}

function InfoGrid({ rows }) {
  return (
    <dl className="clinical-contract-info-grid">
      {rows.filter((row) => row.value).map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function resolveContractGenerateReadiness({
  professionalId,
  pendingCriticalFields,
  clinicForumCity,
  linkedContract,
}) {
  if (linkedContract) return { ready: true, reasons: [] };
  const reasons = [];
  if (pendingCriticalFields.length) reasons.push('Cadastro do paciente incompleto.');
  if (!professionalId) reasons.push('Profissional responsável não definido.');
  if (!clinicForumCity) reasons.push(CLINIC_FORUM_VALIDATION_MESSAGE);
  return { ready: reasons.length === 0, reasons };
}

function resolveUiStatus({ contractAccessible, generateReadiness, linkedContract, contractReadiness }) {
  if (!contractAccessible && !linkedContract) {
    return { key: 'blocked', label: 'Bloqueado', tone: 'blocked' };
  }
  if (linkedContract?.status === CONTRACT_STATUS.DRAFT) {
    return { key: 'draft', label: 'Em edição', tone: 'draft' };
  }
  if (linkedContract && [CONTRACT_STATUS.SENT, CONTRACT_STATUS.VIEWED, CONTRACT_STATUS.SIGNED_BY_PATIENT, CONTRACT_STATUS.SIGNED_BY_CLINIC].includes(linkedContract.status)) {
    return { key: 'waiting', label: 'Aguardando assinatura', tone: 'waiting' };
  }
  if ([CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.COMPLETED].includes(linkedContract?.status)) {
    return { key: 'signed', label: 'Assinado', tone: 'signed' };
  }
  if (linkedContract?.status === CONTRACT_STATUS.CANCELED) {
    return { key: 'canceled', label: 'Cancelado', tone: 'canceled' };
  }
  if (linkedContract?.status === CONTRACT_STATUS.GENERATED) {
    return { key: 'generated', label: 'Gerado', tone: 'ready' };
  }
  if (linkedContract) {
    return {
      key: linkedContract.status,
      label: CONTRACT_STATUS_LABELS[linkedContract.status] || 'Em andamento',
      tone: 'draft',
    };
  }
  if (!generateReadiness.ready) {
    return { key: 'pending', label: 'Pendente', tone: 'draft' };
  }
  if (contractReadiness && !contractReadiness.canGenerate) {
    const tclePending = (contractReadiness.groups?.tcle || []).length > 0;
    if (tclePending) {
      return { key: 'tcle-pending', label: 'TCLE pendente', tone: 'draft' };
    }
    return { key: 'pending-data', label: 'Dados pendentes', tone: 'draft' };
  }
  return { key: 'ready', label: 'Liberado para geração', tone: 'ready' };
}

function formatPhone(phones = []) {
  const main = phones.find((p) => p.is_primary) || phones[0];
  if (!main) return '';
  return `(${main.ddd || ''}) ${main.number || ''}`.trim();
}

function formatClinicAddress(addresses = []) {
  const addr = addresses.find((a) => a.principal) || addresses[0];
  if (!addr) return '';
  const cityUf = [addr.cidade, addr.uf].filter(Boolean).join('/');
  return [addr.logradouro, addr.numero, addr.bairro, cityUf, addr.cep ? `CEP ${addr.cep}` : '']
    .filter(Boolean)
    .join(', ');
}

export function ClinicalContractSection({
  appointmentId,
  viewBudgetId = null,
  viewContractId = null,
  patientId,
  user,
  contractAccessible: contractAccessibleProp,
  budget,
  appointment,
  professional,
  onWorkflowRefresh,
}) {
  const navigate = useNavigate();
  const db = loadDb();
  const fullPatient = patientId ? getPatient(patientId) : null;
  const pendingCriticalFields = fullPatient?.profile?.pendingCriticalFields || [];
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Após reload/HMR, writes no IndexedDB disparam db:updated — reavalia CTA sem state efêmero.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onDbUpdated = () => setHistoryKey((k) => k + 1);
    window.addEventListener('db:updated', onDbUpdated);
    return () => window.removeEventListener('db:updated', onDbUpdated);
  }, []);

  const linkedContract = useMemo(() => {
    if (viewContractId) {
      const details = getContractDetails(viewContractId);
      return details?.contract || null;
    }
    return getContractStatusForQuote(
      appointmentId,
      'clinical_budget',
      budget?.id || viewBudgetId || null,
      patientId,
    );
  }, [appointmentId, budget?.id, viewBudgetId, patientId, viewContractId, historyKey]);

  const effectiveBudget = useMemo(
    () => resolveBudgetForContractSend(linkedContract, budget) || budget || null,
    [linkedContract, budget, historyKey],
  );

  const contractDetails = useMemo(
    () => (linkedContract?.id ? getContractDetails(linkedContract.id) : null),
    [linkedContract?.id, historyKey],
  );

  const financials = useMemo(() => resolveBudgetFinancials(effectiveBudget || { procedures: [] }), [effectiveBudget]);
  const accepted = financials.accepted;

  const paymentPreview = useMemo(() => {
    if (!accepted || !patientId) return null;
    return buildFinancialSection(
      accepted,
      financials.originalValue,
      patientId,
      [appointmentId, effectiveBudget?.id || budget?.id].filter(Boolean),
    );
  }, [accepted, financials.originalValue, patientId, appointmentId, effectiveBudget?.id, budget?.id]);

  const treatmentTypeLabel = useMemo(() => {
    const type = detectTreatmentType({
      planName: effectiveBudget?.planName || budget?.planName || '',
      procedures: effectiveBudget?.procedures || budget?.procedures || [],
    });
    return getTreatmentTypeLabel(type);
  }, [effectiveBudget?.planName, effectiveBudget?.procedures, budget?.planName, budget?.procedures]);

  const clinicForumCity = useMemo(
    () => getClinicForumCityFromDb(db).clinicForumCity,
    [db],
  );

  const lockCtx = useMemo(
    () => (effectiveBudget
      ? getBudgetLockContextForBudget(appointmentId, effectiveBudget)
      : getBudgetLockContext(appointmentId)),
    [appointmentId, effectiveBudget, historyKey],
  );

  const contractAccessible = useMemo(
    () => contractAccessibleProp ?? (canAccessContract(effectiveBudget, lockCtx) || Boolean(linkedContract)),
    [contractAccessibleProp, effectiveBudget, lockCtx, linkedContract],
  );

  const accessBlockReasons = useMemo(
    () => getContractAccessBlockReasons(effectiveBudget, lockCtx),
    [effectiveBudget, lockCtx],
  );

  const generateReadiness = useMemo(
    () => resolveContractGenerateReadiness({
      professionalId: appointment?.professionalId,
      pendingCriticalFields,
      clinicForumCity,
      linkedContract,
    }),
    [appointment?.professionalId, pendingCriticalFields, clinicForumCity, linkedContract],
  );

  const attachedTcleIds = useMemo(
    () => resolveAttachedTcleIdsFromClinicalDocuments({ patientId, appointmentId }),
    [patientId, appointmentId, historyKey],
  );

  const contractReadiness = useMemo(
    () => (patientId && appointmentId && (effectiveBudget || budget)
      ? getContractReadinessChecklist({
        quoteSource: 'clinical_budget',
        quoteId: appointmentId,
        patientId,
        currentUser: user,
        contractNumber: linkedContract?.contractNumber,
        attachedTcleIds,
      })
      : null),
    [patientId, appointmentId, effectiveBudget, budget, user, linkedContract?.contractNumber, attachedTcleIds, historyKey],
  );

  const uiStatus = resolveUiStatus({
    contractAccessible,
    generateReadiness,
    linkedContract,
    contractReadiness,
  });

  const clinic = db.clinicProfile || {};
  const clinicDoc = db.clinicDocumentation || {};
  const clinicPhone = (db.clinicPhones || []).find((p) => p.principal) || db.clinicPhones?.[0];

  const professionalName =
    professional?.nomeCompleto || professional?.name || professional?.apelido || '—';
  const professionalCro = professional?.conselhoNumero || professional?.cro || '—';
  const professionalSpecialty = Array.isArray(professional?.especialidades)
    ? professional.especialidades.join(', ')
    : (professional?.especialidade || '—');

  const guardianName =
    fullPatient?.profile?.guardian_full_name
    || fullPatient?.profile?.legal_guardian_name
    || '';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const resolutionContext = useMemo(() => ({
    patientId: patientId || null,
    appointmentId: appointmentId || null,
    budgetId: effectiveBudget?.id || budget?.id || viewBudgetId || null,
    contractId: linkedContract?.id || viewContractId || null,
  }), [patientId, appointmentId, effectiveBudget?.id, budget?.id, viewBudgetId, linkedContract?.id, viewContractId]);

  const handleResolvePrerequisite = useCallback((card) => {
    const destination = card?.destination;
    if (!destination?.href) {
      showToast('Não foi possível abrir o destino de correção.', 'error');
      return;
    }
    if (destination.mode === 'blocked') {
      showToast(destination.reason || 'Contexto incompleto para correção.', 'error');
      return;
    }
    // Garante que o CTA do paciente nunca perde o patientId do atendimento.
    if (
      (card.group === 'paciente' || card.group === 'responsavel' || card.group === 'dependente')
      && destination.patientId
      && patientId
      && destination.patientId !== patientId
    ) {
      showToast('Contexto do paciente inconsistente. Recarregue o atendimento.', 'error');
      return;
    }
    if (destination.returnUrl && !isSafeClinicalReturnUrl(destination.returnUrl)) {
      showToast('URL de retorno inválida.', 'error');
      return;
    }
    navigate(destination.href, {
      state: {
        returnTo: destination.returnUrl || undefined,
        fromContractPrerequisites: true,
        patientId: destination.patientId || patientId || undefined,
        appointmentId: destination.appointmentId || appointmentId || undefined,
        budgetId: destination.budgetId || budget?.id || undefined,
        docCategory: destination.focus === 'consentimentos' ? 'consentimentos' : undefined,
        docTemplate: destination.templateKey || undefined,
      },
    });
  }, [navigate, patientId, appointmentId, budget?.id]);

  const openContractFlow = () => {
    if (!contractAccessible) {
      showToast(accessBlockReasons[0] || 'Contrato bloqueado.', 'error');
      return;
    }
    if (!generateReadiness.ready) {
      if (pendingCriticalFields.length) setBlockModalOpen(true);
      else showToast(generateReadiness.reasons[0] || 'Complete os requisitos para gerar o contrato.', 'error');
      return;
    }
    setContractModalOpen(true);
  };

  const handleViewPdf = () => {
    const html = linkedContract?.renderedHtml || linkedContract?.editedHtml;
    if (html) {
      const viewWindow = window.open('', '_blank');
      if (viewWindow) {
        const isProfessional = html.includes('contract-document') || html.includes('Contrato de Prestação');
        viewWindow.document.write(isProfessional ? html : contractHtmlWithSignatures(html));
        viewWindow.document.close();
      }
      return;
    }
    if (!contractAccessible) {
      showToast('Complete os requisitos antes de visualizar.', 'error');
      return;
    }
    handlePreviewContract();
  };

  const handlePreviewContract = () => {
    try {
      const html = composeProfessionalClinicalContractHtml({
        quoteId: appointmentId,
        patientId,
        contractNumber: linkedContract?.contractNumber,
        contractStatus: linkedContract?.status || 'draft',
      });
      const viewWindow = window.open('', '_blank');
      if (viewWindow) {
        viewWindow.document.write(html);
        viewWindow.document.close();
      }
    } catch (error) {
      showToast(error.message || 'Erro ao gerar preview.', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    if (!user || (!canGenerate && !linkedContract)) return;
    try {
      await generateProfessionalContractPdf({
        user,
        appointmentId,
        patientId,
        contractNumber: linkedContract?.contractNumber,
        contractStatus: linkedContract?.status,
      });
      showToast('Contrato profissional gerado.');
    } catch (error) {
      showToast(error.message || 'Erro ao gerar PDF.', 'error');
    }
  };

  const handleSendSignature = () => {
    if (!linkedContract?.id || !user) return;
    setSignatureModalOpen(true);
  };

  const handleSignatureSent = () => {
    setHistoryKey((k) => k + 1);
    notifyClinicalBudgetUpdated(patientId);
    onWorkflowRefresh?.();
    showToast('Contrato enviado para assinatura por e-mail.');
  };

  const handleCancelContract = () => {
    if (!linkedContract?.id || !user) return;
    setCancelModalOpen(true);
  };

  const handleConfirmCancelContract = async (payload) => {
    if (!linkedContract?.id || !user) return;
    setCancelBusy(true);
    try {
      await cancelContractSecure(user, linkedContract.id, payload);
      setCancelModalOpen(false);
      setHistoryKey((k) => k + 1);
      showToast('Contrato cancelado e registrado na auditoria.');
    } finally {
      setCancelBusy(false);
    }
  };

  const historyEvents = (contractDetails?.events || [])
    .map((event) => ({ event, label: formatContractEventLabel(event) }))
    .filter((item) => item.label);

  const canCancelAsAdmin = Boolean(
    user && (user.role === 'admin' || user.isMaster || can(user, 'admin_contratos:cancel')),
  );

  const canGenerate = contractAccessible
    && generateReadiness.ready
    && !linkedContract
    && (contractReadiness?.canGenerate ?? false);
  const canEdit = linkedContract?.status === CONTRACT_STATUS.DRAFT;
  const canView = Boolean(linkedContract?.renderedHtml || linkedContract?.editedHtml || contractAccessible);
  const canPreview = contractAccessible && (generateReadiness.ready || linkedContract);
  const canSend = canSendContractForSignature({ contract: linkedContract, budget: effectiveBudget });
  const canCancel = canCancelAsAdmin
    && linkedContract
    && ![CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.CANCELED].includes(linkedContract.status);
  const isCanceled = linkedContract?.status === CONTRACT_STATUS.CANCELED;

  return (
    <>
      <ClinicalStageShell
        title="Contrato"
        description="Formalização jurídica do tratamento aprovado e da condição de pagamento escolhida."
        secondaryActions={(
          <>
            <ClinicalBtn variant="secondary" icon={FileSignature} onClick={openContractFlow} disabled={!canGenerate}>
              Gerar contrato
            </ClinicalBtn>
            {canPreview && !isCanceled ? (
              <ClinicalBtn variant="secondary" icon={FileText} onClick={handlePreviewContract}>
                Pré-visualizar
              </ClinicalBtn>
            ) : null}
            {canPreview && !isCanceled ? (
              <ClinicalBtn variant="secondary" icon={FileText} onClick={handleDownloadPdf}>
                Baixar PDF
              </ClinicalBtn>
            ) : null}
            {canEdit ? (
              <ClinicalBtn variant="secondary" icon={PenLine} onClick={openContractFlow}>
                Editar contrato
              </ClinicalBtn>
            ) : null}
            {canView ? (
              <ClinicalBtn variant="secondary" icon={FileText} onClick={handleViewPdf}>
                Visualizar PDF
              </ClinicalBtn>
            ) : null}
            {canSend ? (
              <ClinicalBtn variant="secondary" icon={Send} onClick={handleSendSignature}>
                Enviar para assinatura
              </ClinicalBtn>
            ) : null}
            {canCancel ? (
              <ClinicalBtn variant="danger" icon={XCircle} onClick={handleCancelContract}>
                Cancelar contrato
              </ClinicalBtn>
            ) : null}
          </>
        )}
      >
        {!contractAccessible && !linkedContract ? (
          <div className="clinical-contract-blocked-card">
            <Lock size={36} strokeWidth={1.25} />
            <h3>Contrato bloqueado</h3>
            <p>Para acessar o contrato, aprove o orçamento e selecione a condição de pagamento escolhida.</p>
            <ul className="clinical-contract-block-reasons">
              {accessBlockReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="clinical-contract-v2">
            {budget?.id ? (
              <ClinicalDocumentPackagePanel
                appointmentId={appointmentId}
                budgetId={budget.id}
                patientId={patientId}
                contractStatus={linkedContract?.status || null}
                compact
              />
            ) : null}
            {!generateReadiness.ready && !linkedContract ? (
              <div className="clinical-contract-canceled-banner" role="status">
                <Lock size={18} aria-hidden />
                <div>
                  <strong>Requisitos pendentes para gerar o contrato</strong>
                  <ul className="clinical-contract-block-reasons">
                    {generateReadiness.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {contractReadiness && !linkedContract ? (
              <ContractReadinessChecklist
                checklist={contractReadiness}
                className="clinical-contract-readiness"
                resolutionContext={resolutionContext}
                onResolve={handleResolvePrerequisite}
              />
            ) : null}
            {isCanceled ? (
              <div className="clinical-contract-canceled-banner" role="status">
                <XCircle size={18} aria-hidden />
                <div>
                  <strong>Contrato cancelado</strong>
                  {linkedContract?.cancelReason ? (
                    <p>Motivo: {linkedContract.cancelReason}</p>
                  ) : null}
                  {linkedContract?.canceledByName ? (
                    <p>Responsável: {linkedContract.canceledByName}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className={`clinical-contract-status-banner tone-${uiStatus.tone}`}>
              <CheckCircle2 size={18} />
              <div>
                <strong>Status do contrato</strong>
                <span>{uiStatus.label}</span>
                {linkedContract?.contractNumber ? (
                  <em>Nº {linkedContract.contractNumber}</em>
                ) : null}
              </div>
            </div>

            <ContractAccordionSection title="Dados do paciente" icon={User} defaultOpen>
              <InfoGrid rows={[
                { label: 'Nome', value: fullPatient?.profile?.full_name || fullPatient?.full_name || '—' },
                {
                  label: 'CPF',
                  value: fullPatient?.profile?.cpf
                    ? formatCpf(String(fullPatient.profile.cpf).replace(/\D/g, ''))
                    : '—',
                },
                { label: 'Telefone', value: formatPhone(fullPatient?.phones) || '—' },
                { label: 'Responsável legal', value: guardianName || '—' },
              ]} />
            </ContractAccordionSection>

            <ContractAccordionSection title="Dados da clínica" icon={Building2}>
              <InfoGrid rows={[
                {
                  label: 'Nome',
                  value: clinic.nomeClinica || clinic.nomeFantasia || clinic.razaoSocial || '—',
                },
                {
                  label: 'CNPJ',
                  value: clinicDoc.cnpj
                    ? formatCnpj(String(clinicDoc.cnpj).replace(/\D/g, ''))
                    : '—',
                },
                { label: 'Endereço', value: formatClinicAddress(db.clinicAddresses) || '—' },
                { label: 'Telefone', value: clinicPhone?.numero ? formatPhone([clinicPhone]) : '—' },
              ]} />
            </ContractAccordionSection>

            <ContractAccordionSection title="Profissional responsável" icon={Stethoscope}>
              <InfoGrid rows={[
                { label: 'Nome', value: professionalName },
                { label: 'CRO', value: professionalCro },
                { label: 'Especialidade', value: professionalSpecialty },
              ]} />
            </ContractAccordionSection>

            <ContractAccordionSection title="Orçamento aprovado" icon={DollarSign} defaultOpen>
              <InfoGrid rows={[
                { label: 'Plano / tratamento', value: budget?.planName || '—' },
                { label: 'Tipo detectado', value: treatmentTypeLabel },
                {
                  label: 'Procedimentos aprovados',
                  value: `${budget?.procedures?.length || 0} procedimento(s)`,
                },
                { label: 'Valor total', value: formatCurrencyBRL(financials.originalValue) },
                { label: 'Desconto', value: formatCurrencyBRL(Math.max(0, financials.originalValue - financials.finalValue)) },
                { label: 'Valor final', value: formatCurrencyBRL(financials.finalValue) },
                {
                  label: 'Forma de pagamento escolhida',
                  value: accepted ? getPaymentOptionTitle(accepted) : '—',
                },
              ]} />
              {paymentPreview?.detailRows?.length ? (
                <div className="clinical-contract-payment-details">
                  {paymentPreview.detailRows.map((row) => (
                    <div key={row.label} className="clinical-contract-payment-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {paymentPreview?.schedule?.length ? (
                <table className="clinical-contract-schedule-table">
                  <thead>
                    <tr>
                      <th>Parcela</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPreview.schedule.map((row) => (
                      <tr key={`${row.label}-${row.dueDate}`}>
                        <td>{row.label}</td>
                        <td>{row.dueDateFormatted}</td>
                        <td>{row.amountFormatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </ContractAccordionSection>

            <ContractAccordionSection title="Cláusulas do contrato" icon={Scale}>
              <div className="clinical-contract-clauses">
                {CLAUSE_GROUPS.map((group) => (
                  <div key={group.title} className="clinical-contract-clause-group">
                    <h4>{group.title}</h4>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </ContractAccordionSection>

            <ContractAccordionSection title="Termos obrigatórios vinculados" icon={Shield}>
              <ul className="clinical-contract-terms-v2">
                {LINKED_TERMS.map((term) => (
                  <li key={term.id}>{term.label}</li>
                ))}
              </ul>
            </ContractAccordionSection>

            <ContractAccordionSection title="Assinaturas" icon={PenLine}>
              <InfoGrid rows={[
                { label: 'Paciente', value: fullPatient?.profile?.full_name || '—' },
                { label: 'Responsável legal', value: guardianName || '—' },
                { label: 'Profissional responsável', value: professionalName },
                { label: 'Testemunhas', value: 'Conforme modelo do contrato' },
              ]} />
            </ContractAccordionSection>

            {historyEvents.length ? (
              <ContractAccordionSection title="Histórico e auditoria" icon={History}>
                <ul className="clinical-contract-history">
                  {historyEvents.map(({ event, label }) => (
                    <li key={event.id}>
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString('pt-BR')}
                      </time>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </ContractAccordionSection>
            ) : null}
          </div>
        )}
      </ClinicalStageShell>

      <GenerateContractModal
        open={contractModalOpen}
        onOpenChange={setContractModalOpen}
        user={user}
        patientId={patientId || ''}
        quoteSource="clinical_budget"
        quoteId={appointmentId}
        budgetId={budget?.id || null}
        flow="clinical"
        onSuccess={(contract) => {
          if (contract?.id) {
            linkFinancingToClinicalContract(user, appointmentId, contract.id);
          }
          markBudgetContractGenerated(user, appointmentId);
          setHistoryKey((k) => k + 1);
          notifyClinicalBudgetUpdated(patientId);
          onWorkflowRefresh?.();
        }}
      />

      <SendContractSignatureModal
        open={signatureModalOpen}
        onOpenChange={setSignatureModalOpen}
        user={user}
        contract={linkedContract}
        budget={budget}
        professional={professional}
        treatmentName={treatmentTypeLabel}
        onSent={handleSignatureSent}
      />

      <CancelContractSecureModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        busy={cancelBusy}
        onConfirm={handleConfirmCancelContract}
      />

      <ContractBlockModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        pendingFields={pendingCriticalFields}
        fieldsMap={PENDING_FIELDS_MAP}
        onFillPatient={() => {
          setBlockModalOpen(false);
          if (!patientId) return;
          handleResolvePrerequisite({
            group: 'paciente',
            destination: buildPrerequisiteDestination('paciente', {
              patientId,
              appointmentId,
              budgetId: budget?.id || viewBudgetId || null,
              contractId: linkedContract?.id || viewContractId || null,
              items: [{ label: 'Cadastro pendente' }],
            }),
          });
        }}
      />

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
