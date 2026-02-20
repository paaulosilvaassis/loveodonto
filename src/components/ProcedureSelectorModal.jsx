import { useEffect, useState } from 'react';
import { Search, X, Plus } from 'lucide-react';
import {
  listProcedures,
  getPriceTableForPatient,
  getDefaultPriceTable,
  getEffectivePrice,
  PROCEDURE_SEGMENT,
  PROCEDURE_STATUS,
  SPECIALTIES,
} from '../services/priceBaseService.js';
import { loadDb } from '../db/index.js';

/**
 * Modal para selecionar procedimento da Base de Preço
 * Usado em Orçamento e Procedimentos a Realizar
 */
export default function ProcedureSelectorModal({
  open,
  onClose,
  onSelect,
  patient = null,
  appointmentId = null,
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    segment: '',
    specialty: '',
    status: PROCEDURE_STATUS.ATIVO,
  });
  const [procedures, setProcedures] = useState([]);
  const [selectedProcedure, setSelectedProcedure] = useState(null);
  const [customizations, setCustomizations] = useState({
    quantity: 1,
    unitValue: '',
    tooth: '',
    region: '',
    observations: '',
  });

  // Obter tabela de preço para o paciente
  const db = loadDb();
  let patientData = patient;
  if (!patientData && appointmentId) {
    const appointment = db.appointments?.find(a => a.id === appointmentId);
    if (appointment?.patientId) {
      patientData = db.patients?.find(p => p.id === appointment.patientId);
    }
  }
  const priceTable = patientData ? getPriceTableForPatient(patientData) : getDefaultPriceTable();
  const priceTableId = priceTable?.id || null;

  useEffect(() => {
    if (open && priceTableId) {
      refreshProcedures();
    } else if (open && !priceTableId) {
      setProcedures([]);
    }
  }, [open, filters, search, priceTableId]);

  const refreshProcedures = () => {
    if (!priceTableId) {
      setProcedures([]);
      return;
    }
    const filtered = listProcedures({
      ...filters,
      search,
      sortBy: 'name',
      priceTableId, // OBRIGATÓRIO: passar priceTableId
    });
    setProcedures(filtered);
  };

  const handleSelect = () => {
    if (!selectedProcedure) return;

    // Obter preço efetivo da tabela (ou preço do procedimento quando não houver override)
    const effective = priceTableId ? getEffectivePrice(selectedProcedure.id, priceTableId) : null;
    const catalogPrice = Number(selectedProcedure.price) || 0;
    const effectivePrice = effective != null && (effective.price != null && effective.price !== '')
      ? Number(effective.price)
      : catalogPrice;
    const effectiveMinPrice = effective?.minPrice;
    const effectiveMaxPrice = effective?.maxPrice;
    const effectiveRestriction = effective?.restriction;

    const finalUnitValue = customizations.unitValue
      ? parseFloat(customizations.unitValue)
      : effectivePrice;

    // Validar restrições
    if (effectiveRestriction === 'FIXO' && customizations.unitValue) {
      alert('Este procedimento tem preço fixo. Não é possível alterar.');
      return;
    }

    if (effectiveRestriction === 'BLOQUEAR') {
      if (effectiveMinPrice && finalUnitValue < effectiveMinPrice) {
        alert(`Preço mínimo permitido: R$ ${effectiveMinPrice.toFixed(2)}`);
        return;
      }
      if (effectiveMaxPrice && finalUnitValue > effectiveMaxPrice) {
        alert(`Preço máximo permitido: R$ ${effectiveMaxPrice.toFixed(2)}`);
        return;
      }
    }

    if (effectiveRestriction === 'AVISAR') {
      if (
        (effectiveMinPrice && finalUnitValue < effectiveMinPrice) ||
        (effectiveMaxPrice && finalUnitValue > effectiveMaxPrice)
      ) {
        const confirmMsg = `Preço fora do recomendado (R$ ${effectiveMinPrice || '—'} - R$ ${effectiveMaxPrice || '—'}). Deseja continuar?`;
        if (!confirm(confirmMsg)) {
          return;
        }
      }
    }

    const procedureData = {
      id: `proc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      procedureCatalogId: selectedProcedure.id,
      title: selectedProcedure.title,
      specialty: selectedProcedure.specialty,
      segment: selectedProcedure.segment,
      tussCode: selectedProcedure.tussCode,
      internalCode: selectedProcedure.internalCode,
      quantity: parseInt(customizations.quantity) || 1,
      unitValue: finalUnitValue,
      totalValue: (parseInt(customizations.quantity) || 1) * finalUnitValue,
      tooth: customizations.tooth || '',
      region: customizations.region || '',
      observations: customizations.observations || '',
      restriction: effectiveRestriction,
      minPrice: effectiveMinPrice,
      maxPrice: effectiveMaxPrice,
      source: 'price_base',
    };

    onSelect(procedureData);
    handleClose();
  };

  const handleClose = () => {
    setSearch('');
    setSelectedProcedure(null);
    setCustomizations({
      quantity: 1,
      unitValue: '',
      tooth: '',
      region: '',
      observations: '',
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Selecionar Procedimento</h2>
          <button type="button" className="modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Busca e Filtros */}
          <div className="procedure-selector-filters">
            <div className="procedure-selector-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar procedimento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={filters.segment}
              onChange={(e) => setFilters({ ...filters, segment: e.target.value })}
            >
              <option value="">Todos os segmentos</option>
              <option value={PROCEDURE_SEGMENT.ODONTOLOGIA}>Odontologia</option>
              <option value={PROCEDURE_SEGMENT.OROFACIAL}>Orofacial</option>
              <option value={PROCEDURE_SEGMENT.DIAGNOSTICO_IMAGEM}>Diagnóstico/Imagem</option>
            </select>
            <select
              value={filters.specialty}
              onChange={(e) => setFilters({ ...filters, specialty: e.target.value })}
            >
              <option value="">Todas as especialidades</option>
              {SPECIALTIES.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </div>

          {/* Lista de Procedimentos */}
          <div className="procedure-selector-list">
            {procedures.length === 0 ? (
              <div className="clinical-empty-state">
                <p>
                  {!priceTableId
                    ? 'Nenhuma tabela de preço disponível. Cadastre uma tabela em Gestão Comercial > Base de Preço.'
                    : 'Nenhum procedimento encontrado.'}
                </p>
              </div>
            ) : (
              <div className="procedure-selector-grid">
                {procedures.map((proc) => {
                  const effective = getEffectivePrice(proc.id, priceTableId);
                  const displayPrice = effective?.price ?? proc?.price ?? 0;
                  const isSelected = selectedProcedure?.id === proc.id;
                  return (
                    <div
                      key={proc.id}
                      className={`procedure-selector-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedProcedure(proc);
                        setCustomizations({
                          ...customizations,
                          unitValue: (effective?.price ?? proc?.price ?? 0).toString(),
                        });
                      }}
                    >
                      <div className="procedure-selector-item-header">
                        <h3>{proc.title}</h3>
                        <span className="procedure-selector-item-price">
                          R$ {Number(displayPrice).toFixed(2)}
                        </span>
                      </div>
                      <div className="procedure-selector-item-meta">
                        <span>{proc.specialty}</span>
                        {proc.tussCode && <span>TUSS: {proc.tussCode}</span>}
                        {proc.priceRestriction !== 'LIVRE' && (
                          <span className={`restriction-badge restriction-${proc.priceRestriction.toLowerCase()}`}>
                            {proc.priceRestriction}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Customizações */}
          {selectedProcedure && (
            <div className="procedure-selector-customizations">
              <h3>Detalhes do Procedimento</h3>
              <div className="procedure-selector-form">
                <div className="form-field">
                  <label>Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={customizations.quantity}
                    onChange={(e) => {
                      const qty = parseInt(e.target.value) || 1;
                      setCustomizations({
                        ...customizations,
                        quantity: qty,
                      });
                    }}
                  />
                </div>
                <div className="form-field">
                  <label>Valor Unitário</label>
                  <input
                    type="number"
                    step="0.01"
                    value={customizations.unitValue}
                    onChange={(e) => setCustomizations({ ...customizations, unitValue: e.target.value })}
                    disabled={selectedProcedure?.priceRestriction === 'FIXO'}
                    placeholder={selectedProcedure ? (selectedProcedure.price || 0).toFixed(2) : '0.00'}
                  />
                  {selectedProcedure?.priceRestriction === 'FIXO' && (
                    <p className="price-base-restriction-warning">Preço fixo pela Base de Preço</p>
                  )}
                </div>
                <div className="form-field">
                  <label>Dente</label>
                  <input
                    type="text"
                    value={customizations.tooth}
                    onChange={(e) => setCustomizations({ ...customizations, tooth: e.target.value })}
                    placeholder="Ex: 16, 17, 18"
                  />
                </div>
                <div className="form-field">
                  <label>Região</label>
                  <input
                    type="text"
                    value={customizations.region}
                    onChange={(e) => setCustomizations({ ...customizations, region: e.target.value })}
                    placeholder="Ex: Superior direito"
                  />
                </div>
                <div className="form-field">
                  <label>Observações</label>
                  <textarea
                    value={customizations.observations}
                    onChange={(e) => setCustomizations({ ...customizations, observations: e.target.value })}
                    rows={2}
                    placeholder="Observações sobre este procedimento..."
                  />
                </div>
                <div className="procedure-selector-total">
                  <strong>
                    Total: R${' '}
                    {(
                      (parseInt(customizations.quantity) || 1) *
                      (parseFloat(customizations.unitValue) || (getEffectivePrice(selectedProcedure.id, priceTableId)?.price ?? 0))
                    ).toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleSelect}
            disabled={!selectedProcedure}
          >
            <Plus size={16} />
            Adicionar Procedimento
          </button>
        </div>
      </div>
    </div>
  );
}
