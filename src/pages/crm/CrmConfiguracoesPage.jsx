import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { Settings } from 'lucide-react';

/**
 * Configurações gerais do CRM (responsáveis padrão, prazos, etc.).
 */
export default function CrmConfiguracoesPage() {
  return (
    <CrmLayout
      title="Configurações"
      description="Responsáveis padrão, prazos de follow-up, tags automáticas e horários de envio."
    >
      <div className="crm-module-placeholder">
        <Settings size={40} className="crm-module-icon" aria-hidden />
        <p className="muted">Configurações do CRM serão implementadas aqui.</p>
      </div>
    </CrmLayout>
  );
}
