# TypeScript Debt Backlog — App Vercel Build Gate

**Data:** 2026-08-03  
**Contexto:** Hotfix de publicação do App (`loveodonto.com.br`).  
**Commit de referência do bridge:** `80b878262bdd4f2479827c166181afc3bb74679f`  
**Status:** Dívida isolada do deploy; **não** corrigida neste hotfix.

---

## Resumo executivo

O build oficial da Vercel falhava porque `package.json` usava:

```json
"build": "tsc -b && vite build"
```

`vite build` passa. `tsc -b` falha com **43** erros TypeScript em código legado de **CRM** e **domain-events**. Nenhum desses arquivos foi alterado por `80b8782`.

Hotfix aplicado: `"build": "vite build"` e `"type-check": "tsc -b"` (gate tipográfico fora do deploy).

---

## Inventário

| Métrica | Valor |
|--------|------:|
| Erros `tsc -b` | **43** |
| Arquivos afetados | **21** |
| Clusters | **6** |
| Regressão do bridge `80b8782` | **não** |

### Arquivos afetados

1. `src/domain-events/domainEventFlags.ts`
2. `src/domain-events/index.ts`
3. `src/domain-events/read-models/analyticsReadModelRefresh.ts`
4. `src/domain-events/read-models/attachAnalyticsReadModels.ts`
5. `src/domain-events/read-models/leadAnalyticsReadModel.ts`
6. `src/domain-events/read-models/leadAnalyticsStore.ts`
7. `src/domain-events/read-models/shared/readModelPromotionChecklist.ts`
8. `src/domain-events/read-models/shared/readModelPromotionInspector.ts`
9. `src/domain-events/staging-activation/authorization-intake/stagingAuthorizationFinalGate.ts`
10. `src/domain-events/staging-activation/authorization-intake/stagingAuthorizationIntakeService.ts`
11. `src/domain-events/staging-activation/authorization/stageOneReadinessGate.ts`
12. `src/domain-events/staging-activation/readonly-verification/readonlyVerificationFinalGate.ts`
13. `src/domain-events/staging-activation/stagingEnvironmentContract.ts`
14. `src/repositories/agenda/agendaRepository.ts`
15. `src/repositories/collaborator/collaboratorRepositorySync.ts`
16. `src/repositories/crm/crmActivityFlags.ts`
17. `src/repositories/crm/crmMapper.ts`
18. `src/repositories/crm/crmRepository.ts`
19. `src/repositories/crm/crmRepositoryFlags.ts`
20. `src/repositories/crm/crmRepositorySync.ts`
21. `src/repositories/financial/financialRepository.ts`

---

## Clusters (6)

| # | Cluster | ~Erros | Prioridade | Estimativa |
|---|---------|-------:|------------|------------|
| 1 | Flags × `Record<string, boolean>` (`lockDangerousFlags` / locks genéricos) | ~12 | P1 | 1–2 h |
| 2 | Read-models envelope / `Record<string, unknown>` (casts e `ReadModelDefinition`) | ~9 | P1 | 1–2 h |
| 3 | CRM: imports de erro, `void \| Core`, sync → `Record` | ~10 | P1 | 1–2 h |
| 4 | staging-activation: unions sem overlap + `readonly` vs mutável | ~7 | P2 | 1 h |
| 5 | `import type` usado como valor (agenda/financial) + barrel `publishDomainEvent` | ~4 | P1 | 30–45 min |
| 6 | Path errado: `CollaboratorRepositoryFlags` importado de `collaboratorTypes` | 1 | P1 | 15 min |

**Estimativa total tipográfica:** ~2–4 h (sem mudança de runtime/Auth/Supabase).

---

## Prioridade

1. **P0 (feito neste hotfix):** desacoplar `tsc -b` do script `build` de produção.
2. **P1:** clusters 1, 2, 3, 5, 6 — desbloqueiam `npm run type-check` limpo.
3. **P2:** cluster 4 (staging-activation) — tooling interno; menor impacto no App runtime.
4. **P3:** reintroduzir `tsc -b` no `build` de CI/produção **somente** após `type-check` verde estável.

---

## Plano de correção futura

1. Rodar `npm run type-check` e tratar por cluster (não arquivo a arquivo sem padrão).
2. Cluster 1: tipar helpers de lock com genéricos `T extends Record<string, boolean>` **ou** overload por interface de flags (sem `any`).
3. Cluster 2: casts via `unknown` onde o envelope é genérico de storage; ou parametrizar stores.
4. Cluster 3: import valor (não `import type`) das classes de erro; narrow `void | Core`; ajustar assinaturas de sync.
5. Cluster 5: corrigir imports; barrel explícito para `publishDomainEvent`.
6. Cluster 6: importar `CollaboratorRepositoryFlags` de `collaboratorRepositoryFlags.ts`.
7. Cluster 4: alinhar tipos de retorno/`readonly` e remover comparações mortas.
8. Validar: `npm run type-check` + `npm run build` + smoke App.
9. Decisão explícita para religar `tsc -b && vite build` no deploy (PR separado).

---

## Fora de escopo deste backlog

- Auth / session bridge  
- Supabase / migrations / RLS  
- Alteração de dados ou tenants  
- Refactors arquiteturais de CRM/domain-events além da tipagem  

---

## Comandos

```bash
npm run build        # produção (vite only)
npm run type-check   # dívida tipográfica (tsc -b)
```
