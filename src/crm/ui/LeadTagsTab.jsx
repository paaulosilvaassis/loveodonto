import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import {
  listTags,
  listTagsByLead,
  addTagToLead,
  removeTagFromLead,
  createTag,
  listTagCategories,
} from '../../services/crmTagService.js';

const DEFAULT_COLOR = '#6366f1';
const DROPDOWN_VIEWPORT_MARGIN = 16;
const DROPDOWN_OFFSET = 10;
const DROPDOWN_MIN_WIDTH = 280;
const DROPDOWN_MAX_WIDTH = 380;
const DROPDOWN_MAX_HEIGHT = 320;

/**
 * Aba Tags do lead: pills, adicionar (autocomplete), criar nova tag, remover com X.
 */
export function LeadTagsTab({ leadId, lead, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [linkedTags, setLinkedTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [dropdownDirection, setDropdownDirection] = useState('bottom');
  const wrapperRef = useRef(null);
  const triggerButtonRef = useRef(null);
  const dropdownRef = useRef(null);

  const categories = useMemo(() => listTagCategories(), []);

  const syncLeadTagsState = () => {
    const nextLinkedTags = leadId ? listTagsByLead(leadId) : [];
    const nextAllTags = listTags();
    setLinkedTags(nextLinkedTags);
    setAllTags(nextAllTags);
  };

  const linkedIds = useMemo(() => new Set(linkedTags.map((t) => t.id)), [linkedTags]);

  const filteredTags = useMemo(() => {
    if (!query.trim()) return allTags;
    const q = query.trim().toLowerCase();
    return allTags.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q)
    );
  }, [allTags, query]);

  useEffect(() => {
    function handleClickOutside(e) {
      const clickedInsideWrapper = wrapperRef.current?.contains(e.target);
      const clickedInsideDropdown = dropdownRef.current?.contains(e.target);
      if (!clickedInsideWrapper && !clickedInsideDropdown) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    syncLeadTagsState();
  }, [leadId, lead?.tagList]);

  useEffect(() => {
    if (!open) return undefined;

    const updateDropdownPosition = () => {
      const triggerRect = triggerButtonRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const availableBelow = window.innerHeight - triggerRect.bottom - DROPDOWN_VIEWPORT_MARGIN;
      const availableAbove = triggerRect.top - DROPDOWN_VIEWPORT_MARGIN;
      const shouldOpenTop = availableBelow < 200 && availableAbove > availableBelow;
      const nextDirection = shouldOpenTop ? 'top' : 'bottom';
      const maxHeightBySpace = shouldOpenTop ? availableAbove - DROPDOWN_OFFSET : availableBelow - DROPDOWN_OFFSET;
      const maxHeight = Math.max(160, Math.min(DROPDOWN_MAX_HEIGHT, maxHeightBySpace));
      const preferredWidth = Math.max(DROPDOWN_MIN_WIDTH, triggerRect.width);
      const width = Math.min(DROPDOWN_MAX_WIDTH, preferredWidth);
      const left = Math.min(
        Math.max(DROPDOWN_VIEWPORT_MARGIN, triggerRect.left),
        window.innerWidth - width - DROPDOWN_VIEWPORT_MARGIN
      );

      const style = {
        position: 'fixed',
        width: `${width}px`,
        left: `${left}px`,
        zIndex: 1100,
        '--crm-tag-dropdown-max-height': `${maxHeight}px`,
      };

      if (shouldOpenTop) {
        style.bottom = `${window.innerHeight - triggerRect.top + DROPDOWN_OFFSET}px`;
      } else {
        style.top = `${triggerRect.bottom + DROPDOWN_OFFSET}px`;
      }

      setDropdownDirection(nextDirection);
      setDropdownStyle(style);
    };

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [open]);

  const handleAddTag = async (tag) => {
    if (!leadId || linkedIds.has(tag.id)) return;
    setLinkedTags((prev) => [...prev, tag]);
    setOpen(false);
    setQuery('');

    try {
      await addTagToLead(leadId, tag.id);
      syncLeadTagsState();
      onUpdate?.();
    } catch (error) {
      setLinkedTags((prev) => prev.filter((t) => t.id !== tag.id));
    }
  };

  const handleRemoveTag = async (tagId) => {
    if (!leadId) return;
    const removedTag = linkedTags.find((t) => t.id === tagId) || null;
    if (!removedTag) return;
    setLinkedTags((prev) => prev.filter((t) => t.id !== tagId));

    try {
      await removeTagFromLead(leadId, tagId);
      syncLeadTagsState();
      onUpdate?.();
    } catch (error) {
      setLinkedTags((prev) => [...prev, removedTag]);
    }
  };

  const handleCreateTag = async () => {
    const name = (newName || '').trim();
    if (!name || !leadId) return;
    try {
      const tag = await createTag({
        name,
        category: newCategory || 'Outros',
        color: newColor || DEFAULT_COLOR,
      });
      await handleAddTag(tag);
      setNewName('');
      setNewCategory('');
      setNewColor(DEFAULT_COLOR);
      setCreateNew(false);
      setOpen(false);
      syncLeadTagsState();
    } catch (error) {
      console.error('Erro ao criar tag:', error);
    }
  };

  const byCategory = useMemo(() => {
    const map = {};
    filteredTags.forEach((t) => {
      const c = t.category || 'Outros';
      if (!map[c]) map[c] = [];
      map[c].push(t);
    });
    return map;
  }, [filteredTags]);

  return (
    <div className="crm-lead-tags-tab" ref={wrapperRef}>
      <div className="crm-lead-tags-pills">
        {linkedTags.map((t) => (
          <span
            key={t.id}
            className="crm-tag-pill"
            style={{ '--tag-color': t.color || DEFAULT_COLOR }}
          >
            <span className="crm-tag-pill-label">{t.name}</span>
            {t.category && <span className="crm-tag-pill-cat">{t.category}</span>}
            <button
              type="button"
              className="crm-tag-pill-remove"
              onClick={() => handleRemoveTag(t.id)}
              aria-label={`Remover tag ${t.name}`}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      <div className="crm-lead-tags-actions">
        {!createNew ? (
          <>
            <button
              type="button"
              className="button secondary"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              ref={triggerButtonRef}
            >
              <Plus size={16} /> Adicionar tag
            </button>
            {open && dropdownStyle && createPortal(
              <div
                className={`crm-lead-tags-dropdown crm-lead-tags-dropdown--${dropdownDirection}`}
                style={dropdownStyle}
                ref={dropdownRef}
              >
                <input
                  type="text"
                  className="crm-lead-tags-search"
                  placeholder="Buscar tag..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <div className="crm-lead-tags-dropdown-list">
                  {Object.keys(byCategory).length === 0 ? (
                    <p className="crm-lead-tags-empty">Nenhuma tag encontrada.</p>
                  ) : (
                    Object.entries(byCategory).map(([cat, tags]) => (
                      <div key={cat} className="crm-lead-tags-group">
                        <div className="crm-lead-tags-group-title">{cat}</div>
                        {tags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="crm-lead-tags-option"
                            disabled={linkedIds.has(t.id)}
                            onClick={() => handleAddTag(t)}
                          >
                            <span
                              className="crm-lead-tags-option-dot"
                              style={{ background: t.color || DEFAULT_COLOR }}
                            />
                            {t.name}
                            {linkedIds.has(t.id) && <span className="crm-lead-tags-option-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  className="crm-lead-tags-create-btn"
                  onClick={() => setCreateNew(true)}
                >
                  + Criar nova tag
                </button>
              </div>,
              document.body
            )}
          </>
        ) : (
          <div className="crm-lead-tags-create-form">
            <input
              type="text"
              placeholder="Nome da tag"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="crm-lead-tags-input"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="crm-lead-tags-select"
              aria-label="Categoria"
            >
              <option value="">Nova categoria (Outros)</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="crm-lead-tags-color"
              title="Cor"
            />
            <button type="button" className="button primary" onClick={handleCreateTag}>
              Criar e adicionar
            </button>
            <button type="button" className="button secondary" onClick={() => { setCreateNew(false); setNewName(''); setNewCategory(''); }}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
