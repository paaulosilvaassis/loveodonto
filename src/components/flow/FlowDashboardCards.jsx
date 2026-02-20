import { useMemo } from 'react';
import { groupAppointmentsByCategory } from '../../services/patientFlowService.js';

export default function FlowDashboardCards({ appointments, selectedCategory, onCategorySelect }) {
  const categories = useMemo(() => {
    return groupAppointmentsByCategory(appointments);
  }, [appointments]);

  return (
    <div className="flow-dashboard-cards">
      {categories.map((category) => {
        const isSelected = selectedCategory === category.key;
        const completionRate = category.total > 0
          ? Math.round((category.completed / category.total) * 100)
          : 0;
        const presenceRate = category.total > 0
          ? Math.round((category.present / category.total) * 100)
          : 0;

        return (
          <button
            key={category.key}
            type="button"
            className={`flow-dashboard-card ${isSelected ? 'selected' : ''}`}
            onClick={() => onCategorySelect(isSelected ? null : category.key)}
          >
            <div className="flow-dashboard-card-header">
              <div className="flow-dashboard-card-title-wrap">
                <h3 className="flow-dashboard-card-title">{category.key}</h3>
                <span className="flow-dashboard-card-subtitle">Agendamentos do dia</span>
              </div>
              <div className="flow-dashboard-card-badge">{category.total}</div>
            </div>
            <div className="flow-dashboard-card-metrics">
              <div className="flow-dashboard-card-metric">
                <span className="flow-dashboard-card-metric-label">Realizados</span>
                <div className="flow-dashboard-card-metric-value">
                  <strong>{category.completed}</strong>
                  <span>/{category.total}</span>
                </div>
                <span className="flow-dashboard-card-metric-percent">{completionRate}%</span>
              </div>
              <div className="flow-dashboard-card-metric">
                <span className="flow-dashboard-card-metric-label">Presentes</span>
                <div className="flow-dashboard-card-metric-value">
                  <strong>{category.present}</strong>
                  <span>/{category.total}</span>
                </div>
                <span className="flow-dashboard-card-metric-percent">{presenceRate}%</span>
              </div>
            </div>
            {category.total > 0 && (
              <div className="flow-dashboard-card-progress">
                <div 
                  className="flow-dashboard-card-progress-bar"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
