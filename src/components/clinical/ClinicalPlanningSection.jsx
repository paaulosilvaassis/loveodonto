import { useEffect, useMemo, useRef, useState } from 'react';

import { Calendar, DollarSign, Plus, ClipboardList } from 'lucide-react';

import ProcedureSelectorModal from '../ProcedureSelectorModal.jsx';

import { AnamnesisAttachModal } from './AnamnesisAttachModal.jsx';

import { ClinicalStageShell, ClinicalBlock, ClinicalBtn } from './ClinicalStageShell.jsx';

import { PlanningKpiBar } from './planning/PlanningKpiBar.jsx';

import { PlanningProcedureRow } from './planning/PlanningProcedureRow.jsx';

import { PlanningSummaryPanel } from './planning/PlanningSummaryPanel.jsx';

import { PlanningRemoveProcedureModal } from './planning/PlanningRemoveProcedureModal.jsx';

import {
  buildPlanningSummary,
  EMPTY_PLANNING_SUMMARY,
  calcItemDiscount,
  calcItemTotal,
} from './planning/planningUtils.js';

import { createId } from '../../services/helpers.js';

import {

  addPlannedProcedure,

  updatePlannedProcedure,

  getClinicalData,

  saveBudget,

  logClinicalEvent,

  BUDGET_STATUS,

  savePlanningAnamnesisKeys,

} from '../../services/clinicalService.js';

import {
  getPlanningRemoveContext,
  removePlannedProcedureWithSync,
} from '../../services/clinicalPlanningRemoveService.js';
import {
  getPreviousBudgetImportContext,
  importProceduresFromPreviousBudget,
} from '../../services/clinicalBudgetLockService.js';
import {
  resolveBudgetForView,
  mapBudgetProceduresToPlanningView,
} from '../../services/budgetNavigationService.js';
import { PreviousBudgetImportCard } from './planning/PreviousBudgetImportCard.jsx';
import { AppointmentBudgetHistoryModal } from './planning/AppointmentBudgetHistoryModal.jsx';


export function ClinicalPlanningSection({

  appointmentId,

  viewBudgetId = null,

  user,

  appointment,

  patient,

  onNavigateToOrcamento,

  onShowToast,

}) {

  const [plannedProcedures, setPlannedProcedures] = useState([]);

  const [showSelector, setShowSelector] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const [anamnesisModalOpen, setAnamnesisModalOpen] = useState(false);

  const [attachedAnamnesis, setAttachedAnamnesis] = useState([]);

  const [newItemIds, setNewItemIds] = useState([]);

  const [removeModal, setRemoveModal] = useState({
    open: false,
    mode: 'confirm',
    plannedId: null,
    procedureName: '',
    isApprovedBudget: false,
    blockReason: 'signed',
  });

  const [removeBusy, setRemoveBusy] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [planningRefreshKey, setPlanningRefreshKey] = useState(0);

  const prevCountRef = useRef(0);

  const isInitialLoadRef = useRef(true);



  const loadPlanned = () => {

    if (viewBudgetId) {
      const { budget } = resolveBudgetForView(appointmentId, viewBudgetId);
      if (budget?.procedures?.length) {
        const list = mapBudgetProceduresToPlanningView(budget.procedures, budget.createdAt);
        setAttachedAnamnesis([]);
        setPlannedProcedures(
          [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
        );
        return;
      }
    }

    const clinicalData = getClinicalData(appointmentId);

    const list = clinicalData?.plannedProcedures || [];

    setAttachedAnamnesis(clinicalData?.planningAnamnesisKeys || []);

    setPlannedProcedures(

      [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

    );

  };



  useEffect(() => {

    loadPlanned();

  }, [appointmentId, viewBudgetId]);



  useEffect(() => {

    const count = plannedProcedures.length;

    if (isInitialLoadRef.current) {
      prevCountRef.current = count;
      isInitialLoadRef.current = false;
      return;
    }

    if (count > prevCountRef.current) {

      const newest = plannedProcedures[0];

      if (newest?.id) {

        setNewItemIds((prev) => [...prev, newest.id]);

        window.setTimeout(() => {

          setNewItemIds((prev) => prev.filter((id) => id !== newest.id));

        }, 600);

      }

      if (onShowToast) onShowToast('Procedimento adicionado ao planejamento.');

    } else if (count < prevCountRef.current) {

      if (onShowToast) onShowToast('Procedimento removido com sucesso.');

    }

    prevCountRef.current = count;

  }, [plannedProcedures.length]);



  const summary = useMemo(
    () => buildPlanningSummary(plannedProcedures) || EMPTY_PLANNING_SUMMARY,
    [plannedProcedures],
  );

  const previousBudgetCtx = useMemo(
    () => getPreviousBudgetImportContext(appointmentId),
    [appointmentId, plannedProcedures.length, planningRefreshKey],
  );

  const budgetHistoryItems = useMemo(() => {
    const clinicalData = getClinicalData(appointmentId);
    return [...(clinicalData?.budgetHistory || [])].sort(
      (a, b) => new Date(b.archivedAt || b.createdAt || 0) - new Date(a.archivedAt || a.createdAt || 0),
    );
  }, [appointmentId, planningRefreshKey]);



  const handleSelectProcedures = (items) => {

    setSaving(true);

    setError('');

    try {

      items.forEach((procedureData) => {

        addPlannedProcedure(user, appointmentId, {

          name: procedureData.title || procedureData.name || '',

          procedureId: procedureData.procedureId || procedureData.procedureCatalogId || procedureData.id,

          code: procedureData.code || '',

          category: procedureData.category || procedureData.specialty || '',

          tooth: procedureData.tooth || '',

          region: procedureData.region || '',

          regionType: procedureData.tooth ? 'tooth' : 'livre',

          notes: procedureData.observations || '',

          quantity: procedureData.quantity || 1,

          unitValue: procedureData.unitValue || 0,

          discount: 0,

          discountType: 'percent',

          stage: 'inicial',

          professionalId: appointment?.professionalId || null,

          restriction: procedureData.restriction,

          minPrice: procedureData.minPrice,

          maxPrice: procedureData.maxPrice,

        });

      });

      loadPlanned();

      setShowSelector(false);

    } catch (err) {

      setError(err?.message || 'Erro ao adicionar procedimento(s).');

    } finally {

      setSaving(false);

    }

  };



  const handleFieldChange = (id, field, value) => {

    updatePlannedProcedure(user, appointmentId, id, { [field]: value });

    loadPlanned();

  };



  const handlePatch = (id, patch) => {

    updatePlannedProcedure(user, appointmentId, id, patch);

    loadPlanned();

  };



  const handleRemoveRequest = (plannedId) => {

    const ctx = getPlanningRemoveContext(appointmentId, plannedId);

    if (!ctx.procedure) {

      setError('Procedimento não encontrado no planejamento.');

      return;

    }

    if (ctx.hasSignedContract || ctx.isBudgetLocked) {
      setRemoveModal({
        open: true,
        mode: 'blocked',
        plannedId: null,
        procedureName: '',
        isApprovedBudget: false,
        blockReason: ctx.hasSignedContract ? 'signed' : 'locked',
      });
      return;
    }

    setRemoveModal({

      open: true,

      mode: 'confirm',

      plannedId,

      procedureName: ctx.procedure.name || 'Procedimento',

      isApprovedBudget: ctx.hasApprovedBudget,

    });

  };



  const handleConfirmRemove = async () => {

    if (!removeModal.plannedId || !user) return;

    setRemoveBusy(true);

    setError('');

    try {

      removePlannedProcedureWithSync(user, appointmentId, removeModal.plannedId);

      setRemoveModal({

        open: false,

        mode: 'confirm',

        plannedId: null,

        procedureName: '',

        isApprovedBudget: false,

      });

      loadPlanned();

    } catch (err) {

      setError(err?.message || 'Erro ao remover procedimento.');

    } finally {

      setRemoveBusy(false);

    }

  };



  const handleImportPrevious = async () => {
    if (!user) return;
    setImportBusy(true);
    setError('');
    try {
      const result = importProceduresFromPreviousBudget(user, appointmentId);
      loadPlanned();
      setPlanningRefreshKey((k) => k + 1);
      onShowToast?.(
        `${result.procedureCount} procedimento(s) importados do orçamento ${result.budgetNumber}.`,
      );
    } catch (err) {
      setError(err?.message || 'Erro ao importar procedimentos.');
    } finally {
      setImportBusy(false);
    }
  };



  const handleGenerateBudget = () => {

    if (!user || plannedProcedures.length === 0) return;

    setError('');

    try {

      const procedures = plannedProcedures.map((proc) => ({

        id: proc.id || createId('proc'),

        procedureId: proc.procedureId,

        code: proc.code,

        category: proc.category,

        name: proc.name,

        tooth: proc.tooth || '',

        region: proc.region || '',

        regionType: proc.regionType,

        quantity: Number(proc.quantity || 1),

        unitValue: Number(proc.unitValue || 0),

        discount: calcItemDiscount(proc),

        discountType: proc.discountType,

        discountRaw: Number(proc.discount || 0),

        totalValue: calcItemTotal(proc),

        observations: proc.notes || '',

        stage: proc.stage || 'inicial',

        professionalId: proc.professionalId || appointment?.professionalId,

      }));



      saveBudget(user, appointmentId, {

        status: BUDGET_STATUS.RASCUNHO,

        planName: '',

        procedures,

        commercialNotes: '',

        paymentType: 'a_vista',

        downPayment: 0,

        installments: 1,

        installmentValue: 0,

        paymentMethod: 'pix',

        discount: summary.discounts,

        interest: 0,

        validityDate: '',

        professionalId: appointment?.professionalId || null,

        planningAnamnesisKeys: attachedAnamnesis,

        createdAt: new Date().toISOString(),

        createdBy: user.id,

      });



      logClinicalEvent(

        appointmentId,

        'budget_generated',

        { plannedProceduresCount: plannedProcedures.length },

        user.id

      );



      if (onNavigateToOrcamento) onNavigateToOrcamento();

      if (onShowToast) onShowToast('Orçamento gerado a partir do planejamento.');

    } catch (err) {

      setError(err?.message || 'Erro ao gerar orçamento.');

    }

  };



  const budgetViewState = useMemo(
    () => (viewBudgetId ? resolveBudgetForView(appointmentId, viewBudgetId) : null),
    [appointmentId, viewBudgetId],
  );

  const isReadOnlyView = Boolean(budgetViewState?.isReadOnly);



  return (

    <>

      {isReadOnlyView ? (
        <div className="clinical-budget-locked-banner" role="status">
          <p>Planejamento vinculado ao orçamento selecionado — somente visualização.</p>
        </div>
      ) : null}

      <ClinicalStageShell

        title="Planejamento de tratamento"

        description="Monte o plano clínico com procedimentos da Base de Preços."

        secondaryActions={

          <>

            <ClinicalBtn variant="secondary" icon={ClipboardList} onClick={() => setAnamnesisModalOpen(true)}>

              Anamnese

            </ClinicalBtn>

            <ClinicalBtn variant="secondary" icon={Plus} onClick={() => setShowSelector(true)} disabled={saving || isReadOnlyView}>

              Procedimento

            </ClinicalBtn>

          </>

        }

        primaryAction={

          plannedProcedures.length > 0 ? (

            <ClinicalBtn variant="primary" icon={DollarSign} onClick={handleGenerateBudget}>

              Gerar orçamento

            </ClinicalBtn>

          ) : null

        }

      >

        {error ? <div className="clinical-inline-error">{error}</div> : null}

        {previousBudgetCtx.hasPrevious && plannedProcedures.length === 0 ? (
          <PreviousBudgetImportCard
            budgetNumber={previousBudgetCtx.budgetNumber}
            procedureCount={previousBudgetCtx.procedureCount}
            onViewHistory={() => setHistoryModalOpen(true)}
            onImport={handleImportPrevious}
            importing={importBusy}
          />
        ) : null}

        {plannedProcedures.length > 0 ? (

          <PlanningKpiBar

            count={summary.count}

            total={summary.total}

            discounts={summary.discounts}

          />

        ) : null}



        <div className="clinical-stage-layout">

          <div className="clinical-stage-main">

            {attachedAnamnesis.length > 0 && (

              <div className="clinical-planning-anamnesis-badge">

                Anamnese: {attachedAnamnesis.length} item(ns) selecionado(s)

              </div>

            )}



            <ClinicalBlock

              title="Procedimentos planejados"

              description={summary.count ? `${summary.count} item(ns) no plano` : 'Nenhum procedimento adicionado'}

              actions={

                <ClinicalBtn variant="secondary" icon={Plus} onClick={() => setShowSelector(true)}>

                  Adicionar

                </ClinicalBtn>

              }

            >

              {plannedProcedures.length === 0 ? (

                <div className="clinical-empty-state clinical-empty-state--compact">

                  <Calendar size={36} strokeWidth={1.25} />

                  <p>Nenhum procedimento adicionado ainda.</p>

                  <ClinicalBtn variant="primary" icon={Plus} onClick={() => setShowSelector(true)}>

                    Adicionar procedimento

                  </ClinicalBtn>

                </div>

              ) : (

                <div className="clinical-planning-table-wrap">

                  <div className="clinical-planning-grid-table" role="table" aria-label="Procedimentos planejados">

                    <div className="clinical-planning-grid-head" role="row">

                      <div role="columnheader">Procedimento</div>

                      <div role="columnheader">Especialidade</div>

                      <div role="columnheader">Etapa</div>

                      <div role="columnheader">Região</div>

                      <div role="columnheader">Qtd</div>

                      <div role="columnheader">Valor</div>

                      <div role="columnheader">Desconto</div>

                      <div role="columnheader">Total</div>

                      <div role="columnheader" className="clinical-planning-col-actions">Ações</div>

                    </div>

                    <div className="clinical-planning-grid-body" role="rowgroup">

                      {plannedProcedures.map((proc) => (

                        <PlanningProcedureRow

                          key={proc.id}

                          proc={proc}

                          isNew={newItemIds.includes(proc.id)}

                          onFieldChange={handleFieldChange}

                          onPatch={handlePatch}

                          onRemove={() => handleRemoveRequest(proc.id)}

                        />

                      ))}

                    </div>

                  </div>

                </div>

              )}

            </ClinicalBlock>

          </div>



          <aside className="clinical-stage-aside">

            <PlanningSummaryPanel

              summary={summary}

              onGenerateBudget={handleGenerateBudget}

              showCta={plannedProcedures.length > 0}

            />

          </aside>

        </div>

      </ClinicalStageShell>



      <ProcedureSelectorModal

        open={showSelector}

        onClose={() => setShowSelector(false)}

        onSelectMultiple={handleSelectProcedures}

        patient={patient}

        appointmentId={appointmentId}

      />



      <AnamnesisAttachModal

        open={anamnesisModalOpen}

        onClose={() => setAnamnesisModalOpen(false)}

        patient={patient}

        selectedKeys={attachedAnamnesis}

        onConfirm={(keys) => {

          setAttachedAnamnesis(keys);

          savePlanningAnamnesisKeys(user, appointmentId, keys);

        }}

      />

      <AppointmentBudgetHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        items={budgetHistoryItems}
      />

      <PlanningRemoveProcedureModal

        open={removeModal.open}

        onOpenChange={(open) => {

          if (!open && !removeBusy) {

            setRemoveModal({
              open: false,
              mode: 'confirm',
              plannedId: null,
              procedureName: '',
              isApprovedBudget: false,
              blockReason: 'signed',
            });

          }

        }}

        mode={removeModal.mode}

        procedureName={removeModal.procedureName}

        isApprovedBudget={removeModal.isApprovedBudget}
        blockReason={removeModal.blockReason}
        busy={removeBusy}

        onConfirm={handleConfirmRemove}

      />

    </>

  );

}


