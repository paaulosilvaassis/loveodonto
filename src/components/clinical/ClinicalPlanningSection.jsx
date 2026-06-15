import { useEffect, useMemo, useRef, useState } from 'react';

import { Calendar, DollarSign, Plus, ClipboardList } from 'lucide-react';

import ProcedureSelectorModal from '../ProcedureSelectorModal.jsx';

import { AnamnesisAttachModal } from './AnamnesisAttachModal.jsx';

import { ClinicalStageShell, ClinicalBlock, ClinicalBtn } from './ClinicalStageShell.jsx';

import { PlanningKpiBar } from './planning/PlanningKpiBar.jsx';

import { PlanningProcedureRow } from './planning/PlanningProcedureRow.jsx';

import { PlanningSummaryPanel } from './planning/PlanningSummaryPanel.jsx';

import {

  buildPlanningSummary,

  calcItemDiscount,

  calcItemTotal,

} from './planning/planningUtils.js';

import { createId } from '../../services/helpers.js';

import {

  addPlannedProcedure,

  updatePlannedProcedure,

  removePlannedProcedure,

  getClinicalData,

  saveBudget,

  logClinicalEvent,

  BUDGET_STATUS,

  savePlanningAnamnesisKeys,

} from '../../services/clinicalService.js';


export function ClinicalPlanningSection({

  appointmentId,

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

  const [highlightId, setHighlightId] = useState(null);

  const prevCountRef = useRef(0);

  const isInitialLoadRef = useRef(true);

  const rowRefs = useRef({});



  const loadPlanned = () => {

    const clinicalData = getClinicalData(appointmentId);

    const list = clinicalData?.plannedProcedures || [];

    setAttachedAnamnesis(clinicalData?.planningAnamnesisKeys || []);

    setPlannedProcedures(

      [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

    );

  };



  useEffect(() => {

    loadPlanned();

  }, [appointmentId]);



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

    }

    prevCountRef.current = count;

  }, [plannedProcedures.length]);



  const summary = useMemo(

    () => buildPlanningSummary(plannedProcedures),

    [plannedProcedures]

  );



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



  const handleRemove = (plannedId) => {

    if (!window.confirm('Remover este item do planejamento?')) return;

    try {

      removePlannedProcedure(user, appointmentId, plannedId);

      loadPlanned();

    } catch (err) {

      setError(err?.message || 'Erro ao remover.');

    }

  };



  const handleDuplicate = (proc) => {

    try {

      addPlannedProcedure(user, appointmentId, {

        name: proc.name,

        procedureId: proc.procedureId,

        code: proc.code,

        category: proc.category,

        tooth: proc.tooth,

        region: proc.region,

        regionType: proc.regionType,

        notes: proc.notes,

        quantity: proc.quantity || 1,

        unitValue: proc.unitValue || 0,

        discount: proc.discount || 0,

        discountType: proc.discountType || 'percent',

        stage: proc.stage || 'inicial',

        professionalId: proc.professionalId || appointment?.professionalId,

        restriction: proc.restriction,

        minPrice: proc.minPrice,

        maxPrice: proc.maxPrice,

      });

      loadPlanned();

      if (onShowToast) onShowToast('Procedimento duplicado.');

    } catch (err) {

      setError(err?.message || 'Erro ao duplicar.');

    }

  };



  const handleEditRow = (procId) => {

    setHighlightId(procId);

    rowRefs.current[procId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window.setTimeout(() => setHighlightId(null), 1800);

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



  return (

    <>

      <ClinicalStageShell

        title="Planejamento de tratamento"

        description="Monte o plano clínico com procedimentos da Base de Preços."

        secondaryActions={

          <>

            <ClinicalBtn variant="secondary" icon={ClipboardList} onClick={() => setAnamnesisModalOpen(true)}>

              Anamnese

            </ClinicalBtn>

            <ClinicalBtn variant="secondary" icon={Plus} onClick={() => setShowSelector(true)} disabled={saving}>

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

                  <p>Busque procedimentos na Base de Preços para iniciar o planejamento.</p>

                  <ClinicalBtn variant="primary" icon={Plus} onClick={() => setShowSelector(true)}>

                    Buscar procedimento

                  </ClinicalBtn>

                </div>

              ) : (

                <div className="clinical-planning-table-wrap">

                  <div className="clinical-planning-grid-table" role="table" aria-label="Procedimentos planejados">

                    <div className="clinical-planning-grid-head" role="row">

                      <div role="columnheader">Procedimento</div>

                      <div role="columnheader">Etapa</div>

                      <div role="columnheader">Região</div>

                      <div role="columnheader">Qtd</div>

                      <div role="columnheader">Valor unitário</div>

                      <div role="columnheader">Desconto</div>

                      <div role="columnheader">Valor final</div>

                      <div role="columnheader" aria-label="Ações" />

                    </div>

                    <div className="clinical-planning-grid-body" role="rowgroup">

                      {plannedProcedures.map((proc) => (

                        <PlanningProcedureRow

                          key={proc.id}

                          proc={proc}

                          rowRef={(el) => {
                            if (el) rowRefs.current[proc.id] = el;
                            else delete rowRefs.current[proc.id];
                          }}

                          isNew={newItemIds.includes(proc.id)}

                          isHighlighted={highlightId === proc.id}

                          onFieldChange={handleFieldChange}

                          onPatch={handlePatch}

                          onDuplicate={() => handleDuplicate(proc)}

                          onEdit={() => handleEditRow(proc.id)}

                          onRemove={() => handleRemove(proc.id)}

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

    </>

  );

}


