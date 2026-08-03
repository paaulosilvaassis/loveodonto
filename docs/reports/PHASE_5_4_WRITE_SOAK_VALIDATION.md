# Phase 5.4 — Write Soak & Staging Validation

**Data:** 2026-07-08  
**Pré-requisito:** Phase 5.3 READY  
**Produção:** `uoepkwhqztmsjnzirpev` — **WRITE permanece false**  
**Staging:** `tckdjyunwmdpqmewrwvt`  
**Tenant referência:** `7aba7127-409c-4ea4-8dbc-807efc5e189c`

---

## 1. Flags staging (somente dev/staging local)

```env
VITE_RH_SUPABASE_READ=true
VITE_RH_SUPABASE_READ_PRIMARY=true
VITE_RH_SUPABASE_WRITE=true
VITE_RH_SHADOW_READ=true
VITE_RH_COMPARE_IDB_SUPABASE=true
VITE_RH_IDB_WRITE_DISABLED=false
```

**Produção:** nenhuma flag acima. Locks `applyProductionSafeLocks` forçam false em build PROD.

---

## 2. Dados de teste

| Item | Valor |
|------|-------|
| Tenant | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| Usuário soak | master com `collaborators:write` |
| Colaborador create | apelido único `Soak-{timestamp}` |
| CRO teste | registro único por execução |
| E-mail opcional | `soak+{timestamp}@implanprime.test` |

---

## 3. Cenários manuais (browser staging)

| # | Cenário | Passos | Critério |
|---|---------|--------|----------|
| M1 | Create dual-write | Criar colaborador RH | IDB imediato + row Supabase + `[RH_WRITE] create ok` |
| M2 | Update dual-write | Editar apelido | UI atualiza + Supabase `updated_at` + mirror IDB |
| M3 | Inativação | `status: inativo` | `softDelete` remoto se uuid; IDB inativo |
| M4 | Read-after-write | Recarregar lista | READ_PRIMARY mostra dado remoto |
| M5 | Foto | uploadCollaboratorPhoto | fotoUrl IDB; dual-write update remoto |
| M6 | System access | createWithSystemAccess | provision API inalterado |
| M7 | Compare | DevTools `[RH_SHADOW]` | divergências logadas; UI não trava |
| M8 | Offline | DevTools offline → create | IDB ok; write remoto falha silenciosa |
| M9 | Rollback flag | `WRITE=false` + restart | só IDB; sem upsert remoto |
| M10 | Produção guard | build PROD ou host prod | WRITE=false efetivo |

---

## 4. Cenários automatizados

Suite: `src/__tests__/collaboratorWriteSoakValidation.test.js`

Simula soak completo com mocks — sem rede/Supabase real.

---

## 5. Critérios de rollback

| Gatilho | Ação |
|---------|------|
| Perda de dado local | `WRITE=false` imediato |
| Divergência blocking > 0 sustained | pausar WRITE; investigar shadow |
| Erro remoto > 5% writes | `WRITE=false`; IDB authority |
| Staging 522/Auth down | BLOCKED_EXTERNAL (não promover) |

---

## 6. Execução soak remoto

**Status operacional (2026-07-08):** soak manual browser **depende** de staging Supabase saudável. Ver `RH_RC03_STAGING_SOAK_TEST.md` / RC-03.7 para bloqueios HTTP 522.

Automated soak (Vitest) valida contratos sem Supabase remoto.

---

## 7. Veredicto Phase 5.4

| Dimensão | Resultado |
|----------|-----------|
| Contratos dual-write (automated) | **PASS** |
| Locks produção | **PASS** |
| Soak manual staging browser | **PENDENTE OPERADOR** (pré-req: staging healthy) |
| Promover WRITE produção | **PROIBIDO** |
