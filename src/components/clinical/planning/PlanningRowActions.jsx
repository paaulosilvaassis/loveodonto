import { useEffect, useRef, useState } from 'react';
import { Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react';

export function PlanningRowActions({ onDuplicate, onEdit, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [open]);

  return (
    <div className="clinical-planning-actions" ref={ref}>
      <button
        type="button"
        className="clinical-planning-action-btn"
        onClick={onEdit}
        title="Editar"
        aria-label="Editar procedimento"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        className="clinical-planning-action-btn clinical-planning-action-btn--danger"
        onClick={onRemove}
        title="Remover"
        aria-label="Remover procedimento"
      >
        <Trash2 size={15} />
      </button>
      <button
        type="button"
        className="clinical-planning-action-btn clinical-planning-action-btn--menu"
        onClick={() => setOpen((prev) => !prev)}
        title="Mais opções"
        aria-label="Menu de opções"
      >
        <MoreVertical size={15} />
      </button>
      {open ? (
        <div className="clinical-planning-actions-menu">
          <button
            type="button"
            onClick={() => {
              onDuplicate();
              setOpen(false);
            }}
          >
            <Copy size={14} />
            Duplicar
          </button>
          <button
            type="button"
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
          >
            <Pencil size={14} />
            Editar
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => {
              onRemove();
              setOpen(false);
            }}
          >
            <Trash2 size={14} />
            Excluir
          </button>
        </div>
      ) : null}
    </div>
  );
}
