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
   - Adicione em **Redirect URLs** a URL de produção, por exemplo:  
     `https://seu-app.vercel.app/**`  
   - Assim o login e callbacks funcionam em produção.

3. **Na Vercel:**
   - **New Project** → importe o repositório do app.
   - **Root Directory:** deixe como está (raiz do repo) ou a pasta onde está o `package.json` do app.
   - **Build Command:** `npm run build` (já é o padrão com Vite).
   - **Output Directory:** `dist` (padrão do Vite).
   - Em **Environment Variables** adicione:
     - `VITE_SUPABASE_APP_URL` = URL do projeto Supabase (ex.: `https://xxxx.supabase.co`)
     - `VITE_SUPABASE_APP_ANON_KEY` = chave anon/public do projeto  
     Se usar o painel platform no mesmo deploy, opcional:
     - `VITE_SUPABASE_PLATFORM_URL` e `VITE_SUPABASE_PLATFORM_ANON_KEY` (podem ser iguais ao app se for o mesmo projeto).

4. **Deploy:** clique em **Deploy**. O `vercel.json` na raiz já configura o roteamento SPA (todas as rotas caem no `index.html`).

5. Acesse a URL gerada (ex.: `https://seu-app.vercel.app`). O app deve carregar e o login via Supabase deve funcionar se as redirect URLs estiverem configuradas.

---

## 2. Deploy do server (API admin) – opcional

Só é necessário se você usar o **Console** (painel platform) que chama a API em `server/`.

- **Railway / Render / Fly.io:** crie um novo serviço apontando para a pasta `server` (ou monorepo com root no `server`).
- **Variáveis de ambiente do server** (nunca no frontend):
  - `ADMIN_API_KEY` – chave secreta para o header `X-Admin-API-Key`
  - `SUPABASE_URL` – URL do projeto Supabase
  - `SUPABASE_SERVICE_ROLE_KEY` – service role key (Supabase → Settings → API)
  - Opcional: `PLATFORM_API_KEY` (ou use a mesma que `ADMIN_API_KEY`)
- No Console, configure a URL da API deployada (ex.: `https://sua-api.railway.app`) e a mesma `ADMIN_API_KEY`.

---

## 3. Variáveis de ambiente (resumo)

| Variável | Onde | Obrigatório |
|----------|------|-------------|
| `VITE_SUPABASE_APP_URL` | Frontend (Vercel) | Sim |
| `VITE_SUPABASE_APP_ANON_KEY` | Frontend (Vercel) | Sim |
| `VITE_SUPABASE_PLATFORM_URL` | Frontend | Só se usar /platform |
| `VITE_SUPABASE_PLATFORM_ANON_KEY` | Frontend | Só se usar /platform |
| `ADMIN_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server | Só se usar a API admin |

Use o `.env.example` como referência; não commite `.env` com valores reais.

---

## 4. Build local (testar antes do deploy)

```bash
npm run build
npm run preview
```

Abre em `http://localhost:4173`. Confira se login e rotas funcionam; em produção o comportamento é o mesmo, com as variáveis definidas no painel da Vercel.
