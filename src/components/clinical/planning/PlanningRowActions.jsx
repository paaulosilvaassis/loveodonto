import { Trash2 } from 'lucide-react';

export function PlanningRowActions({ onRemove }) {
  return (
    <div className="clinical-planning-actions">
      <button
        type="button"
        className="clinical-planning-action-btn clinical-planning-action-btn--remove"
        onClick={onRemove}
        title="Remover procedimento"
        aria-label="Remover procedimento"
      >
        <Trash2 size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
