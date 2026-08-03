# STABILITY CHECKLIST

Checklist operacional para reduzir regressão no Love Odonto.

## Antes de mudar Auth
- Rodar `npm run smoke`.
- Validar login em `http://localhost:5176/login`.
- Confirmar que `AUTH_OK`/`AUTH_FAILED` aparecem nos logs de estabilidade.
- Nunca apagar sessão automaticamente por erro transitório de rede/contexto.

## Antes de alterar tenant-context
- Rodar `npm run smoke`.
- Validar carregamento de `/stability/health`.
- Testar `Tentar novamente` em falha de tenant-context sem forçar logout.
- Confirmar que erros de tenant não redirecionam para login sem erro real de token.

## Antes de deploy
- Rodar `npm run smoke` e garantir sucesso completo.
- Validar envs críticas:
  - `VITE_SUPABASE_APP_URL`
  - `VITE_SUPABASE_APP_ANON_KEY`
  - `VITE_SUPABASE_PLATFORM_URL`
  - `VITE_SUPABASE_PLATFORM_ANON_KEY`
  - `VITE_APP_ADMIN_API_BASE_URL` (quando aplicável)
- Validar alinhamento de host Supabase entre app, console e backend.

## Regras obrigatórias
- Nunca misturar Supabase do Console com Supabase do App.
- Nunca remover sessão por erro de contexto de tenant.
- Diferenciar `AUTH_FAILED` de `TENANT_CONTEXT_FAILED` e `BACKEND_FAILED`.
- Se backend/supabase falhar, exibir erro claro e permitir retry.

## Comando obrigatório pré-deploy
- `npm run smoke`

