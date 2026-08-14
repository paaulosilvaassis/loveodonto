import { useEffect, useMemo, useState } from 'react';
import { Lock, DoorClosed } from 'lucide-react';
import { loadDb } from '../../db/index.js';
import { createId } from '../../services/helpers.js';
import {
  saveBudget,
  getBudget,
  getClinicalData,
  updateBudgetStatus,
  logClinicalEvent,
  getClinicalEvents,
  BUDGET_STATUS,
} from '../../services/clinicalService.js';
import {
  getBudgetLockContext,
  getBudgetLockContextForBudget,
  createNewBudgetForAppointment,
  resolveClinicalBudgetIdentity,
} from '../../services/clinicalBudgetLockService.js';
import {
  resolveBudgetForView,
  validateBudgetConsistency,
  getActiveClinicalBudget,
  BUDGET_CONSISTENCY_ALERT,
} from '../../services/budgetNavigationService.js';
import { notifyClinicalBudgetUpdated } from '../../services/clinicalBudgetApprovedService.js';
import { processApprovedBudgetFinance } from '../../services/clinicalBudgetFinance.js';
import { BudgetPaymentConditions } from './budget/BudgetPaymentConditions.jsx';
import { BudgetSummaryPanel } from './budget/BudgetSummaryPanel.jsx';
import { BudgetPremiumHeader } from './budget/BudgetPremiumHeader.jsx';
import { BudgetCommercialFunnel } from './budget/BudgetCommercialFunnel.jsx';
import { BudgetProceduresDetailModal } from './budget/BudgetProceduresDetailModal.jsx';
import { BudgetApprovalModal } from './budget/BudgetApprovalModal.jsx';
import { BudgetHistoryModal } from './budget/BudgetHistoryModal.jsx';
import { BudgetValidityModal } from './budget/BudgetValidityModal.jsx';
import { getPaymentOptionTitle } from './budget/budgetEventLabels.js';
import { resolveNextSteps } from './budget/budgetCommercialUtils.js';
import {
  calcPlannedValue,
  resolveBudgetFinancials,
  getAcceptedOption,
  formatPaymentOptionLabel,
} from './budget/budgetUtils.js';
import { validateBudgetForApproval } from './budget/budgetCommercialUtils.js';
import { resolveBudgetReadOnlyState } from './budget/budgetEditAccessUtils.js';
import { getChosenPaymentOption } from './contract/contractAccessUtils.js';
import { generateBudgetPdf } from './budget/generateBudgetPdf.js';
import { buildFinancingHistoryPayload } from './budget/budgetFinancingUtils.js';
import { choosePaymentCondition } from './budget/budgetPaymentPresentationService.js';
import { BUDGET_STATUS_BADGES, DEFAULT_PAYMENT_OPTIONS } from './clinicalAppointmentConfig.js';
import { ClinicalBtn } from './ClinicalStageShell.jsx';
import { CreateNewBudgetModal } from './budget/CreateNewBudgetModal.jsx';
import { FinishAppointmentModal } from './budget/FinishAppointmentModal.jsx';
import { ClinicalGuideModal } from './guide/ClinicalGuideModal.jsx';
import { ClinicalGuideMatchBanner } from './guide/ClinicalGuideMatchBanner.jsx';
import { matchGuidesForProcedures } from '../../services/clinicalGuide/clinicalGuideService.js';
import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import {
  APPOINTMENT_CLOSE_REASON,
  closeClinicalAppointment,
  resolveClinicalFinishReadiness,
} from '../../services/clinicalAppointmentCloseService.js';

function defaultValidityDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function mapProceduresFromPlanning(list) {
  return list.map((proc) => {
    const qty = Number(proc.quantity || 1);
    const unit = Number(proc.unitValue || 0);
    return {
      id: proc.id || createId('proc'),
      procedureId: proc.procedureId,
      code: proc.code,
      category: proc.category,
      name: proc.name,
      tooth: proc.tooth || '',
      region: proc.region || '',
      stage: proc.stage,
      quantity: qty,
      unitValue: unit,
      discount: Number(proc.discount || 0),
      totalValue: Number(proc.totalValue ?? qty * unit - Number(proc.discount || 0)),
      observations: proc.notes || '',
    };
  });
}

export function ClinicalBudgetSection({
  appointmentId,
  viewBudgetId = null,
  user,
  appointment,
  patient,
  onNavigateToContract,
  onNavigateToPlanning,
  onWorkflowRefresh,
  onAppointmentClosed,
  onActiveBudgetChange,
}) {
  const [budget, setBudget] = useState(null);
  const [consistencyAlert, setConsistencyAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [proceduresModalOpen, setProceduresModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [validityModalOpen, setValidityModalOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [newBudgetModalOpen, setNewBudgetModalOpen] = useState(false);
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishingAppointment, setFinishingAppointment] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guideInitialId, setGuideInitialId] = useState(null);

  const db = loadDb();

  useEffect(() => {
    const { budget: budgetData, isHistoricalView: historical } = resolveBudgetForView(
      appointmentId,
      viewBudgetId,
    );
    const clinicalData = getClinicalData(appointmentId);
    const planned = clinicalData?.plannedProcedures || [];

    if (budgetData) {
      const procedures = budgetData.procedures?.length
        ? budgetData.procedures
        : (historical ? [] : mapProceduresFromPlanning(planned));
      const original = calcPlannedValue(procedures);
      const nextBudget = {
        ...budgetData,
        procedures,
        validityDate: budgetData.validityDate || defaultValidityDate(),
        paymentOptions: budgetData.paymentOptions?.length
          ? budgetData.paymentOptions
          : DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: original })),
      };
      setBudget(nextBudget);

      const consistency = validateBudgetConsistency(
        nextBudget,
        appointmentId,
        patient?.id || clinicalData?.patientId,
      );
      setConsistencyAlert(consistency.isConsistent ? null : BUDGET_CONSISTENCY_ALERT);
      return;
    }

    if (viewBudgetId) {
      setBudget(null);
      setConsistencyAlert(null);
      return;
    }

    const procedures = mapProceduresFromPlanning(planned);
    const original = calcPlannedValue(procedures);
    setBudget({
      status: BUDGET_STATUS.RASCUNHO,
      planName: clinicalData?.planName || '',
      procedures,
      commercialNotes: '',
      paymentOptions: DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: original })),
      discount: 0,
      interest: 0,
      validityDate: defaultValidityDate(),
      professionalId: appointment?.professionalId || null,
      createdAt: new Date().toISOString(),
      createdBy: user?.id || null,
    });
    setConsistencyAlert(null);
  }, [appointmentId, viewBudgetId, appointment?.professionalId, user?.id, patient?.id]);

  const financials = useMemo(
    () => resolveBudgetFinancials(budget || { procedures: [] }),
    [budget],
  );

  const budgetEvents = useMemo(() => {
    const events = getClinicalEvents(appointmentId) || [];
    return events
      .filter((e) => e.type.includes('budget'))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [appointmentId, historyKey, budget?.status]);

  const lockCtx = useMemo(() => {
    if (budget) {
      return getBudgetLockContextForBudget(appointmentId, budget);
    }
    return getBudgetLockContext(appointmentId);
  }, [appointmentId, budget, historyKey]);

  const viewAccess = useMemo(
    () => resolveBudgetReadOnlyState(budget, lockCtx),
    [budget, lockCtx],
  );

  const { isEditBlocked, isHistoricalView, isApprovedView, lockMessage: accessLockMessage } = viewAccess;
  const isLocked = isEditBlocked;
  const isCommercialReadOnly = viewAccess.isReadOnly;
  const blockedMessage = lockCtx.lockMessage || accessLockMessage;
  const chosenPaymentOption = useMemo(
    () => getChosenPaymentOption(budget),
    [budget],
  );

  const viewedBudgetIdentity = useMemo(
    () => resolveClinicalBudgetIdentity({
      appointmentId,
      budgetId: budget?.id || viewBudgetId || null,
    }),
    [appointmentId, budget?.id, viewBudgetId, historyKey],
  );

  const activeBudgetIdentity = useMemo(
    () => resolveClinicalBudgetIdentity({ appointmentId }),
    [appointmentId, historyKey],
  );

  const budgetDisplayNumber = viewedBudgetIdentity?.displayNumber || '';
  const activeBudgetDisplayNumber = activeBudgetIdentity?.displayNumber || '';
  const budgetStatusLabel = BUDGET_STATUS_BADGES.find((item) => item.value === budget?.status)?.label
    || null;

  const showGoToActiveBudget = isHistoricalView
    && activeBudgetIdentity?.budgetId
    && activeBudgetIdentity.budgetId !== budget?.id;

  const nextSteps = useMemo(
    () => resolveNextSteps(budget, financials, lockCtx),
    [budget, financials, lockCtx],
  );

  const matchedGuides = useMemo(() => {
    if (!budget?.procedures?.length) return [];
    const names = budget.procedures.map((p) => p.name || p.description || '').filter(Boolean);
    return matchGuidesForProcedures(user, names);
  }, [budget?.procedures, user]);

  const openClinicalGuide = (guideId = null) => {
    setGuideInitialId(guideId);
    setGuideModalOpen(true);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 5000 : 3000);
  };

  const refreshHistory = () => setHistoryKey((k) => k + 1);

  const patchBudget = (patch) => setBudget((prev) => ({ ...prev, ...patch }));

  const persist = (nextBudget) => {
    saveBudget(user, appointmentId, nextBudget);
    setBudget(nextBudget);
    refreshHistory();
  };

  const handleSave = async () => {
    if (!user || !budget) return;
    setSaving(true);
    try {
      persist(budget);
      showToast('Orçamento salvo.');
    } catch (error) {
      showToast(`Erro ao salvar: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendToPatient = () => {
    if (!budget || !user) return;
    try {
      const next = { ...budget, status: BUDGET_STATUS.ENVIADO };
      persist(next);
      updateBudgetStatus(user, appointmentId, BUDGET_STATUS.ENVIADO);
      showToast('Orçamento enviado ao paciente.');
      logClinicalEvent(appointmentId, 'budget_sent', { budgetId: budget.id }, user.id);
    } catch (error) {
      showToast(`Erro: ${error.message}`, 'error');
    }
  };

  const handleRejectBudget = () => {
    if (!budget || !user) return;
    try {
      const next = { ...budget, status: BUDGET_STATUS.REPROVADO };
      persist(next);
      updateBudgetStatus(user, appointmentId, BUDGET_STATUS.REPROVADO);
      showToast('Orçamento reprovado.');
      logClinicalEvent(appointmentId, 'budget_rejected', { budgetId: budget.id }, user.id);
    } catch (error) {
      showToast(`Erro: ${error.message}`, 'error');
    }
  };

  const handlePaymentPresented = (opt, nextBudget, meta = {}) => {
    persist(nextBudget);
    if (meta.action === 'unpresented') {
      return;
    }
    logClinicalEvent(appointmentId, 'budget_payment_presented', {
      label: getPaymentOptionTitle(opt),
      optionId: opt.id,
      ...(opt.type === 'financiamento'
        ? buildFinancingHistoryPayload(opt, financials.originalValue)
        : {}),
    }, user?.id);
    showToast('Condição apresentada e salva no orçamento.');
  };

  const handlePaymentChosen = (opt) => {
    if (!budget?.id || !appointmentId) {
      showToast('Orçamento ativo deste atendimento não encontrado.', 'error');
      return;
    }
    const active = getActiveClinicalBudget(appointmentId);
    if (!active?.id || active.id !== budget.id) {
      showToast('Orçamento ativo deste atendimento não encontrado.', 'error');
      return;
    }

    const result = choosePaymentCondition(budget, opt.id, {
      originalValue: financials.originalValue,
      user,
      appointmentId,
      expectedBudgetId: budget.id,
    });
    if (!result.ok) {
      const message = result.errors?.[0] || result.error || 'Não foi possível marcar a condição.';
      showToast(message, 'error');
      return;
    }

    const next = {
      ...result.nextBudget,
      status: budget.status === BUDGET_STATUS.APROVADO ? budget.status : BUDGET_STATUS.NEGOCIACAO,
    };
    persist(next);
    logClinicalEvent(appointmentId, 'budget_payment_chosen', {
      label: getPaymentOptionTitle(opt),
      optionId: opt.id,
      ...(opt.type === 'financiamento'
        ? buildFinancingHistoryPayload(opt, financials.originalValue)
        : {}),
    }, user?.id);
    showToast('Condição marcada como escolhida pelo paciente.');
  };

  const handleApproveClick = () => {
    const errors = validateBudgetForApproval({ budget, financials, patient, appointment });
    if (errors.length) {
      showToast(`Não foi possível aprovar o orçamento: ${errors[0]}`, 'error');
      return;
    }
    setApprovalOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!budget || !user) return;

    const errors = validateBudgetForApproval({ budget, financials, patient, appointment });
    if (errors.length) {
      showToast(`Não foi possível aprovar o orçamento: ${errors[0]}`, 'error');
      setApprovalOpen(false);
      return;
    }

    const accepted = financials.accepted || getAcceptedOption(budget);
    const patientId = patient?.id || appointment?.patientId;

    setApproving(true);
    try {
      const budgetToSave = {
        ...budget,
        professionalId: budget.professionalId || appointment?.professionalId || null,
        id: budget.id || createId('budget'),
      };

      saveBudget(user, appointmentId, budgetToSave);
      updateBudgetStatus(user, appointmentId, BUDGET_STATUS.APROVADO);

      const approvedBudget = {
        ...budgetToSave,
        status: BUDGET_STATUS.APROVADO,
        approvedAt: new Date().toISOString(),
        approvedBy: user.id,
      };

      const { receivables, financing } = processApprovedBudgetFinance(user, {
        appointmentId,
        patientId,
        patient,
        budget: approvedBudget,
        professional: appointment?.professionalId ? { id: appointment.professionalId } : null,
      });

      let nextBudget = approvedBudget;
      if (financing?.id) {
        nextBudget = { ...approvedBudget, financingId: financing.id };
      }

      saveBudget(user, appointmentId, nextBudget, { skipLockCheck: true });
      setBudget(nextBudget);
      setApprovalOpen(false);
      refreshHistory();
      onActiveBudgetChange?.(nextBudget.id);

      const isFinancing = accepted?.type === 'financiamento';
      if (isFinancing && financing?.id) {
        showToast('Orçamento aprovado com sucesso. Financiamento registrado em Financeiro > Financiamentos.');
      } else if (receivables?.length) {
        showToast('Orçamento aprovado com sucesso. Financeiro gerado — contrato liberado.');
      } else {
        showToast('Orçamento aprovado com sucesso.');
      }

      logClinicalEvent(appointmentId, 'budget_approved', {
        budgetId: nextBudget.id,
        totalValue: financials.finalValue,
        paymentOptionId: accepted?.id || null,
        paymentLabel: formatPaymentOptionLabel(accepted),
        financingId: financing?.id || null,
        receivableCount: receivables?.length || 0,
      }, user.id);
      notifyClinicalBudgetUpdated(patientId);
      onWorkflowRefresh?.();
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.debug('handleConfirmApprove:', error);
      }
      showToast(`Não foi possível aprovar o orçamento: ${error.message}`, 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!budget || !patient || !user) {
      showToast('Dados insuficientes para gerar PDF.', 'error');
      return;
    }
    try {
      saveBudget(user, appointmentId, budget);
      const freshBudget = getBudget(appointmentId) || budget;
      const freshFinancials = resolveBudgetFinancials(freshBudget);
      const nextBudget = await generateBudgetPdf({
        user,
        appointmentId,
        budget: freshBudget,
        patient,
        appointment,
        professional: appointment?.professionalId
          ? db.collaborators?.find((c) => c.id === appointment.professionalId)
          : null,
        db,
        financials: freshFinancials,
      });
      if (nextBudget) {
        setBudget(nextBudget);
        refreshHistory();
      }
      showToast('PDF gerado com sucesso!');
    } catch (error) {
      showToast(`Erro ao gerar PDF: ${error.message}`, 'error');
    }
  };

  const handleCreateNewBudget = async () => {
    if (!user) return;
    setCreatingBudget(true);
    try {
      const created = createNewBudgetForAppointment(user, appointmentId);
      setBudget({
        ...created,
        validityDate: defaultValidityDate(),
        paymentOptions: created.paymentOptions?.length
          ? created.paymentOptions
          : DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: 0 })),
      });
      setNewBudgetModalOpen(false);
      refreshHistory();
      onActiveBudgetChange?.(created.id);
      showToast('Novo orçamento criado. Planejamento reiniciado do zero.');
      if (typeof onNavigateToPlanning === 'function') {
        onNavigateToPlanning();
      }
    } catch (error) {
      showToast(error.message || 'Erro ao criar novo orçamento.', 'error');
    } finally {
      setCreatingBudget(false);
    }
  };

  const handlePrintLatestDocument = () => {
    const latest = budget?.documents?.[budget.documents.length - 1];
    if (!latest?.htmlContent) {
      showToast('Gere ou baixe o PDF antes de imprimir.', 'error');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(latest.htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleViewContract = () => {
    if (typeof onNavigateToContract === 'function') {
      onNavigateToContract();
      return;
    }
    showToast('Abra a aba Contrato para visualizar o documento.', 'error');
  };

  const canFinishAppointment = appointment?.status === APPOINTMENT_STATUS.EM_ATENDIMENTO
    && !isHistoricalView;
  const finishReadiness = resolveClinicalFinishReadiness({
    appointment,
    budget,
    appointmentId,
  });

  const handleFinishAppointmentConfirm = async ({ reason, notes }) => {
    if (!user || !appointmentId) return;
    setFinishingAppointment(true);
    try {
      if (!isEditBlocked && budget && !finishReadiness.legallyFrozen) {
        saveBudget(user, appointmentId, budget);
      }
      const result = closeClinicalAppointment(user, {
        appointmentId,
        patientId: patient?.id || appointment?.patientId,
        budgetId: budget?.id || null,
        reason,
        notes,
      });
      setFinishModalOpen(false);
      refreshHistory();
      onWorkflowRefresh?.();
      if (patient?.id || appointment?.patientId) {
        notifyClinicalBudgetUpdated(patient?.id || appointment.patientId);
      }
      if (reason === APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED
        && result.budgetStatus !== BUDGET_STATUS.APROVADO
        && result.budgetStatus !== BUDGET_STATUS.CONTRATO_GERADO) {
        showToast(
          'Atendimento encerrado. Use "Aprovar orçamento" quando o paciente confirmar formalmente.',
          'success',
        );
      } else if (result.followUp) {
        showToast(
          `Atendimento encerrado. Follow-up agendado para ${result.followUp.dueInDays} dias.`,
          'success',
        );
      } else {
        showToast('Atendimento encerrado com sucesso.', 'success');
      }
      if (typeof onAppointmentClosed === 'function') {
        onAppointmentClosed();
      }
    } catch (error) {
      showToast(error?.message || 'Não foi possível encerrar o atendimento.', 'error');
    } finally {
      setFinishingAppointment(false);
    }
  };

  const handleDownloadDocument = (doc) => {
    if (!doc?.htmlContent) {
      showToast('Documento indisponível. Gere um novo PDF.', 'error');
      return;
    }
    const blob = new Blob([doc.htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.fileName || 'orcamento.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!budget) {
    if (viewBudgetId) {
      return (
        <div className="clinical-inline-error" role="alert">
          Orçamento não encontrado. O identificador informado pode estar incorreto ou desatualizado.
        </div>
      );
    }
    return null;
  }

  const patientName =
    patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente';

  const professional = appointment?.professionalId
    ? db.collaborators?.find((c) => c.id === appointment.professionalId)
    : null;

  const professionalName =
    professional?.nomeCompleto || professional?.name || professional?.apelido || '—';

  return (
    <div className="budget-premium-shell">
      <BudgetPremiumHeader
        isEditBlocked={isEditBlocked}
        isLocked={isLocked}
        isApprovedView={isApprovedView}
        hasChosenCondition={Boolean(chosenPaymentOption)}
        hasDocuments={(budget.documents?.length || 0) > 0}
        hasActiveContract={lockCtx.hasActiveContract}
        displayNumber={budgetDisplayNumber}
        statusLabel={budgetStatusLabel || ''}
        budgetStatus={budget.status}
        saving={saving}
        onSave={handleSave}
        onSend={handleSendToPatient}
        onReject={handleRejectBudget}
        onGeneratePdf={handleGeneratePDF}
        onPrint={handlePrintLatestDocument}
        onViewContract={handleViewContract}
        onCreateNew={() => setNewBudgetModalOpen(true)}
        onApprove={handleApproveClick}
        onFinishAppointment={() => setFinishModalOpen(true)}
        canFinishAppointment={canFinishAppointment}
        onNavigateToContract={onNavigateToContract}
        onOpenClinicalGuide={() => openClinicalGuide()}
      />

      <ClinicalGuideMatchBanner
        matches={matchedGuides}
        onOpenGuide={(guideId) => openClinicalGuide(guideId)}
      />

      {isHistoricalView ? (
        <div className="clinical-budget-locked-banner" role="status">
          <Lock size={18} aria-hidden />
          <p>
            Visualizando orçamento
            {' '}
            {budgetDisplayNumber}
            {' '}
            — somente leitura. Para nova negociação, crie um novo orçamento.
          </p>
          {showGoToActiveBudget && typeof onActiveBudgetChange === 'function' ? (
            <ClinicalBtn
              variant="primary"
              size="sm"
              onClick={() => onActiveBudgetChange(activeBudgetIdentity.budgetId)}
            >
              Ir para orçamento atual
              {activeBudgetDisplayNumber ? ` (${activeBudgetDisplayNumber})` : ''}
            </ClinicalBtn>
          ) : null}
        </div>
      ) : null}

      {!isEditBlocked && !isApprovedView ? (
        <div className="clinical-budget-info-banner" role="status">
          <p>
            {budgetDisplayNumber ? `Orçamento ${budgetDisplayNumber}` : 'Orçamento'}
            {budgetStatusLabel ? ` • ${budgetStatusLabel}` : ' em negociação'}
            . Você pode apresentar condições, marcar a condição escolhida e aprovar quando o paciente aceitar.
          </p>
        </div>
      ) : null}

      {isApprovedView ? (
        <div className="clinical-budget-approved-banner" role="status">
          <p>
            Orçamento aprovado com sucesso. As condições comerciais estão protegidas — acesse a aba
            {' '}
            <strong>Contrato</strong>
            {' '}
            para gerar o documento.
          </p>
          {typeof onNavigateToContract === 'function' ? (
            <ClinicalBtn variant="primary" size="sm" onClick={onNavigateToContract}>
              Ir para Contrato
            </ClinicalBtn>
          ) : null}
        </div>
      ) : null}

      {canFinishAppointment ? (
        <div className="clinical-budget-session-bar" role="region" aria-label="Encerramento do atendimento">
          <div className="clinical-budget-session-bar-text">
            <strong>Atendimento em andamento</strong>
            <p>
              O orçamento permanece salvo. Finalize o atendimento agora e retome depois pela Central do Paciente para concluir a aprovação.
            </p>
          </div>
          <ClinicalBtn
            variant="secondary"
            size="sm"
            icon={DoorClosed}
            className="budget-finish-appointment-btn"
            onClick={() => setFinishModalOpen(true)}
            disabled={finishingAppointment}
          >
            {finishingAppointment ? 'Finalizando…' : 'Finalizar atendimento'}
          </ClinicalBtn>
        </div>
      ) : null}

      {consistencyAlert ? (
        <div className="clinical-inline-error" role="alert">
          {consistencyAlert}
        </div>
      ) : null}

      {isEditBlocked && !isHistoricalView ? (
        <div className="clinical-budget-locked-banner" role="status">
          <Lock size={18} aria-hidden />
          <p>{blockedMessage}</p>
        </div>
      ) : null}

      <BudgetCommercialFunnel
        budget={budget}
        financials={financials}
        lockCtx={lockCtx}
      />

      <div className="budget-tab-layout budget-tab-layout--premium">
        <div className="budget-tab-main">
          <BudgetPaymentConditions
            budget={budget}
            setBudget={setBudget}
            originalValue={financials.originalValue}
            onPresent={handlePaymentPresented}
            onChoose={handlePaymentChosen}
            readOnly={isCommercialReadOnly}
            user={user}
          />

          <section className="budget-tab-notes">
            <h3>Observações clínicas e comerciais</h3>
            <textarea
              rows={3}
              value={budget.commercialNotes || ''}
              onChange={(e) => patchBudget({ commercialNotes: e.target.value })}
              onBlur={(e) => {
                if (!isCommercialReadOnly) persist({ ...budget, commercialNotes: e.target.value });
              }}
              disabled={isCommercialReadOnly}
              placeholder="Registre objeções, preferências do paciente e acordos verbais…"
            />
          </section>
        </div>

        <BudgetSummaryPanel
          displayNumber={budgetDisplayNumber}
          patientName={patientName}
          planName={budget.planName}
          professionalName={professionalName}
          procedureCount={budget.procedures?.length || 0}
          originalValue={financials.originalValue}
          discount={financials.discount}
          finalValue={financials.finalValue}
          validityDate={budget.validityDate}
          status={budget.status}
          chosenOption={financials.accepted}
          documents={budget.documents || []}
          events={budgetEvents}
          nextSteps={nextSteps}
          onViewProcedures={() => setProceduresModalOpen(true)}
          onEditValidity={() => setValidityModalOpen(true)}
          onGeneratePdf={handleGeneratePDF}
          onDownloadDocument={handleDownloadDocument}
          onOpenFullHistory={() => setHistoryModalOpen(true)}
          readOnly={isCommercialReadOnly}
        />
      </div>

      <BudgetProceduresDetailModal
        open={proceduresModalOpen}
        onClose={() => setProceduresModalOpen(false)}
        procedures={budget.procedures || []}
      />

      <BudgetHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        events={budgetEvents}
      />

      <BudgetValidityModal
        open={validityModalOpen}
        onClose={() => setValidityModalOpen(false)}
        value={budget.validityDate}
        readOnly={isCommercialReadOnly}
        onSave={(validityDate) => {
          patchBudget({ validityDate });
          persist({ ...budget, validityDate });
          showToast('Validade atualizada.');
        }}
      />

      <BudgetApprovalModal
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        onConfirm={handleConfirmApprove}
        patientName={patientName}
        planName={budget.planName}
        finalValue={financials.finalValue}
        acceptedOption={financials.accepted}
        confirming={approving}
      />

      <CreateNewBudgetModal
        open={newBudgetModalOpen}
        onOpenChange={setNewBudgetModalOpen}
        busy={creatingBudget}
        onConfirm={handleCreateNewBudget}
      />

      <FinishAppointmentModal
        open={finishModalOpen}
        onClose={() => setFinishModalOpen(false)}
        onConfirm={handleFinishAppointmentConfirm}
        confirming={finishingAppointment}
        defaultReason={finishReadiness.defaultReason}
        disabledReasons={finishReadiness.disabledReasons}
        description={
          finishReadiness.legallyFrozen
            ? 'O orçamento e o contrato históricos permanecem intactos. Escolha o motivo oficial do encerramento.'
            : undefined
        }
      />

      <ClinicalGuideModal
        open={guideModalOpen}
        onOpenChange={setGuideModalOpen}
        user={user}
        initialGuideId={guideInitialId}
        onAddToBudget={(guide) => {
          showToast(`Guia "${guide.title}" vinculado ao contexto do orçamento.`);
        }}
      />

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
