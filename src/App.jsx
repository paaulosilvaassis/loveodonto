import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { RequireAuth } from './auth/RequireAuth.jsx';
import RequireRole from './auth/RequireRole.jsx';
import Layout from './components/Layout.jsx';
import AgendaPage from './pages/AgendaPage.jsx';
import AutomationPage from './pages/AutomationPage.jsx';
import CollaboratorsPage from './pages/CollaboratorsPage.jsx';
import ConfiguracoesUsuariosPage from './pages/ConfiguracoesUsuariosPage.jsx';
import OnboardingClinicaPage from './pages/OnboardingClinicaPage.jsx';
import ConvitePage from './pages/ConvitePage.jsx';
import ClinicSettingsPage from './pages/ClinicSettingsPage.jsx';
import CommunicationPage from './pages/CommunicationPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DevResetPage from './pages/DevResetPage.jsx';
import DevSeedPage from './pages/DevSeedPage.jsx';
import DevMigratePage from './pages/DevMigratePage.jsx';
import FinancePage from './pages/FinancePage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
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
import ClinicalAppointmentPage from './pages/ClinicalAppointmentPage.jsx';
import GestaoAtendimentoPage from './pages/GestaoAtendimentoPage.jsx';
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
import { routeAccessMap } from './navigation/menuConfig.js';
import { PlatformAuthProvider } from './auth/PlatformAuthContext.jsx';
import RequirePlatformAuth from './auth/RequirePlatformAuth.jsx';
import PlatformLayout from './platform/PlatformLayout.jsx';
import PlatformLoginPage from './pages/platform/PlatformLoginPage.jsx';
import PlatformDashboardPage from './pages/platform/PlatformDashboardPage.jsx';
import PlatformTenantsPage from './pages/platform/PlatformTenantsPage.jsx';
import PlatformTenantDetailPage from './pages/platform/PlatformTenantDetailPage.jsx';
import PlatformPlansPage from './pages/platform/PlatformPlansPage.jsx';
import PlatformBillingPage from './pages/platform/PlatformBillingPage.jsx';
import PlatformProvidersPage from './pages/platform/PlatformProvidersPage.jsx';
import PlatformTeamPage from './pages/platform/PlatformTeamPage.jsx';

const routeRoles = routeAccessMap();

const withRole = (route, element) => (
  <RequireRole allowedRoles={routeRoles[route]}>
    {element}
  </RequireRole>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PlatformAuthProvider>
        <Routes>
          {import.meta.env?.DEV ? (
            <>
              <Route path="/dev/migrate-db" element={<DevMigratePage />} />
              <Route path="/dev/reset-db" element={<DevResetPage />} />
              <Route path="/dev/seed-db" element={<DevSeedPage />} />
            </>
          ) : null}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/convite" element={<ConvitePage />} />
          <Route path="/platform/login" element={<PlatformLoginPage />} />
          <Route path="/platform" element={<RequirePlatformAuth><PlatformLayout /></RequirePlatformAuth>}>
            <Route index element={<Navigate to="/platform/dashboard" replace />} />
            <Route path="dashboard" element={<PlatformDashboardPage />} />
            <Route path="tenants" element={<PlatformTenantsPage />} />
            <Route path="tenants/:id" element={<PlatformTenantDetailPage />} />
            <Route path="plans" element={<PlatformPlansPage />} />
            <Route path="billing" element={<PlatformBillingPage />} />
            <Route path="providers" element={<PlatformProvidersPage />} />
            <Route path="team" element={<PlatformTeamPage />} />
          </Route>
          <Route
            path="/*"
            element={
              <RequireAuth>
                <Layout>
                  <Routes>
                    <Route path="/atendimento-clinico/:appointmentId" element={<ClinicalAppointmentPage />} />
                    <Route path="/" element={<Navigate to="/gestao/dashboard" replace />} />
                    <Route path="/dashboard" element={<Navigate to="/gestao/dashboard" replace />} />
                    <Route path="/agenda" element={<Navigate to="/gestao/agenda" replace />} />
                    <Route path="/pacientes" element={<Navigate to="/pacientes/busca" replace />} />
                    <Route path="/financeiro" element={<Navigate to="/financeiro/contas-receber" replace />} />
                    <Route path="/relatorios" element={<Navigate to="/financeiro/relatorios" replace />} />
                    <Route path="/comunicacao" element={<Navigate to="/comercial/mensagens" replace />} />
                    <Route path="/colaboradores" element={<Navigate to="/admin/colaboradores" replace />} />
                    <Route path="/settings/clinic" element={<Navigate to="/admin/dados-clinica" replace />} />
                    <Route path="/pacientes/busca" element={withRole('/pacientes/busca', <PatientsPage />)} />
                    <Route path="/pacientes/cadastro" element={withRole('/pacientes/cadastro', <PatientCadastroPage />)} />
                    <Route path="/pacientes/cadastro/:patientId" element={withRole('/pacientes/cadastro', <PatientCadastroPage />)} />
                    <Route
                      path="/prontuario/:patientId"
                      element={
                        <RequireRole allowedRoles={['admin', 'gerente', 'recepcao', 'profissional']}>
                          <PatientChartPage />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="/prontuario/:patientId/odontograma-v2"
                      element={
                        <RequireRole allowedRoles={['admin', 'gerente', 'recepcao', 'profissional']}>
                          <OdontogramV2Page />
                        </RequireRole>
                      }
                    />

                    <Route path="/gestao/dashboard" element={withRole('/gestao/dashboard', <DashboardPage />)} />
                    <Route path="/gestao/agenda" element={withRole('/gestao/agenda', <AgendaPage />)} />
                    <Route path="/gestao-atendimento" element={withRole('/gestao-atendimento', <GestaoAtendimentoPage />)} />
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
                    <Route path="/gestao/convenios" element={withRole('/gestao/convenios', <PlaceholderPage title="Convênios" description="Gestão de convênios e regras de atendimento." />)} />
                    <Route path="/gestao-comercial/jornada-do-paciente" element={withRole('/gestao-comercial/jornada-do-paciente', <PatientJourneyPage />)} />
                    <Route path="/gestao-comercial/fluxo-do-paciente" element={withRole('/gestao-comercial/fluxo-do-paciente', <PatientFlowPage />)} />
                    <Route path="/gestao-comercial/base-de-preco" element={withRole('/gestao-comercial/base-de-preco', <PriceBasePage />)} />
                    <Route
                      path="/gestao-comercial/base-de-preco/tabelas/:priceTableId"
                      element={withRole('/gestao-comercial/base-de-preco', <PriceBaseTableDetailPage />)}
                    />

                    <Route path="/onboarding/clinica" element={<RequireRole allowedRoles={['admin', 'master']}><OnboardingClinicaPage /></RequireRole>} />
                    <Route path="/configuracoes/usuarios" element={<RequireRole allowedRoles={['admin', 'master']}><ConfiguracoesUsuariosPage /></RequireRole>} />
                    <Route path="/master" element={<Navigate to="/gestao/dashboard" replace />} />
                    <Route path="/admin/dados-clinica" element={withRole('/admin/dados-clinica', <ClinicSettingsPage />)} />
                    <Route path="/admin/colaboradores" element={withRole('/admin/colaboradores', <CollaboratorsPage />)} />
                    <Route path="/admin/acessos" element={<Navigate to="/admin/colaboradores" replace />} />
                    <Route path="/admin/base-precos" element={withRole('/admin/base-precos', <PriceBasePage />)} />
                    <Route
                      path="/admin/base-precos/tabelas/:priceTableId"
                      element={withRole('/admin/base-precos', <PriceBaseTableDetailPage />)}
                    />
                    <Route path="/admin/procedimentos" element={withRole('/admin/procedimentos', <PlaceholderPage title="Cadastro de Procedimentos" description="Cadastro e categorização de procedimentos." />)} />
                    <Route path="/admin/contratos" element={withRole('/admin/contratos', <PlaceholderPage title="Contratos" description="Modelos e contratos com pacientes." />)} />
                    <Route path="/admin/consentimentos" element={withRole('/admin/consentimentos', <PlaceholderPage title="Consentimentos" description="Termos e autorizações digitais." />)} />

                    <Route path="/financeiro/contas-pagar" element={withRole('/financeiro/contas-pagar', <FinancePage />)} />
                    <Route path="/financeiro/contas-receber" element={withRole('/financeiro/contas-receber', <FinancePage />)} />
                    <Route path="/financeiro/caixa" element={withRole('/financeiro/caixa', <PlaceholderPage title="Caixa" description="Fluxo diário de caixa e conferências." />)} />
                    <Route path="/financeiro/boletos" element={withRole('/financeiro/boletos', <PlaceholderPage title="Boletos" description="Emissão e acompanhamento de boletos." />)} />
                    <Route path="/financeiro/financiamento" element={withRole('/financeiro/financiamento', <PlaceholderPage title="Financiamento" description="Simulações e condições de pagamento." />)} />
                    <Route path="/financeiro/faturamento" element={withRole('/financeiro/faturamento', <PlaceholderPage title="Faturamento" description="Receita e metas de faturamento." />)} />
                    <Route path="/financeiro/comissoes" element={withRole('/financeiro/comissoes', <PlaceholderPage title="Comissões" description="Comissões e repasses por colaborador." />)} />
                    <Route path="/financeiro/relatorios" element={withRole('/financeiro/relatorios', <ReportsPage />)} />

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

                    <Route path="/estoque" element={<InventoryPage />} />
                    <Route path="/equipe" element={<TeamPage />} />
                    <Route path="/automacao" element={<AutomationPage />} />
                  </Routes>
                </Layout>
              </RequireAuth>
            }
          />
        </Routes>
        </PlatformAuthProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
