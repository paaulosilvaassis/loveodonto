# CRM Clínico — Documentação Técnica

## Visão geral

CRM de Gestão Clínica que controla o ciclo completo do paciente:

**Lead → Contato → Avaliação → Orçamento → Tratamento → Pós-venda → Fidelização**

Integrado ao app (Agenda, Cadastro de Pacientes, Orçamentos, Financeiro) e à comunicação via WhatsApp. Estrutura completa: menu top-level, subitens, rotas, modelos de dados, serviços, UI base e logs prontos para evolução (Kanban DnD, templates, disparos automáticos).

---

## Rotas

| Rota | Página | Descrição |
|------|--------|-----------|
| `/crm/captacao` | CrmCaptacaoPage | Captação de leads (formulário + fontes) |
| `/crm/pipeline` | CrmPipelinePage | Pipeline Kanban (colunas + cards + moveLeadStage) |
| `/crm/leads` | CrmLeadsListPage | Lista de leads |
| `/crm/leads/:id` | CrmLeadProfilePage | Perfil do lead (abas: Dados, Timeline, Tags, Tarefas, Orçamentos) |
| `/crm/comunicacao` | CrmComunicacaoPage | Comunicação WhatsApp (templates + log) |
| `/crm/followup` | CrmFollowupPage | Follow-up / tarefas de retorno |
| `/crm/orcamentos` | CrmOrcamentosPage | Orçamentos & conversão (BudgetLink) |
| `/crm/relatorios` | CrmRelatoriosPage | Relatórios (getKPIs, getFunnelMetrics) |
| `/crm/automacoes` | CrmAutomacoesPage | Automações (AutomationRule: gatilho/condição/ação) |
| `/crm/configuracoes` | CrmConfiguracoesPage | Configurações gerais do CRM |

Todas as rotas são protegidas por `withRole`; permissões definidas em `menuConfig.js` (admin, gerente, recepcao, comercial; automacoes e configuracoes: admin, gerente).

---

## Modelos de dados

### Lead

- `id`, `name`, `phone`, `source` (LeadSource), `interest`, `notes`
- `assignedToUserId` (UserOwner), `stageKey` (PipelineStage), `patientId` (se convertido)
- `tags[]` (LeadTag), `lastContactAt`, `createdAt`, `updatedAt`, `createdByUserId`, `updatedByUserId`

### PipelineStage

- `id`, `key`, `label`, `order`, `color`
- Colunas padrão na migration 16: Novo Lead → Contato Realizado → Avaliação Agendada/Realizada → Orçamento Apresentado → Em Negociação → Aprovado → Em Tratamento → Finalizado → Perdido

### LeadStageHistory (timeline/auditoria)

- Armazenado em `crmLeadEvents`: `id`, `leadId`, `type`, `userId`, `data`, `createdAt`
- Tipos: `status_change`, `contact`, `message_sent`, `budget_*`, `appointment_*`, `converted_to_patient`, `tag_added`, `follow_up_created`
- **Toda mudança de status/stage gera um registro** (createLead, updateLead com stageKey, moveLeadToStage)

### LeadTag

- Tags são strings em `lead.tags[]` (ex.: "Quente", "Alto Ticket")

### LeadTask (follow-up)

- `crmFollowUps`: `id`, `leadId`, `dueAt`, `type`, `notes`, `doneAt`, `createdAt`, `createdByUserId`

### LeadMessageLog (WhatsApp / comunicação)

- `crmMessageLogs`: `id`, `leadId`, `channel` ("whatsapp"), `templateId?`, `messagePreview`, `createdAt`, `createdBy`
- **Toda mensagem enviada (mesmo via link) deve ser registrada** com `logMessage(user, leadId, { channel, templateId?, messagePreview })`, que persiste em `crmMessageLogs` e gera entrada na timeline (`crmLeadEvents` type `message_sent`)

### LeadSource

- Chave: whatsapp, instagram, site, google_ads, indicacao, telefone, walk_in, manual
- Labels em `LEAD_SOURCE_LABELS` (crmService)

### BudgetLink (vínculo com orçamentos)

- `crmBudgetLinks`: `id`, `leadId`, `budgetId`, `createdAt`, `createdByUserId`

### UserOwner (responsável)

- Referência por `assignedToUserId` (userId do colaborador/usuário)

### AutomationRule

- `crmAutomations`: `id`, `name`, `trigger` (ex.: `{ type: "stage_change", stageKey: "orcamento_apresentado" }`), `condition?`, `action` (ex.: `{ type: "send_message", templateId }`), `active`, `createdAt`, `updatedAt`

---

## Eventos auditáveis

- **Criação de lead:** evento `status_change` com toStage = estágio inicial
- **Mudança de estágio:** `moveLeadToStage()` e `updateLead(..., { stageKey })` geram `status_change` em `crmLeadEvents`
- **Mensagem enviada:** `logMessage()` grava em `crmMessageLogs` e em `crmLeadEvents` (type `message_sent`)
- **Conversão para paciente:** `convertLeadToPatient()` gera evento `converted_to_patient`
- **Follow-up criado:** `createFollowUp()` gera evento `follow_up_created`

---

## Integração WhatsApp

### Agora (link + log)

- **Botão "Abrir WhatsApp":** `buildWhatsAppLink(phone, message?)` gera `https://wa.me/55...` (com texto opcional)
- **Template:** campo de mensagem pré-preenchida no perfil do lead e na tela de comunicação
- **Log:** ao enviar (manual ou futuro disparo), chamar `logMessage(user, leadId, { channel: "whatsapp", templateId?, messagePreview })` para persistir em `crmMessageLogs` e na timeline

### Futura (API)

- Estrutura `LeadMessageLog` e `crmMessageLogs` pronta para receber webhooks ou respostas de API de envio (templateId, messagePreview, createdAt, createdBy)

---

## Pipeline Kanban

- **Colunas:** `getPipelineStages()` retorna estágios ordenados
- **Cards:** leads por estágio (`listLeads()` filtrado por `stageKey` ou agrupado no front)
- **Move:** `moveLeadToStage(user, leadId, newStageKey)` — contrato e handler prontos; UI de drag & drop pode ser implementada em cima (onDragEnd chama moveLeadToStage)

---

## Perfil do lead (/crm/leads/:id)

- **Abas:** Dados (dados principais), Timeline (crmLeadEvents + mensagens), Tags (lead.tags), Tarefas/Follow-up (crmFollowUps), Orçamentos (crmBudgetLinks)
- **Botão "Abrir WhatsApp":** usa `buildWhatsAppLink(lead.phone)`

---

## Relatórios

- **Contratos de service:** `getKPIs()` (totalLeads, leadsThisMonth, convertedToPatient, conversionRate, bySource), `getFunnelMetrics()` (byStage, total)
- **Página:** blocos KPI + funil por estágio (placeholders visuais já consumindo esses contratos)

---

## Automações

- **Schema:** AutomationRule (trigger, condition, action)
- **Service:** `listAutomations()`, `createAutomation(user, data)`
- **Página:** lista + criação placeholder (nova regra com trigger stage_change e action send_message)

---

## Próximos passos de implementação

1. **DnD no Pipeline:** implementar drag-and-drop (ex.: react-beautiful-dnd ou @dnd-kit) e no `onDragEnd` chamar `moveLeadToStage(user, leadId, newStageKey)`.
2. **Templates de mensagem:** CRUD de templates e seleção no envio; ao enviar, chamar `logMessage(..., { templateId, messagePreview })`.
3. **Disparos automáticos:** job/trigger que avalia `crmAutomations` (ex.: ao mudar estágio, agendar envio após X horas) e chama API/link WhatsApp + `logMessage`.
4. **Captação:** formulário completo de criação de lead (nome, telefone, origem, interesse, observações, responsável) e listagem com filtros.
5. **Vínculo orçamento:** tela de orçamentos do CRM que cria/lista `crmBudgetLinks` e integra com módulo de orçamento do app.

---

## Arquivos principais

| Área | Arquivos |
|------|----------|
| **Menu / rotas** | `navCategories.js`, `menuConfig.js`, `App.jsx` |
| **Schema / DB** | `db/schema.js` (crmLeads, crmPipelineStages, crmLeadEvents, crmFollowUps, crmAutomations, crmMessageLogs, crmBudgetLinks), `db/migrations.js` (16, 17 + seed) |
| **Domain** | `crm/domain/schemas.js` (JSDoc + constantes) |
| **Repository** | `crm/repositories/crmRepository.js` |
| **Service** | `services/crmService.js` (CRUD leads, getPipelineStages, moveLeadToStage, logMessage, listMessageLogs, getKPIs, getFunnelMetrics, createAutomation, listBudgetLinks, etc.) |
| **UI** | `crm/ui/CrmLayout.jsx`, `crm/ui/PipelineColumn.jsx`, `crm/ui/LeadCard.jsx` |
| **Páginas** | `pages/crm/CrmCaptacaoPage.jsx`, `CrmPipelinePage.jsx`, `CrmLeadsListPage.jsx`, `CrmLeadProfilePage.jsx`, `CrmComunicacaoPage.jsx`, `CrmFollowupPage.jsx`, `CrmOrcamentosPage.jsx`, `CrmRelatoriosPage.jsx`, `CrmAutomacoesPage.jsx`, `CrmConfiguracoesPage.jsx` |
| **Estilos** | `index.css` (crm-pipeline-*, crm-leads-*, crm-profile-*, crm-relatorios-*, crm-automacoes-*) |

---

## Confirmação de escopo

- **Menu lateral:** item top-level "CRM Clínico" junto com Administração, Financeiro, etc. ✅  
- **Subitens e rotas:** /crm/captacao, /crm/pipeline, /crm/leads, /crm/leads/[id], /crm/comunicacao, /crm/followup, /crm/orcamentos, /crm/relatorios, /crm/automacoes, /crm/configuracoes ✅  
- **Páginas funcionais:** todas renderizam layout premium e componentes base (Pipeline com colunas e cards, Perfil com abas, Relatórios com KPIs/funil, Automações com lista e criação) ✅  
- **Modelos e serviço:** Lead, PipelineStage, LeadStageHistory (eventos), LeadTag, LeadTask, LeadMessageLog, LeadSource, BudgetLink, UserOwner, AutomationRule (schemas + repository + crmService) ✅  
- **Log/timeline:** toda mudança de status gera registro; toda mensagem via logMessage gera registro em crmMessageLogs e timeline ✅  
- **WhatsApp:** buildWhatsAppLink, campo template, estrutura LeadMessageLog (leadId, channel, templateId?, messagePreview, createdAt, createdBy) ✅  
- **Pipeline:** tela com colunas do modelo, cards de leads, moveLeadToStage() e handlers prontos para DnD ✅  
- **Perfil lead:** abas Dados, Timeline, Tags, Tarefas/Follow-up, Orçamentos com componentes base e dados do storage ✅  
- **Relatórios:** getKPIs(), getFunnelMetrics() e blocos KPI na página ✅  
- **Automações:** lista + criação placeholder + schema AutomationRule ✅  
- **Documentação:** /docs/CRM.md com visão geral, rotas, modelos, eventos, WhatsApp e próximos passos ✅  

**O escopo NÃO foi simplificado; toda a estrutura pedida foi criada (com placeholders onde a implementação completa é futura).**
