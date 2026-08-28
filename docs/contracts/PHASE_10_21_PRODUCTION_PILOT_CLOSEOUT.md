# PHASE_10.21CP — Production Pilot Closeout

**Módulo:** Contracts & Consents V2  
**Modo:** read-only / documentação / closeout  
**Data:** 2026-08-28  
**HEAD no closeout:** `2e6de5d16036fd269834e2f437e8a3975db7af30`  
**Ambiente:** `https://loveodonto.com.br/` (frontend Vercel) · Admin API Railway  

```text
PHASE_10.21 = CLOSED

PRODUCTION_PILOT = PASS
REAL_CONTRACT = PASS
REAL_PROFESSIONAL_SIGNATURE = PASS
REAL_REMOTE_PATIENT_SIGNATURE = PASS
REAL_CEREMONY_2_OF_2 = PASS
REAL_FINAL_ARTIFACT = PASS

LEGAL_EVIDENCE_HARDENING = LIVE
LEGACY_PILOT_BACKFILL = NONE
HISTORICAL_PILOT_PRESERVED = YES

GLOBAL_ROLLOUT = BLOCKED
CONTROLLED_TENANT_EXPANSION = AUTHORIZED

NEXT_PHASE = PHASE_10.22 — CONTROLLED TENANT EXPANSION
```

Esta fase **não** reexecuta a cerimônia real. Não há mutation jurídica, backfill, regeneração de PDF/csig, novo contrato, e-mail ou alteração de rollout flags.

---

## 1. Escopo

Encerrar formalmente o primeiro piloto real de produção da cerimônia de assinatura clínica (2 signatários: profissional autenticado + paciente remoto por link/e-mail) no tenant Implanprime.

**Incluído:** geração versionada, freeze de package, assinaturas, delivery Resend, artefato PDF final, hardenings future-only, preservação histórica.

**Fora do escopo deste closeout:** cutover do domínio Contracts V2 técnico, desligar V1, ativação global de todos os tenants, cerimônia de menor/responsável, reemissão como fluxo de produto.

---

## 2. Tenant e contrato piloto

| Campo | Valor |
| --- | --- |
| Tenant | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| Clínica | Implanprime Odontologia |
| Contrato | CTR-2026-00005 |
| Contract ID | `gctr-87ca1983-f43c-41ec-ae22-699d5120a39d` |
| Version | `1` (number persistido na row) |
| Status | `signed` |
| Cerimônia | 2/2 `SIGNED` |
| Profissional clínico | colaborador `col-5e1c66f5-342a-4ac8-936c-0eb603df73e8` (CRO-MG 27267) |
| Paciente | adulto do piloto (ID interno `patient-ee56b19f-e9b4-440f-b85e-3c4faf06b063`) |
| Persistência canônica | IndexedDB origem `https://loveodonto.com.br` · DB `appgestaoodonto` · store `data` |

---

## 3. Timeline resumida

| Marco | O que ocorreu |
| --- | --- |
| 10.21C–N | Fundação server-side, unlock de tenant, deploy pré-piloto |
| 10.21AL | Tentativa controlada bloqueada (CRO/RT e drive da aba live) |
| 10.21CE (2026-08-25) | Draft CTR-00005 com `version = 1` persistido |
| 10.21CF | Finalização → status gerado; sem assinatura |
| 10.21CK+ | Freeze + revalidação SHA-256 congelado antes de stroke |
| 10.21CL / CL.1 | Request/link PATIENT + delivery Resend; recovery same-origin |
| 10.21CM | Stroke PATIENT remoto humano; cerimônia 2/2; PDF auto |
| 10.21CN | Auditoria read-only do PDF (SHA-256 calculado, não persistido) |
| 10.21CO | Hardening future-only LIVE (binding remoto + SHA-256 binário) |
| 10.21CP | Este closeout (somente documentação) |

---

## 4. Arquitetura validada no piloto

```
atendimento + orçamento aprovado
  → contrato gerado (version 1)
  → freeze package manifest (FROZEN)
  → stroke PROFESSIONAL (sessão autenticada, clinic_app)
  → request + sign link + e-mail Resend
  → stroke PATIENT (public_sign_link / REMOTE_ON_SCREEN)
  → cerimônia 2/2 → status signed
  → PDF final_signed_artifact + índice patientFiles
```

**Delivery:** frontend same-origin `/internal/app/...` (rewrite Vercel → Railway). Transporte transacional: Resend HTTPS.  
**Writer de assinatura:** `signContractOnScreen` (clínica) e `signContractViaLink` → `signContractOnScreen` (remoto).  
**Artefato final:** jsPDF a partir do HTML/versão/hash assinados; não é ICP-Brasil.

---

## 5. Cadeia jurídica do CTR-00005

Não alterar estes valores. Não backfillar.

| Elo | Valor |
| --- | --- |
| CONTRACT_VERSION | `1` |
| DOCUMENT_HASH (legado) | `h94e01b5` |
| MANIFEST_ID | `pkgm_e4c18a30-23b6-4d47-aaf7-0c4fdc491bb2` |
| MANIFEST_HASH | `9fb4ea77a89cce0e05f4f2d34eff17e3cf947e0361918c5c8d56cef029af1286` |
| FROZEN_CONTENT_SHA256 | `ca949845c4e7b422f80e35888d86890dfb1d57da3d8369d221c5b71ea2c4ab69` |
| PROFESSIONAL_SIGNATURE | `csig-cf6b1dd1-0c43-4b46-98fe-17fd597d6046` |
| PATIENT_SIGNATURE | `csig-0d790a1f-8a3f-4d1f-9c32-16377337f1a1` |
| REQUEST | `csreq-1b940a90-1d2a-44d9-a01c-de45cdb45cb0` (`completed`) |
| LINK | `clnk-ea08b779-f619-4073-b997-bb6134c1534a` (`signed`) |
| FINAL_PDF | `catt-7520a89d-94e6-4bf3-a061-2f253b04d592` |
| FINAL_PDF_SIZE | 14913 bytes |
| PATIENT_FILE | `file-888f37d0-3d12-471d-b2ee-664432630eeb` |
| READ_ONLY_CALCULATED_BINARY_SHA256 | `297dbe148f05277427f1b2dd28e7cfe3ee8ba68ede9235f54f742aecd51e3c66` |

`documentHash` legado **não** é o SHA-256 dos bytes do PDF. O SHA-256 binário acima foi calculado na auditoria 10.21CN e **não** está persistido no CTR-00005.

---

## 6. O que foi provado (classificação)

### VERIFIED_IN_PRODUCTION

A. geração do contrato  
B. `contract.version` persistida (`1`)  
C. freeze do package manifest  
D. manifesto FROZEN  
E. binding paciente / orçamento / agendamento / tenant  
F. seleção explícita do profissional clínico  
G. separação operador × profissional clínico × RT (fluxo humano + cadastro)  
H. assinatura PROFESSIONAL autenticada (`AUTHENTICATED_ELECTRONIC` / `clinic_app`)  
I. cerimônia parcial 1/2 após o profissional  
J. criação do request PATIENT  
K. criação do sign link  
L. token remoto (um request / um link / um token)  
M. delivery por e-mail (Resend aceitou o disparo; paciente abriu o link)  
N. abertura humana do link  
O. assinatura remota PATIENT (`REMOTE_ON_SCREEN` / `public_sign_link`)  
P. frozen-content SHA-256 no caminho feliz (gate executou e aceitou o stroke)  
Q. manifest validation no caminho feliz  
R. contract version validation no caminho feliz  
S. cerimônia 2/2 → `signed`  
T. final signed artifact automático  
U. cópia no `patientFiles`  
V. preservação dos contratos históricos 00003 / 00004 (não tocados pelo piloto 00005)  

Imutabilidade financeira: o orçamento/snapshot do piloto não foi regenerado pela cerimônia (confirmado nas auditorias CM/CN do contrato real).

### VERIFIED_BY_AUTOMATED_TEST (não promover a production-proven)

- Fail-closed de HTML/manifest/version adulterados (`FROZEN_*`, `PACKAGE_DOCUMENT_VERSION_MISSING`, `CONTRACT_VERSION_NOT_ESTABLISHED`)
- Replay / token consumido
- Binding remoto obrigatório + mismatch de contrato (`REMOTE_SIGNATURE_BINDING_*`) — **future-only** (não estava no csig PATIENT de 00005)
- SHA-256 binário persistido + tamper + `FINAL_ARTIFACT_HASH_FAILED` — **future-only**
- PATIENT interno / `OPERATOR_COLLECTED_PRESENCE`
- Isolamento de tenant no writer (`TENANT_MISMATCH`)
- Rotação/cancelamento de request no provider interno

### NOT_YET_PRODUCTION_PILOTED

- Cerimônia de menor / responsável legal (guardian)
- Cancelamento + reemissão como operação de produto em produção
- Expiração real de link (espera até `expiresAt`)
- Rotação/revogação de link em incidente real
- Segundo tenant na allowlist
- Assinatura PATIENT on-screen na clínica (não remota)
- Persistência canônica fora do IndexedDB do browser
- Qualquer declaração de validade ICP-Brasil / assinatura qualificada

---

## 7. Exceções históricas do piloto

### EXCEPTION_1 — evidenceJson PATIENT sem request/link

O csig PATIENT `csig-0d790a1f-…` **não** contém `signatureRequestId` / `signLinkId`.

O binding permanece recuperável e não ambíguo via request `csreq-1b940a90-…`, link `clnk-ea08b779-…`, audit `signed_via_link`, status `completed` / `signed`.

Hardening future-only LIVE desde 10.21CO. **Sem backfill.**

### EXCEPTION_2 — PDF sem SHA-256 persistido

O attachment `catt-7520a89d-…` **não** contém `artifactBinarySha256` / `artifactByteLength` / `artifactGeneratedAt`.

O SHA-256 foi calculado read-only na CN (14913 bytes). Hardening future-only LIVE desde 10.21CO. **Sem backfill. Sem regenerar o PDF.**

### EXCEPTION_3 — DUPLICATE_NOTIFICATION_ONLY

Dois aceites Resend no **mesmo** request:

- 13:49:06Z
- 13:52:43Z

`duplicate request = NO` · `duplicate link = NO` · `duplicate token = NO` · `duplicate signature = NO`

**Contexto CL.1:** o primeiro POST cross-origin para `*.up.railway.app` falhou no browser (`Failed to fetch`). A clínica reenviou. O recovery passou a usar path same-origin `/internal/app/...` (rewrite Vercel). Resultado: duas notificações, um único artefato de assinatura.

Commit: `bae8c1b` (proxy same-origin).

---

## 8. Hardenings LIVE

Confirmado em 2026-08-28 no bundle `https://loveodonto.com.br/assets/App-DMxlTAkk.js` (e código HEAD `2e6de5d`), salvo onde indicado.

| # | Controle | LIVE |
| --- | --- | --- |
| A | `PACKAGE_DOCUMENT_VERSION_MISSING` fail-closed | YES |
| B | Frozen-content SHA-256 antes do stroke | YES |
| C | Revalidação entity/hash do manifest (`FROZEN_MANIFEST_*`) | YES |
| D | Revalidação version (`FROZEN_DOCUMENT_VERSION_MISMATCH`, `CONTRACT_VERSION_NOT_ESTABLISHED`) | YES |
| E | Remote `signatureRequestId` obrigatório (canal público) | YES |
| F | Remote `signLinkId` obrigatório (canal público) | YES |
| G | `REMOTE_SIGNATURE_BINDING_MISSING` | YES |
| H | `REMOTE_SIGNATURE_BINDING_MISMATCH` | YES |
| I | Replay protection (link `signed`/`consumed` → `replay`) | YES (código HEAD + bundle; string minificada) |
| J | PDF binary SHA-256 (`artifactBinarySha256`) | YES (futuros) |
| K | `artifactByteLength` | YES (futuros) |
| L | `artifactGeneratedAt` | YES (futuros) |
| M | `FINAL_ARTIFACT_HASH_FAILED` | YES |
| N | Same-origin Admin API (`/internal/app` + rewrite Vercel; origens `loveodonto.com.br`) | YES |

E e F/G/H/J–M aplicam-se a **novos** csigs/PDFs. O piloto 00005 permanece no formato histórico (exceções 1 e 2).

---

## 9. Matriz de testes (HEAD CO, sem reexecução)

HEAD atual é o commit CO. Não houve mudança funcional depois. Reexecução não foi necessária.

| Classe | Resultado |
| --- | --- |
| UNIT / INTEGRATION | 150/150 PASS (`phase1021co` + BU, CK, CL, CL.1, AP, AO, BN, BA, BZ, U, signature flow, module, PDF 10.7) |
| SECURITY / FAIL-CLOSED | PASS (version missing, frozen mismatch, remote binding missing/mismatch, hash fail) |
| REPLAY | PASS (BU J/V) |
| FINAL_ARTIFACT | PASS (hash independente dos bytes persistidos + tamper) |
| BUILD | PASS (`vite build`) |

---

## 10. Históricos

| Contrato | ID | Estado closeout |
| --- | --- | --- |
| CTR-2026-00003 | `gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a` | signed, hash `h3bb6313c`, 2 csigs — **PRESERVED** |
| CTR-2026-00004 | `gctr-930c24bc-f658-4354-81e3-8eea61335361` | generated, hash `he96548e0`, 0 csigs — **PRESERVED** |
| CTR-2026-00005 | `gctr-87ca1983-…` | signed 2/2, PDF histórico sem SHA persistido — **PRESERVED** |

BACKFILL = ZERO · PDF_REGENERATION = ZERO · SIGNATURE_REGENERATION = ZERO

---

## 11. Matriz de capacidades

| CAPABILITY | STATUS | EVIDENCE | ROLLOUT_DECISION |
| --- | --- | --- | --- |
| Contract generation | PRODUCTION_PROVEN | CTR-00005 gerado/finalizado no tenant piloto | Liberar no padrão do piloto |
| Versioning | PRODUCTION_PROVEN | `version = 1` na row | Liberar; drafts novos já persistem version |
| Freeze | PRODUCTION_PROVEN | manifest FROZEN 00005 | Obrigatório antes de stroke |
| Professional signature | PRODUCTION_PROVEN | `csig-cf6b1dd1-…` autenticada | Liberar com identidade autenticada |
| Patient internal signature | TEST_PROVEN | AO/BA; 00005 foi remoto | Restrito até piloto on-screen |
| Patient remote signature | PRODUCTION_PROVEN | `csig-0d790a1f-…` via link | Liberar no mesmo padrão (adulto + e-mail) |
| Email delivery | PRODUCTION_PROVEN | Resend + abertura humana; ver EXCEPTION_3 | Liberar com same-origin; aceitar risco de retry duplicar notificação |
| Manifest integrity | PRODUCTION_PROVEN (happy path) / TEST_PROVEN (tamper) | 00005 + CK | Liberar; tamper só testado |
| Frozen content integrity | PRODUCTION_PROVEN (happy path) / TEST_PROVEN (tamper) | 00005 + CK | Liberar; tamper só testado |
| Replay protection | TEST_PROVEN | BU; não houve replay humano documentado no link real | Liberar código; não tratar como prova humana |
| Final PDF | PRODUCTION_PROVEN | `catt-7520a89d-…` 14913 bytes | Liberar geração automática |
| Binary PDF SHA-256 persistido | TEST_PROVEN | CO; 00005 é EXCEPTION_2 | Liberar só para **novos** artefatos |
| Patient file copy | PRODUCTION_PROVEN | `file-888f37d0-…` | Liberar |
| Financial immutability | PRODUCTION_PROVEN | snapshot/orçamento do 00005 intactos na cerimônia | Liberar |
| Legacy compatibility | PRODUCTION_PROVEN | 00003/00004/00005 sem backfill | Não migrar evidência histórica |
| Multi-tenant isolation | TEST_PROVEN | BA `TENANT_MISMATCH` | Não ampliar tenant sem allowlist |
| Minor/guardian signing | NOT_PROVEN | sem piloto | **Bloqueado** para rollout |
| Cancellation/reissue | TEST_PROVEN / NOT_PROVEN em prod | provider interno; sem operação humana no 00005 | **Restrito** |
| Link expiration | TEST_PROVEN (código) | `expiresAt` existe; 00005 assinou dentro da validade | Não tratar expiração real como provada |
| Link rotation/revocation | TEST_PROVEN (código) | `challenge_rotated` / cancel | **Restrito** até piloto de incidente |

---

## 12. Riscos residuais

### CRITICAL

Nenhum risco crítico **bloqueante** para um segundo piloto no **mesmo padrão** (adulto, 2/2, e-mail, um tenant allowlisted).

### HIGH

| Risco | Classe | Nota |
| --- | --- | --- |
| Persistência jurídica canônica no IndexedDB do browser do operador | NON_BLOCKING para o piloto atual / FUTURE_ENHANCEMENT para escala | Evidência e PDF vivem no origin da clínica, não num ledger server-side. Perda de perfil/dispositivo, quota ou corrupção IDB é risco arquitetural real. |
| Menor / responsável legal | BLOCKING_FOR_ROLLOUT dessa capacidade | Sem piloto. Não liberar. |
| Cancelamento/reemissão / rotação em incidente | BLOCKING_FOR_ROLLOUT dessa capacidade | Código existe; não foi operado no piloto real. |

### MEDIUM

| Risco | Classe | Nota |
| --- | --- | --- |
| Formato histórico de evidência (EXCEPTION_1 e 2) | NON_BLOCKING | Recuperável por auditoria; futuros csigs/PDFs já saem endurecidos |
| Retry de e-mail → notificação duplicada (EXCEPTION_3) | NON_BLOCKING | Não duplica request/link/token/csig; comunicar à operação |
| Isolamento multi-tenant só TEST_PROVEN | BLOCKING_FOR_ROLLOUT global | Allowlist tenant-a-tenant |
| Replay protection só TEST_PROVEN | NON_BLOCKING | Código LIVE; falta prova humana de refresh pós-assinatura |
| Falha de provedor de e-mail | NON_BLOCKING | CL.1 mostrou recovery; ainda depende de Resend + rewrite |

### LOW

| Risco | Classe | Nota |
| --- | --- | --- |
| `documentHash` legado vs SHA-256 do PDF | FUTURE_ENHANCEMENT | Conceitos distintos; documentado |
| Declaração ICP-Brasil | N/A | O produto **não** declara assinatura qualificada |

---

## 13. Decisão de rollout

**Gate:** `READY_FOR_CONTROLLED_TENANT_EXPANSION`

Não é ativação global. Não é “limited rollout” amplo (3–5 tenants) — ainda falta prova de segundo tenant, menor, e operações de incidente.

### Pode ser liberado (padrão do piloto)

- Um tenant na allowlist por vez (`docs/contracts/TENANT_BY_TENANT_ROLLOUT.md`)
- Paciente adulto
- Profissional autenticado + PATIENT remoto por e-mail
- Freeze obrigatório, version persistida, PDF automático
- V1 permanece disponível; rollback via `docs/contracts/EMERGENCY_ROLLBACK.md`

### Deve permanecer restrito

- Produção global / todos os tenants
- Menor / guardian
- Confiar em SHA-256 persistido em PDFs **anteriores** a 10.21CO
- Tratar retry de e-mail como idempotente na caixa de entrada
- Operar cancelamento/rotação como runbook não ensaiado em produção
- Assumir IndexedDB como arquivo jurídico de longo prazo sem backup/export

**Não** alterar rollout flags neste closeout.

---

## 14. Rollback / fallback

1. Painel `/gestao/contratos/rollout` → rollback imediato (global OFF, `ROLLED_BACK`).
2. Operação volta ao fluxo clássico V1 (orçamento → Contratos).
3. Contratos já assinados **continuam legíveis**; não apagar IndexedDB.
4. Não “consertar” 00003/00004/00005 com backfill.
5. Reativação: RCA + staging + checklist jurídico (`LEGAL_CHECKLIST.md`) + allowlist restrita.

Detalhe operacional: `docs/contracts/EMERGENCY_ROLLBACK.md`.

---

## 15. Commits relevantes

| Commit | Papel |
| --- | --- |
| `006ec75` | Cerimônia multi-signer |
| `36f784d` | Binding da assinatura profissional à identidade autenticada |
| `3107479` | Persistência de `generatedContracts.version` |
| `94235aa` | Fail-closed `documentVersion` no freeze |
| `d8cdd99` | Revalidação SHA-256 congelado antes do stroke |
| `0e96f7f` | Binding de freeze no request PATIENT |
| `e0ad67a` | Classificação de erro de rede no retry de e-mail |
| `bae8c1b` | Proxy same-origin da Admin API (CL.1) |
| `b9b889d` | Resend como transporte transacional |
| `e0e5c98` | Evidência remota + artefato final (BU) |
| `2e6de5d` | Binding request/link + SHA-256 binário future-only (CO) |

Frontend live no closeout: `https://loveodonto.com.br/assets/App-DMxlTAkk.js`.  
Admin API: `https://appgestaoodonto-production.up.railway.app/health` (`ok: true`).  
Deploy **não** é necessário para este documento.

---

## 16. Declarações que este closeout **não** faz

- Não declara validade de assinatura qualificada / ICP-Brasil.
- Não declara que o SHA-256 do PDF de 00005 está persistido.
- Não declara que o csig PATIENT de 00005 carrega request/link no `evidenceJson`.
- Não declara pronto para menores, multi-tenant amplo ou arquivo jurídico server-side.
- Não cria contrato real novo nem altera dados existentes.
