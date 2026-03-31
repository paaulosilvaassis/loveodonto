# ETAPA 6 — Modelagem de Dados (Marketing > Chat Inteligente)

## Premissas

- Todas as entidades são multi-tenant: `tenant_id` (obrigatório), `clinic_id` (obrigatório quando aplicável).
- Auditoria padrão: `created_at`, `updated_at`, `created_by`, `updated_by`.
- IDs com UUID.
- Soft delete para entidades críticas: `deleted_at` (quando necessário).

## Tabelas

## `marketing_accounts`

- Campos: `id`, `tenant_id`, `clinic_id`, `name`, `status`, `timezone`, `settings_json`.
- Índices: `(tenant_id, clinic_id)`, `(status)`.
- Relações: 1:N com canais, campanhas, funis, agentes IA.

## `chat_channels`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `channel_type`, `provider`, `external_channel_id`, `status`, `config_json`, `last_sync_at`.
- Índices: `(tenant_id, clinic_id, status)`, `(provider, external_channel_id)`.
- Relações: N:1 com `marketing_accounts`.

## `chat_contacts`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `patient_id`, `lead_id`, `name`, `phone_e164`, `email`, `origin`, `lifecycle_stage`, `last_interaction_at`, `meta_json`.
- Índices: `(tenant_id, clinic_id, phone_e164)`, `(lifecycle_stage)`, `(last_interaction_at desc)`.
- Relações: 1:N com conversas, notas, listas.

## `chat_conversations`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `chat_channel_id`, `chat_contact_id`, `status`, `ia_mode`, `department_id`, `assigned_user_id`, `opened_at`, `resolved_at`, `last_message_at`, `priority`, `sla_due_at`, `meta_json`.
- Índices: `(tenant_id, clinic_id, status, last_message_at desc)`, `(assigned_user_id, status)`, `(chat_contact_id)`.
- Relações: 1:N com mensagens, atribuições, notas.

## `chat_messages`

- Campos: `id`, `tenant_id`, `clinic_id`, `chat_conversation_id`, `direction` (`inbound|outbound|internal`), `sender_type`, `sender_id`, `content_text`, `content_type`, `media_url`, `template_id`, `status`, `error_code`, `sent_at`, `delivered_at`, `read_at`, `payload_json`.
- Índices: `(chat_conversation_id, sent_at)`, `(tenant_id, clinic_id, status)`.
- Relações: N:1 com `chat_conversations`.

## `conversation_assignments`

- Campos: `id`, `tenant_id`, `clinic_id`, `chat_conversation_id`, `assigned_user_id`, `assigned_by`, `reason`, `assigned_at`.
- Índices: `(chat_conversation_id, assigned_at desc)`, `(assigned_user_id, assigned_at desc)`.

## `conversation_notes`

- Campos: `id`, `tenant_id`, `clinic_id`, `chat_conversation_id`, `note_text`, `is_private`, `created_by`, `created_at`.
- Índices: `(chat_conversation_id, created_at desc)`.

## `tags`

- Campos: `id`, `tenant_id`, `clinic_id`, `name`, `color`, `scope` (`conversation|contact|campaign`), `is_active`.
- Índices: `(tenant_id, clinic_id, scope, name unique)`.

## `chat_conversation_tags` (pivot)

- Campos: `chat_conversation_id`, `tag_id`, `tenant_id`, `clinic_id`, `created_at`, `created_by`.
- PK composta: `(chat_conversation_id, tag_id)`.

## `campaigns`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `name`, `channel_id`, `status`, `scheduled_at`, `started_at`, `finished_at`, `audience_type`, `template_id`, `total_targets`, `total_sent`, `total_failed`, `config_json`.
- Índices: `(tenant_id, clinic_id, status, scheduled_at)`, `(marketing_account_id, created_at desc)`.

## `campaign_audiences`

- Campos: `id`, `tenant_id`, `clinic_id`, `campaign_id`, `source_type`, `source_ref`, `filters_json`, `estimated_size`.
- Índices: `(campaign_id)`.

## `campaign_messages`

- Campos: `id`, `tenant_id`, `clinic_id`, `campaign_id`, `chat_contact_id`, `channel_id`, `status`, `error_code`, `queued_at`, `sent_at`, `delivered_at`, `read_at`, `payload_json`.
- Índices: `(campaign_id, status)`, `(chat_contact_id, queued_at desc)`.

## `automations`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `name`, `trigger_type`, `status`, `version`, `config_json`, `last_run_at`.
- Índices: `(tenant_id, clinic_id, status)`, `(trigger_type)`.

## `automation_steps`

- Campos: `id`, `tenant_id`, `clinic_id`, `automation_id`, `step_order`, `step_type`, `condition_json`, `action_json`, `is_active`.
- Índices: `(automation_id, step_order)`.

## `funnels`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `name`, `status`, `is_default`.
- Índices: `(tenant_id, clinic_id, status)`.

## `funnel_stages`

- Campos: `id`, `tenant_id`, `clinic_id`, `funnel_id`, `name`, `color`, `position`, `rules_json`, `is_active`.
- Índices: `(funnel_id, position)`.

## `funnel_cards`

- Campos: `id`, `tenant_id`, `clinic_id`, `funnel_stage_id`, `chat_conversation_id`, `chat_contact_id`, `title`, `meta_json`, `moved_at`.
- Índices: `(funnel_stage_id, moved_at desc)`, `(chat_conversation_id)`.

## `integration_tokens`

- Campos: `id`, `tenant_id`, `clinic_id`, `provider`, `token_ref`, `scopes`, `expires_at`, `status`, `last_rotated_at`.
- Índices: `(tenant_id, clinic_id, provider)`, `(status)`.
- Segurança: nunca persistir segredo em texto puro; armazenar referência cifrada.

## `webhook_logs`

- Campos: `id`, `tenant_id`, `clinic_id`, `provider`, `event_type`, `event_id`, `status_code`, `received_at`, `processed_at`, `payload_hash`, `error_message`.
- Índices: `(tenant_id, clinic_id, received_at desc)`, `(provider, event_id unique)`.

## `ai_agents`

- Campos: `id`, `tenant_id`, `clinic_id`, `marketing_account_id`, `name`, `model_provider`, `model_name`, `status`, `prompt_version`, `config_json`.
- Índices: `(tenant_id, clinic_id, status)`.

## `templates`

- Campos: `id`, `tenant_id`, `clinic_id`, `name`, `channel_type`, `language`, `category`, `content_json`, `approval_status`.
- Índices: `(tenant_id, clinic_id, channel_type, approval_status)`.

## `broadcast_lists`

- Campos: `id`, `tenant_id`, `clinic_id`, `name`, `description`, `source_type`, `filters_json`, `estimated_size`, `status`.
- Índices: `(tenant_id, clinic_id, status)`.

## `broadcast_list_contacts` (pivot)

- Campos: `broadcast_list_id`, `chat_contact_id`, `tenant_id`, `clinic_id`, `added_at`.
- PK composta: `(broadcast_list_id, chat_contact_id)`.

## `metrics_snapshots`

- Campos: `id`, `tenant_id`, `clinic_id`, `metric_date`, `scope` (`global|channel|user|campaign`), `scope_ref`, `kpi_json`.
- Índices: `(tenant_id, clinic_id, metric_date desc)`, `(scope, scope_ref, metric_date desc)`.

## Status padronizados (sugestão)

- Conversa: `open`, `pending_human`, `resolved`, `archived`
- Campanha: `draft`, `scheduled`, `processing`, `paused`, `completed`, `failed`, `canceled`
- Canal: `connected`, `degraded`, `disconnected`
- Automação: `active`, `paused`, `archived`

## Considerações de segurança e compliance

- Tokens/chaves apenas por vault/secret manager.
- PII mascarada em logs.
- Webhooks com assinatura/verificação de origem.
- Auditoria de ações sensíveis (mudança de IA mode, exclusão de campanha, alteração de permissões).
