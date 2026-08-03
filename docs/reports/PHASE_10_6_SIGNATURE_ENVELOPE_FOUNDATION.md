# PHASE_10.6 — SIGNATURE ENVELOPE FOUNDATION

## 1. Baseline

| Item | Valor |
|------|--------|
| Branch | `main` |
| Commit base | `b95eff1` |
| Working tree | Alterações não commitadas das Phases 10.2–10.5 + 10.6 |
| Repo | `appgestaoodonto/` |
| Data | 2026-08-03 |

## 2. Auditoria inicial

Auditoria somente leitura confirmou:

- Tipos de assinatura Phase 10.2 em `src/domain/contracts/signatures/*`
- Tabelas `app_signature_*` na migration 028 (não aplicada)
- Assinatura interna legada: IndexedDB + `SignatureCanvas` (dataURL) + stubs Clicksign/DocuSign + `/assinatura/:token`
- Sem wiring de produção para signature v2 antes desta fase
- Idempotência, clock, ID factory, content hasher e event factories da Phase 10.5 reutilizáveis
- Feature flags v2 todas `false`; migrations 028/029 não aplicadas
- Sem OTP/token público seguro v2 pré-existente; hashing via `contract-content-hasher`

## 3. Arquivos criados

### Domínio / assinatura

- `src/domain/contracts/signatures/signature-envelope-status.machine.ts`
- `src/domain/contracts/signatures/signature-signer-status.machine.ts`
- `src/domain/contracts/signatures/signing-session-token.service.ts`
- `src/domain/contracts/signatures/signature-authentication-challenge.service.ts`
- `src/domain/contracts/signatures/signature-evidence.hash.ts`
- `src/domain/contracts/signatures/signature-memory.repository.ts`
- `src/domain/contracts/signatures/signature-envelope.application-service.ts`
- `src/domain/contracts/signatures/signature-signer.application-service.ts`
- `src/domain/contracts/signatures/signature-policy.application-service.ts`
- `src/domain/contracts/signatures/internal-signature.provider.ts`
- `src/domain/contracts/signatures/signature-v2.harness.ts`
- `src/domain/contracts/fixtures/signature-v2.fixtures.ts`

### API / UI / testes / docs

- `server/lib/signatureEnvelopesV2Api.js`
- `src/services/signaturesV2Service.js`
- `src/pages/contratos/ContractsAssinaturasV2Page.jsx`
- `src/__tests__/phase106SignatureEnvelopeFoundation.test.js`
- `docs/reports/PHASE_10_6_SIGNATURE_ENVELOPE_FOUNDATION.md`

## 4. Arquivos alterados

- `src/domain/contracts/signatures/signature.types.ts` — extensões 10.6 (métodos, IN_PROGRESS, artifacts, terms, effects)
- `src/domain/contracts/contract.errors.ts` — códigos `SIGNATURE_*`
- `src/domain/contracts/contract.events.ts` — eventos envelope/signer
- `src/domain/contracts/idempotency/contract-idempotency.ts` — ops de envelope
- `src/domain/contracts/index.ts` — exports seletivos
- `src/permissions/catalog.js` — módulo `contract_signatures` (sem roleDefaults)
- `src/contracts/contractsShellConfig.js` — nav `assinaturas-v2`
- `src/ProtectedApp.jsx` — rota condicional
- `server/index.js` — wiring endpoints (flags OFF / sem service)
- `supabase/migrations/028_app_contracts_v2_foundation.sql` (+ espelhos) — status `IN_PROGRESS` alinhado ao domínio canônico (migration **não aplicada**)

## 5. Lifecycle do envelope

Estados: `DRAFT → READY → SENT → IN_PROGRESS → COMPLETED|DECLINED|EXPIRED|CANCELLED|FAILED`

Terminais: `COMPLETED`, `DECLINED`, `EXPIRED`, `CANCELLED`, `FAILED` (sem reabertura).

`PARTIALLY_SIGNED` mantido por compatibilidade com 10.2/028.

## 6. Lifecycle dos signatários

`PENDING → INVITED → DELIVERED|VIEWED|AUTHENTICATED|SIGNED|DECLINED|EXPIRED|FAILED|CANCELLED`

Saltos simulados permitidos (`INVITED → VIEWED`, etc.) sem inventar eventos intermediários.

## 7. Políticas

`SignaturePolicyApplicationService` + repository memory:

- Níveis `SIMPLE|ADVANCED|QUALIFIED|EXTERNAL_PROVIDER`
- Métodos internos simulados: `CLICK_ACCEPT`, `DRAWN_SIGNATURE`, `TYPED_CONFIRMATION`, `OTP_EMAIL`, `OTP_SMS`
- `CERTIFICATE` / `EXTERNAL_PROVIDER` → capability unavailable
- Sem declaração de validade jurídica automática

## 8. Application services

- `createSignatureEnvelopeApplicationService` — create/get/list/addSigner/updateDraft/ready/send/cancel/expire/reconcile/expireDue
- `createSignatureSignerApplicationService` — open/view/challenge/verify/accept/sign/decline (tenant derivado do token)
- `createSignaturePolicyApplicationService` — list/get/create

Dependências injetáveis: repos, clock, IDs, tokens, OTP, idempotency, feature flags.

## 9. Ordem de assinatura

- `ANY_ORDER` (e `PARALLEL`/`GROUPED` normalizados para ANY_ORDER nesta fase)
- `SEQUENTIAL` — somente menor `signerOrder` pendente obrigatório pode prosseguir
- Erro tipado `SIGNATURE_SIGNER_OUT_OF_ORDER`

## 10. Tokens

`SigningSessionTokenService` (memory):

- Token opaco de alta entropia
- Armazena somente hash
- Escopo tenant + envelope + signer
- Expiração / revogação / comparação via hash
- Sem CPF/dados clínicos; sem log do token bruto

## 11. Challenges e OTP

`SignatureAuthenticationChallengeService` (memory):

- OTP nunca em texto persistido (somente hash)
- Expiração curta, limite de tentativas, consumo único
- Novo challenge invalida anterior
- `testOnlyPlainCode` somente harness de teste
- Delivery simulado (sem e-mail/SMS real)

## 12. Termos

`SignatureRequiredAcceptance` com códigos `DOCUMENT_READ`, `SIGNATURE_INTENT_CONFIRMED`, `LGPD_NOTICE_ACKNOWLEDGED`, etc.

- Obrigatórios bloqueiam assinatura
- Não pré-marcados
- Hash de conteúdo por termo
- Consentimentos separados

## 13. Assinatura

`sign` valida token, envelope ativo, ordem, view, auth (quando exigida), termos, método, artifact, hash documental, idempotência.

Retorna envelope, signer, evidence, events, `idempotentReplay`.

Contrato **não** transiciona automaticamente para `SIGNED`.

## 14. Artifacts

`SignatureArtifactReference` — `temporaryArtifactId` + `sha256` + mime/dims.

Sem base64, data URL, blob inline ou SVG arbitrário no domínio.

## 15. Evidências

`SignatureEvidenceSnapshot` serializável, sem token bruto, OTP, assinatura inline ou URL temporária.

## 16. Hash

`hashSignatureEvidence` reutiliza canonicalização/hasher da Phase 10.5 (SHA-256 quando disponível).

## 17. Reconciliação

Conclui para `COMPLETED` quando obrigatórios `SIGNED` com `evidenceHash`, sem declínio obrigatório, hash documental intacto, não expirado.

Efeitos tipados **não executados**:

```ts
contractStatusTransitionRequired / signedPdfRequired / evidenceReportRequired
financialActivationRequired / prontuarioRegistrationRequired
```

## 18. Recusa

Token válido → signer `DECLINED` + evidência; obrigatório → envelope `DECLINED`; sessões/challenges invalidados; assinaturas prévias preservadas; contrato intacto.

## 19. Expiração

`expireEnvelope` / `expireDueEnvelopes` — manual em testes; sem cron/job/scheduler.

Pendentes → `EXPIRED`; assinados permanecem `SIGNED`; idempotente em terminal.

## 20. Cancelamento

Admin com permissão + motivo; revoga tokens/challenges; pendentes → `CANCELLED`; evidências preservadas; contrato/versão intactos.

## 21. Idempotência

Ops: `CREATE_ENVELOPE`, `ADD_SIGNER`, `SEND_ENVELOPE`, `REQUEST_CHALLENGE`, `VERIFY_CHALLENGE`, `SIGN`, `DECLINE`, `CANCEL_ENVELOPE`, `EXPIRE_ENVELOPE`.

Memory repository da Phase 10.5; fingerprint sem dados sensíveis integrais.

## 22. Repositories

Interfaces + memory: Policy, Envelope, Signer, Evidence.

Sessões/challenges cobertos pelos services de token/OTP (storage hash in-memory).

Postgres/Supabase: tabelas 028 prontas, **sem wiring de produção**.

## 23. Provider interno

`createInternalSignatureProvider` — composição local.

`createExternalSignatureProviderStub` — capability unavailable.

Sem e-mail, SMS, arquivo, PDF, certificado ou serviço externo.

## 24. Eventos

Eventos tipados retornados nos resultados (`contract.signature_envelope.*`, `contract.signer.*`, `contract.signed` com `effectsPending: true`).

**Não publicados** / não persistidos em ledger real.

## 25. Auditoria

Factories via `createContractAuditEvent` (sink injetável). Metadados sem OTP/token/assinatura inline/CPF/HTML/snapshots completos.

## 26. Endpoints

Internos (auth + flags):

- `GET/POST /internal/app/signature-policies-v2`
- `GET/POST /internal/app/signature-envelopes-v2`
- `GET .../:id`, `POST .../:id/signers|ready|send|cancel|expire|reconcile`

Públicos técnicos (flags OFF ⇒ 403):

- `POST /public/signatures-v2/:token/{open,view,challenge,verify,accept,sign,decline}`

Sem `getService` no wiring de produção ⇒ 501 se flags forem forçadas sem harness.

## 27. UI técnica

Rota `/gestao/contratos/assinaturas-v2` montada somente com 4 flags ON.

Harness in-memory com fixtures; OTP visível só no harness; canvas → artifact seed (sem data URL no domínio).

## 28. Fixtures

Políticas simple/OTP/sequential; signatários paciente/responsável/profissional/representante/2 testemunhas; envelopes draft/sent/partial/completed/expired/declined. Dados fictícios `@example.com`.

## 29. Permissões

Catálogo (sem grants em `roleDefaults`):

```
contract_signatures:view|create_envelope|manage_signers|send|
cancel_envelope|view_evidence|manage_policies|reconcile
```

## 30. Feature flags

Todas `false`:

- `contracts_domain_v2_enabled`
- `contracts_module_v2_enabled`
- `contract_versioning_enabled`
- `contract_internal_signature_v2_enabled`
- `contract_external_signature_enabled` (permanece stub)

## 31. Segurança

Tokens não enumeráveis / não logados; OTP hashed; rate-limit abstraction preparada; tenant obrigatório; sessão escopada; sem data URL/HTML arbitrário; sem afirmação de assinatura qualificada; fixtures fictícias.

## 32. Testes

`src/__tests__/phase106SignatureEnvelopeFoundation.test.js` — 25 testes:

SM envelope/signer, criação, políticas, tokens, OTP, aceites/assinatura, evidências, sequencial, reconciliação, recusa/expiração/cancelamento, cross-tenant, API/UI gates, provider, idempotência.

## 33. Validação manual (checklist)

- `/gestao/contratos` legado intacto
- Assinatura/PDF legado intactos
- Nenhuma rota v2 visível com flags OFF
- Migrations não aplicadas
- Sem e-mail/SMS/WhatsApp/arquivo/bucket/PDF/evento publicado/financeiro/prontuário

## 34. Comandos executados

```bash
git status -sb && git rev-parse --short HEAD
npm test -- src/__tests__/phase10{2,3,4,5,6}*.test.js
npm run type-check   # dívidas pré-existentes fora de contracts
npm run build        # OK
npm run lint         # dívidas pré-existentes (não corrigidas)
```

## 35. Resultados

| Suite | Resultado |
|-------|-----------|
| Phase 10.2 | 39 passed |
| Phase 10.3 | 27 passed |
| Phase 10.4 | 26 passed |
| Phase 10.5 | 22 passed |
| Phase 10.6 | 25 passed |
| **Total Phase 10** | **139 passed** |
| Build | OK |
| Typecheck (contracts) | Sem erros novos |
| Typecheck global | Dívidas pré-existentes (domain-events, crm, etc.) |
| Lint | Dívidas pré-existentes (não tocadas) |

## 36. Migrations

- 028/029 existentes; 028 atualizado com `IN_PROGRESS` (não aplicada)
- Nenhuma migration nova criada nesta fase
- Migration 006 / `generated_contracts` intactos

## 37. Confirmação de não aplicação

Migrations **não** aplicadas localmente nem remotamente. Nenhum `supabase db push` / apply executado.

## 38. Regressões

Nenhuma regressão nas suites 10.2–10.5. Ajuste em 028 alinhou enum de status ao domínio canônico da 10.6.

## 39. Riscos

- Wiring de produção ainda ausente (intencional)
- Tokens de sessão retornados no harness de send — mascarados na API HTTP
- `PARTIALLY_SIGNED` vs `IN_PROGRESS` coexistentes até consolidação futura
- UI técnica cria harness local se flags forem ligadas sem inject — apenas para demo técnica

## 40. Pendências

- Persistência Postgres wiring (quando migrations forem aprovadas/aplicadas)
- Transição automática contrato → `SIGNED` (fase futura)
- PDF assinado / evidence report / financeiro / prontuário
- Delivery real (e-mail/SMS) — fora de escopo
- Provider externo / certificado qualificado
- Cron de expiração
- UI operacional (não técnica)

## 41. Gate

**APROVADO para conclusão da Phase 10.6** — fundação de envelopes internos com flags OFF, legado intacto, testes e build OK.

## 42. Próxima fase recomendada

**Phase 10.7 — Signed PDF / Evidence Report / Contract Status Transition (gated)**  
ou, se prioridade for persistência: wiring Postgres das tabelas `app_signature_*` após apply controlado das migrations 028/029.
