# PHASE_10_3 — Contracts Persistence and Tenant Security

**Status:** CONCLUÍDA  
**Baseline branch:** `main`  
**Baseline commit:** `b95eff1`  
**Working tree:** inclui Phase 10.1/10.2 + artefatos desta fase (não commitados)  
**Referências:**  
- `docs/reports/PHASE_10_1_CONTRACTS_DISCOVERY_AND_LEGACY_AUDIT.md`  
- `docs/reports/PHASE_10_2_CONTRACTS_DOMAIN_FOUNDATION.md`  

**Migrations aplicadas:** **NÃO**  
**Commit:** não realizado  
**Feature flags:** todas `false`  
**SSOT operacional:** IndexedDB (inalterado)

---

## 1. Objetivo

Projetar e versionar a persistência Postgres/Supabase do domínio Contracts V2 com isolamento multi-tenant, repositories sem wiring e testes de segurança — **sem cutover** e **sem apply automático**.

## 2. Auditoria inicial

| Item | Resultado |
|------|-----------|
| Branch / commit | `main` @ `b95eff1` — OK |
| Convenção SQL | `supabase/migrations/NNN_app_*.sql` + espelhos `supabase-local/` |
| Última migration canônica | `027_app_patient_details.sql` |
| Colisão 006 | `contract_templates`, `contract_blocks`, `generated_contracts`, `contract_audit_logs` **existem** |
| Helpers tenant | `app_user_can_access_tenant`, `app_user_is_tenant_admin` (009/012) |
| RLS pattern | SELECT membro + ALL admin (023/019) |
| UUID | `gen_random_uuid()` |
| Timestamps | `timestamptz` + `touch_updated_at()` |
| Soft delete | `deleted_at` (files) |
| Optimistic concurrency | `row_version` (novo nestas tabelas) |
| Repository pattern | `src/repositories/*` + client injetável (patients Wave 2) |
| Testes cross-tenant | estáticos + mock repository (sem apply DB nesta fase) |

### Decisão de namespace (colisão)

| Brief sugerido | Decisão V2 | Motivo |
|----------------|------------|--------|
| `contract_templates` | `app_contract_templates` | Colide com 006 |
| `contracts` | `app_contracts` | Namespace explícito V2 |
| `contract_audit_events` | `app_contract_audit_events` | Evita confusão com `contract_audit_logs` |
| `signature_*` | `app_signature_*` | Consistência do namespace |

**`generated_contracts` e demais tabelas 006 permanecem intactas.**

### Divergência documentada vs brief §6.3

`patient_id` / `budget_id` / `appointment_id` / `guardian_patient_id` / `treatment_plan_id` são **`text` opaco**, não `uuid` com FK a `patients`.

Motivo: padrão `020_app_appointments` + domínio Phase 10.2 (`PatientId = string`) + patients ainda sem cutover. Evita FK prematura e permite `patient-*` legado.

---

## 3. Migrations criadas (NÃO aplicadas)

| Arquivo | Papel |
|---------|-------|
| `supabase/migrations/028_app_contracts_v2_foundation.sql` | Tabelas, constraints, FKs compostas, triggers, índices, idempotency |
| `supabase/migrations/029_app_contracts_v2_rls.sql` | RLS + grants authenticated |
| Espelhos SHA-256 idênticos | `supabase-local/migrations/*` e `supabase-local/supabase/migrations/*` |

Cabeçalho de ambas: **NÃO EXECUTAR automaticamente**.

Confirmação: nenhum comando `supabase db push`, `psql`, MCP `apply_migration` ou dry-run remoto foi executado nesta fase.

---

## 4. Tabelas

```text
app_signature_policies
app_contract_templates
app_contract_template_versions
app_contracts
app_contract_versions
app_contract_parties
app_contract_treatments
app_contract_odontogram_snapshots
app_contract_financial_snapshots
app_contract_consents
app_contract_packages
app_contract_package_items
app_signature_envelopes
app_signature_signers
app_contract_files
app_contract_audit_events
app_contract_idempotency_keys
```

### Diagrama textual

```text
tenants
  └─ app_signature_policies
  └─ app_contract_templates ── app_contract_template_versions
  └─ app_contracts
        ├─ app_contract_versions (locked_at → immutable)
        ├─ app_contract_parties
        ├─ app_contract_treatments
        ├─ app_contract_*_snapshots / consents
        ├─ app_contract_files
        ├─ app_signature_envelopes ── app_signature_signers
        └─ app_contract_audit_events (append-only)
  └─ app_contract_packages ── app_contract_package_items
  └─ app_contract_idempotency_keys
```

---

## 5. Relacionamentos / Tenant security

Estratégia: `unique (tenant_id, id)` no pai + `foreign key (tenant_id, child_fk) references parent (tenant_id, id)`.

Aplicado a template versions, contract versions, parties, treatments, snapshots, package items, envelopes, signers, files, audit.

Trigger `app_contract_reject_tenant_id_change` impede UPDATE que altere `tenant_id`.

---

## 6. Constraints principais

- Status canônicos Phase 10.2 (CHECK completo — não os 4 da 006)
- Document types canônicos
- Cancelamento/VOIDED exige `cancellation_reason`
- `row_version >= 1`, `version_number >= 1`
- Unique `(tenant_id, contract_number)`, `(tenant_id, package_number)`
- Hash format quando presente
- Files: `storage_path !~ '^data:'`
- Valores financeiros não negativos
- Template PUBLISHED exige `published_at`

---

## 7. RLS

Modelo 023:

| Operação | Policy |
|----------|--------|
| SELECT | `auth.uid()` + `app_user_can_access_tenant` |
| INSERT/UPDATE/DELETE | + `app_user_is_tenant_admin` |
| Audit | SELECT + INSERT only (sem UPDATE/DELETE policy) |
| Files SELECT | + `deleted_at is null` |

Notas:

- `service_role` bypassa RLS (backend) — documentado.
- Master SaaS **não** ganha acesso clínico irrestrito por estas policies.
- RLS **não** substitui autorização de domínio (`contracts:*`).

---

## 8. Imutabilidade

| Recurso | Mecanismo |
|---------|-----------|
| `app_contract_versions` com `locked_at` | Trigger `app_contract_reject_locked_version_mutation` |
| Template version PUBLISHED/locked | Trigger dedicado |
| `tenant_id` | Trigger reject change |
| Repository guard | `saveVersion` bloqueia update se `lockedAt` já setado |

---

## 9. Audit append-only

- Trigger BEFORE UPDATE/DELETE → exception
- RLS sem policies de update/delete
- Repository só expõe `append` / `find` / `list`

---

## 10. Repositories (sem wiring)

Local: `src/repositories/contracts/`

| Classe | Interface |
|--------|-----------|
| `ContractSupabaseRepository` | `ContractRepository` |
| `ContractTemplateSupabaseRepository` | `ContractTemplateRepository` |
| `ContractPackageSupabaseRepository` | `ContractPackageRepository` |
| `SignatureEnvelopeSupabaseRepository` | `SignatureEnvelopeRepository` |
| `ContractFileSupabaseRepository` | `ContractFileRepository` |
| `ContractAuditSupabaseRepository` | `ContractAuditRepository` |

Regras: `tenantId` obrigatório (UUID); `findById` sempre `tenant_id + id`; client **injetado** (sem auto-connect ao supabase global); sem IndexedDB; sem eventos.

---

## 11. Persistence mappers

`contractPersistenceMappers.ts` — round-trip snake_case ↔ camelCase para Contract, Version, Template, Package, Envelope, File, Audit.

Não fabrica odontograma/assinatura/storage; rejeita data URL em files.

---

## 12. Transações

Sem transaction manager paralelo. FKs deferrable permitem create composto (contrato+versão / template+versão) na mesma transação futura do caller. Helpers compostos ficam para fase de wiring.

---

## 13. Idempotência (preparação)

Tabela `app_contract_idempotency_keys` com scopes:

```text
CREATE_FROM_BUDGET, CREATE_PACKAGE, CREATE_ENVELOPE,
WEBHOOK, FINANCIAL_ACTIVATION, PRONTUARIO_REGISTER, GENERATE_PDF
```

Plus colunas `idempotency_key` em `app_contracts`, `app_contract_packages`, `app_signature_envelopes`.

Fluxos **não** implementados nesta fase.

---

## 14. Índices

Tenant + status/patient/budget/created_at; versões por contract; envelopes pendentes (parcial); signers pendentes (parcial); files não deletados (parcial); audit por occurred_at/event_type; templates publicados (parcial).

---

## 15. Segurança de dados

- Sem data URL / binário em `app_contract_files`
- CPF: apenas masked/hash em parties; snapshots sob controle do domínio
- Sem OTP/token/segredo em colunas
- Repositories não logam HTML/snapshots/PII (apenas IDs/ops via erros tipados)

---

## 16. Testes

Arquivo: `src/__tests__/phase103ContractsPersistenceTenantSecurity.test.js`

```text
Test Files  1 passed
Tests       27 passed
```

Cobertura:

- migrations + checksums espelhos
- 006 intacta
- schema parity (statuses/types)
- constraints / imutabilidade / append-only / RLS pattern
- mappers round-trip
- repository mock + cross-tenant
- flags OFF + sem wiring em services legados

Ajuste menor em teste Phase 10.2: assertion “sem migration contracts_v2” substituída (agora 028/029 existem por design da 10.3).

---

## 17. Comandos e resultados

| Comando | Resultado |
|---------|-----------|
| `vitest …phase103…` | **27 passed** |
| `vitest …phase102…` | **39 passed** (após ajuste assertion migrations) |
| `vitest` contractModule/Budget/Hashtags | **15 passed** |
| `tsc -b` filtrado `domain/contracts\|repositories/contracts` | **0 erros novos** |
| `npm run build` | **✓ built** |
| Apply migration / remoto | **não executado** |

Dívida preexistente: TS em CRM/agenda/financial; falha `contractSignatureFlow` com `window.location` (não tocada).

---

## 18. Regressões

| Item | Status |
|------|--------|
| Legado IndexedDB / services | Intactos |
| Migration 006 | Intacta |
| UI / flags | Sem wiring / OFF |
| Build | OK |
| Phase 10.2 domain | OK |

---

## 19. Rollback

### Nesta fase (migrations não aplicadas)

1. Remover `028`/`029` (canônica + espelhos)  
2. Remover `src/repositories/contracts/`  
3. Remover teste phase103  
4. Manter domínio Phase 10.2  

### Futura aplicação controlada (NÃO agora)

Ordem inversa: idempotency → audit → signers → envelopes → files → packages → snapshots/consents/treatments/parties → versions → contracts → template versions/templates → policies → functions/triggers.  
**Nunca** drop com dados reais sem backup. **Nunca** tocar tabelas 006.

---

## 20. Riscos

1. Schemas V2 e legado coexistentes — risco de confusão de nomes (mitigado por prefixo `app_`).  
2. `patient_id text` exigirá estratégia de cutover com `patients.uuid` depois.  
3. RLS admin-only modify pode ser estreito demais para recepção — ajustar com policies por permissão em fase de governance.  
4. Repositories prontos mas não wired — drift se domínio evoluir sem atualizar mappers.

---

## 21. Pendências

1. Dry-run local autorizado (Supabase isolado) antes de qualquer ambiente compartilhado.  
2. Wiring atrás de feature flags (Phase 10.4+ templates / 10.5 generation).  
3. Decisão financeira on-signed vs approve-budget.  
4. Bucket Storage privado para `app_contract_files`.

---

## 22. Gates

| Gate | Status |
|------|--------|
| Migrations manuais criadas | ✅ |
| Migrations **não** aplicadas | ✅ |
| Legado 006 intacto | ✅ |
| Repositories sem wiring | ✅ |
| Queries exigem tenant | ✅ |
| FKs cross-tenant bloqueadas | ✅ |
| RLS definido | ✅ |
| Testes cross-tenant (mock/static) | ✅ |
| Versões locked imutáveis | ✅ |
| Audit append-only | ✅ |
| Schema parity com domínio | ✅ |
| Flags OFF | ✅ |
| IndexedDB SSOT | ✅ |
| Build OK | ✅ |
| Relatório | ✅ |

## 23. Próxima fase recomendada

**PHASE_10.4 — Templates e editor** (CRUD modelos V2 + versionamento + sanitização), ainda atrás de flags OFF, sem cutover IndexedDB.

---

**FIM Phase 10.3 — aguardar aprovação formal. Commit não realizado. Migrations não aplicadas.**
)
