/**
 * Shell das rotas protegidas. Carregado via lazy para não bloquear a tela de login.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireRole from './auth/RequireRole.jsx';
import RequireAdminGate from './auth/RequireAdminGate.jsx';
import RequireModule from './auth/RequireModule.jsx';
import RequireFeatureFlag from './auth/RequireFeatureFlag.jsx';
import Layout from './components/Layout.jsx';
import AgendaPage from './pages/AgendaPage.jsx';
import AutomationPage from './pages/AutomationPage.jsx';
import CollaboratorsPage from './pages/CollaboratorsPage.jsx';
import ConfiguracoesUsuariosPage from './pages/ConfiguracoesUsuariosPage.jsx';
import OnboardingClinicaPage from './pages/OnboardingClinicaPage.jsx';
import ClinicSettingsPage from './pages/ClinicSettingsPage.jsx';
import CommunicationPage from './pages/CommunicationPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FinanceReceivablesPage from './pages/FinanceReceivablesPage.jsx';
import FinancePayablesPage from './pages/FinancePayablesPage.jsx';
import FinanceCashRegisterPage from './pages/FinanceCashRegisterPage.jsx';
import FinanceBoletosPage from './pages/FinanceBoletosPage.jsx';
import FinanceFinanciamentoPage from './pages/FinanceFinanciamentoPage.jsx';
import FinanceFaturamentoPage from './pages/FinanceFaturamentoPage.jsx';
import FinanceComissoesPage from './pages/FinanceComissoesPage.jsx';
import FinanceDREPage from './pages/FinanceDREPage.jsx';
import FornecedoresPage from './pages/administrativo/FornecedoresPage.jsx';
import TreatmentPlanTypesAdminPage from './pages/admin/TreatmentPlanTypesAdminPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import AdminUsuariosPage from './pages/AdminUsuariosPage.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import PatientCadastroPage from './pages/PatientCadastroPage.jsx';
import PatientChartPage from './pages/PatientChartPage.jsx';
import OdontogramV2Page from './pages/OdontogramV2Page.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import PriceBasePage from './pages/PriceBasePage.jsx';
import PriceBaseTableDetailPage from './pages/PriceBaseTableDetailPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import PatientJourneyPage from './pages/PatientJourneyPage.jsx';
import PatientFlowPage from './pages/PatientFlowPage.jsx';
import PatientCareCentralPage from './pages/PatientCareCentralPage.jsx';
import ClinicalAppointmentPage from './pages/ClinicalAppointmentPage.jsx';
import GestaoAtendimentoPage from './pages/GestaoAtendimentoPage.jsx';
import BudgetsHubPage from './pages/BudgetsHubPage.jsx';
import CrmShellLayout from './crm/ui/CrmShellLayout.jsx';
import CrmCaptacaoPage from './pages/crm/CrmCaptacaoPage.jsx';
import CrmPipelinePage from './pages/crm/CrmPipelinePage.jsx';
import CrmLeadsListPage from './pages/crm/CrmLeadsListPage.jsx';
import CrmLeadProfilePage from './pages/crm/CrmLeadProfilePage.jsx';
import CrmComunicacaoPage from './pages/crm/CrmComunicacaoPage.jsx';
import CrmFollowupPage from './pages/crm/CrmFollowupPage.jsx';
import CrmOrcamentosPage from './pages/crm/CrmOrcamentosPage.jsx';
import CrmRelatoriosPage from './pages/crm/CrmRelatoriosPage.jsx';
import CrmAutomacoesPage from './pages/crm/CrmAutomacoesPage.jsx';
import CrmConfiguracoesPage from './pages/crm/CrmConfiguracoesPage.jsx';
import ComercialFollowUpPage from './pages/comercial/ComercialFollowUpPage.jsx';
import SupportPage from './pages/suporte/SupportPage.jsx';
import MarketingChatShellLayout from './pages/marketing/MarketingChatShellLayout.jsx';
import MarketingChatDashboardPage from './pages/marketing/chatInteligente/MarketingChatDashboardPage.jsx';
import MarketingChatConnectPage from './pages/marketing/chatInteligente/MarketingChatConnectPage.jsx';
import MarketingChatInboxPage from './pages/marketing/chatInteligente/MarketingChatInboxPage.jsx';
import MarketingChatInboxRealtimePage from './pages/marketing/chatInteligente/MarketingChatInboxRealtimePage.jsx';
import MarketingChatContactsPage from './pages/marketing/chatInteligente/MarketingChatContactsPage.jsx';
import MarketingChatCampaignsPage from './pages/marketing/chatInteligente/MarketingChatCampaignsPage.jsx';
import MarketingChatAutomationsPage from './pages/marketing/chatInteligente/MarketingChatAutomationsPage.jsx';
import MarketingChatAutomationObservabilityPage from './pages/marketing/chatInteligente/MarketingChatAutomationObservabilityPage.jsx';
import MarketingChatFunnelsPage from './pages/marketing/chatInteligente/MarketingChatFunnelsPage.jsx';
import MarketingChatOperationsPage from './pages/marketing/chatInteligente/MarketingChatOperationsPage.jsx';
import MarketingChatIntegrationsPage from './pages/marketing/chatInteligente/MarketingChatIntegrationsPage.jsx';
import MarketingChatSettingsPage from './pages/marketing/chatInteligente/MarketingChatSettingsPage.jsx';
import MarketingChatReportsPage from './pages/marketing/chatInteligente/MarketingChatReportsPage.jsx';
import StabilityHealthPage from './pages/StabilityHealthPage.jsx';
import ConveniosShellLayout from './convenios/ui/ConveniosShellLayout.jsx';
import ConveniosDashboardPage from './pages/convenios/ConveniosDashboardPage.jsx';
import ConveniosOperadorasPage from './pages/convenios/ConveniosOperadorasPage.jsx';
import ConveniosPlanosPage from './pages/convenios/ConveniosPlanosPage.jsx';
import ConveniosPacientesPage from './pages/convenios/ConveniosPacientesPage.jsx';
import ConveniosAutorizacoesPage from './pages/convenios/ConveniosAutorizacoesPage.jsx';
import ConveniosGuiasPage from './pages/convenios/ConveniosGuiasPage.jsx';
import ConveniosProducaoPage from './pages/convenios/ConveniosProducaoPage.jsx';
import ConveniosGlosasPage from './pages/convenios/ConveniosGlosasPage.jsx';
import ConveniosFaturamentoPage from './pages/convenios/ConveniosFaturamentoPage.jsx';
import ConveniosRecebimentosPage from './pages/convenios/ConveniosRecebimentosPage.jsx';
import ConveniosRelatoriosPage from './pages/convenios/ConveniosRelatoriosPage.jsx';
import ContractsShellLayout from './contracts/ui/ContractsShellLayout.jsx';
import ContractsDashboardPage from './pages/contratos/ContractsDashboardPage.jsx';
import ContractsPendentesPage from './pages/contratos/ContractsPendentesPage.jsx';
import ContractsAssinadosPage from './pages/contratos/ContractsAssinadosPage.jsx';
import ContractsModelosPage from './pages/contratos/ContractsModelosPage.jsx';
import ContractsTermosPage from './pages/contratos/ContractsTermosPage.jsx';
import ContractsAssinaturasPage from './pages/contratos/ContractsAssinaturasPage.jsx';
import ContractsConfigPage from './pages/contratos/ContractsConfigPage.jsx';
import { routeAccessMap } from './navigation/menuConfig.js';
import { getRequiredFeatureFlagForRoute, getRequiredModuleForRoute } from './tenant/tenantAccess.js';

const routeRoles = routeAccessMap();
const withRole = (route, element) => (
  <RequireRole allowedRoles={routeRoles[route]} routePath={route}>
    <RequireModule moduleName={getRequiredModuleForRoute(route)}>
      <RequireFeatureFlag flagKey={getRequiredFeatureFlagForRoute(route)}>
        {element}
      </RequireFeatureFlag>
    </RequireModule>
  </RequireRole>
);
const withAdminGate = (element) => <RequireAdminGate>{element}</RequireAdminGate>;

export default function ProtectedApp() {
  return (
    <Layout>
      <Routes>
        <Route path="/atendimento-clinico/:appointmentId/central" element={<PatientCareCentralPage />} />
        <Route path="/atendimento-clinico/:appointmentId" element={<ClinicalAppointmentPage />} />
        <Route path="/" element={<Navigate to="/gestao/dashboard" replace />} />
        <Route path="/dashboard" element={<Navigate to="/gestao/dashboard" replace />} />
        <Route path="/agenda" element={<Navigate to="/gestao/agenda" replace />} />
        <Route path="/pacientes" element={<Navigate to="/pacientes/busca" replace />} />
        <Route path="/financeiro" element={<Navigate to="/financeiro/contas-receber" replace />} />
        <Route path="/marketing" element={<Navigate to="/marketing/chat-inteligente" replace />} />
        <Route path="/relatorios" element={<Navigate to="/financeiro/relatorios" replace />} />
        <Route path="/comunicacao" element={<Navigate to="/comercial/mensagens" replace />} />
        <Route path="/colaboradores" element={<Navigate to="/admin/colaboradores" replace />} />
        <Route path="/settings/clinic" element={<Navigate to="/admin/dados-clinica" replace />} />
        <Route path="/pacientes/busca" element={withRole('/pacientes/busca', <PatientsPage />)} />
        <Route path="/pacientes/cadastro" element={withRole('/pacientes/cadastro', <PatientCadastroPage />)} />
        <Route path="/pacientes/cadastro/:patientId" element={withRole('/pacientes/cadastro', <PatientCadastroPage />)} />
        <Route path="/prontuario/:patientId" element={<RequireRole allowedRoles={['admin', 'master', 'gerente', 'recepcao', 'profissional']} routePath="/prontuario/:patientId"><PatientChartPage /></RequireRole>} />
        <Route path="/prontuario/:patientId/odontograma-v2" element={<RequireRole allowedRoles={['admin', 'master', 'gerente', 'recepcao', 'profissional']} routePath="/prontuario/:patientId/odontograma-v2"><OdontogramV2Page /></RequireRole>} />
        <Route path="/gestao/dashboard" element={withRole('/gestao/dashboard', <DashboardPage />)} />
        <Route path="/suporte" element={withRole('/suporte', <SupportPage />)} />
        <Route path="/gestao/agenda" element={withRole('/gestao/agenda', <AgendaPage />)} />
        <Route path="/gestao-atendimento" element={withRole('/gestao-atendimento', <GestaoAtendimentoPage />)} />
        <Route path="/orcamentos" element={withRole('/orcamentos', <BudgetsHubPage />)} />
        <Route path="/gestao/crm" element={withRole('/gestao/crm', <PlaceholderPage title="CRM (Kanban)" description="Pipeline comercial com etapas e oportunidades." />)} />
        <Route path="/crm" element={withRole('/crm/captacao', <CrmShellLayout />)}>
          <Route index element={<Navigate to="/crm/captacao" replace />} />
          <Route path="captacao" element={withRole('/crm/captacao', <CrmCaptacaoPage />)} />
          <Route path="pipeline" element={withRole('/crm/pipeline', <CrmPipelinePage />)} />
          <Route path="leads" element={withRole('/crm/leads', <CrmLeadsListPage />)} />
          <Route path="leads/:id" element={withRole('/crm/leads', <CrmLeadProfilePage />)} />
          <Route path="comunicacao" element={withRole('/crm/comunicacao', <CrmComunicacaoPage />)} />
          <Route path="followup" element={withRole('/crm/followup', <CrmFollowupPage />)} />
          <Route path="orcamentos" element={withRole('/crm/orcamentos', <CrmOrcamentosPage />)} />
          <Route path="relatorios" element={withRole('/crm/relatorios', <CrmRelatoriosPage />)} />
          <Route path="automacoes" element={withRole('/crm/automacoes', <CrmAutomacoesPage />)} />
          <Route path="configuracoes" element={withRole('/crm/configuracoes', <CrmConfiguracoesPage />)} />
        </Route>
        <Route path="/gestao/convenios" element={withRole('/gestao/convenios', <ConveniosShellLayout />)}>
          <Route index element={withRole('/gestao/convenios', <ConveniosDashboardPage />)} />
          <Route path="operadoras" element={withRole('/gestao/convenios', <ConveniosOperadorasPage />)} />
          <Route path="planos" element={withRole('/gestao/convenios', <ConveniosPlanosPage />)} />
          <Route path="pacientes" element={withRole('/gestao/convenios', <ConveniosPacientesPage />)} />
          <Route path="autorizacoes" element={withRole('/gestao/convenios', <ConveniosAutorizacoesPage />)} />
          <Route path="guias" element={withRole('/gestao/convenios', <ConveniosGuiasPage />)} />
          <Route path="producao" element={withRole('/gestao/convenios', <ConveniosProducaoPage />)} />
          <Route path="glosas" element={withRole('/gestao/convenios', <ConveniosGlosasPage />)} />
          <Route path="faturamento" element={withRole('/gestao/convenios', <ConveniosFaturamentoPage />)} />
          <Route path="recebimentos" element={withRole('/gestao/convenios', <ConveniosRecebimentosPage />)} />
          <Route path="relatorios" element={withRole('/gestao/convenios', <ConveniosRelatoriosPage />)} />
        </Route>
        <Route path="/gestao/contratos" element={withRole('/gestao/contratos', <ContractsShellLayout />)}>
          <Route index element={withRole('/gestao/contratos', <ContractsDashboardPage />)} />
          <Route path="pendentes" element={withRole('/gestao/contratos', <ContractsPendentesPage />)} />
          <Route path="assinados" element={withRole('/gestao/contratos', <ContractsAssinadosPage />)} />
          <Route path="modelos" element={withRole('/gestao/contratos', <ContractsModelosPage />)} />
          <Route path="termos" element={withRole('/gestao/contratos', <ContractsTermosPage />)} />
          <Route path="assinaturas" element={withRole('/gestao/contratos', <ContractsAssinaturasPage />)} />
          <Route path="configuracoes" element={withRole('/gestao/contratos', <ContractsConfigPage />)} />
        </Route>
        <Route path="/gestao-comercial/jornada-do-paciente" element={withRole('/gestao-comercial/jornada-do-paciente', <PatientJourneyPage />)} />
        <Route path="/gestao-comercial/fluxo-do-paciente" element={withRole('/gestao-comercial/fluxo-do-paciente', <PatientFlowPage />)} />
        <Route path="/gestao-comercial/base-de-preco" element={withRole('/gestao-comercial/base-de-preco', <PriceBasePage />)} />
        <Route path="/gestao-comercial/base-de-preco/tabelas/:priceTableId" element={withRole('/gestao-comercial/base-de-preco', <PriceBaseTableDetailPage />)} />
        <Route path="/onboarding/clinica" element={<RequireRole allowedRoles={['admin', 'master']} routePath="/onboarding/clinica"><OnboardingClinicaPage /></RequireRole>} />
        <Route path="/configuracoes/usuarios" element={<RequireRole allowedRoles={['admin', 'master']} routePath="/configuracoes/usuarios"><ConfiguracoesUsuariosPage /></RequireRole>} />
        <Route path="/stability/health" element={<RequireRole allowedRoles={['admin', 'master', 'gerente']} routePath="/stability/health"><StabilityHealthPage /></RequireRole>} />
        <Route path="/master" element={<Navigate to="/gestao/dashboard" replace />} />
        <Route path="/admin" element={<Navigate to="/admin/dados-clinica" replace />} />
        <Route path="/admin/dados-clinica" element={withAdminGate(withRole('/admin/dados-clinica', <ClinicSettingsPage />))} />
        <Route path="/admin/colaboradores/novo" element={withAdminGate(withRole('/admin/colaboradores', <CollaboratorsPage />))} />
        <Route path="/admin/colaboradores" element={withAdminGate(withRole('/admin/colaboradores', <CollaboratorsPage />))} />
        <Route path="/admin/acessos" element={<Navigate to="/admin/colaboradores" replace />} />
        <Route path="/admin/usuarios" element={withAdminGate(withRole('/admin/usuarios', <AdminUsuariosPage />))} />
        <Route path="/admin/base-precos" element={withAdminGate(withRole('/admin/base-precos', <PriceBasePage />))} />
        <Route path="/admin/base-precos/tabelas/:priceTableId" element={withAdminGate(withRole('/admin/base-precos', <PriceBaseTableDetailPage />))} />
        <Route path="/admin/procedimentos" element={<Navigate to="/admin/base-precos" replace />} />
        <Route path="/admin/contratos" element={<Navigate to="/gestao/contratos" replace />} />
        <Route path="/admin/consentimentos" element={<Navigate to="/gestao/contratos/termos" replace />} />
        <Route path="/admin/fornecedores" element={withAdminGate(withRole('/admin/fornecedores', <FornecedoresPage />))} />
        <Route path="/admin/tipos-tratamento" element={withAdminGate(withRole('/admin/tipos-tratamento', <TreatmentPlanTypesAdminPage />))} />
        <Route path="/administrativo/fornecedores" element={<Navigate to="/admin/fornecedores" replace />} />
        <Route path="/financeiro/contas-pagar" element={withRole('/financeiro/contas-pagar', <FinancePayablesPage />)} />
        <Route path="/financeiro/contas-receber" element={withRole('/financeiro/contas-receber', <FinanceReceivablesPage />)} />
        <Route path="/financeiro/caixa" element={withRole('/financeiro/caixa', <FinanceCashRegisterPage />)} />
        <Route path="/financeiro/boletos" element={withRole('/financeiro/boletos', <FinanceBoletosPage />)} />
        <Route path="/financeiro/financiamento" element={withRole('/financeiro/financiamento', <FinanceFinanciamentoPage />)} />
        <Route path="/financeiro/faturamento" element={withRole('/financeiro/faturamento', <FinanceFaturamentoPage />)} />
        <Route path="/financeiro/comissoes" element={withRole('/financeiro/comissoes', <FinanceComissoesPage />)} />
        <Route path="/financeiro/relatorios" element={withRole('/financeiro/relatorios', <ReportsPage />)} />
        <Route path="/financeiro/relatorios/dre" element={withRole('/financeiro/relatorios/dre', <FinanceDREPage />)} />
        <Route path="/comercial/chats" element={withRole('/comercial/chats', <PlaceholderPage title="Histórico de Chats" description="Histórico completo de conversas." />)} />
        <Route path="/comercial/follow-up" element={withRole('/comercial/follow-up', <ComercialFollowUpPage />)} />
        <Route path="/comercial/mensagens" element={withRole('/comercial/mensagens', <CommunicationPage />)} />
        <Route path="/comercial/confirmacao" element={withRole('/comercial/confirmacao', <PlaceholderPage title="Confirmação de Agendamento" description="Fluxos automáticos de confirmação." />)} />
        <Route path="/comercial/confirmacao/lembrete" element={withRole('/comercial/confirmacao/lembrete', <PlaceholderPage title="Lembrete" description="Mensagens de lembrete automatizadas." />)} />
        <Route path="/comercial/confirmacao/boas-vindas" element={withRole('/comercial/confirmacao/boas-vindas', <PlaceholderPage title="Boas-vindas" description="Mensagens de boas-vindas." />)} />
        <Route path="/comercial/confirmacao/broadcast" element={withRole('/comercial/confirmacao/broadcast', <PlaceholderPage title="Broadcast" description="Envio em massa segmentado." />)} />
        <Route path="/comercial/confirmacao/pos-atendimento" element={withRole('/comercial/confirmacao/pos-atendimento', <PlaceholderPage title="Mensagens pós-atendimento" description="Feedback e follow-up pós atendimento." />)} />
        <Route path="/comercial/confirmacao/lembrete-confirmacao" element={withRole('/comercial/confirmacao/lembrete-confirmacao', <PlaceholderPage title="Lembrete de confirmação" description="Reconfirmações rápidas e automáticas." />)} />
        <Route path="/comercial/confirmacao/semestral" element={withRole('/comercial/confirmacao/semestral', <PlaceholderPage title="Semestral" description="Campanhas semestrais." />)} />
        <Route path="/comercial/confirmacao/anual" element={withRole('/comercial/confirmacao/anual', <PlaceholderPage title="Anual" description="Campanhas anuais." />)} />
        <Route path="/comercial/whatsapp" element={withRole('/comercial/whatsapp', <PlaceholderPage title="WhatsApp (Integrações)" description="Central de integrações WhatsApp." />)} />
        <Route path="/comercial/whatsapp/agenda" element={withRole('/comercial/whatsapp/agenda', <PlaceholderPage title="WhatsApp + Agenda" description="Confirmações automáticas da agenda." />)} />
        <Route path="/comercial/whatsapp/crm" element={withRole('/comercial/whatsapp/crm', <PlaceholderPage title="WhatsApp + CRM" description="Integração com pipeline comercial." />)} />
        <Route path="/comercial/whatsapp/ia" element={withRole('/comercial/whatsapp/ia', <PlaceholderPage title="Atendimento 24/7 com IA" description="IA treinada com base da clínica." />)} />
        <Route path="/comercial/atendimento" element={withRole('/comercial/atendimento', <PlaceholderPage title="Atendimento humano/IA" description="Transbordo automático para humanos." />)} />
        <Route path="/marketing/chat-inteligente" element={withRole('/marketing/chat-inteligente', <MarketingChatShellLayout />)}>
          <Route index element={<Navigate to="/marketing/chat-inteligente/dashboard" replace />} />
          <Route path="dashboard" element={<MarketingChatDashboardPage />} />
          <Route path="conectar-whatsapp" element={<MarketingChatConnectPage />} />
          <Route path="inbox" element={<MarketingChatInboxRealtimePage />} />
          <Route path="caixa-entrada" element={<MarketingChatInboxPage />} />
          <Route path="contatos" element={<MarketingChatContactsPage />} />
          <Route path="campanhas" element={<MarketingChatCampaignsPage />} />
          <Route path="automacoes" element={<MarketingChatAutomationsPage />} />
          <Route path="observabilidade" element={<MarketingChatAutomationObservabilityPage />} />
          <Route path="funis" element={<MarketingChatFunnelsPage />} />
          <Route path="gestao-atendimento" element={<MarketingChatOperationsPage />} />
          <Route path="integracoes" element={<MarketingChatIntegrationsPage />} />
          <Route path="configuracoes" element={<MarketingChatSettingsPage />} />
          <Route path="relatorios" element={<MarketingChatReportsPage />} />
        </Route>
        <Route path="/estoque" element={<InventoryPage />} />
        <Route path="/equipe" element={<TeamPage />} />
        <Route path="/automacao" element={<AutomationPage />} />
      </Routes>
    </Layout>
  );
}
