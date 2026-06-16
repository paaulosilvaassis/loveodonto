import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
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
  createNewBudgetForAppointment,
} from '../../services/clinicalBudgetLockService.js';
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
} from './budget/budgetUtils.js';
import { generateBudgetPdf } from './budget/generateBudgetPdf.js';
import { buildFinancingHistoryPayload } from './budget/budgetFinancingUtils.js';
import {
  buildPaymentOptionSnapshot,
  PAYMENT_PRESENTATION_STATUS,
} from './budget/budgetPaymentPdfUtils.js';
import { DEFAULT_PAYMENT_OPTIONS } from './clinicalAppointmentConfig.js';
import { CreateNewBudgetModal } from './budget/CreateNewBudgetModal.jsx';

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
  user,
  appointment,
  patient,
  onNavigateToContract,
  onNavigateToPlanning,
}) {
  const [budget, setBudget] = useState(null);
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

  const db = loadDb();

  useEffect(() => {
    const budgetData = getBudget(appointmentId);
    const clinicalData = getClinicalData(appointmentId);
    const planned = clinicalData?.plannedProcedures || [];

    if (budgetData) {
      const procedures = budgetData.procedures?.length
        ? budgetData.procedures
        : mapProceduresFromPlanning(planned);
      const original = calcPlannedValue(procedures);
      setBudget({
        ...budgetData,
        procedures,
        validityDate: budgetData.validityDate || defaultValidityDate(),
        paymentOptions: budgetData.paymentOptions?.length
          ? budgetData.paymentOptions
          : DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: original })),
      });
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
  }, [appointmentId, appointment?.professionalId, user?.id]);

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

  const lockCtx = useMemo(
    () => getBudgetLockContext(appointmentId),
    [appointmentId, budget?.status, budget?.id, historyKey],
  );

  const isLocked = lockCtx.isLocked;
  const isTerminalStatus =
    budget?.status === BUDGET_STATUS.REPROVADO
    || budget?.status === BUDGET_STATUS.CANCELADO;
  const isEditBlocked = isLocked || isTerminalStatus;

  const nextSteps = useMemo(
    () => resolveNextSteps(budget, financials, lockCtx),
    [budget, financials, lockCtx],
  );

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

  const handlePaymentPresented = (opt, nextBudget) => {
    persist(nextBudget);
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
    const snapshot = buildPaymentOptionSnapshot(opt, financials.originalValue, user);
    const next = {
      ...budget,
      status: budget.status === BUDGET_STATUS.APROVADO ? budget.status : BUDGET_STATUS.NEGOCIACAO,
      paymentOptions: (budget.paymentOptions || []).map((item) => {
        if (item.id !== opt.id) {
          return { ...item, accepted: false };
        }
        return {
          ...item,
          accepted: true,
          presentToPatient: true,
          presentationStatus: PAYMENT_PRESENTATION_STATUS.ESCOLHIDA,
          presentedAt: item.presentedAt || new Date().toISOString(),
          presentedBy: user?.id || null,
          presentedByName: user?.name || user?.nome || null,
          presentationSnapshot: snapshot,
        };
      }),
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
    const accepted = getAcceptedOption(budget);
    if (!accepted) {
      showToast('Marque a condição escolhida pelo paciente antes de aprovar.', 'error');
      return;
    }
    setApprovalOpen(true);
  };

  const handleConfirmApprove = () => {
    if (!budget || !user) return;
    setApproving(true);
    try {
      saveBudget(user, appointmentId, budget);
      updateBudgetStatus(user, appointmentId, BUDGET_STATUS.APROVADO);
      const approvedBudget = { ...budget, status: BUDGET_STATUS.APROVADO };
      setBudget(approvedBudget);

      const patientId = patient?.id || appointment?.patientId;
      const { financing } = processApprovedBudgetFinance(user, {
        appointmentId,
        patientId,
        patient,
        budget: approvedBudget,
        professional: appointment?.professionalId ? { id: appointment.professionalId } : null,
      });

      if (financing?.id) {
        const withFinancing = { ...approvedBudget, financingId: financing.id };
        saveBudget(user, appointmentId, withFinancing);
        setBudget(withFinancing);
      }

      setApprovalOpen(false);
      refreshHistory();

      const isFinancing = financials.accepted?.type === 'financiamento';
      showToast(
        isFinancing
          ? 'Orçamento aprovado! Financiamento registrado em Financeiro > Financiamentos.'
          : 'Orçamento aprovado! Financeiro e contrato liberados.',
      );

      logClinicalEvent(appointmentId, 'budget_approved', {
        budgetId: budget.id,
        totalValue: financials.finalValue,
        financingId: financing?.id || null,
      }, user.id);
    } catch (error) {
      showToast(`Erro ao aprovar: ${error.message}`, 'error');
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

  if (!budget) return null;

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
        hasDocuments={(budget.documents?.length || 0) > 0}
        hasActiveContract={lockCtx.hasActiveContract}
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
      />

      {isLocked && lockCtx.lockMessage ? (
        <div className="clinical-budget-locked-banner" role="status">
          <Lock size={18} aria-hidden />
          <p>{lockCtx.lockMessage}</p>
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
            readOnly={isEditBlocked}
            user={user}
          />

          <section className="budget-tab-notes">
            <h3>Observações clínicas e comerciais</h3>
            <textarea
              rows={3}
              value={budget.commercialNotes || ''}
              onChange={(e) => patchBudget({ commercialNotes: e.target.value })}
              onBlur={(e) => {
                if (!isEditBlocked) persist({ ...budget, commercialNotes: e.target.value });
              }}
              disabled={isEditBlocked}
              placeholder="Registre objeções, preferências do paciente e acordos verbais…"
            />
          </section>
        </div>

        <BudgetSummaryPanel
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
          readOnly={isEditBlocked}
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
        readOnly={isEditBlocked}
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

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
