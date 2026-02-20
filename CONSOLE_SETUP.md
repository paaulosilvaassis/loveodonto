# Setup do Console da Plataforma

## Visão geral

O Painel Master foi movido para um **Console externo** com base de usuários separada.

## Estrutura

```
├── console/           # App do Console (React + Vite)
├── server/            # Admin API (Express) - service-to-service
├── supabase/
│   ├── migrations/    # Schema (platform_users, platform_tenants, etc.)
│   └── seed_platform_owner.sql
└── src/               # App da clínica (sem Painel Master)
```

## 1. Supabase

### Opção A (recomendada): projeto Supabase separado para o Console

- Crie um projeto no Supabase dedicado ao Console
- Use `VITE_CONSOLE_SUPABASE_URL` e `VITE_CONSOLE_SUPABASE_ANON_KEY` no Console

### Opção B: mesmo Supabase

- Use `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ou prefixo `VITE_CONSOLE_`)
- Execute `supabase/migrations/001_platform_schema.sql`

## 2. Seed do PLATFORM_OWNER

1. No Supabase Dashboard: Authentication > Users > Add user (email + senha)
2. Copie o UUID do usuário criado
3. No SQL Editor:

```sql
INSERT INTO platform_users (id, email, name, role, is_active)
VALUES (
  '<UUID_COPIADO>',
  'seu@email.com',
  'Admin Plataforma',
  'PLATFORM_OWNER',
  true
);
```

## 3. Console

```bash
cd console && npm install && npm run dev
```

Acesse `http://localhost:5176` e faça login com o email/senha do PLATFORM_OWNER.

## 4. Admin API (opcional)

Para o Console acionar o App (criar tenant, atualizar status):

```bash
cd server && npm install
```

Variáveis:

- `ADMIN_API_KEY` – chave secreta (header `X-Admin-API-Key`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_PORT` (default: 4000)

```bash
ADMIN_API_KEY=xxx SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx npm run dev
```

Endpoints:

- POST `/internal/admin/tenants`
- PATCH `/internal/admin/tenants/:id/status`
- PATCH `/internal/admin/tenants/:id/plan`
- GET `/internal/admin/tenants/:id/usage`

## 5. Scripts na raiz

- `npm run console:dev` – subir o Console
- `npm run console:build` – build do Console
- `npm run server:dev` – subir a Admin API
- `npm run server:start` – Admin API em produção

## 6. Deploy

- **App**: Vercel/Netlify em app.seudominio.com
- **Console**: Vercel/Netlify em console.seudominio.com (ou subpath)
- **Admin API**: Vercel Serverless / Railway / Render (sempre protegido por API key)
