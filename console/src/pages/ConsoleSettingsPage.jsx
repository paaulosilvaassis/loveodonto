import { PageHeader, Panel } from '../components/ConsoleUi.jsx';

export default function ConsoleSettingsPage() {
  return (
    <div className="pc-stack">
      <PageHeader title="Configurações" description="Parâmetros da Platform Console, segurança e preferências operacionais." />
      <Panel title="Segurança">
        <ul className="pc-info-list">
          <li><span>Auth provider</span><strong>Supabase Auth separado</strong></li>
          <li><span>Controle de acesso</span><strong>RBAC + permissões por tela/ação</strong></li>
          <li><span>Auditoria</span><strong>Obrigatória para ações sensíveis</strong></li>
        </ul>
      </Panel>
    </div>
  );
}
