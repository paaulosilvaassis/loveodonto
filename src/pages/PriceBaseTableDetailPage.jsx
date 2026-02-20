import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import PriceBaseImportWizard from '../components/PriceBaseImportWizard.jsx';
import {
  createProcedure,
  updateProcedure,
  deleteProcedure,
  listProcedures,
  listPriceTables,
  updatePriceTable,
  duplicatePriceTable,
  validateTussCode,
  PROCEDURE_SEGMENT,
  PROCEDURE_STATUS,
  PRICE_RESTRICTION,
  COMMISSION_TYPE,
  SPECIALTIES,
  PRICE_TABLE_TYPE,
} from '../services/priceBaseService.js';
import { Plus, Edit, Trash2, Copy, Upload, Search, X, Save, ArrowLeft } from 'lucide-react';

export default function PriceBaseTableDetailPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { priceTableId } = useParams();
  const [priceTables, setPriceTables] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    segment: '',
    specialty: '',
    status: '',
    hasRestriction: false,
    sortBy: 'name',
  });
  const [showAddProcedureModal, setShowAddProcedureModal] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditTableModal, setShowEditTableModal] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [editingCell, setEditingCell] = useState(null); // { procedureId, field }
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    refreshPriceTables();
  }, []);

  useEffect(() => {
    refreshProcedures();
  }, [priceTableId, filters]);

  const refreshPriceTables = () => {
    try {
      const tables = listPriceTables();
      setPriceTables(tables);
    } catch (error) {
      alert(`Erro ao carregar tabelas: ${error.message}`);
    }
  };

  const refreshProcedures = () => {
    if (!priceTableId) {
      setProcedures([]);
      return;
    }
    try {
      const filtered = listProcedures({
        ...filters,
        priceTableId,
      });
      setProcedures(filtered);
    } catch (error) {
      alert(`Erro ao carregar procedimentos: ${error.message}`);
      setProcedures([]);
    }
  };

  const selectedTable = useMemo(() => {
    if (!priceTableId) return null;
    return priceTables.find((table) => table.id === priceTableId) || null;
  }, [priceTableId, priceTables]);

  const handleDuplicateTable = () => {
    if (!selectedTable) return;
    const newName = `${selectedTable.name} (Cópia)`;
    try {
      const newTable = duplicatePriceTable(user, selectedTable.id, newName);
      refreshPriceTables();
      if (newTable?.id) {
        navigate(`/gestao-comercial/base-de-preco/tabelas/${newTable.id}`);
      }
    } catch (error) {
      alert(error.message || 'Erro ao duplicar tabela');
    }
  };

  const handleDeleteProcedure = (procedureId) => {
    if (!confirm('Tem certeza que deseja excluir este procedimento?')) return;
    try {
      deleteProcedure(user, procedureId);
      refreshProcedures();
    } catch (error) {
      alert(error.message || 'Erro ao excluir procedimento');
    }
  };

  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
  };

  const handleQuickUpdate = (procedureId, field, value) => {
    try {
      const procedure = procedures.find((proc) => proc.id === procedureId);
      if (!procedure) return;

      let updateData = {};
      if (field === 'price') {
        if (value <= 0) {
          alert('Preço deve ser maior que zero');
          return;
        }
        updateData = { price: value };
      } else if (field === 'minmax') {
        updateData = {
          minPrice: value.minPrice,
          maxPrice: value.maxPrice,
        };
        if (value.minPrice && value.maxPrice && value.minPrice > value.maxPrice) {
          alert('Preço mínimo não pode ser maior que o máximo');
          return;
        }
        if (value.minPrice && procedure.price < value.minPrice) {
          alert('Preço não pode ser menor que o mínimo');
          return;
        }
        if (value.maxPrice && procedure.price > value.maxPrice) {
          alert('Preço não pode ser maior que o máximo');
          return;
        }
      }

      updateProcedure(user, procedureId, updateData);
      refreshProcedures();
      showToast('Valor atualizado com sucesso', 'success');
    } catch (error) {
      alert(error.message || 'Erro ao atualizar valor');
    }
  };

  if (!selectedTable) {
    return (
      <div className="price-base-page">
        <div className="price-base-header">
          <div>
            <h1 className="price-base-title">Base de Preço</h1>
            <p className="price-base-subtitle">Tabela não encontrada</p>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => navigate('/gestao-comercial/base-de-preco')}
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
        </div>
        <SectionCard>
          <div className="price-base-empty-state">
            <p>Tabela selecionada não encontrada</p>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="price-base-page">
      <div className="price-base-header">
        <div>
          <h1 className="price-base-title">{`Tabela: ${selectedTable.name}`}</h1>
          <p className="price-base-subtitle">{selectedTable.type || 'PARTICULAR'}</p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => navigate('/gestao-comercial/base-de-preco')}
        >
          <ArrowLeft size={16} />
          Voltar
        </button>
      </div>

      <SectionCard>
        <div className="price-base-content-header">
          <div>
            <h2>Procedimentos</h2>
            <p className="price-base-content-subtitle">
              {procedures.length} procedimento(s) nesta tabela
            </p>
          </div>
          <div className="price-base-content-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowImportModal(true)}
            >
              <Upload size={16} />
              Importar Planilha
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={handleDuplicateTable}
            >
              <Copy size={16} />
              Duplicar Tabela
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowEditTableModal(true)}
            >
              <Edit size={16} />
              Editar Tabela
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => setShowAddProcedureModal(true)}
            >
              <Plus size={16} />
              Adicionar Procedimento
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="price-base-filters">
          <div className="price-base-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar por nome, código interno ou TUSS..."
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </div>
          <select
            value={filters.segment}
            onChange={(event) => setFilters({ ...filters, segment: event.target.value })}
          >
            <option value="">Todos os segmentos</option>
            <option value={PROCEDURE_SEGMENT.ODONTOLOGIA}>Odontologia</option>
            <option value={PROCEDURE_SEGMENT.OROFACIAL}>Orofacial</option>
            <option value={PROCEDURE_SEGMENT.DIAGNOSTICO_IMAGEM}>Diagnóstico/Imagem</option>
          </select>
          <select
            value={filters.specialty}
            onChange={(event) => setFilters({ ...filters, specialty: event.target.value })}
          >
            <option value="">Todas as especialidades</option>
            {SPECIALTIES.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">Todos os status</option>
            <option value={PROCEDURE_STATUS.ATIVO}>Ativo</option>
            <option value={PROCEDURE_STATUS.INATIVO}>Inativo</option>
          </select>
          <label className="price-base-filter-checkbox">
            <input
              type="checkbox"
              checked={filters.hasRestriction}
              onChange={(event) => setFilters({ ...filters, hasRestriction: event.target.checked })}
            />
            Somente com restrição
          </label>
          <select
            value={filters.sortBy}
            onChange={(event) => setFilters({ ...filters, sortBy: event.target.value })}
          >
            <option value="name">A-Z</option>
            <option value="price_desc">Maior preço</option>
            <option value="price_asc">Menor preço</option>
            <option value="updated">Atualizados recentemente</option>
          </select>
        </div>
      </SectionCard>

      <SectionCard
        title="Lista de Procedimentos"
        description="Clique no preço para editar rapidamente"
      >
        {procedures.length === 0 ? (
          <div className="price-base-empty-state">
            <p>Nenhum procedimento encontrado nesta tabela.</p>
            <div className="price-base-content-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => setShowAddProcedureModal(true)}
              >
                <Plus size={16} />
                Adicionar Procedimento
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowImportModal(true)}
              >
                <Upload size={16} />
                Importar Planilha
              </button>
            </div>
          </div>
        ) : (
          <div className="price-base-table-wrapper">
            <table className="price-base-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Segmento</th>
                  <th>Especialidade</th>
                  <th>TUSS</th>
                  <th>Código Interno</th>
                  <th>Situação</th>
                  <th>Preço</th>
                  <th>Min/Max</th>
                  <th>Restrição</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((proc) => (
                  <tr key={proc.id}>
                    <td className="price-base-table-title">{proc.title}</td>
                    <td>{proc.segment}</td>
                    <td>{proc.specialty}</td>
                    <td>{proc.tussCode || '—'}</td>
                    <td>{proc.internalCode || '—'}</td>
                    <td>
                      <span
                        className={`price-base-status-badge ${
                          proc.status === PROCEDURE_STATUS.ATIVO ? 'active' : 'inactive'
                        }`}
                      >
                        {proc.status}
                      </span>
                    </td>
                    <td className="price-base-table-price">
                      {editingCell?.procedureId === proc.id && editingCell?.field === 'price' ? (
                        <div className="price-base-inline-edit">
                          <input
                            type="number"
                            step="0.01"
                            value={editingValue}
                            onChange={(event) => setEditingValue(event.target.value)}
                            onBlur={() => {
                              handleQuickUpdate(proc.id, 'price', parseFloat(editingValue) || 0);
                              setEditingCell(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                handleQuickUpdate(proc.id, 'price', parseFloat(editingValue) || 0);
                                setEditingCell(null);
                              } else if (event.key === 'Escape') {
                                setEditingCell(null);
                              }
                            }}
                            autoFocus
                            className="price-base-inline-input"
                          />
                        </div>
                      ) : (
                        <span
                          className="price-base-editable-value"
                          onClick={() => {
                            setEditingCell({ procedureId: proc.id, field: 'price' });
                            setEditingValue(proc.price || 0);
                          }}
                          title="Clique para editar"
                        >
                          R$ {(proc.price || 0).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="price-base-table-minmax">
                      {proc.minPrice || proc.maxPrice
                        ? `${proc.minPrice ? `R$ ${proc.minPrice.toFixed(2)}` : '—'} / ${
                            proc.maxPrice ? `R$ ${proc.maxPrice.toFixed(2)}` : '—'
                          }`
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={`price-base-restriction-badge restriction-${(proc.priceRestriction || 'LIVRE').toLowerCase()}`}
                      >
                        {proc.priceRestriction || 'LIVRE'}
                      </span>
                    </td>
                    <td>
                      <div className="price-base-table-actions">
                        <button
                          type="button"
                          className="price-base-action-btn"
                          onClick={() => {
                            setEditingProcedure(proc);
                            setShowAddProcedureModal(true);
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          className="price-base-action-btn"
                          onClick={() => handleDeleteProcedure(proc.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {showAddProcedureModal && (
        <AddEditProcedureModal
          procedure={editingProcedure}
          priceTableId={priceTableId}
          onClose={() => {
            setShowAddProcedureModal(false);
            setEditingProcedure(null);
          }}
          onSave={() => {
            refreshProcedures();
            setShowAddProcedureModal(false);
            setEditingProcedure(null);
          }}
          user={user}
        />
      )}

      {showEditTableModal && (
        <AddEditTableModal
          table={selectedTable}
          onClose={() => setShowEditTableModal(false)}
          onSave={() => {
            refreshPriceTables();
            setShowEditTableModal(false);
          }}
          user={user}
        />
      )}

      {showImportModal && (
        <PriceBaseImportWizard
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          onComplete={(result) => {
            refreshProcedures();
            setShowImportModal(false);
            showToast(
              `${result.createdCount} criados, ${result.updatedCount} atualizados`,
              'success'
            );
          }}
          selectedTableId={priceTableId}
          user={user}
        />
      )}

      {toast ? (
        <div
          className={`toast ${toast.type}`}
          role="status"
          style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000 }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

function AddEditProcedureModal({ procedure, priceTableId, onClose, onSave, user }) {
  if (!priceTableId) {
    alert('Selecione uma tabela de preço antes de adicionar um procedimento');
    onClose();
    return null;
  }

  const [activeTab, setActiveTab] = useState('dados');
  const [formData, setFormData] = useState({
    title: procedure?.title || '',
    status: procedure?.status || PROCEDURE_STATUS.ATIVO,
    segment: procedure?.segment || PROCEDURE_SEGMENT.ODONTOLOGIA,
    specialty: procedure?.specialty || '',
    tussCode: procedure?.tussCode || '',
    internalCode: procedure?.internalCode || '',
    shortcut: procedure?.shortcut || '',
    costPrice: procedure?.costPrice || '',
    price: procedure?.price || '',
    minPrice: procedure?.minPrice || '',
    maxPrice: procedure?.maxPrice || '',
    priceRestriction: procedure?.priceRestriction || PRICE_RESTRICTION.LIVRE,
    commissionType: procedure?.commissionType || COMMISSION_TYPE.NENHUMA,
    commissionValue: procedure?.commissionValue || '',
    notes: procedure?.notes || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) {
      newErrors.title = 'Título é obrigatório';
    }
    if (!formData.specialty) {
      newErrors.specialty = 'Especialidade é obrigatória';
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Preço deve ser maior que zero';
    }
    if (formData.minPrice && formData.maxPrice) {
      if (parseFloat(formData.minPrice) > parseFloat(formData.maxPrice)) {
        newErrors.minPrice = 'Preço mínimo não pode ser maior que o máximo';
      }
    }
    if (formData.minPrice && parseFloat(formData.price) < parseFloat(formData.minPrice)) {
      newErrors.price = 'Preço não pode ser menor que o mínimo';
    }
    if (formData.maxPrice && parseFloat(formData.price) > parseFloat(formData.maxPrice)) {
      newErrors.price = 'Preço não pode ser maior que o máximo';
    }
    if (formData.tussCode) {
      const validation = validateTussCode(formData.tussCode);
      if (!validation.valid) {
        newErrors.tussCode = validation.error;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const data = {
        title: formData.title.trim(),
        status: formData.status,
        segment: formData.segment,
        specialty: formData.specialty,
        tussCode: formData.tussCode || null,
        internalCode: formData.internalCode || null,
        shortcut: formData.shortcut || null,
        costPrice: formData.costPrice ? parseFloat(formData.costPrice) : null,
        price: parseFloat(formData.price),
        minPrice: formData.minPrice ? parseFloat(formData.minPrice) : null,
        maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice) : null,
        priceRestriction: formData.priceRestriction,
        commissionType: formData.commissionType,
        commissionValue: formData.commissionValue ? parseFloat(formData.commissionValue) : null,
        notes: formData.notes || null,
      };

      if (procedure) {
        updateProcedure(user, procedure.id, data);
      } else {
        createProcedure(user, priceTableId, data);
      }

      onSave();
    } catch (error) {
      alert(error.message || 'Erro ao salvar procedimento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-content-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{procedure ? 'Editar Procedimento' : 'Adicionar Procedimento'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {Object.keys(errors).length > 0 && (
          <div className="price-base-modal-errors">
            {Object.values(errors).map((error, idx) => (
              <div key={idx} className="error-message">
                {error}
              </div>
            ))}
          </div>
        )}

        <div className="price-base-modal-tabs">
          <button
            type="button"
            className={`price-base-modal-tab ${activeTab === 'dados' ? 'active' : ''}`}
            onClick={() => setActiveTab('dados')}
          >
            Dados Principais
          </button>
          <button
            type="button"
            className={`price-base-modal-tab ${activeTab === 'precos' ? 'active' : ''}`}
            onClick={() => setActiveTab('precos')}
          >
            Preços e Regras
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'dados' && (
            <div className="price-base-modal-form">
              <div className="form-field">
                <label>
                  Título do Procedimento <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                  placeholder="Ex: Limpeza Profissional"
                  className={errors.title ? 'error' : ''}
                />
                {errors.title && <span className="error-text">{errors.title}</span>}
              </div>

              <div className="form-field">
                <label>Situação</label>
                <select
                  value={formData.status}
                  onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                >
                  <option value={PROCEDURE_STATUS.ATIVO}>Ativo</option>
                  <option value={PROCEDURE_STATUS.INATIVO}>Inativo</option>
                </select>
              </div>

              <div className="form-field">
                <label>Segmento</label>
                <select
                  value={formData.segment}
                  onChange={(event) => setFormData({ ...formData, segment: event.target.value })}
                >
                  <option value={PROCEDURE_SEGMENT.ODONTOLOGIA}>Odontologia</option>
                  <option value={PROCEDURE_SEGMENT.OROFACIAL}>Orofacial</option>
                  <option value={PROCEDURE_SEGMENT.DIAGNOSTICO_IMAGEM}>Diagnóstico/Imagem</option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Especialidade <span className="required">*</span>
                </label>
                <select
                  value={formData.specialty}
                  onChange={(event) => setFormData({ ...formData, specialty: event.target.value })}
                  className={errors.specialty ? 'error' : ''}
                >
                  <option value="">Selecione...</option>
                  {SPECIALTIES.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
                {errors.specialty && <span className="error-text">{errors.specialty}</span>}
              </div>

              <div className="form-field">
                <label>Código TUSS</label>
                <input
                  type="text"
                  value={formData.tussCode}
                  onChange={(event) => setFormData({ ...formData, tussCode: event.target.value })}
                  placeholder="81000065 ou 0.00.00.000"
                  className={errors.tussCode ? 'error' : ''}
                />
                {errors.tussCode && <span className="error-text">{errors.tussCode}</span>}
              </div>

              <div className="form-field">
                <label>Código Interno</label>
                <input
                  type="text"
                  value={formData.internalCode}
                  onChange={(event) => setFormData({ ...formData, internalCode: event.target.value })}
                  placeholder="Ex: LIMP001"
                />
              </div>

              <div className="form-field">
                <label>Atalho</label>
                <input
                  type="text"
                  value={formData.shortcut}
                  onChange={(event) => setFormData({ ...formData, shortcut: event.target.value })}
                  placeholder="Ex: LP"
                />
              </div>

              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>Observações</label>
                <textarea
                  value={formData.notes}
                  onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                  rows={3}
                  placeholder="Observações sobre o procedimento..."
                />
              </div>
            </div>
          )}

          {activeTab === 'precos' && (
            <div className="price-base-modal-form">
              <div className="form-field">
                <label>Preço de Custo</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.costPrice}
                  onChange={(event) => setFormData({ ...formData, costPrice: event.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="form-field">
                <label>
                  Preço <span className="required">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(event) => setFormData({ ...formData, price: event.target.value })}
                  placeholder="0.00"
                  className={errors.price ? 'error' : ''}
                />
                {errors.price && <span className="error-text">{errors.price}</span>}
              </div>

              <div className="form-field">
                <label>Preço Mínimo</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.minPrice}
                  onChange={(event) => setFormData({ ...formData, minPrice: event.target.value })}
                  placeholder="0.00"
                  className={errors.minPrice ? 'error' : ''}
                />
                {errors.minPrice && <span className="error-text">{errors.minPrice}</span>}
              </div>

              <div className="form-field">
                <label>Preço Máximo</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.maxPrice}
                  onChange={(event) => setFormData({ ...formData, maxPrice: event.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="form-field">
                <label>Restringir Preço</label>
                <select
                  value={formData.priceRestriction}
                  onChange={(event) =>
                    setFormData({ ...formData, priceRestriction: event.target.value })
                  }
                >
                  <option value={PRICE_RESTRICTION.LIVRE}>Livre</option>
                  <option value={PRICE_RESTRICTION.AVISAR}>Avisar</option>
                  <option value={PRICE_RESTRICTION.BLOQUEAR}>Bloquear</option>
                  <option value={PRICE_RESTRICTION.FIXO}>Fixo</option>
                </select>
                {formData.priceRestriction === PRICE_RESTRICTION.FIXO && (
                  <p className="price-base-restriction-warning">
                    ⚠️ Preço será travado no Orçamento
                  </p>
                )}
              </div>

              <div className="form-field">
                <label>Tipo de Comissão</label>
                <select
                  value={formData.commissionType}
                  onChange={(event) =>
                    setFormData({ ...formData, commissionType: event.target.value })
                  }
                >
                  <option value={COMMISSION_TYPE.NENHUMA}>Nenhuma</option>
                  <option value={COMMISSION_TYPE.PERCENTUAL}>Percentual</option>
                  <option value={COMMISSION_TYPE.VALOR}>Valor Fixo</option>
                </select>
              </div>

              {formData.commissionType !== COMMISSION_TYPE.NENHUMA && (
                <div className="form-field">
                  <label>Valor da Comissão</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.commissionValue}
                    onChange={(event) =>
                      setFormData({ ...formData, commissionValue: event.target.value })
                    }
                    placeholder={
                      formData.commissionType === COMMISSION_TYPE.PERCENTUAL ? '%' : 'R$'
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEditTableModal({ table, onClose, onSave, user }) {
  const [formData, setFormData] = useState({
    name: table?.name || '',
    type: table?.type || PRICE_TABLE_TYPE.PARTICULAR,
    active: table?.active !== undefined ? table.active : true,
    isDefault: table?.isDefault || false,
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('Nome da tabela é obrigatório');
      return;
    }
    try {
      updatePriceTable(user, table.id, formData);
      onSave();
    } catch (error) {
      alert(error.message || 'Erro ao salvar tabela');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar Tabela</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label>
              Nome da Tabela <span className="required">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label>
              Tipo <span className="required">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(event) => setFormData({ ...formData, type: event.target.value })}
            >
              <option value={PRICE_TABLE_TYPE.PARTICULAR}>Particular</option>
              <option value={PRICE_TABLE_TYPE.CONVENIO}>Convênio</option>
              <option value={PRICE_TABLE_TYPE.PROMOCIONAL}>Promocional</option>
              <option value={PRICE_TABLE_TYPE.PARCERIA}>Parceria</option>
              <option value={PRICE_TABLE_TYPE.INTERNA}>Interna</option>
            </select>
          </div>
          <div className="form-field">
            <label>
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(event) => setFormData({ ...formData, active: event.target.checked })}
              />
              Tabela Ativa
            </label>
          </div>
          <div className="form-field">
            <label>
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(event) => setFormData({ ...formData, isDefault: event.target.checked })}
              />
              Definir como tabela padrão
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button primary" onClick={handleSave}>
            <Save size={16} />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
