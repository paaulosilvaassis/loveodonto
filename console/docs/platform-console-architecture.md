# Platform Console - Arquitetura Inicial

## 1) Arquitetura e rotas

- Aplicação separada em `console/` (fora do app principal).
- Auth dedicada via `VITE_CONSOLE_SUPABASE_URL` e `VITE_CONSOLE_SUPABASE_ANON_KEY`.
- Rotas:
  - `/login`
  - `/dashboard`
  - `/tenants`
  - `/tenants/:id`
  - `/billing`
  - `/subscriptions`
  - `/connectivities`
  - `/support`
  - `/logs-errors`
  - `/feature-flags`
  - `/audit`
  - `/settings`

## 2) Segurança e permissões

- `RequirePlatformAuth` protege todas as rotas privadas.
- `RequirePlatformPermission` habilita controle por permissão em rotas sensíveis.
- Papéis de referência:
  - `owner`, `super_admin`, `suporte`, `financeiro`, `operacoes`, `leitura`.
- Ações sensíveis com auditoria obrigatória:
  - bloqueio/liberação de clínica
  - alteração de plano
  - ativação/desativação de módulos
  - habilitação de acesso assistido
  - alterações de feature flags

## 3) Banco e RLS

- Migration completa em `console/supabase/migrations/001_platform_console_schema.sql`.
- Seed base em `console/supabase/seeds/001_platform_console_seed.sql`.
- Tabelas criadas:
  - `tenants`
  - `tenant_users`
  - `tenant_modules`
  - `tenant_integrations`
  - `tenant_subscriptions`
  - `tenant_billing_events`
  - `support_tickets`
  - `support_messages`
  - `audit_logs`
  - `system_health_checks`
  - `feature_flags`
  - `platform_admin_users`
  - `platform_roles`
  - `platform_permissions`
  - `platform_role_permissions`

## 4) Frontend operacional

- Layout SaaS com sidebar fixa e topbar.
- Dashboard com KPIs, saúde do sistema, inadimplência e auditoria recente.
- Clínicas com filtros + detalhe operacional completo.
- Telas de cobrança, assinaturas, conectividades, suporte, logs/erros, feature flags e auditoria.
