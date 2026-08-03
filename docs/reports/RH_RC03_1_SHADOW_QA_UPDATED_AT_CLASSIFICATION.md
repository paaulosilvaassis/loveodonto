# RH RC-03.1 — Correção classificação Shadow QA (`updated_at`)

**Data:** 2026-07-07  
**Escopo:** Somente lógica de classificação Shadow QA — sem alteração de banco, dados, RLS, UUID ou legacy_id.

---

## 1. Sintoma reportado

Com 4 colaboradores alinhados estruturalmente:

```
localCount = 4
remoteCount = 4
matchPercent = 25%
blockingDiffCount = 3
transitionalDiffCount = 0
canPromoteReadPrimary = false
```

Os 3 bloqueios eram exclusivamente:

> `updated_at local mais recente que remoto — possível conflito pós-backfill`

---

## 2. Causa raiz

Em `classifyShadowFieldDiff` (Ticket 1.11), o case `updated_at` aplicava regra assimétrica:

```typescript
if (localMs > remoteMs) {
  tier = 'blocking_diff';  // ← incorreto para RC-01.4
}
```

**Condição bloqueante:** quando o cache IDB tinha `updated_at` **mais recente** que o Supabase (esperado após hydrate/read-primary ou edição local de metadados), o diff era promovido a `blocking_diff`, incrementava `blockingDiffCount` e impedia `canPromoteReadPrimary`.

Adicionalmente, `compareCollaborators` colocava qualquer par com diff (mesmo só `updated_at`) em `field_diff` em vez de `match`, reduzindo `matchPercent` para 25% (1/4).

---

## 3. Correção aplicada

### 3.1 `collaboratorShadowDiffClassification.ts` (+ paridade `server/lib/rhShadowDiffClassification.js`)

- Exportado `INFORMATIONAL_SHADOW_FIELDS = new Set(['updated_at'])`.
- `updated_at` **sempre** classificado como `informational_diff`, independente de qual timestamp é mais recente.
- Removida função `parseShadowTimestamp` (não mais necessária).
- `canPromoteReadPrimary` permanece `blockingDiffCount === 0` — `updated_at` não incrementa blocking.

### 3.2 `collaboratorShadowValidation.ts`

- Nova função `splitShadowFieldDiffs`: separa diffs estruturais vs informativos.
- Em `compareCollaborators`: se **não há diffs estruturais**, o par vai para `match` (mesmo com `updated_at` divergente).
- Diffs só-`updated_at` ainda aparecem em `field_diff` para observabilidade, mas **não reduzem** `matchPercent`.

---

## 4. Campos bloqueantes (inalterados)

Continuam como `blocking_diff`:

| Campo / evento | Motivo |
|----------------|--------|
| `uuid` (pós-mirror) | Identidade canônica |
| `legacy_id` | Chave de correlação |
| `email` | Identidade / acesso |
| `tenant_id` | Isolamento multi-tenant |
| `missing_local` / `missing_remote` | Registro ausente |
| `duplicate`, `invalid_uuid`, `invalid_legacy` | Conflito estrutural |
| `count_mismatch` | Contagem divergente |
| `status`, `nome`, `cargo`, `categoria`, `agenda_enabled` | Integridade ficha RH |

**Não bloqueante:** `updated_at` (exclusivamente informativo — RC-01.4).

---

## 5. Resultado esperado após correção

```
localCount = 4
remoteCount = 4
matchPercent = 100%
blockingDiffCount = 0
transitionalDiffCount = 0
canPromoteReadPrimary = true
```

*(Quando os únicos diffs forem `updated_at` e campos estruturais coincidirem.)*

---

## 6. Testes executados

```
npm run test — shadow suites: PASS
```

| Suite | Resultado |
|-------|-----------|
| `collaboratorShadowDiffClassification.test.js` | PASS (incl. cenário 4× updated_at only) |
| `collaboratorShadowValidation.test.js` | PASS |
| `rhShadowReadQa.test.js` | PASS |
| `collaboratorUuidMirror.test.js` | PASS |

---

## 7. Validação browser

Reexecutar **RH Shadow QA** em `/dev/qa-tools` após reload do app (HMR ou restart dev).

Resultado esperado alinhado à seção 5.

---

## 8. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/repositories/collaborator/collaboratorShadowDiffClassification.ts` | `updated_at` → sempre informational |
| `src/repositories/collaborator/collaboratorShadowValidation.ts` | MATCH quando só diffs informativos |
| `server/lib/rhShadowDiffClassification.js` | Paridade Node |
| `src/__tests__/collaboratorShadowDiffClassification.test.js` | Testes RC-03.1 |
| `docs/reports/RH_RC03_1_SHADOW_QA_UPDATED_AT_CLASSIFICATION.md` | Este relatório |

**Zero commit. Zero alteração em banco/dados.**
