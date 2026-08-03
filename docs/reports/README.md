# Reports — Auditorias, Validações e Relatórios

Documentos de **diagnóstico, auditoria e evidência** — não normativos.

Relatórios descrevem **estado observado** em um ponto no tempo. Constituições descrevem **estado desejado/obrigatório**.

---

## Relatórios Markdown (esta pasta)

| Relatório | Descrição |
|-----------|-----------|
| [LOVE_ODONTO_ARCHITECTURAL_CONSOLIDATION_REALITY_AUDIT.md](./LOVE_ODONTO_ARCHITECTURAL_CONSOLIDATION_REALITY_AUDIT.md) | **Auditoria geral de aderência ao plano SSOT (Reality Audit)** |
| [PHASE_9_1_SUPABASE_SCHEMA_GAP_CLOSURE.md](./PHASE_9_1_SUPABASE_SCHEMA_GAP_CLOSURE.md) | **Phase 9.1 — Schema Gap Closure (migrations 020–023, sem apply)** |
| [PHASE_9_2_SUPABASE_LOCAL_MIGRATION_DRY_RUN_RLS_VALIDATION.md](./PHASE_9_2_SUPABASE_LOCAL_MIGRATION_DRY_RUN_RLS_VALIDATION.md) | **Phase 9.2 — Local dry-run + RLS (static pass; DB apply blocked)** |
| [PHASE_9_2A_ISOLATED_LOCAL_SUPABASE_ENVIRONMENT_PREPARATION.md](./PHASE_9_2A_ISOLATED_LOCAL_SUPABASE_ENVIRONMENT_PREPARATION.md) | **Phase 9.2A — Ambiente Supabase local isolado (prep; apply blocked)** |
| [PHASE_9_2B_LOCAL_SUPABASE_TOOLCHAIN_SETUP_READINESS.md](./PHASE_9_2B_LOCAL_SUPABASE_TOOLCHAIN_SETUP_READINESS.md) | **Phase 9.2B — Toolchain (histórico BLOCKED; reconciliado 2026-07-22 → PENDING_RLS_RUNTIME)** |
| [PHASE_9_2C_LOCAL_RUNTIME_RLS_VALIDATION.md](./PHASE_9_2C_LOCAL_RUNTIME_RLS_VALIDATION.md) | **Phase 9.2C — RLS runtime local (reconciliado 2026-08-02: RLS_RUNTIME_PASS 45/45)** |
| [PHASE_9_3A_FUNCTIONAL_E2E_ODONTO_VALIDATION.md](./PHASE_9_3A_FUNCTIONAL_E2E_ODONTO_VALIDATION.md) | **Phase 9.3A — Functional E2E local (reconciliado: FUNCTIONAL_E2E_PASS 29/29)** |
| [PHASE_9_4A_WAVE1_PATIENTS_FOUNDATION.md](./PHASE_9_4A_WAVE1_PATIENTS_FOUNDATION.md) | **Phase 9.4A Wave 1 — Patients foundation + Wave 1B runtime (31/31 RLS)** |
| [PHASE_9_4A_SECURITY_HARDENING.md](./PHASE_9_4A_SECURITY_HARDENING.md) | **Phase 9.4A Security Hardening — JWT membership + RLS fail-closed + budgets quarantine (026)** |
| [PHASE_9_4A_WAVE2_PATIENT_DETAILS.md](./PHASE_9_4A_WAVE2_PATIENT_DETAILS.md) | **Phase 9.4A Wave 2 — Patient details satélites + repository Supabase real (027)** |
| [PHASE_9_4A_WAVE3A_PATIENT_DATA_READINESS_AUDIT.md](./PHASE_9_4A_WAVE3A_PATIENT_DATA_READINESS_AUDIT.md) | **Phase 9.4A Wave 3A — Patient data readiness audit (IndexedDB read-only; gate Wave 3B)** |
| [architecture-audit-love-odonto-v2.md](./architecture-audit-love-odonto-v2.md) | Auditoria arquitetural completa (Etapa 2) |
| [feature-audit.md](./feature-audit.md) | Auditoria de features |
| [PHASE_REPORT_TEMPLATE.md](./PHASE_REPORT_TEMPLATE.md) | Template oficial relatório por phase |
| [PHASE_5_15_PLATFORM_ARCHITECTURE_CONSOLIDATION.md](./PHASE_5_15_PLATFORM_ARCHITECTURE_CONSOLIDATION.md) | Consolidação arquitetura Repository V3 |
| [PHASE_6_1_CRM_KANBAN_REPOSITORY_FOUNDATION.md](./PHASE_6_1_CRM_KANBAN_REPOSITORY_FOUNDATION.md) | CRM/Kanban Repository Foundation |
| [PHASE_6_2_CRM_READ_CUTOVER_WAVE_A.md](./PHASE_6_2_CRM_READ_CUTOVER_WAVE_A.md) | CRM Read Cutover Wave A (Pipeline, Leads, Kanban) |
| [PHASE_6_3_CRM_WRITE_CUTOVER_WAVE_A.md](./PHASE_6_3_CRM_WRITE_CUTOVER_WAVE_A.md) | CRM Write Cutover Wave A (Dual Write) |
| [PHASE_6_4_CRM_PRIMARY_WRITE_SOAK_VALIDATION.md](./PHASE_6_4_CRM_PRIMARY_WRITE_SOAK_VALIDATION.md) | CRM Primary Write + Soak (Wave A) |
| [PHASE_6_5_CRM_WAVE_B_FOUNDATION.md](./PHASE_6_5_CRM_WAVE_B_FOUNDATION.md) | CRM Wave B Foundation (Activity Stream) |
| [PHASE_6_6_CRM_WAVE_B_READ_CUTOVER_ACTIVITY_STREAM.md](./PHASE_6_6_CRM_WAVE_B_READ_CUTOVER_ACTIVITY_STREAM.md) | CRM Wave B Read Cutover (Activity Stream) |
| [PHASE_6_7_CRM_WAVE_B_WRITE_CUTOVER_ACTIVITY_STREAM.md](./PHASE_6_7_CRM_WAVE_B_WRITE_CUTOVER_ACTIVITY_STREAM.md) | CRM Wave B Write Cutover (Activity Dual Write) |
| [PHASE_6_8_CRM_ACTIVITY_PRIMARY_WRITE_SOAK_VALIDATION.md](./PHASE_6_8_CRM_ACTIVITY_PRIMARY_WRITE_SOAK_VALIDATION.md) | CRM Activity Primary Write + Soak Validation |
| [PHASE_6_9_DOMAIN_EVENTS_FOUNDATION.md](./PHASE_6_9_DOMAIN_EVENTS_FOUNDATION.md) | Domain Events Foundation (estrutural) |
| [PHASE_7_0_DOMAIN_EVENT_TOOLKIT_PUBLISHER_FOUNDATION.md](./PHASE_7_0_DOMAIN_EVENT_TOOLKIT_PUBLISHER_FOUNDATION.md) | Domain Event Toolkit + Publisher Foundation |
| [PHASE_7_1_CRM_DOMAIN_EVENT_ADOPTION_WAVE_A.md](./PHASE_7_1_CRM_DOMAIN_EVENT_ADOPTION_WAVE_A.md) | CRM Domain Event Adoption Wave A (Leads) |
| [PHASE_7_2_FINANCIAL_DOMAIN_EVENT_ADOPTION_WAVE_A.md](./PHASE_7_2_FINANCIAL_DOMAIN_EVENT_ADOPTION_WAVE_A.md) | Financial Domain Event Adoption Wave A |
| [PHASE_7_3_DOMAIN_EVENT_OBSERVABILITY_FOUNDATION.md](./PHASE_7_3_DOMAIN_EVENT_OBSERVABILITY_FOUNDATION.md) | Domain Event Observability Foundation |
| [PHASE_7_4_DOMAIN_EVENT_FACADE_AGENDA_ADOPTION_WAVE_A.md](./PHASE_7_4_DOMAIN_EVENT_FACADE_AGENDA_ADOPTION_WAVE_A.md) | Domain Event Facade + Agenda Adoption Wave A |
| [PHASE_7_5_CRM_WAVE_B_DOMAIN_EVENT_ADOPTION.md](./PHASE_7_5_CRM_WAVE_B_DOMAIN_EVENT_ADOPTION.md) | CRM Wave B Domain Event Adoption |
| [PHASE_7_6_DOMAIN_EVENT_CONSUMER_FOUNDATION.md](./PHASE_7_6_DOMAIN_EVENT_CONSUMER_FOUNDATION.md) | Domain Event Consumer Foundation |
| [PHASE_7_7_FIRST_CONSUMER_PILOT_EVENT_AUDIT_PROJECTION.md](./PHASE_7_7_FIRST_CONSUMER_PILOT_EVENT_AUDIT_PROJECTION.md) | First Consumer Pilot (Event Audit Projection) |
| [PHASE_7_8_ANALYTICS_PROJECTION_FOUNDATION.md](./PHASE_7_8_ANALYTICS_PROJECTION_FOUNDATION.md) | Analytics Projection Foundation |
| [PHASE_7_9_ANALYTICS_READ_MODEL_PILOT_LEAD_ANALYTICS.md](./PHASE_7_9_ANALYTICS_READ_MODEL_PILOT_LEAD_ANALYTICS.md) | Analytics Read Model Pilot (Lead Analytics) |
| [PHASE_8_0_CQRS_READ_MODEL_FOUNDATION.md](./PHASE_8_0_CQRS_READ_MODEL_FOUNDATION.md) | CQRS Read Model Foundation |
| [PHASE_8_1_MULTI_READ_MODEL_ADOPTION.md](./PHASE_8_1_MULTI_READ_MODEL_ADOPTION.md) | Multi Read Model Adoption |
| [PHASE_8_2_READ_MODEL_SOAK_CONSISTENCY_VALIDATION.md](./PHASE_8_2_READ_MODEL_SOAK_CONSISTENCY_VALIDATION.md) | Read Model Soak + Consistency Validation |
| [PHASE_8_3_TENANT_SCOPED_ANALYTICS_PROJECTION_FOUNDATION.md](./PHASE_8_3_TENANT_SCOPED_ANALYTICS_PROJECTION_FOUNDATION.md) | Tenant-Scoped Analytics Projection Foundation |
| [PHASE_8_4_CQRS_READ_MODEL_PROMOTION_READINESS.md](./PHASE_8_4_CQRS_READ_MODEL_PROMOTION_READINESS.md) | CQRS Read Model Promotion Readiness |
| [PHASE_8_5_CQRS_ARCHITECTURE_CERTIFICATION.md](./PHASE_8_5_CQRS_ARCHITECTURE_CERTIFICATION.md) | CQRS Architecture Certification |
| [PHASE_8_6_CONTROLLED_STAGING_ACTIVATION_PLAN.md](./PHASE_8_6_CONTROLLED_STAGING_ACTIVATION_PLAN.md) | Controlled Staging Activation Plan |
| [PHASE_8_7_CONTROLLED_STAGING_PREFLIGHT_EXECUTION.md](./PHASE_8_7_CONTROLLED_STAGING_PREFLIGHT_EXECUTION.md) | Controlled Staging Preflight Execution |
| [PHASE_8_8_STAGING_AUTHORIZATION_PACKAGE_STAGE_ONE_READINESS.md](./PHASE_8_8_STAGING_AUTHORIZATION_PACKAGE_STAGE_ONE_READINESS.md) | Staging Authorization Package + Stage 1 Readiness |
| [PHASE_8_9_STAGING_AUTHORIZATION_DATA_INTAKE_FINAL_VALIDATION.md](./PHASE_8_9_STAGING_AUTHORIZATION_DATA_INTAKE_FINAL_VALIDATION.md) | Staging Authorization Data Intake + Final Validation |
| [PHASE_8_10_AUTHORIZED_STAGING_READONLY_VERIFICATION_GATE.md](./PHASE_8_10_AUTHORIZED_STAGING_READONLY_VERIFICATION_GATE.md) | Authorized Staging Read-only Verification Gate |
| [PHASE_8_11_STAGING_AUTHORIZATION_HANDOFF_EVIDENCE_READINESS.md](./PHASE_8_11_STAGING_AUTHORIZATION_HANDOFF_EVIDENCE_READINESS.md) | Staging Authorization Handoff + Evidence Readiness |
| [PHASE_8_12_HANDOFF_OWNER_ASSIGNMENT_AUTHORIZATION_INPUT_VALIDATION.md](./PHASE_8_12_HANDOFF_OWNER_ASSIGNMENT_AUTHORIZATION_INPUT_VALIDATION.md) | Handoff Owner Assignment + Authorization Input Validation |

---

## Relatórios JSON (scripts)

Evidências operacionais timestampadas:

```
scripts/reports/
  rh-backfill-*.json
  staging-seed-*.json
  pre-apply-snapshot-*.json
```

Referência: [`../constitution/LOVE_ODONTO_V2_MASTER_QA.md`](../constitution/LOVE_ODONTO_V2_MASTER_QA.md) · [`../constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md`](../constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md) §22

---

## O que colocar aqui

- Auditorias de arquitetura e segurança  
- Relatórios de homologação formal  
- Post-mortems documentados  
- Validações pós-migration (resumo executivo em Markdown)

**Não** colocar Constituições ou playbooks nesta pasta.
