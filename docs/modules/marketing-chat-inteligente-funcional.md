# ETAPA 2 — Mapeamento Funcional (LoveOdonto > Marketing > Chat Inteligente)

## 1) Dashboard principal

- Objetivo: visão executiva e operacional do período, com priorização rápida de atendimento.
- O que o usuário faz: filtra período, acompanha KPIs, abre listas filtradas de conversas.
- Dados necessários: volume de mensagens, tempo de resposta, conversas abertas/resolvidas, origem por canal, pendências.
- Ações primárias: aplicar período, abrir conversas pendentes, acessar automações.
- Ações secundárias: consultar atendentes ativos, próximos agendamentos/eventos.
- Dependências: conversas, atendentes, campanhas, agenda.
- Permissões: leitura ampla para perfis autorizados ao módulo.
- Componentes: cards KPI, gráficos compactos, listas com links, seletor de período.
- Eventos de sistema: `dashboard_period_changed`, `dashboard_kpi_opened`, `dashboard_quick_action_clicked`.

## 2) Caixa de entrada / Conversas

- Objetivo: central única de atendimento humano + IA.
- O que o usuário faz: lê/responde mensagens, muda status, ativa/desativa IA, classifica por tags/departamento/atendente.
- Dados necessários: conversas, mensagens, contato, canal, atendente, departamento, tags, status, modo IA.
- Ações primárias: responder, anexar, resolver/reabrir, atribuir responsável.
- Ações secundárias: anotar, consultar log, agendar mensagens/compromissos.
- Dependências: contatos, agenda, usuários, integrações de canais.
- Permissões: operação completa para Comercial/Atendimento/Admin/Gerente.
- Componentes: lista de conversas, painel de chat, painel lateral de metadados, ações em lote.
- Eventos: `conversation_opened`, `message_sent`, `conversation_status_changed`, `ai_mode_toggled`, `bulk_update_applied`.

## 3) Contatos / Leads / Pacientes

- Objetivo: base de relacionamento unificada para marketing e atendimento.
- O que o usuário faz: buscar/filtrar, editar dados, taguear, importar/exportar, abrir conversa.
- Dados necessários: nome, telefone, canal preferencial, origem, tags, estágio, vínculo paciente/lead.
- Ações primárias: criar/editar contato, abrir conversa, associar tags.
- Ações secundárias: importação/exportação, histórico resumido.
- Dependências: CRM, cadastro de pacientes, conversas.
- Permissões: comercial/atendimento/admin/gerente; leitura parcial para financeiro (somente métricas).
- Componentes: tabela paginada, filtros, actions dropdown, estados vazios.
- Eventos: `contact_created`, `contact_updated`, `contact_import_requested`, `contact_open_chat`.

## 4) Campanhas / Disparos / Automações

- Objetivo: orquestrar comunicação ativa em escala com rastreabilidade.
- O que o usuário faz: cria campanha, agenda envio, pausa/retoma, clona, acompanha progresso/erro.
- Dados necessários: campanha, audiência, templates, canal, janelas de envio, status.
- Ações primárias: criar/editar campanha, iniciar/pausar/retomar.
- Ações secundárias: clonar, excluir, visualizar detalhes, validar resultado.
- Dependências: contatos/listas, templates, canais e mensageria.
- Permissões: comercial/admin/gerente.
- Componentes: tabela de campanhas, barra de progresso, filtros/status.
- Eventos: `campaign_created`, `campaign_status_changed`, `campaign_cloned`, `campaign_deleted`.

## 5) Funis / CRM vinculado ao marketing

- Objetivo: organizar conversas/oportunidades por estágio e facilitar handoff.
- O que o usuário faz: movimenta cartões em Kanban, cria/edita quadro, aplica filtros por coluna.
- Dados necessários: funis, estágios, cartões (conversa/lead), tags, responsável, departamento.
- Ações primárias: mover cartão, atualizar estágio/status.
- Ações secundárias: configurar coluna (cor, filtros, alerta), remover coluna.
- Dependências: CRM, conversas, tags, equipe.
- Permissões: comercial/atendimento/admin/gerente.
- Componentes: board Kanban, modal de confirmação, filtros por coluna.
- Eventos: `funnel_card_moved`, `funnel_stage_updated`, `funnel_column_saved`.

## 6) Configurações do módulo

- Objetivo: parametrizar operação de IA, canais, equipe e comportamento de atendimento.
- O que o usuário faz: configura base de conhecimento, integrações, webhook/token, regras e templates.
- Dados necessários: conta, canais, credenciais seguras, políticas de atendimento, recursos de IA.
- Ações primárias: salvar configuração, testar integração/base.
- Ações secundárias: upload de base, ajuste assistido por IA, comparativo de alterações.
- Dependências: integrações externas (WhatsApp/API), segurança/segredos, usuários.
- Permissões: admin/gerente; leitura parcial para outros perfis.
- Componentes: wizard de configuração, formulários longos, validações e feedback.
- Eventos: `integration_saved`, `knowledge_base_saved`, `webhook_updated`, `ai_rule_updated`.

## 7) Relatórios e métricas

- Objetivo: medir performance de atendimento, campanhas e conversão.
- O que o usuário faz: aplica filtros, analisa KPIs, exporta dados.
- Dados necessários: snapshots de métricas, eventos de conversa, campanhas, SLA.
- Ações primárias: consultar visão consolidada e exportar.
- Ações secundárias: comparativos por período/canal/equipe.
- Dependências: dashboard, conversas, campanhas, CRM.
- Permissões: leitura para admin/gerente/comercial/financeiro (escopo definido por role).
- Componentes: cartões de métricas, tabela de desempenho, gráficos simples, export CSV.
- Eventos: `report_filtered`, `report_exported`.

## Regras funcionais transversais

- Multi-clínica: todo dado do módulo deve carregar com `tenant_id` + `clinic_id`.
- Auditoria: alterações sensíveis registradas com `created_by`, `updated_by` e timestamp.
- Fallback de UX: sempre ter `loading`, `empty`, `error` e `retry`.
- Integrações externas devem ser assíncronas e resilientes (fila/reprocessamento).
- Branding proprietário externo não é replicado literalmente; apenas equivalência funcional.
