import { useState, useMemo } from 'react';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { listAutomations, createAutomation } from '../../services/crmService.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Zap, Plus } from 'lucide-react';

/**
 * Automações: lista + criação placeholder. Schema AutomationRule (gatilho/condição/ação).
 */
export default function CrmAutomacoesPage() {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const rules = useMemo(() => listAutomations(), [refresh]);
  const handleCreate = () => {
    try {
      createAutomation(user, {
        name: 'Nova regra',
        trigger: { type: 'stage_change', stageKey: 'orcamento_apresentado' },
        condition: { delayHours: 24 },
        action: { type: 'send_message', templateId: null },
      });
      setRefresh((r) => r + 1);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <CrmLayout
      title="Automações"
      description="Regras por gatilho, condição e ação. Ex.: ao mover para 'Orçamento Apresentado', enviar mensagem após 24h."
    >
      <div className="crm-automacoes-toolbar">
        <button type="button" className="button primary" onClick={handleCreate}>
          <Plus size={16} /> Nova automação
        </button>
      </div>
      <div className="crm-automacoes-list">
        {rules.length === 0 ? (
          <p className="muted">Nenhuma regra de automação. Crie uma para começar.</p>
        ) : (
          <ul className="crm-automacoes-items">
            {rules.map((r) => (
              <li key={r.id} className="crm-automacoes-item">
                <Zap size={18} />
                <span className="crm-automacoes-name">{r.name}</span>
                <span className="crm-automacoes-trigger">{r.trigger?.type}: {r.trigger?.stageKey || '—'}</span>
                <span className={`crm-automacoes-active ${r.active ? 'active' : ''}`}>{r.active ? 'Ativa' : 'Inativa'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CrmLayout>
  );
}
