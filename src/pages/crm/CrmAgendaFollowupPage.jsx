import { CrmModulePage } from './CrmModulePage.jsx';
import { Calendar } from 'lucide-react';

export default function CrmAgendaFollowupPage() {
  return (
    <CrmModulePage
      title="Agenda & Follow-up"
      description="Lembretes de retorno, follow-up automático por tempo e alertas visuais no CRM. Integração com a Agenda do app."
    >
      <div className="crm-module-placeholder">
        <Calendar size={40} className="crm-module-icon" aria-hidden />
        <p className="muted">
          Exemplos: orçamento sem resposta em 3 dias, avaliação agendada não confirmada, paciente sem retorno há 6 meses. Alertas e integração com Agenda serão implementados aqui.
        </p>
      </div>
    </CrmModulePage>
  );
}
