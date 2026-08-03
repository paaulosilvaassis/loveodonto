# PHASE_10.9 — CONTROLLED LOCAL PERSISTENCE WIRING AND DATABASE VALIDATION

## 1. Baseline

| Item | Valor |
|------|--------|
| Branch | `main` |
| Commit base | `b95eff1` |
| Working tree | Phases 10.2–10.9 não commitadas |
| Repo | `appgestaoodonto/` |
| Data | 2026-08-03 |

## 2. Auditoria

Confirmado antes de alterar código:

- Stack isolado `supabase-local/` (`project_id=love-odonto-local-disposable`)
- Opt-in 3 níveis Phase 9.2 + guards anti-remoto
- Repos Supabase 10.3 + stub ledger 10.8
- Sem `pg` npm — testes locais via `docker exec … psql`
- SHA-256 idênticos 028/029/030 nos espelhos
- Flags v2 todas `false`
- Nenhuma evidência de apply remoto 028–030

## 3. Proteção de ambiente

`assessContractsV2DatabaseEnvironment` / `assertContractsV2LocalDatabase`:

- exige `CONTRACTS_V2_LOCAL_DATABASE=true`
- + `RUN_SUPABASE_LOCAL_INTEGRATION` + `LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY`
- bloqueia hosts remotos / refs staging+produção / env proibidos
- código de aborto: `CONTRACTS_V2_LOCAL_DATABASE_REQUIRED`
- sem override silencioso

## 4. Ambiente local utilizado

| Item | Valor |
|------|--------|
| Workdir | `supabase-local/` |
| Project | `love-odonto-local-disposable` |
| Container | `supabase_db_love-odonto-local-disposable` |
| API | `http://127.0.0.1:54321` |
| DB | `postgresql://postgres@127.0.0.1:54322/postgres` |

## 5. Migrations aplicadas localmente

Ordem: `028` → `029` → `030` → `031`

Correções necessárias para apply local:

- removido `)` órfão ao fim de `028` e `029` (erro de sintaxe)
- `031`: cast `tenant_id::text` em policy; grants do ledger

## 6. Confirmação de não aplicação remota

- Runner usa apenas `supabase-local/` + `guardCommand`
- Sem `db push`, `--linked`, MCP apply remoto
- `migrationsAppliedRemotely: false` no relatório do runner

## 7. Schema validado

Fixture SQL consultou `pg_tables` / `pg_constraint` / `pg_proc`:

- 17 tabelas foundation + `app_contract_ledger` + `app_contract_number_sequences`
- `INTEGRITY_MANIFEST` e `IN_PROGRESS` presentes
- `app_contract_next_number` presente

## 8. RLS

Validado com JWT simulado (`set_config` + `SET LOCAL ROLE authenticated`):

- member A lê A / não lê B
- no-tenant bloqueado
- admin A insert A / bloqueado insert B
- member não insert
- ledger read A / blocked B

## 9. FKs multi-tenant

Falharam no banco: version→contract, signer→envelope, ledger→contract, template_version→template cross-tenant.

## 10. Imutabilidade

- versão locked: HTML/hash bloqueados
- template PUBLISHED: conteúdo bloqueado
- ledger: update/delete bloqueados; sequence duplicada bloqueada

## 11. Repositories

Factory `createContractsV2Repositories({ mode })`:

- `unavailable` (default/prod)
- `memory` (unitários)
- `postgres-test` (exige guard + client explícito)

Implementações: Contract/Template/Package/Envelope/File/Audit Supabase; Ledger Postgres real; Idempotency Postgres; Number sequences Postgres.

## 12. Mappers

Round-trip já coberto na 10.3 (mock); fixture local validou linhas reais de contratos/versões/envelopes/files/ledger.

## 13. Transaction context

`ContractsV2TransactionContext` + `createContractsV2TransactionManager`:

- reutiliza contexto ativo (sem nested BEGIN)
- `createMemoryTransactionManager` unifica snapshot/rollback memory

## 14. Nested transaction resolution

Risco 10.8 resolvido: um único BEGIN; nested calls reusam o mesmo contexto.

## 15. Rollback real

- savepoint/subtransaction PL/pgSQL na fixture
- memory manager rollback em teste unitário
- dual reset do runner prova reprodutibilidade

## 16. Concurrency

- `ContractPersistenceConflictError.concurrencyCode = CONTRACTS_V2_CONCURRENCY_CONFLICT`
- numeração via upsert atômico (sem MAX+1)

## 17. Idempotência

`031` amplia scopes (incl. `COMPLETE_CONTRACT_SIGNING`) + colunas `status`/`input_fingerprint`/`result_ref`.  
`ContractIdempotencyPostgresRepository` implementa reserve/complete/fail.

## 18. Numeração

`031_app_contract_number_sequences.sql` + `app_contract_next_number` — validado `CTR-2026-000001/000002`.

## 19. Ledger Postgres

`ContractLedgerPostgresRepository` valida hash canônico na aplicação antes do insert; append-only no banco.

## 20. Assinatura persistida

Policies/envelopes/signers persistidos na fixture. OTP/token bruto **não** persistidos (bloqueio de rollout documentado).

## 21. Metadata de arquivos

`app_contract_files` com path seguro + hash; bytes permanecem memory storage.

## 22. Storage

Memory storage para bytes; metadata Postgres local. Atomicidade banco+object storage = fase futura.

## 23. E2E local

Fixture seed + asserts cobrem seed, FKs, imutabilidade, RLS, números, idempotency, rollback.  
Lifecycle completo app-layer permanece nos harness memory 10.5–10.8; wiring Postgres via factory `postgres-test`.

## 24. Restart tests

Dual `db reset` + re-execução da fixture (pass1 + pass2). Tokens/OTP in-memory não sobrevivem (bloqueio).

## 25. Feature flags

Todas permanecem `false`. Nenhuma `.env` padrão alterada para `true`.

## 26. Wiring

Factory por modo; UI/rotas v2 **não** conectadas a Postgres; produção = unavailable.

## 27. Testes

| Suite | Resultado |
|-------|-----------|
| phase109 static | 16 passed, 1 skipped (opt-in) |
| phase102–109 | 194 passed, 1 skipped |
| SQL fixture | 45/45 PASS |
| Runner dual-reset | CONTRACTS_V2_LOCAL_PASS |
| Build | OK |

## 28. Comandos

```bash
# estáticos
npx vitest run src/__tests__/phase109ControlledLocalPersistence.test.js

# integração local (opt-in)
env -u DATABASE_URL -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY \
  RUN_SUPABASE_LOCAL_INTEGRATION=true \
  LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
  APPLY_LOCAL_DB_RESET=true \
  CONTRACTS_V2_LOCAL_DATABASE=true \
  npm run supabase:local:contracts-v2
```

## 29. Resultados

- Migrations 028–031 aplicadas localmente com sucesso
- Reprodutibilidade confirmada (2× reset + fixture)
- Nenhuma migration remota

## 30. Regressões

- phase103 ajustado para excluir tabelas 030/031 do check de 028
- build OK; legado não alterado

## 31. Riscos

- OTP/session tokens ainda in-memory
- bytes de arquivo ainda memory
- PostgREST transactions limitadas vs SQL `query` path

## 32. Bloqueios (rollout)

1. Persistência segura de session/challenge (migration futura)
2. Object storage real + compensação metadata
3. Flags OFF — sem cutover
4. Tokens não sobrevivem restart processual

## 33. Teardown

- Stack local **permanece up** para auditoria (`supabase_db_love-odonto-local-disposable`)
- Para parar: `cd supabase-local && supabase stop`
- Migrations versionadas **não** removidas
- Sem chaves/tokens em arquivos versionáveis
- Produção intacta

## 34. Gate

**APROVADO** — critérios do brief atendidos no ambiente local descartável.

## 35. Próxima fase recomendada

**Phase 10.10** — gated side-effects execution (financeiro/prontuário/jornada/CRM/entrega) com outbox + flags dedicadas, após aprovação explícita; e/ou persistência segura de sessions/challenges.
