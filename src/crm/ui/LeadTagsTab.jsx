import { useState, useMemo, useRef, useEffect } from 'react';
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
  const wrapperRef = useRef(null);

  const linkedTags = useMemo(() => (leadId ? listTagsByLead(leadId) : []), [leadId, lead?.tagList]);
  const allTags = useMemo(() => listTags(), []);
  const categories = useMemo(() => listTagCategories(), []);

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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdd = (tag) => {
    if (!leadId || linkedIds.has(tag.id)) return;
    addTagToLead(leadId, tag.id);
    setOpen(false);
    setQuery('');
    onUpdate?.();
  };

  const handleRemove = (tagId) => {
    if (!leadId) return;
    removeTagFromLead(leadId, tagId);
    onUpdate?.();
  };

  const handleCreateTag = () => {
    const name = (newName || '').trim();
    if (!name) return;
    const tag = createTag({
      name,
      category: newCategory || 'Outros',
      color: newColor || DEFAULT_COLOR,
    });
    addTagToLead(leadId, tag.id);
    setNewName('');
    setNewCategory('');
    setNewColor(DEFAULT_COLOR);
    setCreateNew(false);
    setOpen(false);
    onUpdate?.();
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
              onClick={() => handleRemove(t.id)}
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
            >
              <Plus size={16} /> Adicionar tag
            </button>
            {open && (
              <div className="crm-lead-tags-dropdown">
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
                            onClick={() => handleAdd(t)}
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
              </div>
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
