import { CheckCircle2, Lock } from 'lucide-react';
import { getNavStepStatus, STEP_STATUS, STEP_STATUS_LABELS } from './clinicalAppointmentConfig.js';

const STATUS_CLASS = {
  [STEP_STATUS.PENDING]: 'is-pending',
  [STEP_STATUS.IN_PROGRESS]: 'is-active',
  [STEP_STATUS.COMPLETED]: 'is-done',
  [STEP_STATUS.BLOCKED]: 'is-blocked',
};

/**
 * Barra horizontal de etapas do Atendimento Clínico.
 */
export function ClinicalStepNav({ items, activeSection, workflow, onSelect, getLockMessage }) {
  return (
    <nav className="clinical-step-nav clinical-step-nav--horizontal" aria-label="Etapas do atendimento">
      <ol className="clinical-step-nav-list">
        {items.map((item, index) => {
          const Icon = item.icon;
          const status = getNavStepStatus(item.id, workflow, activeSection);
          const isCurrent = activeSection === item.id;
          const isBlocked = status === STEP_STATUS.BLOCKED;
          const isDone = status === STEP_STATUS.COMPLETED;
          const title = isBlocked && getLockMessage ? getLockMessage(item.id) : undefined;

          return (
            <li key={item.id} className="clinical-step-nav-list-item">
              <button
                type="button"
                className={`clinical-step-nav-item ${STATUS_CLASS[status] || ''} ${isCurrent ? 'is-current' : ''}`}
                onClick={() => onSelect(item.id)}
                title={title}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="clinical-step-nav-index">{index + 1}</span>
                <span className="clinical-step-nav-icon">
                  {isBlocked ? (
                    <Lock size={14} aria-hidden="true" />
                  ) : isDone && !isCurrent ? (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  ) : (
                    <Icon size={14} aria-hidden="true" />
                  )}
                </span>
                <span className="clinical-step-nav-text">
                  <span className="clinical-step-nav-name">{item.label}</span>
                  <span className={`clinical-step-nav-status clinical-step-nav-status--${status}`}>
                    {STEP_STATUS_LABELS[status]}
                  </span>
                </span>
              </button>
              {index < items.length - 1 && (
                <span className="clinical-step-nav-connector" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
