import { useMemo } from 'react';
import { groupAppointmentsByCategory } from '../../services/patientFlowService.js';

export default function FlowTopSummaryChips({ appointments, selectedCategory, onSelect }) {
  const categories = useMemo(() => groupAppointmentsByCategory(appointments), [appointments]);

  return (
    <div className="flow-summary-chips">
      {categories.slice(0, 6).map((category) => {
        const isActive = selectedCategory === category.key;
        return (
          <button
            key={category.key}
            type="button"
            className={`flow-summary-chip ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(isActive ? null : category.key)}
          >
            {category.key} <span>({category.total})</span>
          </button>
        );
      })}
    </div>
  );
}
