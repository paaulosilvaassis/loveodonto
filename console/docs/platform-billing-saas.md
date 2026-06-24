# Módulo de Cobrança SaaS — Platform Console

Documentação do fluxo de cobrança da plataforma Love Odonto. Este módulo é **exclusivo da Console SaaS** e não interfere no financeiro interno de cada clínica (contas a receber, boletos, DRE, etc.).

## Arquitetura

```
Console (5177)  ──GET/POST──►  Admin API (3001)  ──service role──►  Supabase
                                                                      ├── platform_subscriptions
                                                                      ├── platform_invoices
                                                                      ├── platform_billing_events
                                                                      ├── platform_billing_alerts
                                                                      └── tenants (status / billing_status)

App principal (5176)  ──GET──►  /internal/app/tenant-context
                                 └── bloqueia UI se status = billing_blocked
```

## Tabelas (migração `015_platform_billing_saas.sql`)

| Tabela | Função |
|--------|--------|
| `platform_subscriptions` | Assinatura SaaS por clínica (trial, ciclo, próximo vencimento) |
| `platform_invoices` | Faturas mensais da plataforma |
| `platform_billing_events` | Histórico auditável de ações e transições |
| `platform_billing_alerts` | Alertas operacionais para o time financeiro |

Colunas adicionadas em `tenants`:
- `billing_blocked_at` — quando a clínica foi bloqueada por cobrança
- `billing_blocked_reason` — ex.: `atraso_financeiro`
- `billing_unblocked_at` — último desbloqueio manual
- `billing_last_evaluated_at` — última execução de `evaluateBillingStatus`

## Fluxo de negócio

### 1. Criação da clínica (provisionamento)

Ao chamar `POST /internal/platform/tenants/provision`:

1. Cria `tenant_subscriptions` (legado, mantido)
2. Cria `platform_subscriptions` com:
   - `status = active_trial`
   - `started_at = now`
   - `trial_ends_at = now + 30 dias`
   - `next_due_date = now + 30 dias`
3. Cria primeira `platform_invoices` com vencimento em 30 dias e `status = open`
4. Registra evento `subscription.created`

### 2. Avaliação diária (`evaluateBillingStatus`)

Endpoint: `POST /internal/platform/billing/evaluate`

Para cada fatura em `open`, `due_today` ou `overdue`:

| Condição | Ação |
|----------|------|
| 5 dias antes do vencimento | Alerta `vencendo_em_5_dias` |
| No dia do vencimento | `invoice.status = due_today`, assinatura `vencido`, alerta “Cobrança vencida hoje” — **clínica continua ativa** |
| 1º ao 10º dia de atraso | `inadimplente`, badge laranja, `overdue_days` atualizado — **acesso mantido** |
| 11º dia ou mais | `bloqueio_recomendado`, alerta crítico — **sem bloqueio automático** |

### 3. Bloqueio manual

`POST /internal/platform/tenants/:tenantId/block-for-billing`

- `tenants.status = billing_blocked`
- `billing_blocked_at`, `billing_blocked_reason = atraso_financeiro`
- App principal exibe tela de suspensão e impede uso
- Dados da clínica **não são apagados**

### 4. Registro de pagamento

`POST /internal/platform/tenants/:tenantId/invoices/:invoiceId/mark-paid`

Body: `amountCents`, `paidAt`, `paymentMethod`, `notes`, `nextDueRule` (`from_payment` | `from_previous_due`)

- Fatura marcada como `paid`
- Assinatura volta para `active`
- Nova fatura `open` criada (+30 dias conforme regra)
- Alertas resolvidos
- Se bloqueada: desbloqueia automaticamente

### 5. Desbloqueio manual

`POST /internal/platform/tenants/:tenantId/unblock`

Remove bloqueio sem registrar pagamento (casos excepcionais).

## Endpoints internos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/internal/platform/billing/overview` | Dashboard e lista consolidada |
| GET | `/internal/platform/tenants/:tenantId/billing` | Detalhe da clínica |
| POST | `/internal/platform/tenants/:tenantId/invoices/:invoiceId/mark-paid` | Registrar pagamento |
| POST | `/internal/platform/tenants/:tenantId/block-for-billing` | Bloquear por inadimplência |
| POST | `/internal/platform/tenants/:tenantId/unblock` | Desbloquear |
| POST | `/internal/platform/billing/evaluate` | Executar avaliação de status |

## Console — telas

- `/billing` — Dashboard com KPIs, alertas e lista de clínicas
- `/billing/:tenantId` — Detalhe, histórico, registrar pagamento, bloquear/desbloquear

### Cores de status (UX)

| Cor | Status |
|-----|--------|
| Verde | `active`, `paid`, `active_trial` |
| Amarelo | `vencendo_em_5_dias`, `due_today`, `vencido` |
| Laranja | `inadimplente` (1–10 dias) |
| Vermelho | `bloqueio_recomendado` |
| Cinza | `billing_blocked`, `canceled` |

## Proteção no app principal

- `platformAccessService.js` — `billing_blocked` incluído em `BLOCKED_STATUSES`
- `RequireTenantAccess` — redireciona para `TenantAccessBlockedPage`
- Mensagem: *“Acesso temporariamente suspenso. Entre em contato com o suporte Love Odonto.”*

## Deploy / migração

1. Aplicar `console/supabase/migrations/015_platform_billing_saas.sql` no projeto Supabase da Platform
2. Reiniciar Admin API (`server/`)
3. Na Console, usar **Atualizar status** em Cobranças para processar clínicas existentes
4. Agendar `POST /internal/platform/billing/evaluate` (cron externo ou Railway cron) — recomendado 1x/dia

## Arquivos principais

| Arquivo | Papel |
|---------|-------|
| `console/supabase/migrations/015_platform_billing_saas.sql` | Schema |
| `server/platformBillingService.js` | Regras de negócio |
| `server/index.js` | Endpoints + hook no provisionamento |
| `console/src/pages/ConsoleBillingPage.jsx` | Dashboard |
| `console/src/pages/ConsoleBillingTenantDetailPage.jsx` | Detalhe |
| `console/src/services/platformConsoleService.js` | Cliente HTTP |
| `src/services/platformAccessService.js` | Bloqueio no app |
| `src/pages/TenantAccessBlockedPage.jsx` | Tela de suspensão |
