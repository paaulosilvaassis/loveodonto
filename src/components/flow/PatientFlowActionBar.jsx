/**
 * Painel de ações operacionais — mini-cards por categoria com identidade cromática.
 */

import {
  UserCheck,
  Stethoscope,
  TrendingUp,
  CircleCheck,
} from 'lucide-react';

const ACTION_GROUPS = [
  {
    id: 'recepcao',
    label: 'Recepção',
    theme: 'recepcao',
    Icon: UserCheck,
    actions: [
      { id: 'checkin', label: 'Registrar chegada', level: 'primary' },
      { id: 'move', label: 'Mover paciente', level: 'secondary' },
    ],
  },
  {
    id: 'atendimento',
    label: 'Atendimento',
    theme: 'atendimento',
    Icon: Stethoscope,
    actions: [
      { id: 'start', label: 'Iniciar atendimento', level: 'primary' },
      { id: 'end', label: 'Encerrar atendimento', level: 'secondary' },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    theme: 'comercial',
    Icon: TrendingUp,
    actions: [
      { id: 'commercial', label: 'Enviar para avaliação comercial', level: 'primary' },
      { id: 'financial', label: 'Enviar para financeiro', level: 'secondary' },
    ],
  },
  {
    id: 'finalizacao',
    label: 'Finalização',
    theme: 'finalizacao',
    Icon: CircleCheck,
    actions: [
      { id: 'finalize', label: 'Finalizar atendimento', level: 'primary' },
      { id: 'noshow', label: 'Registrar falta', level: 'secondary' },
    ],
  },
];

function FlowActionButton({ label, level, onClick }) {
  return (
    <button
      type="button"
      className={`pf-action-btn pf-action-btn--${level}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ActionCategoryCard({ group, handlers }) {
  const { Icon } = group;

  return (
    <article className={`pf-action-card pf-action-card--${group.theme}`}>
      <header className="pf-action-card-head">
        <span className="pf-action-card-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <h3 className="pf-action-card-title">{group.label}</h3>
      </header>
      <div className="pf-action-card-buttons">
        {group.actions.map((action) => (
          <FlowActionButton
            key={action.id}
            label={action.label}
            level={action.level}
            onClick={handlers[action.id]}
          />
        ))}
      </div>
    </article>
  );
}

export default function PatientFlowActionBar({ handlers = {} }) {
  return (
    <section className="pf-action-panel" aria-labelledby="pf-action-panel-title">
      <header className="pf-action-panel-head">
        <h2 id="pf-action-panel-title" className="pf-action-panel-title">
          Ações Operacionais
        </h2>
        <p className="pf-action-panel-sub">
          Movimente pacientes entre as etapas do atendimento.
        </p>
      </header>

      <div className="pf-action-grid" role="toolbar" aria-label="Ações rápidas do fluxo">
        {ACTION_GROUPS.map((group) => (
          <ActionCategoryCard key={group.id} group={group} handlers={handlers} />
        ))}
      </div>
    </section>
  );
}
