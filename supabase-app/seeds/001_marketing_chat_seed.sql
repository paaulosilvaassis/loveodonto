-- Seed minimo para Marketing > Chat Inteligente (Supabase APP)
-- Ajuste tenant_id/clinic_id conforme ambiente.

do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_clinic text := 'clinic-1';
  v_account uuid;
  v_channel uuid;
  v_contact uuid;
  v_conv uuid;
  v_automation uuid;
  v_event uuid;
  v_job uuid;
  v_run uuid;
  v_funnel uuid;
  v_stage_1 uuid;
  v_stage_2 uuid;
begin
  insert into public.marketing_accounts (tenant_id, clinic_id, name, status)
  values (v_tenant, v_clinic, 'LoveOdonto Marketing', 'active')
  returning id into v_account;

  insert into public.chat_channels (tenant_id, clinic_id, marketing_account_id, channel_type, provider, status)
  values (v_tenant, v_clinic, v_account, 'whatsapp', 'whatsapp-cloud-api', 'connected')
  returning id into v_channel;

  insert into public.chat_contacts (tenant_id, clinic_id, marketing_account_id, name, phone_e164, origin, lifecycle_stage, tags)
  values (v_tenant, v_clinic, v_account, 'Ana Souza', '+5511998761111', 'WhatsApp', 'lead_quente', array['lead_quente'])
  returning id into v_contact;

  insert into public.chat_conversations (
    tenant_id, clinic_id, marketing_account_id, chat_channel_id, chat_contact_id,
    status, ia_mode, department, unread_count, preview, tags, opened_at, last_message_at
  )
  values (
    v_tenant, v_clinic, v_account, v_channel, v_contact,
    'open', 'active', 'Comercial', 1, 'Quero saber sobre clareamento', array['lead_quente'], now(), now()
  )
  returning id into v_conv;

  insert into public.chat_messages (tenant_id, clinic_id, chat_conversation_id, direction, sender_type, content_text)
  values
    (v_tenant, v_clinic, v_conv, 'inbound', 'contact', 'Oi, quero saber sobre clareamento dental.'),
    (v_tenant, v_clinic, v_conv, 'outbound', 'user', 'Perfeito! Vou te enviar os detalhes agora.');

  insert into public.tags (tenant_id, clinic_id, name, color, scope)
  values
    (v_tenant, v_clinic, 'lead_quente', '#ef4444', 'conversation'),
    (v_tenant, v_clinic, 'retorno', '#0ea5e9', 'conversation'),
    (v_tenant, v_clinic, 'financeiro', '#f59e0b', 'conversation')
  on conflict (tenant_id, clinic_id, scope, name) do nothing;

  insert into public.campaigns (
    tenant_id, clinic_id, marketing_account_id, name, channel_id, status, scheduled_at,
    message_template, total_targets, total_sent, total_failed
  )
  values (
    v_tenant, v_clinic, v_account, 'Reativacao semestral', v_channel, 'processing', now() + interval '1 day',
    'Oi [[primeiro_nome]], temos uma condicao especial para voce neste mes.', 250, 120, 3
  );

  insert into public.automations (
    tenant_id, clinic_id, marketing_account_id, name, trigger_type, status, config_json, last_run_at
  )
  values (
    v_tenant, v_clinic, v_account, 'Recuperacao sem resposta', 'no_reply', 'active',
    jsonb_build_object('delay_minutes', 60, 'channel', 'whatsapp'),
    now()
  )
  returning id into v_automation;

  insert into public.automation_steps (
    tenant_id, clinic_id, automation_id, step_order, step_type, condition_json, action_json, is_active
  )
  values
    (v_tenant, v_clinic, v_automation, 1, 'wait', '{}'::jsonb, jsonb_build_object('minutes', 60), true),
    (v_tenant, v_clinic, v_automation, 2, 'send_message', '{}'::jsonb, jsonb_build_object('message', 'Oi [[primeiro_nome]], posso te ajudar?'), true);

  insert into public.automation_events (
    tenant_id, clinic_id, automation_id, trigger_type, event_status, chat_conversation_id, chat_contact_id,
    channel, dedupe_key, payload_json, scheduled_at, processed_at
  )
  values (
    v_tenant, v_clinic, v_automation, 'no_reply', 'processed', v_conv, v_contact,
    'whatsapp', 'seed:no_reply:1', jsonb_build_object('source', 'seed'), now(), now()
  )
  returning id into v_event;

  insert into public.scheduled_jobs (
    tenant_id, clinic_id, automation_id, automation_event_id, chat_conversation_id, chat_contact_id,
    dedupe_key, trigger_type, channel, job_status, run_at, completed_at, attempt_count, max_attempts, next_step_index
  )
  values (
    v_tenant, v_clinic, v_automation, v_event, v_conv, v_contact,
    'seed:job:1', 'no_reply', 'whatsapp', 'completed', now() - interval '5 minutes', now() - interval '4 minutes', 1, 3, 2
  )
  returning id into v_job;

  insert into public.automation_runs (
    tenant_id, clinic_id, automation_id, scheduled_job_id, automation_event_id, trigger_type, run_status,
    chat_conversation_id, chat_contact_id, channel, started_at, finished_at, duration_ms
  )
  values (
    v_tenant, v_clinic, v_automation, v_job, v_event, 'no_reply', 'success',
    v_conv, v_contact, 'whatsapp', now() - interval '5 minutes', now() - interval '4 minutes', 4200
  )
  returning id into v_run;

  insert into public.automation_run_steps (
    tenant_id, clinic_id, automation_run_id, automation_id, step_order, step_type, step_status,
    channel, message_preview, started_at, finished_at, duration_ms
  )
  values
    (v_tenant, v_clinic, v_run, v_automation, 1, 'wait', 'success', 'whatsapp', null, now() - interval '5 minutes', now() - interval '5 minutes', 0),
    (v_tenant, v_clinic, v_run, v_automation, 2, 'send_message', 'success', 'whatsapp', 'Oi [[primeiro_nome]], posso te ajudar?', now() - interval '4 minutes', now() - interval '4 minutes', 4200);

  insert into public.job_attempts (
    tenant_id, clinic_id, scheduled_job_id, automation_run_id, attempt_no, attempt_status, error_text
  )
  values (
    v_tenant, v_clinic, v_job, v_run, 1, 'success', null
  );

  insert into public.automation_metrics_daily (
    tenant_id, clinic_id, metric_day, total_runs, success_runs, failed_runs, total_duration_ms,
    by_automation_json, by_channel_json, step_failures_json
  )
  values (
    v_tenant, v_clinic, current_date, 1, 1, 0, 4200,
    jsonb_build_object(v_automation::text, 1),
    jsonb_build_object('whatsapp', 1),
    '{}'::jsonb
  )
  on conflict (tenant_id, clinic_id, metric_day) do update
  set total_runs = excluded.total_runs,
      success_runs = excluded.success_runs,
      failed_runs = excluded.failed_runs,
      total_duration_ms = excluded.total_duration_ms,
      by_automation_json = excluded.by_automation_json,
      by_channel_json = excluded.by_channel_json,
      step_failures_json = excluded.step_failures_json,
      updated_at = now();

  insert into public.funnels (tenant_id, clinic_id, marketing_account_id, name, status, is_default)
  values (v_tenant, v_clinic, v_account, 'Funil principal', 'active', true)
  returning id into v_funnel;

  insert into public.funnel_stages (tenant_id, clinic_id, funnel_id, name, color, position)
  values
    (v_tenant, v_clinic, v_funnel, 'Novo lead', '#6366F1', 1),
    (v_tenant, v_clinic, v_funnel, 'Contato iniciado', '#0EA5E9', 2)
  returning id into v_stage_1;

  select id into v_stage_2
  from public.funnel_stages
  where funnel_id = v_funnel and position = 2
  limit 1;

  insert into public.funnel_cards (tenant_id, clinic_id, funnel_stage_id, chat_conversation_id, chat_contact_id, title)
  values (v_tenant, v_clinic, coalesce(v_stage_2, v_stage_1), v_conv, v_contact, 'Ana Souza');

  insert into public.metrics_snapshots (tenant_id, clinic_id, metric_date, scope, kpi_json)
  values (
    v_tenant,
    v_clinic,
    current_date,
    'global',
    jsonb_build_object(
      'messages_total', 2,
      'open_conversations', 1,
      'resolved_conversations', 0,
      'campaign_delivery_rate', 0.48
    )
  );
end $$;
