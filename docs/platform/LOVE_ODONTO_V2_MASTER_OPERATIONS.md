# Love Odonto V2 — Master Operations (Constituição Oficial de Operações)

**Documento:** `docs/platform/LOVE_ODONTO_V2_MASTER_OPERATIONS.md`  
**Versão:** 1.0.0  
**Data:** 2026-06-29  
**Status:** Oficial — referência normativa para operação diária, incidentes, backup, suporte e continuidade do Love Odonto V2.  
**Complemento de:** [`LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) · [`LOVE_ODONTO_V2_MASTER_QA.md`](../constitution/LOVE_ODONTO_V2_MASTER_QA.md) · [`LOVE_ODONTO_V2_MASTER_SECURITY.md`](./LOVE_ODONTO_V2_MASTER_SECURITY.md) · [`LOVE_ODONTO_V2_MASTER_INTEGRATION.md`](./LOVE_ODONTO_V2_MASTER_INTEGRATION.md) · [`LOVE_ODONTO_V2_MASTER_OBSERVABILITY.md`](./LOVE_ODONTO_V2_MASTER_OBSERVABILITY.md) · [`LOVE_ODONTO_V2_MASTER_RELEASE_MANAGEMENT.md`](./LOVE_ODONTO_V2_MASTER_RELEASE_MANAGEMENT.md) · [`LOVE_ODONTO_V2_MASTER_DEVELOPMENT_GUIDE.md`](./LOVE_ODONTO_V2_MASTER_DEVELOPMENT_GUIDE.md)

**Regra de ouro:** toda operação em staging ou produção segue este manual. Em conflito com prática ad hoc, **este documento prevalece** até revisão formal.

**Escopo:** rotinas, runbooks, SLA/SLO operacionais, escalonamento e governança. **Não** contém código executável.

**Nota estratégica:** este é o **último Master operacional** da suíte V2. Após sua adoção, a prioridade do projeto passa à **consolidação de código** (Love Odonto V3 / cutover SSOT).

**Legenda:** ✅ operacional hoje · 🔄 parcial · ⏳ roadmap

---

## Índice

1. [Filosofia Operacional](#1-filosofia-operacional) · 2. [Organização da Operação](#2-organização-da-operação) · 3. [Ambientes](#3-ambientes) · 4–6. [Rotinas Diária / Semanal / Mensal](#4-rotinas-diárias) · 7–8. [Incidentes / Classificação](#7-gestão-de-incidentes) · 9–10. [SLA / SLO](#9-sla) · 11–14. [Suporte N1–N3 / Escalonamento / Comunicação](#11-suporte-n1) · 15–16. [On Call](#16-on-call) · 17–20. [Backup / Restore / DR / Continuidade](#17-backup) · 21. [Capacity Planning](#21-capacity-planning) · 22–27. [Monitoramento / Dashboards / Alertas / Health / Logs / Auditoria](#22-monitoramento) · 28. [Mudanças](#28-mudanças) · 29–37. [Operações por superfície](#29-operações-de-banco) · 38. [Runbooks](#38-runbooks) · 39. [Roadmap](#39-roadmap) · 40. [Governança Operacional](#40-governança-operacional)

**Apêndices:** [Matrizes](#apêndice-a--matrizes) · [Checklists](#apêndice-b--checklists) · [Regras proibidas](#apêndice-c--regras-proibidas) · [Roadmap detalhado](#apêndice-d--roadmap-detalhado)

---

## 1. Filosofia Operacional

Operar Love Odonto V2 é manter **clínicas atendendo pacientes** com dados isolados, auditáveis e recuperáveis.

| Premissa | Significado |
|----------|-------------|
| **Runbooks, não heroísmo** | Procedimentos documentados vencem memória individual |
| **Staging primeiro** | Nenhuma operação prod sem espelho validado |
| **Evidência** | Ticket + log + relatório JSON para toda mudança |
| **Fail closed** | Incidente incerto → escalar, não improvisar em prod |
| **Tenant-aware** | Suporte e ops sempre identificam `tenant_id` |
| **Blameless post-mortem** | Foco em sistema, não em pessoa |

---

## 2. Organização da Operação

### 2.1 Papéis

| Papel | Responsabilidade |
|-------|------------------|
| **Ops Lead** | Rotinas, backup, deploy coordination |
| **SRE / Platform Eng** | API, Supabase, observabilidade |
| **DBA / Data Ops** | Migrations, backfill, restore |
| **Support N1** | Triagem tenant, FAQ, logs básicos |
| **Support N2** | Auth, tenant-context, RBAC, integrações |
| **Support N3 / Eng** | Código, migrations, incidentes SEV-1/2 |
| **Release Manager** | Deploys, Go/No-Go — ver Release Management |
| **DPO / Legal** | LGPD em incidentes com dados pessoais |
| **Product Owner** | Priorização pós-incidente, comunicação tenant |

### 2.2 Canais

| Canal | Uso |
|-------|-----|
| Ticket / helpdesk | Toda solicitação tenant |
| Slack ops ⏳ | Incidentes, deploys |
| Status page ⏳ | Comunicação pública |
| `scripts/reports/` | Evidência ops (backfill, backup) |

---

## 3. Ambientes

| Ambiente | Supabase ref | App | API | Dados | Ops writes |
|----------|--------------|-----|-----|-------|------------|
| **Local** | Staging creds | `:5176` | `:3001` | Seed/dev | ✅ livre |
| **Staging** | `tckdjyunwmdpqmewrwvt` | Vercel preview ⏳ | Railway ⏳ | Implanprime anon | ✅ pós dry-run |
| **Produção** | `uoepkwhqztmsjnzirpev` | loveodonto.com.br | Railway prod | Clínicas reais | ✅ janela + gate |

### Tenant staging referência (QA/ops)

| Campo | Valor |
|-------|-------|
| Tenant ID | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| Clinic | `implanprime-staging` |
| Master test | `paulo+staging@implanprime.test` |

**OPS-ENV-001:** Confirmar project ref antes de qualquer CLI/MCP — `node scripts/preflight-local.mjs`.

---

## 4. Rotinas Diárias

| Horário (BRT) | Atividade | Responsável |
|---------------|-----------|-------------|
| **Início** | Checklist início do dia — Apêndice B.1 | Ops |
| Manhã | Verificar alertas overnight (Supabase, Railway, Vercel) | Ops |
| Manhã | `GET /health` prod + staging | Ops |
| Contínuo | Triagem tickets N1 | Support |
| Tarde | Review stability logs staging se deploy recente | Eng |
| **Fim** | Checklist fim do dia — Apêndice B.2 | Ops on-duty |

### Sinais diários obrigatórios

- Auth failure rate normal
- tenant-context failures = 0 spike
- Supabase advisors sem critical novo
- Nenhum SEV aberto > 24h sem update

---

## 5. Rotinas Semanais

| Dia | Atividade |
|-----|-----------|
| **Segunda** | Review incidentes semana anterior; error budget |
| **Terça** | Sync eng + ops — fila migrations/backfill |
| **Quarta** | `npm audit` + dependency review |
| **Quinta** | Staging smoke completo Master QA §10 |
| **Sexta** | Freeze deploy L3/L4 após 14h; backup report review |

---

## 6. Rotinas Mensais

| Atividade | Responsável |
|-----------|-------------|
| Restore drill staging (sample table) | DBA |
| Review SLA/SLO dashboards | Ops Lead |
| Rotação secrets review ⏳ | Security |
| Capacity Supabase (storage, connections) | SRE |
| Post-mortem backlog closure | Eng Lead |
| Runbook accuracy review | Ops |
| DORA metrics report | Release Manager |

---

## 7. Gestão de Incidentes

Fluxo alinhado a [`LOVE_ODONTO_V2_MASTER_SECURITY.md`](./LOVE_ODONTO_V2_MASTER_SECURITY.md) §47.

```
Detectar → Triagem → Declarar SEV → Conter → Erradicar → Recuperar → RCA → Comunicar → Fechar
```

| Fase | Ações |
|------|-------|
| **Detectar** | Alerta, ticket, monitoramento |
| **Triagem** | Classificar SEV; assign Incident Commander |
| **Conter** | Rollback, disable feature, block endpoint |
| **Erradicar** | Fix root cause |
| **Recuperar** | Smoke, validação tenant |
| **RCA** | Post-mortem 5 dias úteis SEV-1/2 |
| **Comunicar** | Tenants, status page, ANPD se LGPD |
| **Fechar** | Ticket + action items tracked |

**Checklist incidente:** Apêndice B.3.

---

## 8. Classificação de Incidentes

| SEV | Impacto | Exemplos | MTTA | MTTR |
|-----|---------|----------|------|------|
| **SEV-1** | Multi-tenant / dados / plataforma down | Cross-tenant leak, Auth total down | 15 min | 4 h |
| **SEV-2** | Tenant(s) major / API degradada | tenant-context fail widespread | 30 min | 8 h |
| **SEV-3** | Feature degradada / tenant isolado | WhatsApp fail, logo upload | 2 h | 24 h |
| **SEV-4** | Cosmético / workaround exists | UI glitch, typo | 4 h | 72 h |

Ver [Apêndice A.1](#a1-matriz-de-incidentes).

---

## 9. SLA

SLA **externo** (tenant-facing) — alinhado Security §20 e Observability §20.

| Serviço | Disponibilidade mensal | Exclusões |
|---------|------------------------|-----------|
| App clínica | 99.5% | Manutenção comunicada |
| Login / Auth | 99.9% | IdP Supabase outage documentado |
| Admin API | 99.5% | — |
| Email transacional | 99% | Provider third-party |

**Crédito / compensação:** conforme contrato SaaS — fora escopo técnico deste doc.

---

## 10. SLO

SLO **interno** — Observability §21.

| SLO | Target |
|-----|--------|
| API success rate | 99.5% / 30d |
| tenant-context p95 | < 2s |
| Auth availability | 99.9% |
| Backup success | 100% |
| Smoke post-deploy | 100% |

---

## 11. Suporte N1

**Escopo:** primeiro contato, triagem, FAQ.

| Pode | Não pode |
|------|----------|
| Reset senha via processo admin | Alterar RLS/SQL prod |
| Verificar status serviço | Deploy código |
| Coletar tenant_id, screenshots | Acessar service role |
| Escalar N2 com pacote completo | Prometer prazo sem eng |

### Pacote escalonamento N1 → N2

- Tenant ID + usuário + horário
- Passos reprodução
- Screenshot / mensagem erro
- URL rota afetada
- Já tentou logout/login?

---

## 12. Suporte N2

**Escopo:** auth, tenant-context, RBAC, integrações, billing warnings.

| Ferramentas | Ações |
|-------------|-------|
| Supabase dashboard (read) | Verificar tenant_users, membership |
| identity-health API | Avaliar identidade |
| `/stability/health` staging | Reproduzir |
| identity_events query | Timeline acesso |
| Master QA casos | Regressão manual |

Escalar N3: SEV-2+, migration, code bug, data corruption.

---

## 13. Suporte N3

**Escopo:** engenharia — código, migrations, infra, RCA.

- Deploy hotfix — Release Management §25
- Migration forward fix
- Backfill / restore
- Supabase PITR coordination
- Post-mortem author

---

## 14. Escalonamento

Ver [Apêndice A.3](#a3-matriz-de-escalonamento).

**Regra:** SEV-1 → Incident Commander + Tech Lead + Ops imediato; notificar PO em 30 min.

---

## 15. Comunicação

| Audiência | SEV-1/2 | SEV-3/4 |
|-----------|---------|---------|
| Equipe interna | Imediato Slack ⏳ | Ticket |
| Tenants afetados | < 1h email/status | Resposta ticket |
| Todos tenants | Se plataforma wide | — |
| ANPD | 72h se dados pessoais | — |

Template status: "Investigando" → "Identificado" → "Monitorando" → "Resolvido".

---

## 16. On Call

| Aspecto | Norma |
|---------|-------|
| Cobertura | 24×7 para SEV-1/2 ⏳ formal roster |
| Rotação | Semanal |
| Handoff | Checklist Apêndice B.8 |
| Ferramentas | Runbooks, Supabase, Railway, Vercel |
| Compensação | Política RH — fora escopo técnico |

**Interim:** Tech Lead on-call informal até Fase 2.

---

## 17. Backup

| Tipo | Frequência | Local | Retenção |
|------|------------|-------|----------|
| Supabase PITR | Contínuo | Supabase | Plano |
| Pre-apply JSON | Antes backfill/migration dados | `scripts/reports/` | Permanente |
| Export staging | Semanal ops | Secure storage | 90d |
| Config env | A cada change | Secret manager | Versioned |

**OPS-BKP-001:** Backup sem teste restore mensal → não conforme.

Checklist: Apêndice B.4.

---

## 18. Restore

| Cenário | Método | RTO |
|---------|--------|-----|
| App/API bad deploy | Redeploy tag anterior | 15 min |
| Row-level corruption | JSON backup + rollback script | 2 h |
| Migration failure | PITR Supabase / forward fix | 2–4 h |
| Full disaster | PITR + redeploy stack | 4–8 h |

**Gate prod restore:** janela + Go/No-Go + QA smoke pós-restore.

Checklist: Apêndice B.5.

---

## 19. Disaster Recovery

| Métrica | Alvo | Roadmap |
|---------|------|---------|
| **RPO** | 24h (PITR) | 1h |
| **RTO** | 4h stack | 1h |

### Cenários

1. **Supabase region failure** — status Supabase; evaluate PITR restore; communicate
2. **Railway API down** — rollback deploy; scale/restart
3. **Vercel CDN issue** — rollback; cache purge
4. **Auth outage** — fail closed login; status page
5. **Complete credential compromise** — rotate all secrets — Security runbook ⏳

---

## 20. Continuidade

| Componente | Degraded mode |
|------------|---------------|
| Admin API down | App read cache IDB — **no writes SSOT** |
| Supabase read slow | Retry; banner latency |
| Email down | Queue invites; manual resend later |
| Storage down | Block uploads; show message |

**Prioridade restauração:** Auth → Postgres → API → Storage → Integrações.

---

## 21. Capacity Planning

| Recurso | Review | Threshold ação |
|---------|--------|----------------|
| Supabase DB size | Mensal | 80% plano |
| Storage egress | Mensal | 80% budget |
| Railway CPU/RAM | Semanal | > 70% sustained |
| Connection pool | Semanal | > 80% max |
| IDB (client) | N/A | User device |

---

## 22. Monitoramento

| Fonte | O que monitorar |
|-------|-----------------|
| Supabase Dashboard | CPU, connections, advisors |
| Railway | API logs, restarts, 5xx |
| Vercel | Deploy status, edge errors |
| Uptime probe ⏳ | /health, login page |
| stabilityLogService | DEV/staging patterns |

Ver [`LOVE_ODONTO_V2_MASTER_OBSERVABILITY.md`](./LOVE_ODONTO_V2_MASTER_OBSERVABILITY.md) §19–25.

---

## 23. Dashboards

| Dashboard | Audiência | Estado |
|-----------|-----------|--------|
| Platform Overview | Ops | ⏳ |
| Supabase | DBA | ✅ |
| Railway API | SRE | ✅ |
| Tenant Health | Support N2 | ⏳ |
| Incidents | Ops Lead | Ticket ⏳ |

---

## 24. Alertas

| Alerta | Owner | Runbook |
|--------|-------|---------|
| /health fail | Ops | RB-API-001 |
| 5xx spike | SRE | RB-API-002 |
| Auth fail spike | Eng | RB-AUTH-001 |
| Advisor critical | DBA | RB-DB-001 |
| Backup fail | Ops | RB-BKP-001 |

Matriz completa: Observability Apêndice A.3.

**OPS-ALERT-001:** Alerta sem responsável → inválido.

---

## 25. Health Checks

| Check | Comando / URL | Frequência |
|-------|---------------|------------|
| API liveness | `GET /health` | 1 min ⏳ |
| API identity | `npm run audit:identity-api` | Weekly |
| Stack local | `npm run smoke` | Pre-deploy |
| Admin API probe | `npm run check:admin-api` | Daily staging |
| Frontend diag | `/stability/health` | On incident |

---

## 26. Logs

### Consulta operacional

| Log | Onde | Uso |
|-----|------|-----|
| Railway API | Host dashboard | 5xx, startup |
| Supabase Logs | Dashboard | Auth, Postgres |
| identity_events | SQL | Access timeline |
| stability buffer | Browser dev | Auth/tenant debug |
| scripts/reports | Repo ops | Backfill audit |

**Proibido:** CPF, tokens, Authorization — Security §43.

---

## 27. Auditoria

| Operação | Trail |
|----------|-------|
| Deploy prod | Git tag + ticket |
| Migration apply | JSON report |
| Backfill | dry-run + backup + apply reports |
| RBAC change | identity_events |
| Admin console | audit_logs |
| Support data access | Ticket log ⏳ |

Retenção: 12–24 meses — Security §22.

---

## 28. Mudanças

Toda mudança prod segue [`LOVE_ODONTO_V2_MASTER_RELEASE_MANAGEMENT.md`](./LOVE_ODONTO_V2_MASTER_RELEASE_MANAGEMENT.md).

| Tipo | Processo |
|------|----------|
| **Standard release** | RC → staging → Go/No-Go → prod |
| **Hotfix** | hotfix branch → fast QA → prod |
| **Ops-only** | Migration/backfill gate §25 Architecture |
| **Config env** | Redeploy + smoke |
| **Emergency** | SEV + IC approval + post-facto review 24h |

Checklist mudança: Apêndice B.9.

**OPS-CHG-001:** Mudança sem registro ticket → proibida.

---

## 29. Operações de Banco

| Operação | Procedimento |
|----------|--------------|
| Nova migration | Staging apply → validate → prod janela |
| Backfill | dry-run → backup → apply staging → prod gate |
| Query sanity | órfãos, cross-tenant = 0 |
| Advisors | pós-migration `get_advisors` |
| Rollback | PITR ou forward migration |
| Seed | **Nunca prod** sem autorização |

Scripts ref: `scripts/rh-backfill-to-supabase.mjs`, `scripts/pre-apply-full-backup.mjs`, `scripts/collaborator-id-backfill.mjs`.

---

## 30. Operações Supabase

| Área | Ops |
|------|-----|
| **Auth** | Redirect URLs, SMTP, rate limits |
| **RLS** | Policy review pós-migration |
| **Storage** | Bucket quotas, policy audit |
| **Branches** | Preview DB ⏳ |
| **Logs** | Enable drain ⏳ |
| **PITR** | Restore drill mensal |

Project refs: staging `tckdjyunwmdpqmewrwvt` · prod `uoepkwhqztmsjnzirpev`.

---

## 31. Operações Storage

| Bucket | Ops |
|--------|-----|
| `clinic-logos` | Orphan scan; CDN cache |
| `clinical-guides` | Size audit |
| Roadmap buckets | Create via migration only |

Incident: upload fail spike → check MIME limits, RLS, egress.

---

## 32. Operações Admin API

| Tarefa | Detalhe |
|--------|---------|
| Deploy | Railway; env server-side secrets |
| Rollback | Railway previous deployment |
| Health | `GET /health` — version field |
| Identity ops | `/internal/app/identity-health/evaluate` |
| Logs | Railway — no PII |
| Scale | Vertical/horizontal Railway ⏳ |

Porta dev: **3001** · CORS prod whitelist.

---

## 33. Operações Frontend

| Tarefa | Detalhe |
|--------|---------|
| Deploy | Vercel; `npm run build` |
| Rollback | Vercel instant rollback |
| Env | `VITE_*` rebuild required on change |
| Cache | CDN purge se asset stale |
| Smoke | Login + tenant-context pós-deploy |

Ver `DEPLOY.md`.

---

## 34. Operações IA

| Tarefa | Detalhe |
|--------|---------|
| Provider outage | Degraded — handoff humano |
| Quota exceeded | Tenant limit banner |
| Prompt incident | Disable feature flag ⏳ |
| Logs | No prompt content prod |

Marketing Chat — Master Integration §38–39.

---

## 35. Operações Integrações

| Integração | Monitor | Ação outage |
|------------|---------|-------------|
| Email (Resend/SG) | Bounce rate | Failover SMTP Supabase |
| Signature webhook | 401/400 rate | Rotate secret |
| WhatsApp | ⏳ | Manual wa.me fallback |
| N8N | ⏳ | Pause workflows |

Master Integration §21–22.

---

## 36. Operações Financeiras

| Área | Ops |
|------|-----|
| Platform billing | Console `/internal/platform/billing/*` |
| Tenant block | `block-for-billing` |
| Invoice mark paid | Console action + audit |
| Gateway ⏳ | Webhook DLQ monitor |

Support N2 pode verificar billing warnings em tenant-context.

---

## 37. Operações Tenant

| Operação | Canal |
|----------|-------|
| Provision new clinic | Platform Console |
| Resend access | Console / API |
| Block / unblock | Console billing |
| Debug membership | identity-health (staging) |
| RBAC fix | access-bundle API |
| Link RH ↔ user | collaborators/link API |

**Sempre registrar:** tenant_id, actor, ticket.

---

## 38. Runbooks

Ver [Apêndice A.5](#a5-matriz-de-runbooks).

| ID | Título | SEV |
|----|--------|-----|
| RB-AUTH-001 | Falha login / AUTH_FAILED spike | 2–3 |
| RB-TENANT-001 | TENANT_CONTEXT_FAILED | 2–3 |
| RB-API-001 | Admin API /health down | 1–2 |
| RB-API-002 | 5xx rate elevado | 2 |
| RB-DB-001 | Migration failure | 1–2 |
| RB-BKP-001 | Restore from backup | 1–2 |
| RB-DEPLOY-001 | Rollback deploy | 2–3 |
| RB-SEC-001 | Suspected credential leak | 1 |
| RB-INT-001 | Webhook signature fail | 3 |

Detalhe operacional: [`STABILITY_CHECKLIST.md`](../playbooks/STABILITY_CHECKLIST.md), Release Management §24, Security §47.

---

## 39. Roadmap

Ver [Apêndice D](#apêndice-d--roadmap-detalhado).

---

## 40. Governança Operacional

| Aspecto | Norma |
|---------|-------|
| **Dono documento** | Ops Lead + Tech Lead |
| **Revisão** | Trimestral ou pós SEV-1 |
| **Métricas** | DORA + SLA monthly review |
| **Auditoria ops** | Sample tickets + deploy logs mensal |
| **Conflitos** | Este doc + Release Management + Security |
| **Transição V3** | Runbooks atualizados conforme cutover SSOT |

### Hierarquia normativa ops

1. Master Security (incidentes, backup, LGPD)
2. Master Release Management (deploy, rollback)
3. Master QA (validação)
4. **Este Master Operations** (dia a dia)
5. Master Observability (sinais)
6. Playbooks (`STABILITY_CHECKLIST`, `LOCAL_DEV`)

---

## Apêndice A — Matrizes

### A.1 Matriz de Incidentes

| SEV | Trigger | IC | Comms | RCA due |
|-----|---------|-----|-------|---------|
| 1 | Cross-tenant, prod down | Ops Lead | 30 min tenants | 3d |
| 2 | Auth/API major | Tech Lead | 1h internal | 5d |
| 3 | Feature broken | Support N2 | Ticket | 10d |
| 4 | Minor | N1 | Ticket | Optional |

### A.2 Matriz de SLA

| Serviço | SLA | Medição | Owner |
|---------|-----|---------|-------|
| App uptime | 99.5% | Uptime probe | Ops |
| Auth | 99.9% | Supabase auth metrics | SRE |
| API | 99.5% | /health + 5xx | SRE |
| Support response N1 | 4h business | Ticket | Support |
| Support response SEV-1 | 15 min | Pager ⏳ | Ops |

### A.3 Matriz de Escalonamento

| De | Para | Quando |
|----|------|--------|
| N1 | N2 | Auth, tenant, RBAC, reproduzível |
| N2 | N3 | Code bug, migration, SEV-2+ |
| N3 | IC + Lead | SEV-1, data breach |
| N3 | DPO | PII envolvido |
| Ops | Railway/Supabase support | Infra provider outage |

### A.4 Matriz de Severidade (ops view)

| Nível | User impact | Data risk | Example |
|-------|-------------|-----------|---------|
| Critical | All tenants | High | Leak, prod down |
| High | Many tenants | Medium | Auth broken |
| Medium | One tenant | Low | One clinic config |
| Low | Workaround | None | UI glitch |

### A.5 Matriz de Runbooks

| ID | Trigger | First action | Owner | Doc ref |
|----|---------|--------------|-------|---------|
| RB-AUTH-001 | Login fail spike | Check Supabase status | N2 | STABILITY |
| RB-TENANT-001 | Context timeout | Check API /health | N2 | STABILITY |
| RB-API-001 | Health fail | Railway restart/rollback | Ops | DEPLOY |
| RB-DB-001 | Migration error | Stop apply; assess PITR | DBA | Release Mgmt |
| RB-BKP-001 | Data corruption | Isolate; restore JSON | DBA | Security §45 |
| RB-DEPLOY-001 | Bad release | Vercel/Railway rollback | Ops | Release §24 |
| RB-SEC-001 | Key leak | Rotate secrets | Security | Security §17 |
| RB-INT-001 | Webhook 401 | Verify SIGNATURE_WEBHOOK_SECRET | N2 | Integration §39 |

### A.6 Matriz de Responsabilidades (RACI)

| Atividade | Ops | SRE | DBA | Support | Eng | PO |
|-----------|-----|-----|-----|---------|-----|-----|
| Daily health check | R | A | C | I | I | — |
| Deploy prod | C | R | C | I | A | I |
| Migration prod | C | C | R | I | A | I |
| Incident IC | R | A | C | C | A | I |
| Backup/restore | R | C | A | — | C | — |
| Tenant support | I | C | — | R | C | I |
| Post-mortem | C | R | C | I | A | I |

R=Responsible, A=Accountable, C=Consulted, I=Informed

---

## Apêndice B — Checklists

### B.1 Início do dia

- [ ] Verificar alertas overnight
- [ ] `GET /health` prod — 200
- [ ] Supabase dashboard — sem critical advisor novo
- [ ] Tickets SEV abertos — status update
- [ ] Deploys últimas 24h — smoke OK?
- [ ] On-call handoff lido (se aplicável)

### B.2 Final do dia

- [ ] Tickets triaged — nenhum SEV-1/2 sem owner
- [ ] Incidentes — timeline updated
- [ ] Deploys documentados
- [ ] Backups agendados OK
- [ ] Handoff nota para próximo on-call
- [ ] Freeze respeitado se sexta

### B.3 Incidente

- [ ] SEV classificado
- [ ] IC assignado
- [ ] Canal war room ⏳
- [ ] Timeline iniciado
- [ ] Containment executado
- [ ] Comunicação conforme §15
- [ ] RCA agendado
- [ ] Post-mortem blameless

### B.4 Backup

- [ ] Escopo definido
- [ ] Pre-apply script executado
- [ ] Arquivo JSON arquivado `scripts/reports/`
- [ ] Checksum / size validado
- [ ] Registro ticket ops
- [ ] Restore test agendado (mensal)

### B.5 Restore

- [ ] Aprovação Go/No-Go
- [ ] Janela comunicada
- [ ] Método selecionado (PITR / JSON / redeploy)
- [ ] Execute runbook RB-BKP-001
- [ ] SQL validation pós-restore
- [ ] Smoke QA
- [ ] Ticket fechado com evidência

### B.6 Deploy

Ver Release Management Apêndice B.6 — resumo:

- [ ] G1–G10 QA
- [ ] Go/No-Go GO
- [ ] Ordem deploy correta
- [ ] Smoke pós-deploy
- [ ] 24h watch

### B.7 Rollback

- [ ] SEV declarado
- [ ] RB-DEPLOY-001 ou RB-DB-001
- [ ] Stakeholders notified
- [ ] Smoke pós-rollback
- [ ] RCA iniciado

### B.8 On Call handoff

- [ ] Incidentes abertos listados
- [ ] Deploys recentes
- [ ] Alertas silenciados (justificativa)
- [ ] Known issues
- [ ] Contatos escalonamento

### B.9 Mudança (change ticket)

- [ ] Descrição + tenant impact
- [ ] Risk level L1–L4
- [ ] Rollback plan
- [ ] Janela aprovada
- [ ] Executores named
- [ ] Evidência pós-execução
- [ ] Ticket fechado

---

## Apêndice C — Regras proibidas

| # | Proibição |
|---|-----------|
| ❌ 1 | Operação sem logs / ticket |
| ❌ 2 | Incidente SEV-1/2 sem RCA |
| ❌ 3 | Mudança prod sem registro |
| ❌ 4 | Backup prod sem teste restore periódico |
| ❌ 5 | Restore nunca validado em staging |
| ❌ 6 | Ambiente prod sem monitoramento mínimo (/health) |
| ❌ 7 | Alteração manual SQL prod (fora migration script) |
| ❌ 8 | Acesso admin Supabase sem auditoria ticket |
| ❌ 9 | Operação L3/L4 fora janela |
| ❌ 10 | Backfill prod sem dry-run |
| ❌ 11 | Seed não autorizado prod |
| ❌ 12 | Compartilhar service role |
| ❌ 13 | Fechar ticket sem evidência smoke |
| ❌ 14 | Escalonar SEV-1 sem IC |

---

## Apêndice D — Roadmap detalhado

| Fase | Nome | Entregas |
|------|------|----------|
| **1** | **Operação Básica** | Este documento; runbooks core; daily checklist; staging gate; smoke |
| **2** | **Automação** | Uptime probes; alert routing; on-call roster; CI deploy; log drain |
| **3** | **Operação Enterprise** | Status page; ITSM integration; SLA reporting; restore automation |
| **4** | **SRE** | Error budget policy; chaos staging; OTel; auto-rollback |
| **5** | **Operação Global** | Multi-region; 24×7 follow-the-sun; SOC2 ops evidence |

### Fase 1 — estado atual ✅

- [x] Manual ops consolidado
- [x] Staging/prod refs documentados
- [x] Smoke + health scripts
- [x] Backup JSON workflow
- [x] Incident classification
- [x] Runbook index
- [ ] Formal on-call ⏳
- [ ] Status page ⏳
- [ ] Uptime automation ⏳

---

## Controle de revisão

| Versão | Data | Alteração |
|--------|------|-----------|
| 1.0.0 | 2026-06-29 | Versão inicial — Master Operations V2 (último Master operacional) |

---

## Critérios de aceite (este documento)

| Critério | Status |
|----------|--------|
| Processo operacional completo | ✅ §4–40 |
| Runbooks definidos | ✅ §38, A.5 |
| SLA documentado | ✅ §9, A.2 |
| Incidentes documentados | ✅ §7–8, A.1 |
| Operação diária definida | ✅ §4–6, B.1–B.2 |
| Roadmap criado | ✅ §39, Apêndice D |
| Checklists criados | ✅ Apêndice B (9) |
| Regras proibidas | ✅ Apêndice C |

---

## Suíte completa — Masters Love Odonto V2

| # | Documento | Camada |
|---|-----------|--------|
| — | [Master Architecture](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) | Constituição |
| — | [Master Business Rules](../constitution/LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md) | Constituição |
| — | [Master Database](../constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md) | Constituição |
| — | [Master QA](../constitution/LOVE_ODONTO_V2_MASTER_QA.md) | Constituição |
| 6.2 | [Master API](./LOVE_ODONTO_V2_MASTER_API.md) | Platform |
| 6.3 | [Master Development Guide](./LOVE_ODONTO_V2_MASTER_DEVELOPMENT_GUIDE.md) | Platform |
| 7.1 | [Master Security](./LOVE_ODONTO_V2_MASTER_SECURITY.md) | Platform |
| 7.2 | [Master Integration](./LOVE_ODONTO_V2_MASTER_INTEGRATION.md) | Platform |
| 7.3 | [Master Observability](./LOVE_ODONTO_V2_MASTER_OBSERVABILITY.md) | Platform |
| 7.4 | [Master Release Management](./LOVE_ODONTO_V2_MASTER_RELEASE_MANAGEMENT.md) | Platform |
| **7.5** | **Master Operations** (este) | Platform |

**Próximo foco do projeto:** consolidação de código — Love Odonto V3 (cutover SSOT, módulos Supabase, remoção legado IDB).

### Referências operacionais

- [`STABILITY_CHECKLIST.md`](../playbooks/STABILITY_CHECKLIST.md)
- [`LOCAL_DEV.md`](../playbooks/LOCAL_DEV.md)
- [`DEPLOY.md`](../../DEPLOY.md)
- [`architecture-audit-love-odonto-v2.md`](../reports/architecture-audit-love-odonto-v2.md)

---

*Love Odonto V2 — Este documento é a Constituição Oficial de Operações. Alterações exigem revisão explícita e bump de versão nesta seção.*
