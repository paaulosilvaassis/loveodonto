# Repository V3 — Matriz de Production Guards

**Phase 5.15** — Guards obrigatórios antes de qualquer cutover em produção.

---

## 1. Guards universais (todos os domínios)

| Guard | Implementação | Efeito |
|-------|---------------|--------|
| **PROD runtime lock** | `import.meta.env.PROD` → `lockDangerous*Flags()` | Todas flags perigosas → `false` |
| **Supabase host produção** | `PRODUCTION_SUPABASE_PROJECT_REF = uoepkwhqztmsjnzirpev` | READ/WRITE/SHADOW bloqueados se env aponta produção |
| **Defaults false** | `*_REPOSITORY_FLAG_DEFAULTS` | Comportamento legado preservado |
| **Vitest isolation** | `applyVitestIsolationContract()` | Env de teste nunca herda staging |
| **Tenant body forbidden** | `assertNoTenantIdInBody` / `assertNoTenantIdQueryParam` | Tenant só via Core Tenant |
| **Sem commit automático** | Processo manual | Nenhuma promoção silenciosa |

---

## 2. Matriz por domínio

| Guard | RH | Clinic | Agenda | Financial |
|-------|-----|--------|--------|-----------|
| `lockDangerous*Flags` em PROD | ✅ | ✅ | ✅ | ✅ |
| Host Supabase prod bloqueia READ | ✅ | ✅ | ✅ | ✅ |
| Host Supabase prod bloqueia WRITE | ✅ | ✅ | ✅ | ✅ |
| Host Supabase prod bloqueia SHADOW | ✅ | ✅ | ✅ | ✅ |
| Validação flag dependencies | ✅ | ✅ | ✅ | ✅ |
| `FORBIDDEN_TENANT_IDS` no server | ✅ | ✅ | ✅ | ✅ |
| 503 table missing (sem crash) | ✅ | ✅ | ✅ | ✅ |
| Logs DEV-only | ✅ | ✅ | ✅ | ✅ |

---

## 3. Guards de escrita

| Cenário | Comportamento obrigatório |
|---------|---------------------------|
| Falha remota dual-write | IDB preservado; retorno usuário inalterado |
| Falha remota primary | IDB preservado (gravado antes do microtask) |
| Flag OFF mid-session | Próxima operação 100% legado |
| Offline browser | Fallback IDB (`isBrowserOffline`) |
| Remote unavailable | `isRemoteReadUnavailableError` → IDB |

---

## 4. Guards de dados

| Regra | Detalhe |
|-------|---------|
| IndexedDB nunca removido | Mirror/hydrate apenas |
| Legado nunca removido nesta fase | Services originais permanecem |
| Sem migrations automáticas | Schema remoto manual/autorizado |
| Sem alteração HTTP contract | Status codes e payloads estáveis |
| Idempotência write | `correlation_id` + `idempotency_key` (Financial) |

---

## 5. Checklist pré-promoção staging → produção

- [ ] Soak 48–72h verde em staging
- [ ] `FINANCIAL_*` / `{DOMAIN}_*` flags OFF em produção verificado
- [ ] `applyProductionSafeLocks` testado em CI
- [ ] Regressão completa sem skip inesperado
- [ ] Relatório técnico aprovado formalmente
- [ ] Rollback documentado (flag OFF)
- [ ] Operador confirma Supabase remoto intacto

---

## 6. Referência de código

| Módulo | Função |
|--------|--------|
| `*RepositoryFlags.ts` | `applyProductionSafeLocks`, `lockDangerous*Flags` |
| `server/lib/*Api*.js` | `FORBIDDEN_TENANT_IDS`, table missing |
| `src/config/envGuard.js` | Stability checks Supabase |
| `rhTestFlagContract.js` | Isolamento Vitest |
