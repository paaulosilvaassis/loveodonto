# PHASE_10.11 — PUBLIC SIGNING ENDPOINT WIRING AND CONTROLLED DELIVERY SIMULATION

## 1. Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Commit base | `b95eff1` |
| Working tree | alterações não commitadas das Phases 10.2–10.11 |
| Commit nesta fase | **não realizado** |

## 2. Auditoria

Confirmado antes de alterar código:

- Endpoints públicos já montados em `server/index.js` via `signatureEnvelopesV2Api.js` (stubs, flags OFF)
- Rate-limit HTTP era no-op; domínio 10.10 já tinha rate limit persistível
- Sem helmet/CSRF/express-rate-limit; CORS global permissivo (`origin: true`)
- Delivery de assinatura inexistente (apenas `deliverySimulated: true`)
- Página legada `/assinatura/:token` (IndexedDB) — não reutilizada como backend v2
- Sessions/challenges/storage da 10.10 prontos para composição
- Flags v2 todas `false`; rotas registradas mas gated

## 3. Environment guard

- `isPublicSignaturesV2ApiEnabled` exige 8 flags (domain, module, versioning, signature, pdf, storage, ledger, patient_portal)
- `assertPublicSignaturesV2LocalEnvironment` bloqueia refs remotas / produção sem harness local
- Opt-in harness: `CONTRACTS_V2_PUBLIC_LOCAL_HARNESS` ou `LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY`
- Sem override por query/header público

## 4. Delivery domain

Interfaces em `signature-delivery.types.ts`:

- `SignatureDeliveryProvider`
- `SignatureDeliveryAttempt`
- canais: EMAIL, SMS, WHATSAPP, IN_PERSON, TECHNICAL_HARNESS
- purposes: INVITATION, AUTHENTICATION_CHALLENGE, COMPLETION_NOTICE

## 5. Providers simulados

| Provider | Canais | Externas |
|----------|--------|----------|
| `technical-harness` | TECHNICAL_HARNESS, IN_PERSON | nenhuma |
| `in-person` | IN_PERSON | nenhuma |
| `simulated-email` | EMAIL | nenhuma |
| `simulated-sms` | SMS | nenhuma |

OTP/link só em memória do harness técnico — nunca em resposta pública HTTP.

## 6. Delivery attempts

Entidade + memory repo + metadata sanitizada (bloqueia token/otp/fullLink/email/phone/cpf).

## 7. Migration

`034_app_signature_delivery_attempts.sql`

- FKs compostas, tenant imutável, unique idempotency
- RLS deny-by-default, service_role only
- Espelhos SHA-256 OK
- Aplicada **somente local** (`CONTRACTS_V2_PHASE1011_PASS`)
- Remoto: **não aplicado**

## 8. Invitation flow

`createSignatureInvitationService`:

READY → issue session → build local link → delivery attempt → provider simulado → metadata sem token no path

## 9. Public links

Formato: `/assinar/v2/{token}`

- Origem allowlisted (localhost/127.0.0.1)
- Token no path, sem query
- Sem tenant/signerId/CPF/contractId no path
- Link integral só em `harnessSecrets` (memória)

## 10. Endpoints

Montados em `server/lib/publicSignaturesV2Api.js`:

```
POST /public/signatures-v2/:token/open|view|challenge|verify|accept|sign|decline
GET  /public/signatures-v2/:token/status|document
```

Deps vazias em produção ⇒ 403/501. Internal envelopes permanecem em `signatureEnvelopesV2Api.js`.

## 11. Anti-enumeração

Resposta pública uniforme:

- HTTP 404
- `SIGNATURE_PUBLIC_ACCESS_DENIED`
- Mensagem: «Não foi possível acessar esta solicitação de assinatura.»
- Delay uniforme leve
- Códigos internos só em métricas/logs sanitizados

## 12. Session opening

`open` retorna dados mínimos (clínica fixture, título, papel, status, passos, expiresAt). Sem PDF/CPF/financeiro/ledger/evidência.

## 13. Document access

`view` / `document`: sessão validada; evidence report bloqueado; hash abreviado; `Cache-Control: private, no-store`.

## 14. OTP

`challenge` → delivery simulado + confirmação genérica (sem OTP).  
`verify` → falhas colapsadas em acesso negado genérico.  
OTP recuperável só via harness (`getOtpFromHarness`).

## 15. Terms

`accept` aceita `acceptances[]` com `code/accepted/contentHash` ou `acceptanceIds` legado do signer service.

## 16. Signature

`sign` usa IP do socket (não body); `effectsExecuted: false` sempre na resposta pública.

## 17. Decline

`decline` com motivo; sessão revogada ⇒ open genérico 404.

## 18. Public UI

`ContractSignPublicV2Page.jsx` em `/assinar/v2/:token`

Etapas: load → view → OTP → termos → canvas → confirmação.  
Estados: loading/invalid/expired/awaiting auth/sign/completed/declined.  
Token só em state React; meta robots noindex.

## 19. Security headers

Por resposta pública:

- Cache-Control: private, no-store
- Referrer-Policy: no-referrer
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- CSP restritiva (`frame-ancestors 'none'`)
- X-Robots-Tag: noindex, nofollow

## 20. Delivery harness

`/gestao/contratos/entregas-v2` (`ContractsEntregasV2Page.jsx`)

Atrás das 8 flags. Permite fixture, canal simulado, destino mascarado, copy link, OTP harness, falha, reenvio, revogar sessão.

## 21. Resend policy

`DEFAULT_RESEND_INVITATION_POLICY`: revoke previous, create new, max 5, min 60s.

## 22. Expiration

Lazy via token service (expired → denied genérico). Sem cron.

## 23. Observability

Contadores em memória (`signature_public_*`, `signature_delivery_*`, `signature_rate_limited_total`). Labels sem PII/token.

## 24. Audit

Delivery attempts + metadata segura; eventos de domínio do signer service; sem token/OTP/URL completa.

## 25. Idempotency

Delivery por `idempotency_key` unique; operações públicas aceitam `idempotencyKey` no body (delegado ao signer service).

## 26. Rate limiting

HTTP adapter in-memory (injetável; testes usam store compartilhado = restart-safe simulado). Domínio 10.10 disponível para wiring Postgres.

## 27. CORS

Global ainda `origin: true` (pré-existente). Rotas públicas adicionam headers próprios; credentials wildcard não introduzido. Restrição CORS dedicada documentada como risco residual / próxima fase de harden.

## 28. Local HTTP E2E

Handlers HTTP testados com mock req/res + harness:

open → view → challenge → verify → (accept/sign conforme política) + restart de handlers + rate limit + revoke.

## 29. Browser tests

Cobertura estática: rota montada, ausência de `localStorage.setItem` / `indexedDB.open` / `sessionStorage.setItem` para token; canvas e fluxo na página. Teste de browser automatizado completo não exigiu framework novo — harness UI disponível sob flags.

## 30. Restart tests

Handlers recriados com mesmos services/stores; challenge/verify e rate limit sobrevivem.

## 31. Permissions

Catálogo (sem `roleDefaults`):

- `contract_signatures:send_invitation`
- `contract_signatures:resend_invitation`
- `contract_signatures:view_delivery`
- `contract_signatures:revoke_session`
- `contract_signatures:view_public_harness`

## 32. Flags

Todas `false` por padrão. UI/API públicas exigem injeção explícita. Nenhum `.env` padrão alterado.

## 33. Tests

| Suite | Resultado |
|-------|-----------|
| phase1011 | 14 passed |
| 10.2–10.11 | 225 passed / 1 skipped |
| Build | OK |
| SQL 034 local | CONTRACTS_V2_PHASE1011_PASS |

## 34. Commands

```bash
npm run test:supabase:phase1011
npm test -- src/__tests__/phase102…phase1011…
npm run build
# local SQL (stack up):
# docker exec … psql -f contracts_v2_phase1011_validation.sql
```

## 35. Results

- Dual path unitário HTTP: PASS
- Migration 034 local: aplicada
- Remoto: false
- OTP nunca em resposta pública
- Effects: `executed=false`

## 36. Regressions

Nenhuma regressão nova nas suites 10.2–10.10. Legado `/assinatura/:token` intacto.

## 37. Security

Sem delivery real; sem token/OTP em DB de delivery; path público não persistido com token; anti-enumeração; headers; flags OFF.

## 38. Risks

- CORS global permanece permissivo (pré-existente)
- Rate-limit HTTP default é memory (Postgres disponível via 10.10 para evolução)
- Fluxo sign completo depende da política/termos do harness demo
- Sem dual reset automatizado 028–034 nesta fase (034 applied incremental no stack existente)

## 39. Blockers (próximas fases)

1. CORS allowlist dedicada para `/public/signatures-v2/*`
2. Wiring server com harness local opt-in (hoje deps vazias)
3. Cutover IndexedDB / produção
4. Pending effects gated
5. Provider real (fora de escopo)

## 40. Teardown

| Item | Estado |
|------|--------|
| 034 local | aplicada |
| Bucket | inalterado (10.10) |
| Stack | pode permanecer up |
| Stop | `cd supabase-local && supabase stop` |
| Remoto | inalterado |

## 41. Gate

**APPROVED / CONCLUÍDA** para ambiente local/efêmero com flags OFF.

## 42. Próxima fase recomendada

**Phase 10.12 — Production Hardening, CORS Allowlist And Controlled Staging Cutover Prep**  
(ou: wiring opt-in do server harness local + CORS restrito + dual reset 028–034 + browser E2E opcional).
