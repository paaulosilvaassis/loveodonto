import { useParams } from 'react-router-dom';
import { CrmModulePage } from './CrmModulePage.jsx';
import { User } from 'lucide-react';

export default function CrmPerfilPage() {
  const { leadId } = useParams();

  return (
    <CrmModulePage
      title={leadId ? 'Perfil do Lead / Paciente' : 'Perfil Lead / Paciente'}
      description="Dados principais, linha do tempo (contatos, mensagens, status, orçamentos, agendamentos) e tags personalizadas (ex.: Quente, Implante Total, Alto Ticket)."
    >
      <div className="crm-module-placeholder">
        <User size={40} className="crm-module-icon" aria-hidden />
        <p className="muted">
          {leadId
            ? `Perfil do lead ${leadId}: abas Dados, Linha do tempo e Tags serão carregadas aqui.`
            : 'Selecione um lead no Pipeline ou na Captação para abrir o perfil completo.'}
        </p>
      </div>
    </CrmModulePage>
  );
}
