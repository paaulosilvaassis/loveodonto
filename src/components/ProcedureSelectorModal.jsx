import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Star, Plus, Trash2 } from 'lucide-react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  ModalClose,
} from './ui/Modal.jsx';
import {
  listProcedures,
  getPriceTableForPatient,
  getDefaultPriceTable,
  getEffectivePrice,
  PROCEDURE_STATUS,
} from '../services/priceBaseService.js';
import { loadDb } from '../db/index.js';
import {
  QUICK_SPECIALTY_FILTERS,
  SORT_OPTIONS,
  LIST_TABS,
  PROCEDURE_COMBOS,
  getFavoriteIds,
  toggleFavorite,
  pushRecent,
  recordUsage,
  resolveComboProcedures,
  formatMoney,
  getProcedureCode,
  getEstimatedDuration,
  getRecentIds,
  getUsageCounts,
} from './procedureSelectorConfig.js';

function buildProcedurePayload(proc, priceTableId) {
  const effective = priceTableId ? getEffectivePrice(proc.id, priceTableId) : null;
  const catalogPrice = Number(proc.price) || 0;
  const effectivePrice =
    effective != null && effective.price != null && effective.price !== ''
      ? Number(effective.price)
      : catalogPrice;

  return {
    id: `proc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    procedureId: proc.id,
    procedureCatalogId: proc.id,
    title: proc.title,
    name: proc.title,
    specialty: proc.specialty,
    category: proc.specialty,
    segment: proc.segment,
    code: proc.internalCode || proc.tussCode || '',
    tussCode: proc.tussCode,
    internalCode: proc.internalCode,
    quantity: 1,
    unitValue: effectivePrice,
    totalValue: effectivePrice,
    tooth: '',
    region: '',
    observations: proc.notes || '',
    restriction: effective?.restriction ?? proc.priceRestriction,
    minPrice: effective?.minPrice ?? proc.minPrice,
    maxPrice: effective?.maxPrice ?? proc.maxPrice,
    source: 'price_base',
  };
}

/**
 * Seletor profissional de procedimentos (Base de Preços).
 * Suporta seleção múltipla, favoritos, recentes e combos.
 */
export default function ProcedureSelectorModal({
  open,
  onClose,
  onSelect,
  onSelectMultiple,
  patient = null,
  appointmentId = null,
}) {
  const [search, setSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('usage');
  const [listTab, setListTab] = useState('all');
  const [procedures, setProcedures] = useState([]);
  const [selectedMap, setSelectedMap] = useState({});
  const [favorites, setFavorites] = useState([]);
  const [hoverId, setHoverId] = useState(null);

  const db = loadDb();
  let patientData = patient;
  if (!patientData && appointmentId) {
    const appointment = db.appointments?.find((a) => a.id === appointmentId);
    if (appointment?.patientId) {
      patientData = db.patients?.find((p) => p.id === appointment.patientId);
    }
  }
  const priceTable = patientData ? getPriceTableForPatient(patientData) : getDefaultPriceTable();
  const priceTableId = priceTable?.id || null;

  const resetState = useCallback(() => {
    setSearch('');
    setSpecialtyFilter('all');
    setSortBy('usage');
    setListTab('all');
    setSelectedMap({});
    setHoverId(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetState();
    if (priceTableId) {
      setFavorites(getFavoriteIds(priceTableId));
      const list = listProcedures({
        priceTableId,
        status: PROCEDURE_STATUS.ATIVO,
        sortBy: 'name',
      });
      setProcedures(list);
    } else {
      setProcedures([]);
    }
  }, [open, priceTableId, resetState]);

  const enrichedProcedures = useMemo(() => {
    const usage = getUsageCounts(priceTableId);
    return procedures.map((proc) => {
      const effective = priceTableId ? getEffectivePrice(proc.id, priceTableId) : null;
      const unitValue =
        effective?.price != null && effective.price !== ''
          ? Number(effective.price)
          : Number(proc.price) || 0;
      return {
        ...proc,
        unitValue,
        usageCount: usage[proc.id] || 0,
        isFavorite: favorites.includes(proc.id),
      };
    });
  }, [procedures, priceTableId, favorites]);

  const filteredProcedures = useMemo(() => {
    let list = [...enrichedProcedures];
    const recentIds = getRecentIds(priceTableId);

    if (listTab === 'favorites') {
      list = list.filter((p) => favorites.includes(p.id));
    } else if (listTab === 'recent') {
      list = list.filter((p) => recentIds.includes(p.id));
      list.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
    } else if (listTab === 'popular') {
      list = list.filter((p) => p.usageCount > 0);
      list.sort((a, b) => b.usageCount - a.usageCount);
    }

    if (specialtyFilter !== 'all') {
      list = list.filter((p) => {
        const spec = (p.specialty || '').toLowerCase();
        const filter = specialtyFilter.toLowerCase();
        return spec.includes(filter) || spec === filter;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.specialty || '').toLowerCase().includes(q) ||
          (p.internalCode || '').toLowerCase().includes(q) ||
          (p.tussCode || '').toLowerCase().includes(q)
      );
    }

    if (sortBy === 'name') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'price_asc') {
      list.sort((a, b) => a.unitValue - b.unitValue);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.unitValue - a.unitValue);
    } else if (sortBy === 'usage') {
      list.sort((a, b) => b.usageCount - a.usageCount || a.title.localeCompare(b.title));
    }

    return list;
  }, [enrichedProcedures, specialtyFilter, search, sortBy, listTab, favorites, priceTableId]);

  const selectedItems = useMemo(
    () => Object.values(selectedMap),
    [selectedMap]
  );

  const subtotal = selectedItems.reduce((sum, item) => sum + item.unitValue, 0);

  const toggleSelected = (proc) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[proc.id]) {
        delete next[proc.id];
      } else {
        next[proc.id] = { proc, payload: buildProcedurePayload(proc, priceTableId) };
      }
      return next;
    });
  };

  const removeSelected = (procId) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      delete next[procId];
      return next;
    });
  };

  const handleFavorite = (e, procId) => {
    e.stopPropagation();
    const next = toggleFavorite(priceTableId, procId);
    setFavorites(next);
  };

  const applyCombo = (combo) => {
    const matches = resolveComboProcedures(combo, enrichedProcedures);
    if (matches.length === 0) return;
    setSelectedMap((prev) => {
      const next = { ...prev };
      matches.forEach((proc) => {
        next[proc.id] = { proc, payload: buildProcedurePayload(proc, priceTableId) };
      });
      return next;
    });
    setListTab('all');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleConfirm = () => {
    if (selectedItems.length === 0) return;
    const payloads = selectedItems.map((s) => s.payload);
    const ids = selectedItems.map((s) => s.proc.id);
    recordUsage(priceTableId, ids);
    pushRecent(priceTableId, ids);

    if (onSelectMultiple) {
      onSelectMultiple(payloads);
    } else {
      payloads.forEach((p) => onSelect(p));
    }
    handleClose();
  };

  const hoveredProc = hoverId ? enrichedProcedures.find((p) => p.id === hoverId) : null;

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent
        size="xl"
        className="procedure-selector-modal"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <ModalHeader className="procedure-selector-header">
          <div>
            <ModalTitle>Selecionar Procedimentos para o Tratamento</ModalTitle>
            <ModalDescription>
              Busque e adicione procedimentos ao planejamento do paciente.
            </ModalDescription>
          </div>
          <ModalClose className="procedure-selector-close" aria-label="Fechar">
            <X size={18} />
          </ModalClose>
        </ModalHeader>

        <ModalBody className="procedure-selector-body">
          <div className="procedure-selector-main">
            <div className="procedure-selector-tabs">
              {LIST_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`procedure-selector-tab ${listTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setListTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {listTab === 'combos' ? (
              <div className="procedure-selector-combos">
                {PROCEDURE_COMBOS.map((combo) => (
                  <button
                    key={combo.id}
                    type="button"
                    className="procedure-selector-combo-card"
                    onClick={() => applyCombo(combo)}
                  >
                    <span className="procedure-selector-combo-emoji">{combo.emoji}</span>
                    <div>
                      <strong>{combo.label}</strong>
                      <p>{combo.description}</p>
                    </div>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="procedure-selector-search-row">
                  <div className="procedure-selector-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Buscar procedimento, código ou especialidade"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="procedure-selector-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    aria-label="Ordenar por"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="procedure-selector-chips" role="tablist" aria-label="Especialidades">
                  {QUICK_SPECIALTY_FILTERS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      role="tab"
                      aria-selected={specialtyFilter === chip.id}
                      className={`procedure-selector-chip ${specialtyFilter === chip.id ? 'is-active' : ''}`}
                      onClick={() => setSpecialtyFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <div className="procedure-selector-list-wrap">
                  {!priceTableId ? (
                    <p className="procedure-selector-empty">
                      Nenhuma tabela de preço disponível. Cadastre em Administrativo → Base de Preços.
                    </p>
                  ) : filteredProcedures.length === 0 ? (
                    <p className="procedure-selector-empty">Nenhum procedimento encontrado.</p>
                  ) : (
                    <table className="procedure-selector-table">
                      <thead>
                        <tr>
                          <th aria-label="Selecionar" />
                          <th>Procedimento</th>
                          <th>Especialidade</th>
                          <th>Código</th>
                          <th>Valor</th>
                          <th>Tempo</th>
                          <th aria-label="Favorito" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProcedures.map((proc) => {
                          const checked = Boolean(selectedMap[proc.id]);
                          return (
                            <tr
                              key={proc.id}
                              className={`procedure-selector-row ${checked ? 'is-selected' : ''}`}
                              onMouseEnter={() => setHoverId(proc.id)}
                              onMouseLeave={() => setHoverId(null)}
                              onClick={() => toggleSelected(proc)}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSelected(proc)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Selecionar ${proc.title}`}
                                />
                              </td>
                              <td>
                                <span className="procedure-selector-name">{proc.title}</span>
                              </td>
                              <td>
                                <span className="procedure-selector-badge">{proc.specialty || '—'}</span>
                              </td>
                              <td className="procedure-selector-code">{getProcedureCode(proc)}</td>
                              <td className="procedure-selector-price">{formatMoney(proc.unitValue)}</td>
                              <td className="procedure-selector-time">{getEstimatedDuration(proc)}</td>
                              <td>
                                <button
                                  type="button"
                                  className={`procedure-selector-fav ${proc.isFavorite ? 'is-on' : ''}`}
                                  onClick={(e) => handleFavorite(e, proc.id)}
                                  aria-label={proc.isFavorite ? 'Remover favorito' : 'Favoritar'}
                                >
                                  <Star size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {hoveredProc && (
                  <div className="procedure-selector-preview">
                    <strong>{hoveredProc.title}</strong>
                    <p>{hoveredProc.notes || 'Sem descrição cadastrada.'}</p>
                    <span>
                      Qtd. padrão: 1 · Tempo médio: {getEstimatedDuration(hoveredProc)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="procedure-selector-sidebar">
            <h3>Procedimentos Selecionados</h3>
            {selectedItems.length === 0 ? (
              <p className="procedure-selector-sidebar-empty">
                Selecione itens na lista ou use um combo pronto.
              </p>
            ) : (
              <ul className="procedure-selector-selected-list">
                {selectedItems.map(({ proc, payload }) => (
                  <li key={proc.id}>
                    <div>
                      <span>{proc.title}</span>
                      <strong>{formatMoney(payload.unitValue)}</strong>
                    </div>
                    <button
                      type="button"
                      className="procedure-selector-remove"
                      onClick={() => removeSelected(proc.id)}
                      aria-label={`Remover ${proc.title}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="procedure-selector-sidebar-summary">
              <div><span>Quantidade</span><strong>{selectedItems.length}</strong></div>
              <div className="procedure-selector-subtotal">
                <span>Subtotal</span>
                <strong>{formatMoney(subtotal)}</strong>
              </div>
            </div>
            <button
              type="button"
              className="clinical-btn clinical-btn--primary clinical-btn--sm procedure-selector-sidebar-cta"
              disabled={selectedItems.length === 0}
              onClick={handleConfirm}
            >
              Adicionar ao planejamento
            </button>
          </aside>
        </ModalBody>

        <ModalFooter className="procedure-selector-footer">
          <button type="button" className="clinical-btn clinical-btn--secondary clinical-btn--sm" onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="clinical-btn clinical-btn--primary clinical-btn--sm"
            disabled={selectedItems.length === 0}
            onClick={handleConfirm}
          >
            Adicionar procedimentos{selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
