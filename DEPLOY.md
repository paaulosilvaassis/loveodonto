# Colocar o app na web (deploy)

O app é um **frontend Vite + React** que usa **Supabase** (auth e banco). O deploy do **frontend** é suficiente para o app principal; o **server** (API admin) só é necessário se você usar o Console/Platform.

---

## 1. Deploy do frontend na Vercel (recomendado)

### Pré-requisitos

- Conta no [Vercel](https://vercel.com)
- Projeto no [Supabase](https://supabase.com) com a URL e a **anon key** do projeto

### Passos

1. **Suba o código para um repositório Git** (GitHub, GitLab ou Bitbucket), se ainda não estiver.

2. **No Supabase (Authentication → URL Configuration):**
   - **Site URL:** `https://loveodonto.com.br`
   - Adicione em **Redirect URLs** (todas obrigatórias para primeiro acesso):
     - `https://loveodonto.com.br/primeiro-acesso`
     - `https://loveodonto.com.br/**`
     - `http://localhost:5176/primeiro-acesso`
     - `http://localhost:5176/**`
   - Assim o login, convites e recovery redirecionam com tokens ou `?code=` para `/primeiro-acesso`.

3. **Na Vercel:**
   - **New Project** → importe o repositório do app.
   - **Root Directory:** deixe como está (raiz do repo) ou a pasta onde está o `package.json` do app.
   - **Build Command:** `npm run build` (já é o padrão com Vite).
   - **Output Directory:** `dist` (padrão do Vite).
   - Em **Environment Variables** adicione:
     - `VITE_SUPABASE_APP_URL` = URL do projeto Supabase (ex.: `https://xxxx.supabase.co`)
     - `VITE_SUPABASE_APP_ANON_KEY` = chave anon/public do projeto  
     Para **login SaaS** (`VITE_ACCESS_SAAS_ENABLED=1` ou equivalente em produção):
     - `VITE_SUPABASE_PLATFORM_URL` e `VITE_SUPABASE_PLATFORM_ANON_KEY` (mesmo projeto Supabase do backend)
     - **`VITE_PLATFORM_API_BASE_URL`** = URL pública da Admin API (`server/`), **sem** `localhost` nem `127.0.0.1`  
       (ex.: `https://love-odonto-api.up.railway.app`)  
       Alias no app: `VITE_APP_ADMIN_API_BASE_URL` (mesmo valor).

4. **Deploy:** clique em **Deploy**. O `vercel.json` na raiz já configura o roteamento SPA (todas as rotas caem no `index.html`).

5. Acesse a URL gerada (ex.: `https://seu-app.vercel.app`). O login SaaS exige Supabase **e** a Admin API publicada com `VITE_PLATFORM_API_BASE_URL` configurada no build da Vercel.

---

## 2. Deploy do server (API admin) – opcional

Só é necessário se você usar o **Console** (painel platform) que chama a API em `server/`.

- **Railway / Render / Fly.io:** crie um novo serviço apontando para a pasta `server` (ou monorepo com root no `server`).
- **Variáveis de ambiente do server** (nunca no frontend):
  - `ADMIN_API_KEY` – chave secreta para o header `X-Admin-API-Key`
  - `SUPABASE_URL` – URL do projeto Supabase
  - `SUPABASE_SERVICE_ROLE_KEY` – service role key (Supabase → Settings → API)
  - Opcional: `PLATFORM_API_KEY` (ou use a mesma que `ADMIN_API_KEY`)
- No frontend (Vercel) e na Console, use a mesma URL pública: `VITE_PLATFORM_API_BASE_URL=https://sua-api.railway.app`.
- No Console, configure também `VITE_PLATFORM_API_KEY` (igual a `PLATFORM_API_KEY` no server).

---

## 3. Variáveis de ambiente (resumo)

| Variável | Onde | Obrigatório |
|----------|------|-------------|
| `VITE_SUPABASE_APP_URL` | Frontend (Vercel) | Sim |
| `VITE_SUPABASE_APP_ANON_KEY` | Frontend (Vercel) | Sim |
| `VITE_SUPABASE_PLATFORM_URL` | Frontend (Vercel) | Sim, para login SaaS |
| `VITE_SUPABASE_PLATFORM_ANON_KEY` | Frontend (Vercel) | Sim, para login SaaS |
| `VITE_PLATFORM_API_BASE_URL` | Frontend (Vercel) | **Sim em produção** — URL pública da Admin API |
| `VITE_ACCESS_SAAS_ENABLED` | Frontend (Vercel) | `1` em produção para modo SaaS |
| `ADMIN_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server (Railway/Render) | Obrigatório no backend |
| `PLATFORM_API_KEY` | Server + Console | Para rotas `/internal/platform/*` |

Use o `.env.example` como referência; não commite `.env` com valores reais.

---

## 4. Build local (testar antes do deploy)

```bash
npm run build
npm run preview
```

Abre em `http://localhost:4173`. Confira se login e rotas funcionam; em produção o comportamento é o mesmo, com as variáveis definidas no painel da Vercel.
