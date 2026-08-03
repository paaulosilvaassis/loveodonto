# CQRS Staging Preflight Execution Playbook

**Phase 8.7** — complemento do [CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md](./CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md)

**Preflight Execution ≠ Stage Activation**

---

## Permitido nesta fase

- Auditoria estática local
- Resolução local de flags (defaults OFF)
- Validação de contratos de ambiente / autorização / tenants
- Validação de ordem de flags, tenant scope, rollback, evidence requirements
- Simulação estrutural local (`local-simulated`) para Read Model readiness — **não** é evidência de staging remoto
- Regressão completa (`npm test`)
- Coleta de evidências apenas do que foi executado
- Inspeção remota **somente leitura** se e somente se: `environment.authorized` + `humanApproval.approved` + ferramenta read-only garantida

## Proibido

- Ativar flags
- Soak remoto / stages de ativação
- Alterar env vars, staging, produção, banco, Supabase, Storage
- Migrations / seeds / tenants remotos
- Mutar HTTP / workers / cron / UI
- Inventar autorização, ambiente, tenant, host ou projectRef
- Alterar `pending` → `approved`
- Confundir `local-simulated` com evidência real de staging

---

## Como configurar ambiente

1. `environmentType: staging` (ou `local-simulated` só para testes estruturais)
2. `authorized: true` + `authorizedBy` + `authorizedAt`
3. Rejeitar production projectRef
4. Não usar só `NODE_ENV`

## Como registrar aprovação

- Contrato `StagingHumanAuthorization` com `status: approved`
- Exige `approvedBy` + `approvedAt` reais
- Sem autoaprovação

## Como selecionar tenants

- Lista explícita `pilotTenantIds` (mín. 1)
- `controlTenantIds` opcional e isolado
- Sem all-tenants; sem IDs inventados

## Como executar preflight

```js
import {
  executeControlledStagingPreflight,
  buildControlledStagingPreflightReport,
  prepareLocalSimulatedReadModelReadiness,
} from '@/domain-events/staging-activation';

// Opcional: readiness estrutural local (NÃO staging remoto)
// prepareLocalSimulatedReadModelReadiness(FLAGS_ON);

const report = buildControlledStagingPreflightReport({
  executionMode: 'local-static',
  regression: { /* injetar após npm test */ },
});
```

## Interpretar blockers

| Sintoma | Recommendation típica |
|---------|----------------------|
| auth pending | `preflight_blocked_awaiting_human_approval` |
| env blocked | `preflight_blocked_awaiting_environment` |
| tenants ausentes | `preflight_blocked_awaiting_tenant_selection` |
| regressão falhou / produção | `preflight_failed` |
| tudo OK + auth/env/tenants | `preflight_passed_awaiting_stage_activation_authorization` |

## Quando parar

- Sempre que produção for detectada
- Sem autorização humana
- Sem staging autorizado para qualquer ação remota
- Sem promoção para Stage 1 sem nova autorização explícita (Phase 8.8)

## Flags

**Nenhuma flag pode ser ligada na Phase 8.7.**

API: `executeControlledStagingPreflight` · `buildControlledStagingPreflightReport` · `inspectControlledStagingPreflight`
