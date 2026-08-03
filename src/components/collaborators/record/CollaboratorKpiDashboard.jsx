import {
  Briefcase,
  Clock,
  DollarSign,
  Shield,
  Stethoscope,
  Award,
} from 'lucide-react';

const ICONS = {
  access: Shield,
  profile: Briefcase,
  hours: Clock,
  schedule: Clock,
  salary: DollarSign,
  specialty: Stethoscope,
  council: Award,
  tenure: Clock,
};

export default function CollaboratorKpiDashboard({ items = [] }) {
  if (!items.length) return null;
  return (
    <section className="cr-kpi-strip" aria-label="Resumo do colaborador">
      {items.map((item) => {
        const Icon = ICONS[item.key] || Briefcase;
        return (
          <article key={item.key} className="cr-kpi-card">
            <span className="cr-kpi-card__icon" aria-hidden><Icon size={14} /></span>
            <div className="cr-kpi-card__text">
              <span className="cr-kpi-card__label">{item.label}</span>
              <strong className="cr-kpi-card__value">{item.value}</strong>
              {item.hint ? <span className="cr-kpi-card__hint">{item.hint}</span> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
