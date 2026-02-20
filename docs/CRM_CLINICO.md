# CRM Clínico — Documentação Técnica

## Visão geral

CRM de Gestão Clínica que controla o ciclo completo do paciente:

**Lead → Contato → Avaliação → Orçamento → Tratamento → Pós-venda → Fidelização**

Integrado ao app (Agenda, Cadastro de Pacientes, Orçamentos, Financeiro) e à comunicação via WhatsApp, com foco em conversão de leads e retenção.

---

## Estrutura no app

### Menu lateral (top-level)

- **CRM Clínico** (categoria com ícone Kanban)
  - **Captação de Leads** — `/crm-clinico/captacao`
  - **Pipeline de Atendimento** — `/crm-clinico/pipeline`
  - **Perfil Lead / Paciente** — `/crm-clinico/perfil` e `/crm-clinico/perfil/:leadId`
  - **Comunicação (WhatsApp)** — `/crm-clinico/comunicacao`
  - **Agenda & Follow-up** — `/crm-clinico/agenda-followup`
  - **Orçamentos & Conversão** — `/crm-clinico/orcamentos`
  - **Relatórios & Métricas** — `/crm-clinico/relatorios`
  - **Automações & Configurações** — `/crm-clinico/configuracoes`

### Rotas e permissões

- Rotas registradas em `App.jsx` com `withRole(route, element)`.
- `routeAccessMap` em `menuConfig.js` define roles por rota (admin, gerente, recepcao, comercial).
- Automações & Configurações: apenas admin e gerente.

---

## Modelos de dados (schema v16)

### `crmLeads` (array)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | ID único (createId('crmlead')) |
| name | string | Nome (obrigatório) |
| phone | string | Telefone/WhatsApp (apenas dígitos) |
| source | string | Origem: whatsapp, instagram, site, google_ads, indicacao, telefone, walk_in, manual |
| interest | string | Interesse principal (implante, protese, estetica, ortodontia, etc.) |
| notes | string | Observações iniciais |
| assignedToUserId | string \| null | Responsável pelo atendimento |
| stageKey | string | Etapa no pipeline (ex.: novo_lead, contato_realizado, aprovado) |
| patientId | string \| null | Se convertido, ID do paciente (cadastro) |
| tags | string[] | Tags (ex.: Quente, Alto Ticket) |
| lastContactAt | string \| null | ISO date do último contato |
| createdAt, updatedAt | string | ISO date |
| createdByUserId, updatedByUserId | string \| null | Auditoria |

Regras:

- Lead **não** vira paciente automaticamente; conversão manual ou por automação.
- Histórico preservado via `crmLeadEvents`.

### `crmPipelineStages` (array)

Colunas do Kanban (editáveis). Padrão na migration 16:

| order | key | label |
|-------|-----|--------|
| 1 | novo_lead | Novo Lead |
| 2 | contato_realizado | Contato Realizado |
| 3 | avaliacao_agendada | Avaliação Agendada |
| 4 | avaliacao_realizada | Avaliação Realizada |
| 5 | orcamento_apresentado | Orçamento Apresentado |
| 6 | em_negociacao | Em Negociação |
| 7 | aprovado | Aprovado |
| 8 | em_tratamento | Em Tratamento |
| 9 | finalizado | Finalizado |
| 10 | perdido | Perdido |

Cada estágio tem: `id`, `key`, `label`, `order`, `color`.

### `crmLeadEvents` (array)

Linha do tempo por lead. Cada evento:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | createId('crmev') |
| leadId | string | Lead relacionado |
| type | string | status_change, contact, message_sent, budget_created, budget_presented, budget_approved, budget_rejected, appointment_scheduled, appointment_done, converted_to_patient, tag_added, follow_up_created |
| userId | string \| null | Quem gerou o evento |
| data | object | Payload (ex.: fromStage, toStage, content, templateId) |
| createdAt | string | ISO date |

Uso: contatos, mensagens, mudanças de status, orçamentos, agendamentos, conversão, tags, follow-ups. Tudo auditável.

### `crmFollowUps` (array)

Lembretes de retorno / follow-up.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | createId('crmfu') |
| leadId | string | Lead relacionado |
| dueAt | string | ISO date do vencimento |
| type | string | retorno, orcamento_sem_resposta, etc. |
| notes | string | Observações |
| doneAt | string \| null | Concluído em (ISO) |
| createdAt, createdByUserId | string | Auditoria |

### `crmAutomations` (array)

Regras de automação (estrutura futura): disparo por mudança de estágio, prazos, mensagens automáticas, etc.

---

## Serviço: `crmService.js`

- **Leads:** `createLead`, `listLeads`, `getLeadById`, `updateLead`, `convertLeadToPatient`
- **Pipeline:** `getPipelineStages`, `moveLeadToStage`
- **Eventos:** `addLeadEvent`, `listLeadEvents` (linha do tempo)
- **WhatsApp:** `buildWhatsAppLink(phone, message?)`, `logWhatsAppSent`
- **Follow-ups:** `createFollowUp`, `listFollowUps`
- **Automações:** `listAutomations`

Constantes exportadas: `LEAD_SOURCE`, `LEAD_SOURCE_LABELS`, `LEAD_INTEREST_LABELS`, `CRM_EVENT_TYPE`.

---

## Integração com o restante do app

- **Agenda:** follow-ups e lembretes podem referenciar `appointments`; futura integração com tela de agenda (agendamento a partir do lead).
- **Cadastro de pacientes:** conversão de lead → paciente preenche `lead.patientId` com `patient.id`; não duplicar dados — lead mantém histórico, paciente é a entidade clínica.
- **Orçamentos:** orçamentos existentes (ex.: `budgets` / clinical) podem ser vinculados ao lead (ex.: `budget.leadId` ou evento `budget_created` em `crmLeadEvents`).
- **Financeiro:** ticket médio e métricas de conversão podem usar dados de orçamentos e transações.
- **WhatsApp:** `buildWhatsAppLink(phone, message)` gera `https://wa.me/55...`; cada envio registrado com `logWhatsAppSent` e evento `message_sent` na linha do tempo.

---

## Decisões técnicas

1. **Lead ≠ Paciente:** Lead é registro comercial/relacionamento; paciente é entidade clínica. Conversão explícita (manual ou automação) com `convertLeadToPatient` e `patientId` no lead.
2. **Pipeline editável:** Colunas em `crmPipelineStages`; ordem e cores configuráveis; estágio do lead em `lead.stageKey`.
3. **Auditoria:** Toda mudança de estágio e evento relevante gera entrada em `crmLeadEvents` e, quando aplicável, `logAction` para auditoria geral.
4. **WhatsApp:** Integração “link + log”. Botão “Abrir conversa” usa `buildWhatsAppLink(lead.phone)`; envios reais (manual ou template) devem chamar `logWhatsAppSent` para histórico no CRM.
5. **Escalabilidade:** Schema em memória/localStorage (v16); preparado para futura migração para API/Supabase com mesmos conceitos (leads, stages, events, follow-ups, automations).

---

## Arquivos principais

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/db/schema.js` | `DB_VERSION = 16`, arrays `crmLeads`, `crmPipelineStages`, `crmLeadEvents`, `crmFollowUps`, `crmAutomations` |
| `src/db/migrations.js` | Migration 16: cria arrays e estágios padrão do pipeline |
| `src/navigation/navCategories.js` | Categoria “CRM Clínico” e 8 itens de menu |
| `src/navigation/menuConfig.js` | Seção CRM Clínico para `routeAccessMap` |
| `src/App.jsx` | Rotas `/crm-clinico/*` e imports das páginas |
| `src/pages/crm/*.jsx` | Telas base (Captação, Pipeline, Perfil, Comunicação, Agenda & Follow-up, Orçamentos, Relatórios, Configurações) |
| `src/services/crmService.js` | CRUD leads, pipeline, eventos, WhatsApp, follow-ups, automações |
| `src/index.css` | Classes `.crm-module-placeholder`, `.crm-module-icon` |

---

## Próximos passos (implementação futura)

1. **Captação:** Formulário de criação de lead + listagem com filtros (origem, estágio, responsável).
2. **Pipeline:** Kanban drag-and-drop por `stageKey`, usando `getPipelineStages` e `moveLeadToStage`.
3. **Perfil:** Página de perfil do lead (dados, abas linha do tempo e tags), link “Abrir no WhatsApp” com `buildWhatsAppLink`.
4. **Comunicação:** Templates de mensagem e envio (ou redirecionamento WhatsApp) + `logWhatsAppSent`.
5. **Agenda & Follow-up:** Listagem de follow-ups e alertas; integração com tela de Agenda.
6. **Orçamentos:** Vincular orçamento ao lead; eventos `budget_created`, `budget_presented`, `budget_approved`/`rejected`.
7. **Relatórios:** KPIs (leads por origem, conversão, tempo médio, ticket, performance) e gráficos (funil, tempo, comparativo).
8. **Automações:** CRUD de regras em `crmAutomations` e job/trigger (ex.: ao mudar estágio, disparar mensagem após X horas).
