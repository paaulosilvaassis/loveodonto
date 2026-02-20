# Painel da Plataforma (/platform)

O painel da plataforma fica **dentro do mesmo app**, em rotas `/platform/*`, com auth e dados separados do app das clínicas.

## Rotas

| Rota | Descrição |
|------|-----------|
| `/platform/login` | Login da equipe (platform_users) |
| `/platform/dashboard` | Cards: tenants ativos, trial, suspensas, inadimplência |
| `/platform/tenants` | Lista de clínicas + criar |
| `/platform/tenants/:id` | Detalhe: visão geral, usuários, plano, cobrança, auditoria, uso |
| `/platform/plans` | CRUD de planos |
| `/platform/billing` | Faturas / inadimplência |
| `/platform/providers` | Stripe / Pagarme (PLATFORM_OWNER/ADMIN) |
| `/platform/team` | Gerenciar platform_users |

## Variáveis de ambiente

### App (clínicas)

- `VITE_SUPABASE_APP_URL` ou `VITE_SUPABASE_URL`
- `VITE_SUPABASE_APP_ANON_KEY` ou `VITE_SUPABASE_ANON_KEY`

### Plataforma (painel)

- `VITE_SUPABASE_PLATFORM_URL` – URL do Supabase do painel
- `VITE_SUPABASE_PLATFORM_ANON_KEY` – anon key do Supabase do painel

Sessões são separadas: o client da plataforma usa `storageKey: 'appgestaoodonto-platform-auth'`.

## Admin API (server)

Proteção: header `x-platform-key` (ou `PLATFORM_API_KEY` no server).

- `POST /internal/platform/tenants` – criar tenant
- `PATCH /internal/platform/tenants/:id/status` – suspender/reativar
- `PATCH /internal/platform/tenants/:id/plan` – mudar plano

Variáveis no server: `PLATFORM_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Guards

- Acesso a `/platform/*` (exceto login): apenas `platform_user` ativo.
- Usuários da clínica não veem link para `/platform` no menu; se acessarem a URL, são redirecionados para `/platform/login`.
- Roles: PLATFORM_OWNER, PLATFORM_ADMIN, SALES, SUPPORT, FINANCE (permissões por tela conforme escopo).

## Tabelas (Supabase plataforma)

Ver `supabase/migrations/001_platform_schema.sql`: `platform_users`, `platform_audit_logs`, `payment_providers`, `plans`, `platform_tenants`, `subscriptions`.
