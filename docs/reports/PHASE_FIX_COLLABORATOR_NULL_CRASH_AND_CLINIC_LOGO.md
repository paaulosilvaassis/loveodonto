# PHASE — FIX COLLABORATOR NULL CRASH + CLINIC LOGO DISPLAY

## Gate

**READY_FOR_LOCAL_MANUAL_VALIDATION**

> Correções locais apenas. Sem commit/push/deploy. Sem migration. Sem alteração de Contracts Operational UX / rollout.

---

## BUG 1 — COLLABORATOR CRASH

**Root cause:** Após criar/abrir colaborador, `selectedId` era setado antes da lista hidratar. O render chamava `getCollaboratorNameDisplay(selectedCollaboratorRow)` com `selectedCollaboratorRow = null`, acessando `null.nomeCompleto`.

**Arquivo/função:** `src/pages/CollaboratorsPage.jsx` → `getCollaboratorNameDisplay` / render de `CollaboratorRecordView`; helpers em `src/utils/collaboratorDisplay.js`.

**O colaborador chegou a ser criado?:** Sim — a persistência local (`createCollaborator`) e o provisionamento de acesso podiam concluir; o crash era na re-renderização da ficha. Não criar duplicata.

**Correção:**
1. Causa raiz: em `handleCollaboratorCreated`, refrescar a lista **antes** de `setSelectedId`.
2. Resiliência: helpers null-safe + `resolveCollaboratorForDisplay` (fallback para `draft.profile`).
3. Filtrar linhas inválidas na lista / directory.

**Teste criação dentista:** coberto por testes unitários de display + fluxo de create ordenado (validação manual local pendente).

**Teste reload:** helpers + lista filtrada evitam crash com registro incompleto.

**Resultado:** PASS (unit) — aguarda validação manual local.

---

## BUG 2 — CLINIC LOGO

**Root cause:** A API `/internal/app/tenant-context` já devolvia `clinicProfile` com `logo_url`, mas `getTenantContext` / `readTenantAccessSnapshot` / `TenantProvider` **descartavam** o campo. `useClinicLogo` lia `useTenant().clinicProfile` (sempre `undefined`) e caía no fallback Love Odonto. O nome vinha de `useClinicSummary` (IndexedDB), mas a logo não.

**Onde a logo estava salva:** `clinic_profiles.logo_url` (Supabase) + Storage `clinic-logos/{tenantId}/…` + espelho local `db.clinicProfile.logoUrl`.

**Onde a tela estava buscando:** `useClinicLogo` → TenantContext.clinicProfile (ausente).

**Correção:**
1. Propagar `clinicProfile` no tenant context.
2. Sync para IndexedDB no `TenantProvider`.
3. `useClinicLogo` com fallback local tenant-scoped + listeners `saas:clinic-profile-synced`.
4. Cache-bust `?v=` em URLs http(s); `useClinicSummary` também escuta sync.
5. `ClinicSettingsPage` aguarda `updateClinicProfile`.

**Multi-tenant isolation:** logo local só se `clinicProfile.tenant_id === session.tenantId`.

**Cache/update:** evento de sync + cache-bust na URL Storage.

**Resultado:** PASS (unit) — aguarda validação manual local.

---

## Entrega

| Campo | Valor |
|-------|--------|
| **Files changed** | `collaboratorDisplay.js` (novo), `CollaboratorsPage.jsx`, `CollaboratorTeamDirectory.jsx`, `avatarUtils.js`, `clinicLogo.js`, `useClinicLogo.js`, `useClinicSummary.js`, `tenantContextService.js`, `platformAccessService.js`, `TenantContext.jsx`, `tenantClinicProfileSync.js`, `clinicService.js`, `ClinicSettingsPage.jsx`, testes + este relatório |
| **Tests** | `collaboratorNullCrashFix.test.js`, `clinicLogoDisplayFix.test.js`, `clinicLogo.test.js` — 13/13 PASS |
| **Build** | **PASS** (`npm run build`) |
| **Migration required** | **NO** |
| **Production changed** | **NO** |
| **Contracts rollout changed** | **NO** |
| **Risks** | Baixo — UI/contexto; sync local best-effort |
| **Decision** | Correções locais prontas para validação manual |
| **Gate** | **READY_FOR_LOCAL_MANUAL_VALIDATION** |

## HARD STOP

Não commit / push / deploy nesta fase.
