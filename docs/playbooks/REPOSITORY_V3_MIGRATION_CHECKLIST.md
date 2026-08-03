# Repository V3 — Checklist Oficial de Migração

**Phase 5.15** — Use este checklist para cada novo domínio.

---

## Pré-requisitos

- [ ] Domínio mapeado no legado (services, IDB collections, shape)
- [ ] Tabelas Supabase planejadas (sem executar migration sem autorização)
- [ ] Permissões RBAC identificadas
- [ ] Fase N.1–N.5 planejada
- [ ] Nenhum commit até aprovação explícita

---

## Fase N.1 — Foundation

- [ ] `src/repositories/{domain}/` criado
- [ ] `{domain}Types.ts` — Core, LegacyRow, DTOs, interfaces
- [ ] `{domain}RepositoryFlags.ts` — defaults false, locks produção
- [ ] `{domain}Mapper.ts` — legado ↔ core ↔ server
- [ ] `{domain}IndexedDbRepository.ts`
- [ ] `{domain}Cache.ts`
- [ ] `{domain}AdminApiRepository.ts` (stubs)
- [ ] `{domain}RepositorySync.ts` — hydrate, compare, offline
- [ ] `{domain}Repository.ts` — facade
- [ ] `{domain}RepositoryBridge.js`
- [ ] `{domain}RepositoryFoundation.test.js`
- [ ] Flags OFF → zero alteração funcional
- [ ] Regressão completa verde

---

## Fase N.2 — Read Cutover

- [ ] `server/lib/{domain}ApiList.js` + rotas GET
- [ ] `src/services/{domain}AdminApi.js`
- [ ] Remote clients registrados no bridge
- [ ] `{domain}ReadAdapter.js` wired nos services
- [ ] Shadow read: `schedule{Domain}ShadowRead`
- [ ] Compare: `compareIdbVsRemote`
- [ ] `{domain}ReadCutover.test.js`
- [ ] `*_ApiList.test.js` (server)
- [ ] Contrato em `rhTestFlagContract.js`
- [ ] Relatório técnico N.2

---

## Fase N.3 — Write Cutover (dual-write)

- [ ] `server/lib/{domain}ApiWrite.js` + rotas POST/PUT/DELETE
- [ ] Write DTOs + mapper server body
- [ ] `{domain}WriteAdapter.js` — microtask pós-IDB
- [ ] Idempotência preparada (se aplicável)
- [ ] Write audit in-memory (se aplicável)
- [ ] Fallback: falha remota → IDB preservado
- [ ] `{domain}WriteCutover.test.js`
- [ ] Relatório técnico N.3

---

## Fase N.4 — Write Primary + Soak

- [ ] `{DOMAIN}_WRITE_PRIMARY` implementado
- [ ] Hydrate pós-write primary
- [ ] Soak metrics + consistency report
- [ ] `{domain}WritePrimary.test.js`
- [ ] `{domain}WriteSoakValidation.test.js`
- [ ] Rollback por flag validado
- [ ] Relatório técnico N.4

---

## Fase N.5 — Promote (futuro, autorização explícita)

- [ ] Soak manual staging 48–72h
- [ ] Divergências IDB vs remote = 0 críticas
- [ ] Aprovação formal operador + tech lead
- [ ] **Não** promover produção sem checklist completo

---

## Critérios de aceite universais

- [ ] Produção não alterada (flags OFF)
- [ ] Banco não alterado
- [ ] Migrations não executadas
- [ ] Supabase remoto não alterado sem autorização
- [ ] Storage remoto não alterado
- [ ] IndexedDB preservado
- [ ] Frontend funcionalmente idêntico com flags OFF
- [ ] Regressão: 0 falhas novas
- [ ] Commit não realizado (salvo pedido explícito)

---

## Artefatos obrigatórios por fase

| Artefato | Path |
|----------|------|
| Relatório | `docs/reports/PHASE_{N}_{DOMAIN}_{NAME}.md` |
| Testes | `src/__tests__/{domain}*.test.js` |
| Flags contract | `src/__tests__/rhTestFlagContract.js` |

Use template: [`../reports/PHASE_REPORT_TEMPLATE.md`](../reports/PHASE_REPORT_TEMPLATE.md)
