import { useMemo } from 'react';
import { Section } from '../../components/Section.jsx';
import { listPlans } from '../../services/planService.js';

export default function MasterPlansPage() {
  const plans = useMemo(() => listPlans(false), []);

  return (
    <div className="stack">
      <Section title="Planos">
        <div className="card">
          <table className="access-list-table">
            <thead><tr><th>Nome</th><th>Preço</th><th>Intervalo</th><th>Ativo</th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}><td><strong>{p.name}</strong></td><td>R$ {((p.price || 0) / 100).toFixed(2)}</td><td>{p.interval || 'month'}</td><td>{p.is_active !== false ? 'Sim' : 'Não'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
