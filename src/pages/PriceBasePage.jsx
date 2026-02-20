import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import {
  createPriceTable,
  updatePriceTable,
  deletePriceTable,
  listPriceTables,
  duplicatePriceTable,
  listProcedures,
  PRICE_TABLE_TYPE,
} from '../services/priceBaseService.js';
import { Plus, Edit, Trash2, Copy, Star, X, Save } from 'lucide-react';

export default function PriceBasePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [priceTables, setPriceTables] = useState([]);
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);

  useEffect(() => {
    refreshPriceTables();
  }, []);

  const refreshPriceTables = () => {
    try {
      const tables = listPriceTables();
      setPriceTables(tables);
    } catch (error) {
      alert(`Erro ao carregar tabelas: ${error.message}`);
    }
  };

  const handleDuplicateTable = (tableId) => {
    const table = priceTables.find((item) => item.id === tableId);
    if (!table) return;
    const newName = `${table.name} (Cópia)`;
    try {
      const newTable = duplicatePriceTable(user, tableId, newName);
      refreshPriceTables();
      if (newTable?.id) {
        navigate(`/gestao-comercial/base-de-preco/tabelas/${newTable.id}`);
      }
    } catch (error) {
      alert(error.message || 'Erro ao duplicar tabela');
    }
  };

  const handleDeleteTable = (tableId) => {
    if (!confirm('Tem certeza que deseja excluir esta tabela?')) return;
    try {
      deletePriceTable(user, tableId);
      refreshPriceTables();
    } catch (error) {
      alert(error.message || 'Erro ao excluir tabela');
    }
  };

  const tableProcedureCounts = useMemo(() => {
    const map = new Map();
    priceTables.forEach((table) => {
      map.set(table.id, listProcedures({ priceTableId: table.id }).length);
    });
    return map;
  }, [priceTables]);

  return (
    <div className="price-base-page">
      <div className="price-base-header">
        <div>
          <h1 className="price-base-title">Base de Preço</h1>
          <p className="price-base-subtitle">Gerencie suas tabelas de preço</p>
        </div>
      </div>

      <SectionCard>
        <div className="price-base-sidebar-header">
          <h2>Tabelas de Preço</h2>
          <button
            type="button"
            className="button primary"
            onClick={() => setShowAddTableModal(true)}
          >
            <Plus size={16} />
            Criar Tabela
          </button>
        </div>

        {priceTables.length === 0 ? (
          <div className="price-base-empty-state">
            <p>Crie uma tabela para começar</p>
            <button
              type="button"
              className="button primary"
              onClick={() => setShowAddTableModal(true)}
            >
              <Plus size={16} />
              Criar Tabela de Preço
            </button>
          </div>
        ) : (
          <div className="price-base-tables-list">
            {priceTables.map((table) => (
              <div
                key={table.id}
                className="price-base-table-item"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/gestao-comercial/base-de-preco/tabelas/${table.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    navigate(`/gestao-comercial/base-de-preco/tabelas/${table.id}`);
                  }
                }}
              >
                <div className="price-base-table-item-header">
                  <div className="price-base-table-item-name">
                    {table.name}
                    {table.isDefault && (
                      <span className="price-base-table-badge">
                        <Star size={12} />
                        Padrão
                      </span>
                    )}
                  </div>
                  <div className="price-base-table-item-type">{table.type || 'PARTICULAR'}</div>
                </div>
                <div className="price-base-table-item-meta">
                  <span className={`price-base-status-badge ${table.active ? 'active' : 'inactive'}`}>
                    {table.active ? 'Ativa' : 'Inativa'}
                  </span>
                  <span className="price-base-table-item-count">
                    {tableProcedureCounts.get(table.id) || 0} procedimentos
                  </span>
                </div>
                <div className="price-base-table-item-actions">
                  <button
                    type="button"
                    className="price-base-table-item-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingTable(table);
                      setShowAddTableModal(true);
                    }}
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    type="button"
                    className="price-base-table-item-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDuplicateTable(table.id);
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  {!table.isDefault && (
                    <button
                      type="button"
                      className="price-base-table-item-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteTable(table.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {showAddTableModal && (
        <AddEditTableModal
          table={editingTable}
          onClose={() => {
            setShowAddTableModal(false);
            setEditingTable(null);
          }}
          onSave={() => {
            refreshPriceTables();
            setShowAddTableModal(false);
            setEditingTable(null);
          }}
          user={user}
        />
      )}
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
      if (table) {
        updatePriceTable(user, table.id, formData);
      } else {
        createPriceTable(user, formData);
      }
      onSave();
    } catch (error) {
      alert(error.message || 'Erro ao salvar tabela');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{table ? 'Editar Tabela' : 'Nova Tabela'}</h2>
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
              placeholder="Ex: Particular, Convênio X, Promoção 2026"
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
