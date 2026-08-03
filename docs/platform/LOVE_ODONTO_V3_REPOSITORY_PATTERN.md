# Love Odonto V3 — Repository Pattern Oficial

**Versão:** 1.0 (Phase 5.15)  
**Status:** Normativo para novas migrações de domínio  
**Autoridade:** Complementa [`../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md)

---

## 1. Propósito

Padronizar a convergência **IndexedDB (legado) → Admin API → Supabase (SSOT)** sem ruptura funcional, usando feature flags e cutover incremental.

**Domínios de referência validados:**

| Domínio | Path | Fases |
|---------|------|-------|
| Collaborators (RH) | `src/repositories/collaborator/` | 5.1–5.4 |
| Clinic Profile | `src/repositories/clinicProfile/` | 5.5–5.6 |
| Agenda | `src/repositories/agenda/` | 5.7–5.10 |
| Financeiro | `src/repositories/financial/` | 5.11–5.14 |

---

## 2. Camadas obrigatórias

```
Pages / UI
    ↓
Service legado (IDB authority com flags OFF)
    ↓
ReadAdapter / WriteAdapter (opcional por operação)
    ↓
RepositoryBridge (flags + registro Admin API)
    ↓
{Domain}Repository (facade)
    ↓
├── {Domain}IndexedDbRepository   (legado sync)
├── {Domain}AdminApiRepository  (remote client)
├── {Domain}Cache                 (memória)
├── {Domain}Mapper                (core ↔ legado ↔ server)
├── {Domain}RepositorySync        (hydrate, compare, offline)
└── {Domain}RepositoryFlags       (feature flags)
    ↓
Admin API (`server/lib/{domain}Api*.js`)
    ↓
Supabase (SSOT quando remoto disponível)
```

### 2.1 Responsabilidades

| Camada | Responsabilidade |
|--------|------------------|
| **Service legado** | Regras de negócio, validação, permissões, `withDb()` |
| **ReadAdapter** | `fromRepo !== null ? repo : loadDb()` — sem alterar contrato público |
| **WriteAdapter** | Dual-write / primary-write assíncrono pós-IDB |
| **Bridge** | Resolve flags, injeta remote clients, hooks de teste |
| **Repository** | Orquestra IDB/cache/remoto; assert flags por operação |
| **Flags** | Defaults `false`, validação, production locks |
| **Admin API** | Tenant via Core Tenant; **nunca** `tenant_id` no body/query do frontend |

---

## 3. Tipos e naming

### 3.1 Convenções de arquivo

| Artefato | Padrão |
|----------|--------|
| Flags | `{domain}RepositoryFlags.ts` |
| Types | `{domain}Types.ts` |
| Mapper | `{domain}Mapper.ts` |
| IDB reader | `{domain}IndexedDbRepository.ts` |
| Admin API client | `{domain}AdminApiRepository.ts` |
| Sync/hydrate | `{domain}RepositorySync.ts` |
| Facade | `{domain}Repository.ts` |
| Cache | `{domain}Cache.ts` |
| Bridge | `{domain}RepositoryBridge.js` ou `{domain}ServiceRepositoryBridge.js` |
| Read adapter | `{domain}ReadAdapter.js` |
| Write adapter | `{domain}WriteAdapter.js` |
| Admin API server | `server/lib/{domain}ApiList.js`, `{domain}ApiWrite.js` |
| Cliente HTTP | `src/services/{domain}AdminApi.js` |

### 3.2 Tipos core

- `{Entity}Core` — shape normalizado (camelCase, tenantId)
- `{Entity}LegacyRow` — shape IndexedDB existente
- `{Entity}CreateCoreDto` / `{Entity}UpdateCoreDto` — write DTOs
- `I{Domain}Repository` — contrato público da facade
- `I{Domain}AdminApiClient` — read + write remoto

### 3.3 IDs

- `legacyId` = ID IndexedDB (`row.id`)
- `uuid` = ID Supabase quando disponível
- Resolução remota: `legacy_id` OR `id` (UUID)

---

## 4. Feature flags — modelo canônico

Ver [`REPOSITORY_V3_FLAG_MATRIX.md`](./REPOSITORY_V3_FLAG_MATRIX.md).

**Regra universal:** com todas as flags `false`, comportamento **idêntico** ao legado puro.

### 4.1 Read path

| Flag | Efeito |
|------|--------|
| `{DOMAIN}_READ` | Habilita leitura remota |
| `{DOMAIN}_READ_PRIMARY` | SSOT remoto; hydrate IDB + cache |

### 4.2 Shadow / Compare

| Flag | Efeito |
|------|--------|
| `{DOMAIN}_SHADOW` / `{DOMAIN}_SHADOW_READ` | Leitura remota paralela; log DEV |
| `{DOMAIN}_COMPARE` | Diff IDB vs remoto; nunca altera retorno |

### 4.3 Write path

| Flag | Efeito |
|------|--------|
| `{DOMAIN}_WRITE` | Habilita escrita remota |
| `{DOMAIN}_DUAL_WRITE` | IDB authority + shadow write async (Financeiro) |
| `{DOMAIN}_WRITE_PRIMARY` | Remote SSOT + hydrate IDB mirror |
| `{DOMAIN}_WRITE_COMPARE` | Diff pós-write; log DEV |

---

## 5. Fluxos de cutover

### 5.1 Read cutover (Phase N.2)

```
Service → ReadAdapter
  → if READ_PRIMARY: Repository.listCore → Admin API → hydrate → return
  → elif legado: loadDb() / listLegacySync
  → scheduleShadowRead se SHADOW/COMPARE
```

### 5.2 Write cutover — dual-write (Phase N.3)

```
Service → IDB write (síncrono, retorno imediato)
  → queueMicrotask → WriteAdapter → Repository.*Core → Admin API
  → resultado descartado (shadow) OU hydrate (primary)
  → falha remota: IDB preservado, log DEV
```

### 5.3 Write primary + soak (Phase N.4)

```
Service → IDB write (fallback garantido)
  → queueMicrotask → Primary write → hydrate IDB
  → soak metrics + consistency report
  → rollback: flag OFF → 100% IDB
```

---

## 6. Admin API — convenções

| Regra | Detalhe |
|-------|---------|
| Prefixo | `/internal/app/{resource}` |
| Auth | `requireAppUser` + membership tenant |
| Tenant | `req.tenantContext.tenantId` — **proibido** no body/query |
| Listagem | `GET` com paginação `page`, `pageSize`, filtros |
| Escrita | `POST` create/upsert, `PUT` update, `DELETE` delete |
| Tabela ausente | `503` + code `*_TABLE_MISSING` |
| Select | `legacy_id` obrigatório em todas as tabelas V3 |
| Body write | snake_case no server; mapper no cliente |

---

## 7. Logs e métricas (DEV only)

| Token | Uso |
|-------|-----|
| `[{DOMAIN}_READ]` | Read path / fallback |
| `[{DOMAIN}_SHADOW]` | Shadow/compare |
| `[{DOMAIN}_WRITE]` | Repository write |
| `[{DOMAIN}_WRITE_ADAPTER]` | Adapter dual/primary |
| `[{DOMAIN}_WRITE_AUDIT]` | Audit in-memory |
| `[{DOMAIN}_WRITE_SOAK]` | Soak validation |

**Proibição:** `console.log` sem guard `import.meta.env?.DEV`.

---

## 8. Testes obrigatórios por fase

Ver [`../playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md`](../playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md) e `src/__tests__/repositoryV3ArchitectureContract.test.js`.

---

## 9. Fases padrão por domínio

| Fase | Entrega |
|------|---------|
| **N.1 Foundation** | Types, flags, mapper, IDB reader, cache, facade stub |
| **N.2 Read Cutover** | Admin API GET, ReadAdapter, shadow/compare |
| **N.3 Write Cutover** | Admin API write, WriteAdapter dual-write |
| **N.4 Write Primary** | WRITE_PRIMARY, hydrate, soak validation |
| **N.5 Soak / Promote** | Homologação staging, relatório operador |

---

## 10. Referências

- Checklist: [`../playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md`](../playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md)
- Flags: [`REPOSITORY_V3_FLAG_MATRIX.md`](./REPOSITORY_V3_FLAG_MATRIX.md)
- Guards: [`REPOSITORY_V3_PRODUCTION_GUARDS.md`](./REPOSITORY_V3_PRODUCTION_GUARDS.md)
- Template relatório: [`../reports/PHASE_REPORT_TEMPLATE.md`](../reports/PHASE_REPORT_TEMPLATE.md)
- Contrato testes: `src/__tests__/rhTestFlagContract.js`
- Relatório consolidação: [`../reports/PHASE_5_15_PLATFORM_ARCHITECTURE_CONSOLIDATION.md`](../reports/PHASE_5_15_PLATFORM_ARCHITECTURE_CONSOLIDATION.md)
