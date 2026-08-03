# Playbooks — Procedimentos Operacionais

Procedimentos repetíveis para operação, desenvolvimento, deploy e estabilidade do Love Odonto V2.

Playbooks **executam** o que as Constituições **definem**.

---

## Documentos atuais

| Playbook | Uso |
|----------|-----|
| [STABILITY_CHECKLIST.md](./STABILITY_CHECKLIST.md) | Pré-deploy, auth, tenant-context |
| [LOCAL_DEV.md](./LOCAL_DEV.md) | Ambiente de desenvolvimento local |
| [SUPABASE_LOCAL_DRY_RUN_SETUP.md](./SUPABASE_LOCAL_DRY_RUN_SETUP.md) | Dry-run Supabase local isolado (Phase 9.2A) |
| [REPOSITORY_V3_MIGRATION_CHECKLIST.md](./REPOSITORY_V3_MIGRATION_CHECKLIST.md) | Checklist oficial migração Repository V3 |
| [CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md](./CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md) | Plano de ativação controlada CQRS em staging (Phase 8.6) |
| [CQRS_STAGING_PREFLIGHT_EXECUTION_PLAYBOOK.md](./CQRS_STAGING_PREFLIGHT_EXECUTION_PLAYBOOK.md) | Execução de preflight de segurança (Phase 8.7) |
| [templates/](./templates/) | Templates humanos Stage 1 / staging auth (Phase 8.8) |

---

## Playbooks relacionados (repo root)

| Path | Uso |
|------|-----|
| `DEPLOY.md` | Deploy produção |
| `CONSOLE_SETUP.md` | Setup console |
| `scripts/preflight-local.mjs` | Validação env |

---

## O que colocar aqui

- Runbooks de deploy e rollback  
- Procedimentos de migration / backfill  
- Checklists operacionais  
- Guias de incident response  
- Onboarding de desenvolvedores

Referência QA: [`../constitution/LOVE_ODONTO_V2_MASTER_QA.md`](../constitution/LOVE_ODONTO_V2_MASTER_QA.md)
