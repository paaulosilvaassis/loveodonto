import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { listFollowUps, getLeadById } from '../../services/crmService.js';
import { Calendar } from 'lucide-react';

/**
 * Lista de follow-ups (LeadTask). Integração com agenda e alertas.
 */
export default function CrmFollowupPage() {
  const pending = useMemo(() => listFollowUps({ pending: true }), []);
  const byLead = useMemo(() => {
    const map = {};
    pending.forEach((f) => {
      if (!map[f.leadId]) map[f.leadId] = getLeadById(f.leadId);
    });
    return map;
  }, [pending]);

  return (
    <CrmLayout
      title="Follow-up"
      description="Lembretes de retorno e tarefas. Integração com Agenda e alertas visuais no CRM."
    >
      <div className="crm-followup-list">
        {pending.length === 0 ? (
          <div className="crm-module-placeholder">
            <Calendar size={40} className="crm-module-icon" aria-hidden />
            <p className="muted">Nenhum follow-up pendente.</p>
          </div>
        ) : (
          <ul className="crm-followup-items">
            {pending.map((f) => (
              <li key={f.id} className="crm-followup-item">
                <Link to={`/crm/leads/${f.leadId}`} className="crm-followup-lead">
                  {byLead[f.leadId]?.name || f.leadId}
                </Link>
                <span className="crm-followup-due">{new Date(f.dueAt).toLocaleDateString('pt-BR')}</span>
                <span className="crm-followup-type">{f.type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CrmLayout>
  );
}
