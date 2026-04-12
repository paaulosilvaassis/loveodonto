# Desenvolvimento local

Antes de subir qualquer serviço, os scripts `npm` executam **`scripts/preflight-local.mjs`**: alinhamento Supabase (API ↔ Console ↔ app platform), e bloqueio de portas duplicadas (3001 API, 5177 Console).

## Comandos

| Comando | Efeito |
|--------|--------|
| `npm run env:check` | Só valida env (stack API + Console). |
| `npm run dev` | App (Vite) na porta do projeto; valida app + API. |
| `npm run dev:all` | App + `console:dev` em paralelo. |
| `npm run console:dev` | API 3001 + Console 5177 (coordena duplicados). |
| `npm run console:vite-only` | Só Vite da Console; falha se `/login` já responder na 5177. |
| `npm run api:dev` | Só API; falha se `/health` já estiver OK na 3001. |

## Variáveis opcionais (emergência)

| Variável | Uso |
|----------|-----|
| `LOVE_ODONTO_ALLOW_DUPLICATE_DEV=1` | Ignora bloqueio de segunda instância API/Console (não recomendado). |
| `LOVE_ODONTO_SKIP_PORT_FREE=1` | Não mata processo na 5177; falha se a porta estiver ocupada. |

`ADMIN_API_PORT` (padrão `3001`) deve ser o mesmo em todo o stack se alterar a porta da API.
