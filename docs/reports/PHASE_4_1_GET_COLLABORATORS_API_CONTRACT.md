# Phase 4.1 — Contrato Oficial: `GET /internal/app/collaborators`

**Documento:** `docs/reports/PHASE_4_1_GET_COLLABORATORS_API_CONTRACT.md`  
**Data:** 2026-07-07  
**Base:** `docs/reports/PHASE_4_OFFICIAL_API_AUDIT.md`  
**Escopo:** Contrato **somente documental** — sem código, endpoint, banco ou commit  
**Versão:** `v1.0.0-draft`

---

## 1. Objetivo do endpoint

Expor a **lista oficial de colaboradores RH** de uma clínica (tenant) via Admin API, com **Supabase `public.collaborators` como única fonte de verdade**.

| Finalidade | Detalhe |
|------------|---------|
| **Primária** | Substituir leituras ad hoc (IndexedDB / Supabase direto no browser) por contrato HTTP estável |
| **Secundária** | Alimentar cache IndexedDB (RC-02 read-primary) e telas que hoje usam `tenantCollaboratorService` + IDB |
| **Fora de escopo v1** | Satélites RH (documentos, telefones, financeiro), permissões, agenda/work hours, fotos upload |

**Princípio:** retornar **todos os colaboradores ativos** do tenant resolvido (com filtros opcionais documentados abaixo).

---

## 2. Fonte oficial dos dados

| Camada | Papel |
|--------|-------|
| **`public.collaborators` (Supabase)** | ✅ **Fonte oficial (SSOT)** |
| **IndexedDB** | ❌ **Proibido** como fonte ou fallback no handler |
| **`tenant_users`** | ❌ Não é lista RH; opcional enriquecimento futuro (v2) |
| **Seed / mock / tenant-1** | ❌ **Proibido** |

Query obrigatória no backend (service_role):

```sql
SELECT <campos>
FROM public.collaborators
WHERE tenant_id = :resolved_tenant_id
  AND deleted_at IS NULL          -- default v1
  -- + filtros opcionais
ORDER BY apelido ASC, nome_completo ASC;
```

---

## 3. Tabela Supabase usada

| Item | Valor |
|------|-------|
| **Schema** | `public` |
| **Tabela** | `collaborators` |
| **Migration** | `016_collaborators_core.sql` |
| **RLS** | `019_collaborators_rls.sql` (bypass via service_role + guards app) |
| **PK** | `id` (UUID) |
| **Tenant FK** | `tenant_id → tenants.id` |
| **Soft delete** | `deleted_at` + `status = 'inativo'` |

**Satélites (Fase 2+):** não incluídos neste endpoint.

---

## 4. Tenant obrigatório

### 4.1 Regra normativa

> **O tenant efetivo NÃO pode ser escolhido livremente pelo frontend.**  
> Deve ser **derivado do contexto autenticado** (`tenant_users` + JWT).

### 4.2 Algoritmo de resolução (obrigatório na implementação)

Ordem de precedência:

| # | Condição | Tenant usado |
|---|----------|--------------|
| T1 | `app_metadata.current_tenant_id` presente **e** membership ativa válida | `current_tenant_id` |
| T2 | Usuário com **exatamente uma** membership ativa em `tenant_users` | `tenant_users.tenant_id` |
| T3 | `?tenant_id=` informado **e** coincide com membership ativa do JWT | valor validado |
| T4 | Múltiplas memberships **sem** disambiguation | **Erro `TENANT_AMBIGUOUS`** |
| T5 | Nenhuma membership ativa | **Erro `TENANT_MEMBERSHIP_REQUIRED`** |

### 4.3 Proibições explícitas

| Proibido | Código erro sugerido |
|----------|---------------------|
| Aceitar `tenant_id` do body | `TENANT_FROM_BODY_FORBIDDEN` |
| Usar `tenant-1`, `tenant_1`, vazio | `TENANT_FORBIDDEN` |
| Primeira clínica / primeiro row `tenant_users` | `TENANT_IMPLICIT_FORBIDDEN` |
| Fallback IndexedDB / localStorage | `TENANT_IDB_FORBIDDEN` |
| `tenant_id` query que **não** pertence ao actor | `TENANT_MISMATCH` |

**Referência de implementação existente:** `resolveActiveTenantUser` + validação cruzada (`server/index.js:536–592`).  
**Diferença vs `users/list`:** este endpoint **não** exige `tenant_id` obrigatório na query quando T1/T2 resolvem unambiguously.

---

## 5. Autenticação obrigatória

| Requisito | Detalhe |
|-----------|---------|
| **Header** | `Authorization: Bearer <access_token>` |
| **Middleware** | `requireAppUser` (`server/index.js:1867`) |
| **Validação** | `supabase.auth.getUser(accessToken)` |
| **Anon key** | ❌ Insuficiente — JWT de sessão app obrigatório |
| **service_role no client** | ❌ Proibido no browser |

**Erros:**

| HTTP | code | Quando |
|------|------|--------|
| 401 | — | Token ausente ou inválido |
| 503 | — | Supabase Auth indisponível (rede) |

---

## 6. RBAC obrigatório

### 6.1 Modelo v1 (alinhado à RLS 019)

| Requisito | Detalhe |
|-----------|---------|
| **Membership** | Row ativa em `tenant_users` para o tenant resolvido |
| **Papel mínimo** | **Qualquer membro ativo** do tenant (roster read) |
| **Admin obrigatório?** | ❌ **Não** — diferente de `GET /users/list` |

**Justificativa:** RLS `collaborators_select_tenant` permite leitura do roster a membros autenticados; agenda, avatares e equipe operacional dependem disso.

### 6.2 Restrições adicionais (implementação)

| Check | Ação |
|-------|------|
| Tenant bloqueado (`billing_blocked`, etc.) | Permitir leitura; warnings opcionais no envelope (futuro) |
| Usuário `has_system_access = false` | **403** — sem acesso ao app |
| Colaborador inativo em `tenant_users` | **403** |

**Nota:** operações administrativas sensíveis (write/delete) usarão admin RBAC em endpoints futuros (4.6+).

---

## 7. Campos retornados

### 7.1 Shape canônico (JSON snake_case — API)

Cada item em `collaborators[]`:

| Campo API | Tipo | Obrigatório | Origem DB | Notas |
|-----------|------|-------------|-----------|-------|
| `id` | UUID string | ✅ | `collaborators.id` | PK oficial |
| `legacy_id` | string \| null | ✅ | `collaborators.legacy_id` | `col-*` / `col-saas-*`; fallback `id` se null |
| `tenant_id` | UUID string | ✅ | `collaborators.tenant_id` | Deve = tenant resolvido |
| `status` | `"ativo"` \| `"inativo"` | ✅ | `status` | |
| `apelido` | string | ✅ | `apelido` | |
| `nome_completo` | string | ✅ | `nome_completo` | |
| `nome_social` | string \| null | ✅ | `nome_social` | |
| `sexo` | string \| null | ✅ | `sexo` | |
| `data_nascimento` | date string \| null | ✅ | `data_nascimento` | ISO `YYYY-MM-DD` |
| `email` | string \| null | ✅ | `email` | lower-case |
| `foto_url` | string \| null | ✅ | `foto_url` | HTTPS/Storage only; nunca `data:` |
| `rh_categoria` | string | ✅ | `rh_categoria` | |
| `cargo` | string | ✅ | `cargo` | |
| `rh_funcao_descricao` | string \| null | ✅ | `rh_funcao_descricao` | |
| `tipo_vinculo` | string | ✅ | `tipo_vinculo` | |
| `setor` | string | ✅ | `setor` | |
| `especialidades` | string[] | ✅ | `especialidades` | |
| `registro_profissional` | string \| null | ✅ | `registro_profissional` | |
| `conselho_nome` | string \| null | ✅ | `conselho_nome` | |
| `conselho_uf` | string \| null | ✅ | `conselho_uf` | 2 chars |
| `agenda_enabled` | boolean | ✅ | `agenda_enabled` | |
| `created_at` | ISO8601 | ✅ | `created_at` | |
| `updated_at` | ISO8601 | ✅ | `updated_at` | |

### 7.2 Campos excluídos v1

| Campo DB | Motivo |
|----------|--------|
| `created_by`, `updated_by` | Auditoria interna — expor em v2 se necessário |
| `deleted_at` | Omitido quando `include_deleted=false` (default) |

### 7.3 Mapeamento frontend

Alinhado a `CollaboratorCore` (`collaboratorMapper.ts`):

| API snake_case | Core camelCase |
|----------------|----------------|
| `id` | `uuid` |
| `legacy_id` | `legacyId` |
| `nome_completo` | `nomeCompleto` |
| … | … |

---

## 8. Filtros permitidos

Query string — **todos opcionais**:

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `status` | `ativo` \| `inativo` | *(todos exceto deletados)* | Filtra por status |
| `agenda_enabled` | `true` \| `false` | — | Profissionais de agenda |
| `search` | string | — | ILIKE em `apelido`, `nome_completo`, `email` |
| `include_deleted` | `true` \| `false` | `false` | Inclui `deleted_at IS NOT NULL` |
| `tenant_id` | UUID | — | **Somente disambiguation** (§4) |

**Proibido:** filtros que alterem tenant efetivo (`tenant_id` no body, header custom, etc.).

**Default v1:** equivalente a `status=ativo` implícito via `deleted_at IS NULL` + `status != 'inativo'` (mirror `applyListFilters` em `collaboratorSupabaseRepository.ts`).

---

## 9. Paginação

### v1.0 (MVP)

| Aspecto | Contrato |
|---------|----------|
| **Comportamento default** | Retorna **todos** os registros do tenant (típico ≤ 50) |
| **Limite máximo** | **500** rows — acima disso: erro ou truncamento documentado |
| **Paginação cursor** | ❌ v1 — reservado v1.1 |

### v1.1 (opcional futuro)

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `limit` | int 1–500 | Default 500 |
| `offset` | int ≥ 0 | Default 0 |

Envelope incluirá `meta.total`, `meta.limit`, `meta.offset`.

---

## 10. Ordenação

| Prioridade | Campo | Direção |
|------------|-------|---------|
| 1 | `apelido` | ASC |
| 2 | `nome_completo` | ASC |
| 3 | `id` | ASC (tie-break) |

**Parâmetro `sort`:** ❌ v1 — fixo para previsibilidade.

---

## 11. Envelope de resposta

### 11.1 Sucesso — HTTP 200

```json
{
  "success": true,
  "tenant_id": "7aba7127-409c-4ea4-8dbc-807efc5e189c",
  "source": "supabase.collaborators",
  "count": 4,
  "collaborators": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "legacy_id": "col-f93e5dbf-…",
      "tenant_id": "7aba7127-409c-4ea4-8dbc-807efc5e189c",
      "status": "ativo",
      "apelido": "Dra. Juliana",
      "nome_completo": "Juliana",
      "nome_social": null,
      "sexo": null,
      "data_nascimento": null,
      "email": "juliana+staging@implanprime.test",
      "foto_url": null,
      "rh_categoria": "Corpo Clínico",
      "cargo": "Implantodontista",
      "rh_funcao_descricao": null,
      "tipo_vinculo": "PJ",
      "setor": "Clínico",
      "especialidades": [],
      "registro_profissional": null,
      "conselho_nome": null,
      "conselho_uf": null,
      "agenda_enabled": true,
      "created_at": "2026-06-29T12:00:00.000Z",
      "updated_at": "2026-06-29T12:00:00.000Z"
    }
  ],
  "meta": {
    "read_only": true,
    "api_version": "4.1.0",
    "filters_applied": {
      "status": null,
      "agenda_enabled": null,
      "search": null,
      "include_deleted": false
    }
  }
}
```

### 11.2 Lista vazia

HTTP **200** com `count: 0`, `collaborators: []` — **não** 404.

---

## 12. Erros possíveis

| HTTP | `code` | Causa | Body exemplo |
|------|--------|-------|--------------|
| 401 | — | JWT ausente/inválido | `{ "error": "Token do app ausente." }` |
| 403 | `TENANT_MEMBERSHIP_REQUIRED` | Sem vínculo ativo | `{ "error": "…", "code": "TENANT_MEMBERSHIP_REQUIRED" }` |
| 403 | `TENANT_MISMATCH` | `?tenant_id` ≠ membership | `{ "error": "tenant_id inválido…", "code": "TENANT_MISMATCH" }` |
| 400 | `TENANT_AMBIGUOUS` | Multi-clínica sem disambiguation | `{ "error": "…", "code": "TENANT_AMBIGUOUS" }` |
| 400 | `TENANT_FORBIDDEN` | `tenant-1` ou proibido | `{ "error": "…", "code": "TENANT_FORBIDDEN" }` |
| 400 | — | Filtro inválido | `{ "error": "status inválido." }` |
| 503 | — | Supabase timeout/522/rede | `{ "error": "Não foi possível contactar o Supabase…" }` |
| 500 | — | Erro inesperado | `{ "error": "Falha ao listar colaboradores." }` |

**Padrão de erro:** alinhado a `users/list` — `{ "error": string, "code"?: string }`, sem stack trace em produção.

---

## 13. Logs / auditoria

### 13.1 v1 — structured console (obrigatório)

```js
console.log('[RH_COLLABORATORS_LIST]', {
  user_id,
  email,
  tenant_id: resolvedTenantId,
  count,
  filters,
  duration_ms,
  at: new Date().toISOString(),
});
```

### 13.2 v1 — não incluir

| Mecanismo | v1 |
|-----------|-----|
| `audit_logs` (Postgres) | ❌ |
| `identity_events` | ❌ |
| PII em log (CPF, etc.) | ❌ — satélites fora do escopo |

### 13.3 v2 (futuro)

Persistência em `audit_logs` para leituras admin sensíveis — fora do escopo 4.1.

---

## 14. Segurança / RLS

| Camada | Comportamento |
|--------|---------------|
| **Cliente Supabase** | `service_role` (`server/index.js:274`) — backend only |
| **RLS Postgres** | Bypass intencional; **guards aplicacionais** substituem |
| **Isolamento tenant** | `.eq('tenant_id', resolvedTenantId)` **obrigatório** em toda query |
| **Projeção** | `select` explícito de colunas — evitar `*` em produção se possível |
| **Rate limit** | Herdar política Admin API (futuro); v1 sem limit dedicado |
| **CORS** | N/A — server-side / proxy Vite `:5176 → :3001` |

**Defesa em profundidade:** mesmo com service_role, handler **rejeita** qualquer row cujo `tenant_id` ≠ resolvido (assert pós-query).

---

## 15. Cache IndexedDB

| Regra | Detalhe |
|-------|---------|
| **Fluxo** | API → frontend service → `collaboratorRepository.syncCacheFromRemote` → IDB |
| **Autoridade** | **API/Supabase** — IDB nunca responde este endpoint |
| **Offline** | Fora do escopo — repository RC-02 trata `indexeddb-offline` separadamente |
| **Hydrate** | Após 200, frontend **pode** espelhar em IDB via flag `READ_PRIMARY` |
| **Invalidação** | `updated_at` max no payload vs cache local |

**Proibido no handler:** ler/escrever IndexedDB, chamar `withDb`, importar `src/db/*`.

---

## 16. Compatibilidade com frontend atual

| Consumer atual | Hoje | Migração Phase 4.1 |
|----------------|------|---------------------|
| `tenantCollaboratorService.js` | `users/list` + IDB enrich | Opt-in: `GET /collaborators` para ficha RH |
| `collaboratorServiceReadAdapter.js` | IDB `listLegacySync` | Paralelo até flag |
| `collaboratorRepository.listCore` | Supabase JWT client | Pode delegar à API via bridge |
| `CollaboratorsPage.jsx` | IDB CRUD | **Sem alteração v1** — só contrato |
| `listCollaborators` filters | camelCase legacy | Adapter snake_case ↔ camelCase |

### 16.1 Compatibilidade de IDs

| Campo | Uso legacy | Uso novo |
|-------|------------|----------|
| `legacy_id` | `collaboratorId` em agenda/financeiro | **Manter** |
| `id` (UUID) | `tenant_users.collaborator_uuid` | **Canônico** |

### 16.2 Feature flag (implementação futura)

```env
VITE_RH_API_LIST_COLLABORATORS=false   # default até soak OK
```

**v1 contrato:** endpoint existe; frontend **não** obrigado a migrar na mesma PR.

---

## 17. Critérios de aceite

| # | Critério |
|---|----------|
| AC-01 | `GET /internal/app/collaborators` retorna 200 + envelope §11 com JWT válido |
| AC-02 | Tenant resolvido **somente** via algoritmo §4 — nunca `tenant-1` |
| AC-03 | `tenant_id` query inválido → 403 `TENANT_MISMATCH` |
| AC-04 | Multi-clínica sem disambiguation → 400 `TENANT_AMBIGUOUS` |
| AC-05 | Dados 100% de `public.collaborators` — zero IDB |
| AC-06 | Default exclui soft-deleted (`deleted_at IS NULL`) |
| AC-07 | Staging tenant soak: **4 colaboradores** (Paulo, Juliana, Renata, Melissa) |
| AC-08 | `legacy_id` presente em todos os rows staging |
| AC-09 | `foto_url` nunca `data:` na resposta |
| AC-10 | Log `[RH_COLLABORATORS_LIST]` emitido |
| AC-11 | Tempo resposta p95 < 2s com ≤ 500 rows |
| AC-12 | Nenhuma regressão em `users/list` ou `tenant-context` |

---

## 18. Testes obrigatórios

| Suite | Arquivo sugerido | Casos mínimos |
|-------|------------------|---------------|
| **HTTP integration** | `server/__tests__/collaboratorsListApi.test.js` | 200 happy path; 401 sem token |
| **Tenant isolation** | idem | TENANT_MISMATCH; TENANT_AMBIGUOUS |
| **Forbidden tenants** | idem | `tenant-1` rejeitado |
| **Filters** | idem | status, agenda_enabled, search |
| **Empty tenant** | idem | 200 count=0 |
| **Mapper parity** | reutilizar `collaboratorMapper` tests | snake API ↔ CollaboratorCore |
| **Regression** | `npm run test` existente | 83+ RH tests PASS |

**Ferramenta:** supertest contra `:3001` com JWT fixture staging (mock `getUser`).

**Gate:** nenhum merge de implementação sem suite verde.

---

## 19. Plano de implementação

> **Somente após aprovação deste contrato.** Ordem mínima:

| Step | Ação | Arquivo |
|------|------|---------|
| 1 | Helper `resolveTenantFromAppAuth(req)` extraindo §4 | `server/index.js` ou inline |
| 2 | Handler `GET /internal/app/collaborators` | `server/index.js` (~after `users/list`) |
| 3 | Query Supabase + filtros + sort | handler |
| 4 | Log `[RH_COLLABORATORS_LIST]` | handler |
| 5 | Testes supertest | `server/__tests__/…` |
| 6 | Documentar em `LOVE_ODONTO_V2_MASTER_API.md` | docs |
| 7 | *(Opcional)* Client wrapper `listCollaboratorsFromApi()` | `src/services/` + flag |

**Estimativa:** ~150–200 LOC handler + ~200 LOC tests.  
**Sem:** novos módulos npm, novas telas, migrations.

---

## 20. Plano de rollback

| Nível | Ação |
|-------|------|
| **R0 — Feature flag** | `VITE_RH_API_LIST_COLLABORATORS=false` — frontend ignora API |
| **R1 — Route disable** | Comentar/remover rota GET (1 handler) |
| **R2 — Proxy** | Vite proxy inalterado — sem impacto |
| **R3 — Dados** | Read-only — **zero** mutação DB; rollback sem migration |
| **R4 — Cache** | IDB cache anterior permanece válido |

**RTO:** imediato (deploy revert). **RPO:** N/A (read-only).

---

## 21. Veredicto final

### Contrato Phase 4.1

## ✅ **READY**

Especificação completa: objetivo, SSOT, tenant, auth, RBAC, campos, filtros, envelope, erros, segurança, cache, compatibilidade, aceite, testes, implementação e rollback definidos.

### Implementação em código

## ❌ **NOT READY**

| Bloqueador | Detalhe |
|------------|---------|
| **B1** | Staging Supabase **`BLOCKED_EXTERNAL`** (HTTP 522) — impede AC-07 e testes live |
| **B2** | Suite `server/__tests__/collaboratorsListApi.test.js` **não existe** |
| **B3** | Helper tenant §4 ainda **não codificado** (contrato only) |

**Desbloqueio:** recovery staging (RC-03.9 §7) + implementar handler + testes supertest → então **READY PARA IMPLEMENTAÇÃO EXECUTADA**.

---

## Apêndice A — Referências

| Artefato | Path |
|----------|------|
| Auditoria Phase 4 | `docs/reports/PHASE_4_OFFICIAL_API_AUDIT.md` |
| Schema collaborators | `supabase/migrations/016_collaborators_core.sql` |
| RLS | `supabase/migrations/019_collaborators_rls.sql` |
| Mapper canônico | `src/repositories/collaborator/collaboratorMapper.ts` |
| Padrão list existente | `server/index.js:2784` (`users/list`) |
| Padrão tenant resolve | `server/index.js:1950` (`tenant-context`) |
| RC-03 status | `docs/reports/RC-03_FINAL_STATUS.md` |

---

*Phase 4.1 — contrato oficial only. Zero código. Zero commit.*
