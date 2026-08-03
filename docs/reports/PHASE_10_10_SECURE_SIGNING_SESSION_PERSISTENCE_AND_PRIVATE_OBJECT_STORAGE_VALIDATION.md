# PHASE_10.10 — SECURE SIGNING SESSION PERSISTENCE AND PRIVATE OBJECT STORAGE VALIDATION

## 1. Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Commit base | `b95eff1` |
| Working tree | alterações não commitadas das Phases 10.2–10.10 |
| Commit nesta fase | **não realizado** (conforme autorização) |

## 2. Auditoria

Confirmado antes de alterar código:

- `SigningSessionTokenService` / memory-only em `signing-session-token.service.ts`
- Challenge OTP memory-only em `signature-authentication-challenge.service.ts`
- Rate limit stub no-op em `signatureEnvelopesV2Api.js`
- `ContractPrivateStorage` + `createMemoryContractPrivateStorage` (sem bucket real)
- `app_contract_files` sem coluna `status` (PENDING/STORED/VERIFIED) na 028
- Padrão de bucket privado: `024_collaborator_photos_storage.sql` + signed URL em `assetsAvatarApi.js`
- Sem antivírus; MIME allowlist em contracts v2; magic-bytes só em assets
- Transaction context Phase 10.9 reutilizado
- Flags v2 todas `false`
- Tabelas `app_signature_sessions` / challenges **ausentes** em 028–031
- Stack local: `love-odonto-local-disposable` / workdir `supabase-local/`

## 3. Environment guard

Estendido em `contractsV2EnvironmentGuard.ts`:

- `CONTRACTS_V2_LOCAL_DATABASE_REQUIRED` (reutilizado)
- `CONTRACTS_V2_LOCAL_STORAGE_REQUIRED` (novo)
- Opt-in: `CONTRACTS_V2_LOCAL_STORAGE=true`
- Bucket allowlist: somente `contracts-v2-private-local`
- Bloqueio de host remoto / project refs de produção/staging
- Modo factory: `postgres-storage-local-test`
- Sem override por query/header/config pública

## 4. Migrations

| Arquivo | Conteúdo |
|---------|----------|
| `032_app_signature_sessions_and_challenges.sql` | sessions, challenges, rate_limits, RLS deny-by-default, triggers |
| `033_app_contract_private_storage_local.sql` | status em `app_contract_files`, `app_contract_storage_ops`, bucket + policies |

Espelhos SHA-256 idênticos em:

- `supabase/migrations/`
- `supabase-local/migrations/`
- `supabase-local/supabase/migrations/`

## 5. Confirmação de aplicação apenas local

| Ambiente | Resultado |
|----------|-----------|
| Local (`supabase-local`) | apply via `db reset` dual — **PASS** |
| Remoto | **não aplicado** |
| Bucket remoto | **não criado** |

Comando:

```bash
env -u DATABASE_URL -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY \
  RUN_SUPABASE_LOCAL_INTEGRATION=true \
  LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
  APPLY_LOCAL_DB_RESET=true \
  CONTRACTS_V2_LOCAL_DATABASE=true \
  CONTRACTS_V2_LOCAL_STORAGE=true \
  npm run supabase:local:contracts-v2-phase1010 -- --json
```

Probe: migrations `028`–`033` presentes; bucket `contracts-v2-private-local:false`.

## 6. Tabelas de sessão

`app_signature_sessions`: token_id + token_hash (64 hex), status ACTIVE/CONSUMED/EXPIRED/REVOKED/LOCKED, FKs compostas envelope/signer, trigger de consistência signer↔envelope, tenant imutável, unique `(tenant_id, token_id)` e `(tenant_id, token_hash)`.

## 7. Challenges

`app_signature_challenges`: code_hash only, attempt_count/max_attempts, status PENDING/VERIFIED/CONSUMED/EXPIRED/INVALIDATED/LOCKED, FK session+envelope+signer, trigger de escopo.

## 8. Rate limiting

`app_signature_rate_limits` + `SignatureRateLimitService` com janela/contador/bloqueio.

Operações: `OPEN_SESSION`, `REQUEST_CHALLENGE`, `VERIFY_CHALLENGE`, `SIGN`, `DECLINE`.

Escopo via `buildSignatureRateLimitScope` (envelope|signer|session|ipHash) — sem IP integral obrigatório.

## 9. RLS

Sessions/challenges/rate_limits/storage_ops:

- RLS enabled + force
- revoke authenticated/anon
- grant service_role
- sem policies de SELECT/INSERT/UPDATE para membro comum

Storage bucket:

- privado (`public=false`)
- SELECT autenticado apenas com path canônico + membro do tenant
- sem INSERT/UPDATE/DELETE para authenticated (upload só service_role/backend)

## 10. Repositories

| Interface | Memory | Postgres |
|-----------|--------|----------|
| `SigningSessionRepository` | `createMemorySigningSessionRepository` | `PostgresSigningSessionRepository` |
| `SignatureAuthenticationChallengeRepository` | memory | `PostgresSignatureAuthenticationChallengeRepository` |
| `SignatureRateLimitRepository` | memory | `PostgresSignatureRateLimitRepository` |

Regras: hash antes da query; optimistic `row_version`; sem retorno público de `codeHash` via `toChallengePublicView`.

## 11. Token service

`createPersistedSigningSessionTokenService`:

emit → hash → persist hash → return token once → validate by hash → expire/revoke/consume persistidos → restart-safe.

## 12. Challenge service

`createPersistedSignatureAuthenticationChallengeService`:

invalidate previous → hash OTP → persist → simulate delivery → verify with timing-safe compare → attempts persistidas → replay bloqueado.

OTP bruto só com `exposePlainCodeInTests` no harness.

## 13. Bucket local

Nome: `contracts-v2-private-local`

- privado
- MIME allowlist (pdf/json/png/webp/jpeg/text)
- file_size_limit 20 MiB
- criado somente no stack local

## 14. Storage policies

Documentado na 033: defesa por path canônico `tenants/{uuid}/contracts/...`, sem listagem anônima, frontend sem upload arbitrário. Backend service_role bypassa RLS — defesa de aplicação + path builder + metadata saga.

## 15. Storage implementation

`createSupabaseContractPrivateStorage` + `ContractObjectStorageDriver` (memory / supabase).

Modo explícito `local-test`; bucket injectado; sem fallback automático.

## 16. Path strategy

Reutiliza `createContractStoragePathBuilder` (Phase 10.7): sem PII, sem `..`, sem data URL, IDs safe.

## 17. Saga e compensação

`PENDING` → upload → `STORED` → verify → `VERIFIED`

- upload fail → `FAILED` + `FILE_UPLOAD_FAILED`
- metadata pós-upload fail → tentativa de remove + `FILE_RECONCILIATION_REQUIRED` / `CONTRACT_STORAGE_COMPENSATION_REQUIRED`

## 18. Reconciliação

`ContractFileReconciliationService.inspect` / `planRepair`:

detecta metadata sem objeto, órfãos, hash/size diverge, PENDING stale, STORED unverified, artifact incompleto.

**Sem auto-repair destrutivo** (`autoExecuted: false`).

## 19. Download autorizado

`getAuthorizedDownload`: permissão + tenant + status + audit op `FILE_DOWNLOAD_AUTHORIZED` / `COMPLETED`; bytes via driver; signed URL interna não logada.

## 20. Signature artifacts

`createSignatureGraphicArtifactService`: PNG/WebP, max 512KB, rejeita SVG/data URL, hash obrigatório, referência `fileId`+`sha256` (sem data URL persistida).

## 21. Restart tests

Unitários com store compartilhado (novo service instance = restart):

- sessão: emit → restart → validate → revoke → restart → revoked
- challenge: fail attempt → restart → contador → verify → restart → replay blocked
- rate limit: partial → restart → still blocked
- storage: upload → restart → download + hash

## 22. E2E local

Fixture SQL `contracts_v2_phase1010_validation.sql` + dual `db reset` (PASS ×2).

Fluxo de domínio E2E completo de assinatura continua harness memory/postgres-test; bytes via memory driver / local bucket metadata. Renderer técnico Phase 10.7 permanece não produtivo. Nenhum efeito financeiro/clínico/CRM/envio.

## 23. Feature flags

Todas permanecem `false` (defaults + runtime sem overrides). Nenhum `.env` padrão alterado para habilitar v2.

## 24. Testes

| Suite | Resultado |
|-------|-----------|
| phase1010 unit | 17 passed |
| phase102–109 + 1010 | 211 passed, 1 skipped |
| Local SQL dual reset | CONTRACTS_V2_PHASE1010_PASS |
| Build | OK |

## 25. Comandos

```bash
npm test -- src/__tests__/phase1010SecureSigningSessionPersistenceAndPrivateStorage.test.js
npm run test:supabase:phase1010
npm run supabase:local:contracts-v2-phase1010 -- --json
npm run build
```

## 26. Resultados

- Dual reset local: PASS / PASS
- Versions: 028–033
- Bucket: `contracts-v2-private-local:false`
- Remote migrations/buckets: false

## 27. Regressões

- Phase 10.3 filtro de tabelas foundation atualizado para excluir 032/033 (efeito colateral esperado de `CONTRACT_V2_TABLES`)
- Demais suites 10.2–10.9 verdes
- Falha legada pré-existente possível fora deste escopo: `contractSignatureFlow` (`window.location.origin`) — não introduzida aqui

## 28. Segurança

- Token/OTP nunca em texto no DB
- Sem URL pública permanente
- Sem PII real / pacientes reais
- Sem OTP real / e-mail / SMS / WhatsApp
- Sem credenciais de produção em arquivos versionáveis
- Ops ledger bloqueia payload com keys sensíveis (`token`, `signedUrl`, `otp`, …)

## 29. Riscos

- Banco e object storage sem ACID compartilhado — saga/compensação é best-effort
- Path UUID helpers do Storage exigem tenant UUID no path (alinhado ao DB)
- Integração Postgres+Storage real no app ainda gated por flags OFF e factory explícita
- `planRepair` retorna plano; execução destrutiva permanece bloqueada

## 30. Bloqueios remanescentes (próximas fases)

1. Wiring HTTP público real de assinatura v2 com sessões persistidas (ainda flags OFF)
2. Cutover IndexedDB / legado
3. Side-effects financeiros/clínicos gated
4. Bucket/policies em staging/produção (fora do escopo desta fase)

## 31. Teardown

| Item | Estado |
|------|--------|
| Migrations locais 032/033 | aplicadas no stack descartável |
| Bucket local | `contracts-v2-private-local` |
| Objetos fictícios | fixture SQL (metadados); sem upload remoto |
| Stack | permanece up para auditoria |
| Stop | `cd supabase-local && supabase stop` |
| Remoto | inalterado |

## 32. Gate

**APPROVED / CONCLUÍDA** — critérios §29 do brief atendidos para ambiente local/efêmero.

## 33. Próxima fase recomendada

**Phase 10.11 — Public Signing Endpoint Wiring And Controlled Delivery Simulation**  
(ou equivalente: conectar endpoints públicos/admin ao token/challenge/rate-limit/storage persistidos, ainda com flags OFF e delivery simulado, sem cutover operacional).
