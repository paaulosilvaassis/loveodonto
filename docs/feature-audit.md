# Auditoria de Funcionalidades - App Gestão Odonto

## Diagnóstico do Projeto (estado atual)
- Stack: Vite + React (JSX), React Router (dependência instalada), sem backend.
- Estrutura: apenas `src/App.jsx`, `src/main.jsx`, `src/index.css`.
- Rotas: inexistentes (uma tela única).
- Componentes: inexistentes (tudo no `App`).
- Banco/Persistência: inexistente.
- Autenticação/Permissões: inexistentes.
- Estado global: inexistente.
- Validações: inexistentes.
- Testes: inexistentes.
- Observação: scripts de build referenciam `tsc -b` sem `tsconfig`.

## Matriz de Cobertura (feature → existe? onde? status → o que falta)

### A) Agenda / Agendamento
- Criar/reagendar/cancelar consultas → **Completo** → UI em `src/pages/AgendaPage.jsx`, serviço em `src/services/appointmentService.js`, persistência em `src/db`.
- Visualização calendário dia/semana/mês + filtros → **Completo** → UI e filtros em `src/pages/AgendaPage.jsx`.
- Bloqueios de horário + conflitos → **Completo** → regra em `src/services/appointmentService.js`, testes em `src/__tests__/agenda.test.js`.
- Status (agendado/confirmado/atendido/faltou/cancelado) → **Completo** → modelo em `src/services/appointmentService.js`.
- Lembretes automáticos → **Completo** → fila/templates/log em `src/services/communicationService.js`, geração em `src/pages/AutomationPage.jsx`.

### B) Pacientes
- Cadastro completo do paciente → **Completo** → UI em `src/pages/PatientsPage.jsx`, serviço em `src/services/patientService.js`.
- Vincular consultas/procedimentos → **Parcial** → consultas vinculadas via `patientId`, faltam filtros cruzados.

### C) Comunicação com Paciente
- Fila de mensagens + templates → **Completo** → `src/pages/CommunicationPage.jsx`, `src/services/communicationService.js`.
- Templates com variáveis → **Completo** → placeholder no conteúdo do template.
- Logs de envio → **Completo** → `src/services/communicationService.js`.

### D) Financeiro
- Contas a pagar/receber (CRUD) → **Completo** → `src/pages/FinancePage.jsx`, `src/services/financeService.js`.
- Fluxo de caixa por período → **Completo** → `src/services/financeService.js`.
- Parcelas por tratamento/contrato → **Completo** → `src/services/financeService.js`, teste em `src/__tests__/finance.test.js`.
- Inadimplência e régua de cobrança → **Completo** → `src/services/financeService.js`, automação em `src/services/automationService.js`.
- Comissões por profissional → **Completo** → `src/services/financeService.js`.
- Boleto (estrutura de integração + dados) → **Completo** → campo `boletoData` em `src/services/financeService.js` e UI em `src/pages/FinancePage.jsx`.

### E) Relatórios / Dashboards
- Dashboard (agenda do dia, contas a vencer, inadimplência, retornos, aniversariantes) → **Completo** → `src/pages/DashboardPage.jsx`, `src/services/reportsService.js`.
- Relatórios exportáveis (CSV/PDF) → **Parcial** → CSV em `src/pages/ReportsPage.jsx`, PDF não implementado.

### F) Gestão da Equipe
- Usuários, cargos e permissões → **Completo** → `src/pages/TeamPage.jsx`, `src/permissions/permissions.js`, `src/auth/AuthContext.jsx`.
- Controle de salas/consultórios → **Completo** → `src/pages/TeamPage.jsx`.
- Escala/agenda por profissional → **Completo** → `src/pages/TeamPage.jsx`.
- Registro de ponto (CRUD + relatórios) → **Completo** → `src/pages/TeamPage.jsx`.

### G) Estoque e Compras
- Estoque de materiais + mínimo + alertas → **Completo** → `src/pages/InventoryPage.jsx`, `src/services/inventoryService.js`.
- Entradas/saídas (movimentação) → **Completo** → `src/pages/InventoryPage.jsx`.
- Fornecedores e compras (CRUD) → **Completo** → `src/pages/InventoryPage.jsx`.
- Relatório de consumo por período → **Completo** → `src/services/inventoryService.js`.

### H) Automação / Inteligência
- Insights (faltas/ociosidade/top procedimentos/receita) → **Completo** → `src/services/reportsService.js`.
- Automatizações (lembretes/estoque/cobrança) → **Completo** → `src/services/automationService.js`.

## Checklist de Execução (feito/pendente)
- [x] Implementar base: autenticação, permissões, modelos e persistência
- [x] Agenda (A)
- [x] Pacientes (B)
- [x] Financeiro (D)
- [x] Dashboards/Relatórios (E)
- [x] Estoque/Compras (G)
- [x] Comunicação (C)
- [x] Equipe (F)
- [x] Automação/Insights (H)
- [x] Migrar/versão de banco (browser storage)
- [x] Testes mínimos (agenda, prontuário, financeiro, permissões)
- [x] Validar build/lint/test
