# PHASE_10.21O — STEP A TENANT UNLOCK

## Gate

**READY_FOR_GLOBAL_PILOT_UNLOCK**

> Unlock controlado **somente** do tenant piloto. Global permanece OFF.  
> `operationalUxEnabled` permanece **false** (AND global∧tenant).  
> **ETAPA B NÃO executada.** HARD STOP.

---

## Entrega pedida

| Campo | Valor |
|-------|--------|
| **HTTP** | GET before **200** · PUT **200** · GET after **200** |
| **Tenant** | `b721c2c9-d924-41ee-8911-dc00c8208326` (IP ODONTOLOGIA E ESTETICA / Implanprime) |
| **Global enabled** | **false** |
| **Tenant enabled** | **true** |
| **Operational UX enabled** | **false** |
| **Other tenants** | **0** com `contracts_operational_ux_enabled=true` |
| **V1** | **INTACT** (UX efetiva OFF) |
| **Audit** | `PUT_TENANT_ROLLOUT` @ `2026-08-10T23:40:06.913Z` · role `master` · actor presente |
| **Production clinical usage** | **NONE** (sem paciente/contrato/comunicação) |
| **Errors** | **NONE** |
| **Decision** | STEP A PASS — aguardar autorização humana para STEP B |
| **Gate** | **READY_FOR_GLOBAL_PILOT_UNLOCK** |

---

## Pré-condição (GET autenticado)

| Campo | Valor |
|-------|--------|
| Tenant resolvido | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| `productionGlobalEnabled` | false |
| `tenantEnabled` | false |
| `operationalUxEnabled` | false |
| `source` | `feature_flags` |

## Mutação (PUT) — somente tenant

Payload (sem `productionGlobalEnabled`):

```json
{
  "tenantId": "b721c2c9-d924-41ee-8911-dc00c8208326",
  "tenantEnabled": true,
  "mode": "OPERATIONAL_UX",
  "notes": "PHASE_10.21O STEP A — tenant pilot unlock only; global remains OFF"
}
```

Flag escrita:

- `contracts_operational_ux_enabled`
- `scope_type=tenant`
- `scope_ref=b721c2c9-d924-41ee-8911-dc00c8208326`
- `enabled=true`
- `mode=OPERATIONAL_UX`

Global:

- row `contracts_operational_ux_global_enabled` / `scope_type=global` / `scope_ref=*` criada/atualizada com **`enabled=false`** (default OFF; não ativada).

## Re-fetch oficial

| Campo | Valor |
|-------|--------|
| `productionGlobalEnabled` | **false** |
| `tenantEnabled` | **true** |
| `operationalUxEnabled` | **false** |
| `mode` | `OPERATIONAL_UX` |
| `source` | `feature_flags` |

## Confirmações

| Check | Resultado |
|-------|-----------|
| V1 intacto | PASS (UX efetiva OFF) |
| Nenhuma outra clínica habilitada | PASS |
| Sem comunicação externa | PASS |
| Sem alteração clínica | PASS |
| Sem criação de contrato/paciente | PASS |
| STEP B (global ON) | **NÃO EXECUTADA** |

---

## HARD STOP

Aguardando autorização humana de Paulo para a **ETAPA B** (global kill switch).

Não ligar `contracts_operational_ux_global_enabled`.
Não criar paciente real.
Não criar contrato real.
