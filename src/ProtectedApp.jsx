/**
 * Shell das rotas protegidas. Carregado via lazy para não bloquear a tela de login.
 * Páginas internas: React.lazy (PERF.A) — Layout/guards permanecem eager.
 */
export { updateClinicAddress } from './services/clinicAddressUpdateFacade.js';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireRole from './auth/RequireRole.jsx';
import RequireAdminGate from './auth/RequireAdminGate.jsx';
import RequireModule from './auth/RequireModule.jsx';
import RequireFeatureFlag from './auth/RequireFeatureFlag.jsx';
import { useAuth } from './auth/useAuth.js';
import { useTenant } from './tenant/useTenant.js';
import Layout from './components/Layout.jsx';
import { isQaToolsRouteEnabled } from './config/qaToolsGuard.js';
import { isContractsV2TechnicalHarnessEnabled } from './domain/contracts/contracts-v2-technical-harness.ts';
import { routeAccessMap } from './navigation/menuConfig.js';
import { getRequiredFeatureFlagForRoute, getRequiredModuleForRoute } from './tenant/tenantAccess.js';

const AgendaPage = lazy(() => import('./pages/AgendaPage.jsx'));
const AutomationPage = lazy(() => import('./pages/AutomationPage.jsx'));
const CollaboratorsPage = lazy(() => import('./pages/CollaboratorsPage.jsx'));
const ConfiguracoesUsuariosPage = lazy(() => import('./pages/ConfiguracoesUsuariosPage.jsx'));
const OnboardingClinicaPage = lazy(() => import('./pages/OnboardingClinicaPage.jsx'));
const ClinicSettingsPage = lazy(() => import('./pages/ClinicSettingsPage.jsx'));
const CommunicationPage = lazy(() => import('./pages/CommunicationPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const FinanceReceivablesPage = lazy(() => import('./pages/FinanceReceivablesPage.jsx'));
const FinancePayablesPage = lazy(() => import('./pages/FinancePayablesPage.jsx'));
const FinanceCashRegisterPage = lazy(() => import('./pages/FinanceCashRegisterPage.jsx'));
const FinanceBoletosPage = lazy(() => import('./pages/FinanceBoletosPage.jsx'));
const FinanceFinanciamentoPage = lazy(() => import('./pages/FinanceFinanciamentoPage.jsx'));
const FinanceFaturamentoPage = lazy(() => import('./pages/FinanceFaturamentoPage.jsx'));
const FinanceComissoesPage = lazy(() => import('./pages/FinanceComissoesPage.jsx'));
const FinanceDREPage = lazy(() => import('./pages/FinanceDREPage.jsx'));
const FornecedoresPage = lazy(() => import('./pages/administrativo/FornecedoresPage.jsx'));
const TreatmentPlanTypesAdminPage = lazy(() => import('./pages/admin/TreatmentPlanTypesAdminPage.jsx'));
const ClinicalGuidesAdminPage = lazy(() => import('./pages/admin/ClinicalGuidesAdminPage.jsx'));
const ClinicalMediaLibraryPage = lazy(() => import('./pages/admin/ClinicalMediaLibraryPage.jsx'));
const IdentitiesDashboardPage = lazy(() => import('./pages/admin/IdentitiesDashboardPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const AdminUsuariosPage = lazy(() => import('./pages/AdminUsuariosPage.jsx'));
const PatientsPage = lazy(() => import('./pages/PatientsPage.jsx'));
const PatientCadastroPage = lazy(() => import('./pages/PatientCadastroPage.jsx'));
const PatientChartPage = lazy(() => import('./pages/PatientChartPage.jsx'));
const OdontogramV2Page = lazy(() => import('./pages/OdontogramV2Page.jsx'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage.jsx'));
const PriceBasePage = lazy(() => import('./pages/PriceBasePage.jsx'));
const PriceBaseTableDetailPage = lazy(() => import('./pages/PriceBaseTableDetailPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const TeamPage = lazy(() => import('./pages/TeamPage.jsx'));
const PatientJourneyPage = lazy(() => import('./pages/PatientJourneyPage.jsx'));
const PatientFlowPage = lazy(() => import('./pages/PatientFlowPage.jsx'));
const PatientCareCentralPage = lazy(() => import('./pages/PatientCareCentralPage.jsx'));
const ClinicalAppointmentPage = lazy(() => import('./pages/ClinicalAppointmentPage.jsx'));
const GestaoAtendimentoPage = lazy(() => import('./pages/GestaoAtendimentoPage.jsx'));
const BudgetsHubPage = lazy(() => import('./pages/BudgetsHubPage.jsx'));
const CrmShellLayout = lazy(() => import('./crm/ui/CrmShellLayout.jsx'));
const CrmCaptacaoPage = lazy(() => import('./pages/crm/CrmCaptacaoPage.jsx'));
const CrmPipelinePage = lazy(() => import('./pages/crm/CrmPipelinePage.jsx'));
const CrmLeadsListPage = lazy(() => import('./pages/crm/CrmLeadsListPage.jsx'));
const CrmLeadProfilePage = lazy(() => import('./pages/crm/CrmLeadProfilePage.jsx'));
const CrmComunicacaoPage = lazy(() => import('./pages/crm/CrmComunicacaoPage.jsx'));
const CrmFollowupPage = lazy(() => import('./pages/crm/CrmFollowupPage.jsx'));
const CrmOrcamentosPage = lazy(() => import('./pages/crm/CrmOrcamentosPage.jsx'));
const CrmRelatoriosPage = lazy(() => import('./pages/crm/CrmRelatoriosPage.jsx'));
const CrmAutomacoesPage = lazy(() => import('./pages/crm/CrmAutomacoesPage.jsx'));
const CrmConfiguracoesPage = lazy(() => import('./pages/crm/CrmConfiguracoesPage.jsx'));
const ComercialFollowUpPage = lazy(() => import('./pages/comercial/ComercialFollowUpPage.jsx'));
const SupportPage = lazy(() => import('./pages/suporte/SupportPage.jsx'));
const MarketingChatShellLayout = lazy(() => import('./pages/marketing/MarketingChatShellLayout.jsx'));
const MarketingChatDashboardPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatDashboardPage.jsx'));
const MarketingChatConnectPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatConnectPage.jsx'));
const MarketingChatInboxPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatInboxPage.jsx'));
const MarketingChatInboxRealtimePage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatInboxRealtimePage.jsx'));
const MarketingChatContactsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatContactsPage.jsx'));
const MarketingChatCampaignsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatCampaignsPage.jsx'));
const MarketingChatAutomationsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatAutomationsPage.jsx'));
const MarketingChatAutomationObservabilityPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatAutomationObservabilityPage.jsx'));
const MarketingChatFunnelsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatFunnelsPage.jsx'));
const MarketingChatOperationsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatOperationsPage.jsx'));
const MarketingChatIntegrationsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatIntegrationsPage.jsx'));
const MarketingChatSettingsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatSettingsPage.jsx'));
const MarketingChatReportsPage = lazy(() => import('./pages/marketing/chatInteligente/MarketingChatReportsPage.jsx'));
const StabilityHealthPage = lazy(() => import('./pages/StabilityHealthPage.jsx'));
const QaToolsPage = lazy(() => import('./pages/dev/QaToolsPage.jsx'));
const ConveniosShellLayout = lazy(() => import('./convenios/ui/ConveniosShellLayout.jsx'));
const ConveniosDashboardPage = lazy(() => import('./pages/convenios/ConveniosDashboardPage.jsx'));
const ConveniosOperadorasPage = lazy(() => import('./pages/convenios/ConveniosOperadorasPage.jsx'));
const ConveniosPlanosPage = lazy(() => import('./pages/convenios/ConveniosPlanosPage.jsx'));
const ConveniosPacientesPage = lazy(() => import('./pages/convenios/ConveniosPacientesPage.jsx'));
const ConveniosAutorizacoesPage = lazy(() => import('./pages/convenios/ConveniosAutorizacoesPage.jsx'));
const ConveniosGuiasPage = lazy(() => import('./pages/convenios/ConveniosGuiasPage.jsx'));
const ConveniosProducaoPage = lazy(() => import('./pages/convenios/ConveniosProducaoPage.jsx'));
const ConveniosGlosasPage = lazy(() => import('./pages/convenios/ConveniosGlosasPage.jsx'));
const ConveniosFaturamentoPage = lazy(() => import('./pages/convenios/ConveniosFaturamentoPage.jsx'));
const ConveniosRecebimentosPage = lazy(() => import('./pages/convenios/ConveniosRecebimentosPage.jsx'));
const ConveniosRelatoriosPage = lazy(() => import('./pages/convenios/ConveniosRelatoriosPage.jsx'));
const ContractsShellLayout = lazy(() => import('./contracts/ui/ContractsShellLayout.jsx'));
const ContractsDashboardPage = lazy(() => import('./pages/contratos/ContractsDashboardPage.jsx'));
const ContractsPendentesPage = lazy(() => import('./pages/contratos/ContractsPendentesPage.jsx'));
const ContractsAssinadosPage = lazy(() => import('./pages/contratos/ContractsAssinadosPage.jsx'));
const ContractsModelosPage = lazy(() => import('./pages/contratos/ContractsModelosPage.jsx'));
const ContractsModelosV2Page = lazy(() => import('./pages/contratos/ContractsModelosV2Page.jsx'));
const ContractsInstanciasV2Page = lazy(() => import('./pages/contratos/ContractsInstanciasV2Page.jsx'));
const ContractsAssinaturasV2Page = lazy(() => import('./pages/contratos/ContractsAssinaturasV2Page.jsx'));
const ContractsDocumentosV2Page = lazy(() => import('./pages/contratos/ContractsDocumentosV2Page.jsx'));
const ContractsConclusaoV2Page = lazy(() => import('./pages/contratos/ContractsConclusaoV2Page.jsx'));
const ContractsEntregasV2Page = lazy(() => import('./pages/contratos/ContractsEntregasV2Page.jsx'));
const ContractsTermosPage = lazy(() => import('./pages/contratos/ContractsTermosPage.jsx'));
const ContractsAssinaturasPage = lazy(() => import('./pages/contratos/ContractsAssinaturasPage.jsx'));
const ContractsConfigPage = lazy(() => import('./pages/contratos/ContractsConfigPage.jsx'));
const ContractsFilaPage = lazy(() => import('./pages/contratos/ContractsFilaPage.jsx'));
const ContractsRolloutPage = lazy(() => import('./pages/contratos/ContractsRolloutPage.jsx'));

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

/** Fallback de rota lazy — conteúdo dentro do Layout (shell já visível). */
function RouteChunkFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        color: '#6B7280',
        fontSize: '0.95rem',
      }}
    >
      Carregando…
    </div>
  );
}

export default function ProtectedApp() {
  const { user } = useAuth();
  const tenant = useTenant();
  const contractsV2TechnicalHarnessEnabled = isContractsV2TechnicalHarnessEnabled({
    user,
    projectRef: tenant?.projectRef,
  });

  return (
    <Layout>
      <Suspense fallback={<RouteChunkFallback />}>
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
            <Route path="fila" element={withRole('/gestao/contratos', <ContractsFilaPage />)} />
            <Route path="pendentes" element={withRole('/gestao/contratos', <ContractsPendentesPage />)} />
            <Route path="assinados" element={withRole('/gestao/contratos', <ContractsAssinadosPage />)} />
            <Route path="modelos" element={withRole('/gestao/contratos', <ContractsModelosPage />)} />
            {contractsV2TechnicalHarnessEnabled ? (
              <Route path="modelos-v2" element={withRole('/gestao/contratos', <ContractsModelosV2Page />)} />
            ) : null}
            {contractsV2TechnicalHarnessEnabled ? (
              <Route path="instancias-v2" element={withRole('/gestao/contratos', <ContractsInstanciasV2Page />)} />
            ) : null}
            <Route path="termos" element={withRole('/gestao/contratos', <ContractsTermosPage />)} />
            <Route path="assinaturas" element={withRole('/gestao/contratos', <ContractsAssinaturasPage />)} />
            {contractsV2TechnicalHarnessEnabled ? (
              <Route path="assinaturas-v2" element={withRole('/gestao/contratos', <ContractsAssinaturasV2Page />)} />
            ) : null}
            {contractsV2TechnicalHarnessEnabled ? (
              <Route path="documentos-v2" element={withRole('/gestao/contratos', <ContractsDocumentosV2Page />)} />
            ) : null}
            {contractsV2TechnicalHarnessEnabled ? (
              <Route path="conclusao-v2" element={withRole('/gestao/contratos', <ContractsConclusaoV2Page />)} />
            ) : null}
            {contractsV2TechnicalHarnessEnabled ? (
              <Route path="entregas-v2" element={withRole('/gestao/contratos', <ContractsEntregasV2Page />)} />
            ) : null}
            <Route path="configuracoes" element={withRole('/gestao/contratos', <ContractsConfigPage />)} />
            <Route path="rollout" element={withRole('/gestao/contratos', <ContractsRolloutPage />)} />
          </Route>
          <Route path="/gestao-comercial/jornada-do-paciente" element={withRole('/gestao-comercial/jornada-do-paciente', <PatientJourneyPage />)} />
          <Route path="/gestao-comercial/fluxo-do-paciente" element={withRole('/gestao-comercial/fluxo-do-paciente', <PatientFlowPage />)} />
          <Route path="/gestao-comercial/base-de-preco" element={withRole('/gestao-comercial/base-de-preco', <PriceBasePage />)} />
          <Route path="/gestao-comercial/base-de-preco/tabelas/:priceTableId" element={withRole('/gestao-comercial/base-de-preco', <PriceBaseTableDetailPage />)} />
          <Route path="/onboarding/clinica" element={<RequireRole allowedRoles={['admin', 'master']} routePath="/onboarding/clinica"><OnboardingClinicaPage /></RequireRole>} />
          <Route path="/configuracoes/usuarios" element={<RequireRole allowedRoles={['admin', 'master']} routePath="/configuracoes/usuarios"><ConfiguracoesUsuariosPage /></RequireRole>} />
          <Route path="/stability/health" element={<RequireRole allowedRoles={['admin', 'master', 'gerente']} routePath="/stability/health"><StabilityHealthPage /></RequireRole>} />
          {isQaToolsRouteEnabled() ? (
            <Route
              path="/dev/qa-tools"
              element={(
                <RequireRole allowedRoles={['admin', 'master']} routePath="/dev/qa-tools">
                  <QaToolsPage />
                </RequireRole>
              )}
            />
          ) : null}
          <Route path="/master" element={<Navigate to="/gestao/dashboard" replace />} />
          <Route path="/admin" element={<Navigate to="/admin/dados-clinica" replace />} />
          <Route path="/admin/dados-clinica" element={withAdminGate(withRole('/admin/dados-clinica', <ClinicSettingsPage />))} />
          <Route path="/admin/colaboradores/novo" element={withAdminGate(withRole('/admin/colaboradores', <CollaboratorsPage />))} />
          <Route path="/admin/colaboradores" element={withAdminGate(withRole('/admin/colaboradores', <CollaboratorsPage />))} />
          <Route path="/admin/acessos" element={<Navigate to="/admin/colaboradores" replace />} />
          <Route path="/admin/usuarios" element={withAdminGate(withRole('/admin/usuarios', <AdminUsuariosPage />))} />
          <Route path="/admin/identidades" element={withAdminGate(withRole('/admin/identidades', <IdentitiesDashboardPage />))} />
          <Route path="/admin/base-precos" element={withAdminGate(withRole('/admin/base-precos', <PriceBasePage />))} />
          <Route path="/admin/base-precos/tabelas/:priceTableId" element={withAdminGate(withRole('/admin/base-precos', <PriceBaseTableDetailPage />))} />
          <Route path="/admin/procedimentos" element={<Navigate to="/admin/base-precos" replace />} />
          <Route path="/admin/contratos" element={<Navigate to="/gestao/contratos" replace />} />
          <Route path="/admin/consentimentos" element={<Navigate to="/gestao/contratos/termos" replace />} />
          <Route path="/admin/fornecedores" element={withAdminGate(withRole('/admin/fornecedores', <FornecedoresPage />))} />
          <Route path="/admin/tipos-tratamento" element={withAdminGate(withRole('/admin/tipos-tratamento', <TreatmentPlanTypesAdminPage />))} />
          <Route path="/admin/guia-clinico" element={withAdminGate(withRole('/admin/guia-clinico', <ClinicalGuidesAdminPage />))} />
          <Route path="/admin/biblioteca-imagens-clinicas" element={withAdminGate(withRole('/admin/biblioteca-imagens-clinicas', <ClinicalMediaLibraryPage />))} />
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
      </Suspense>
    </Layout>
  );
}
