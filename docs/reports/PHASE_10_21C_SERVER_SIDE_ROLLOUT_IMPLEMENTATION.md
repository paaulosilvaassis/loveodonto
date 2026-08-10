# PHASE_10.21C — IMPLEMENT SERVER-SIDE ROLLOUT USING EXISTING FEATURE_FLAGS

## Status / Gate

**READY_FOR_SERVER_SIDE_VALIDATION**

> Sem migration. Sem tabela nova. Sem ativação de produção.  
> V1 intacto. Contracts V2 técnico OFF. Harness OFF.  
> SSOT: `public.feature_flags`. Browser = cache.

---

## Arquivos alterados

| Arquivo | Papel |
|---------|--------|
| `server/lib/contractsOperationalRolloutApi.js` | **novo** — handlers GET/PUT/POST |
| `server/index.js` | rotas `/internal/app/contracts/operational-rollout*` |
| `src/domain/contracts/rollout/contracts-operational-rollout-flags.ts` | **novo** — keys, payload, runtime, map |
| `src/domain/contracts/rollout/contracts-operational-mode.ts` | `tenantEnabled`, `source`, runtime SSOT |
| `src/services/contractsOperationalRolloutService.js` | API client + cache local |
| `src/pages/contratos/ContractsRolloutPage.jsx` | load/save com re-fetch servidor |
| `src/pages/BudgetsHubPage.jsx` | hydrate rollout do servidor |
| `src/__tests__/phase1021cServerSideRollout.test.js` | **novo** |
| `src/__tests__/phase1020ProductionReadiness.test.js` | async + reset cache |
| `package.json` | script `test:supabase:phase1021c` |
| Este relatório | gate / entrega |

---

## Endpoints criados

| Método | Path | Auth | Quem |
|--------|------|------|------|
| GET | `/internal/app/contracts/operational-rollout` | Bearer app | membro do tenant |
| PUT | `/internal/app/contracts/operational-rollout` | Bearer app | admin/master |
| POST | `/internal/app/contracts/operational-rollout/rollback` | Bearer app | admin/master |

### Flags SSOT

1. `contracts_operational_ux_global_enabled` — `scope_type=global`, `scope_ref=*`
2. `contracts_operational_ux_enabled` — `scope_type=tenant`, `scope_ref=<tenantId>`

Payload: `mode`, `rollbackReason`, `changedByUserId`, `changedByRole`, `changedAt`, `notes`, `audit[]`

---

## Frontend alterado

- Painel lê servidor no mount; botões só confirmam sucesso após resposta + re-fetch.
- Hub de orçamentos hidrata cache do servidor (falha → cache/V1).
- localStorage/IDB permanecem **cache**, não SSOT.

---

## Fluxo de leitura

1. App chama GET com JWT.
2. Backend resolve membership → tenant_id (ignora tenant estrangeiro).
3. Lê rows `feature_flags` (global + tenant).
4. Mapeia para state + `operationalUxEnabled`.
5. Frontend atualiza cache e UI.

## Fluxo de escrita

1. Admin/master PUT/POST.
2. Bloqueio se `body.tenantId` ≠ tenant da membership.
3. Upsert `feature_flags` (service role no server).
4. Audit em `payload.audit` + best-effort `audit_logs`.
5. Re-read e devolve estado canônico.
6. UI só toast de sucesso após re-fetch.

### Runtime

```
operationalUxEnabled =
  global.enabled &&
  tenant.enabled &&
  mode !== "ROLLED_BACK" &&
  mode !== "V1_ONLY"
```

---

## Segurança

- Cross-tenant write → 403 `TENANT_FORBIDDEN`
- Não-admin → 403
- Global ON exige env unlock + frase `ATIVAR_PRODUCAO_OPERATIONAL_UX`
- Sem wildcard de tenants
- `updated_by` de platform não é usado para actor clínico (vai no payload)

---

## Rollback

POST `/rollback`:
- tenant `enabled=false`, `mode=ROLLED_BACK`, motivo + actor
- global kill switch `enabled=false`
- V1 preservado; contratos não apagados

---

## Compatibilidade V1

V1 permanece sempre disponível. UX nova só com global∧tenant∧mode operacional.

---

## Produção ativa

**NÃO.** Defaults OFF. Nenhuma row de rollout criada automaticamente nesta implementação.  
Tenant piloto `b721c2c9-…` permanece sem ativação real até validação + frase humana futura.

---

## Testes

```bash
npm run test:supabase:phase1020   # 16/16
npm run test:supabase:phase1021c  # 7/7
```

---

## Gate final

**READY_FOR_SERVER_SIDE_VALIDATION**

Próximo: validar GET/PUT/rollback contra Admin API + Supabase (staging/prod read) sem ativar piloto.
