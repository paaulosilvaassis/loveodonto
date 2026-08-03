# PHASE_10 — CHANGESET MANIFEST

## Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| HEAD | `b95eff1b5f151326b218d0f97482bb387c12f993` |
| Working tree | Phases 10.2–10.11 (+ 10.12 hardening) não commitadas |
| Contagem status | ~69 entradas (tracked modified + untracked) |
| Diff tracked | 11 arquivos, +386/−66 (aprox.) |

## Arquivos não relacionados / temporários (não limpar automaticamente)

| Arquivo | Nota |
|---------|------|
| `.cursor/debug-*.log`, `debug-68fcb4.log` | logs de debug — fora do escopo Phase 10 |
| `.DS_Store` | sistema |
| `collaborators-export.json` | export possivelmente sensível — não commit |
| `erro_supabase.txt` | log local |
| `tsconfig.tsbuildinfo` | artefato de build |

## Secrets

- Nenhum `.env` / `.pem` / credential file no changeset.
- Menções a project refs de produção/staging aparecem apenas em **blocklists** de guards/testes/docs.
- `collaborators-export.json` tratado como potencial PII — excluir de commit.

## Migrations (checksum SHA-256 mirrors OK)

| Migration | Fase | SHA-256 (prefix) |
|-----------|------|------------------|
| 028_app_contracts_v2_foundation.sql | 10.3 | db0a515a6e89 |
| 029_app_contracts_v2_rls.sql | 10.3 | e02207797c2d |
| 030_app_contract_ledger.sql | 10.8/10.9 | ad2d20a2e799 |
| 031_app_contract_number_sequences.sql | 10.9 | 91107b00f12d |
| 032_app_signature_sessions_and_challenges.sql | 10.10 | faa509987ad2 |
| 033_app_contract_private_storage_local.sql | 10.10 | 77ca97bf8914 |
| 034_app_signature_delivery_attempts.sql | 10.11 | 3c4dc98836cd |

Mirrors: `supabase/migrations` ≡ `supabase-local/migrations` ≡ `supabase-local/supabase/migrations`.

Migration `006` (legado): **não alterada** no diff.

## Bucket local

| Bucket | Fase | Remoto |
|--------|------|--------|
| `contracts-v2-private-local` | 10.10 | não criado |

Futuro staging (somente plano): `contracts-v2-private-staging` — **não criado**.

## Feature flags (todas default `false`)

Todas as 15 flags em `CONTRACT_FEATURE_FLAGS` / `CONTRACT_FEATURE_FLAG_DEFAULTS`.

## Phase 10.12 — hardening (adicionado)

| Área | Arquivos principais |
|------|---------------------|
| Runtime domain | `src/domain/contracts/runtime/**` |
| CORS/headers/proxy HTTP | `server/lib/contractsV2PublicSecurity.js` |
| Readiness API | `server/lib/contractsV2RuntimeReadinessApi.js` |
| Public API harden | `server/lib/publicSignaturesV2Api.js` |
| Wire | `server/index.js` |
| Preflight | `scripts/contracts-v2-staging-preflight.mjs` |
| Dual reset 028–034 | `scripts/supabase/runLocalContractsV2Phase1012Validation.mjs` |
| Fixture | `supabase-local/fixtures/contracts_v2_phase1012_validation.sql` |
| Tests | `src/__tests__/phase1012ProductionHardeningCorsAndStagingPrep.test.js` |
| Report | `docs/reports/PHASE_10_12_PRODUCTION_HARDENING_CORS_AND_STAGING_CUTOVER_PREP.md` |
| Permissões (catalog only) | `runtime_readiness`, `staging_preflight`, `view_security_diagnostics` |

## Ordem recomendada de revisão

1. Migrations 028–034 + RLS  
2. Domain `src/domain/contracts/**`  
3. Repositories `src/repositories/contracts/**`  
4. Server APIs `server/lib/*V2*.js` + `server/index.js`  
5. UI pages v2 + shell/catalog  
6. Testes phase102–phase1012  
7. Relatórios `docs/reports/PHASE_10_*`  
8. Hardening 10.12 (CORS/runtime/readiness)

## Riscos de merge

- `server/index.js`, `src/permissions/catalog.js`, `package.json`, `ProtectedApp.jsx` — hotspots
- Grande árvore untracked `src/domain/` e `src/repositories/contracts/`
- Não misturar logs/debug/export no mesmo commit

## Legado não alterado

- `generatedContracts` / IndexedDB SSOT  
- migration `006`  
- PDF/assinatura legados operacionais  
- `roleDefaults`  
- dual-write ausente  

## Checkpoint (sem commit)

Comandos seguros documentados:

```bash
git status --short
git diff --stat
git diff --name-status
```

**Não executar:** `git add`, `git commit`, `git push`, `git reset --hard`, `git clean -fd`.
