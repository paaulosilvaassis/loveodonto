# PHASE_10.22A — TENANT_B discovery (read-only)

**Data:** 2026-08-28  
**Modo:** READ-ONLY  
**Projeto produção:** `uoepkwhqztmsjnzirpev` (`https://uoepkwhqztmsjnzirpev.supabase.co`)  
**Mutations:** ZERO (nenhum PUT de rollout, allowlist, contrato, request, e-mail, PDF ou assinatura)

---

## Gate

**BLOCKED_WAITING_REAL_SECOND_PRODUCTION_TENANT**

Não há TENANT_B real em produção. A 10.22B (enablement) **não** está autorizada.

---

## Método

GET Supabase REST em `public.tenants`, `public.tenant_users` e `public.feature_flags` (somente leitura).  
Nenhum INSERT/UPDATE/DELETE. Staging **não** foi usado como candidato.

---

## TENANT_A (histórico — não é TENANT_B)

| Campo | Valor |
| --- | --- |
| ID | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| Status | `active` |
| Billing | `ok` / plano `Scale` |
| Clínica | Implanprime Odontologia (Itatiaiuçu / MG) |
| Papel 10.22 | historical production pilot tenant |
| `tenant_users` | 2 ativos (`master` × 1, `profissional` × 1) |
| Flag tenant `contracts_operational_ux_enabled` | `true` (somente este `scope_ref`) |
| Flag global `contracts_operational_ux_global_enabled` | `true` (inalterada nesta fase) |
| Piloto 10.21 | CTR-2026-00005 — CLOSED / PASS |

TENANT_A **não** é candidato a expansão: já é o piloto. 10.22 pede um segundo tenant.

---

## Descoberta

| Métrica | Valor |
| --- | --- |
| Tenants em produção (todas as rows) | **1** |
| Tenants `status=active` excluindo TENANT_A | **0** |
| Candidatos TENANT_B | **[]** |
| Outros tenants com UX operacional ON | **0** |

Não existe segundo UUID de clínica no projeto de produção. Não há tenant suspenso/trial oculto na mesma tabela.

Clínicas de **staging** (`tckdjyunwmdpqmewrwvt`) e seeds fictícios **não** são TENANT_B. IDs de export RH / staging (ex. comentário `b2f95268-…` no seed) **não** foram promovidos: ou não existem em produção, ou referem a mesma clínica Implanprime, não a um segundo estabelecimento.

---

## Elegibilidade do padrão 10.22 (não aplicável — sem candidato)

O briefing exige cenário real compatível com o piloto (adulto, profissional atribuído, CRO, version, freeze, 1+1, remoto+e-mail, hardening CO).

Essa checagem clínica **só faz sentido depois** de existir um tenant SaaS distinto. Dados de paciente/CRO/atendimento do piloto vivem no IndexedDB da origem `loveodonto.com.br`, não numa tabela `tenants` de segundo clinic.

| Requisito | Resultado 10.22A |
| --- | --- |
| Paciente adulto | N/A — sem TENANT_B |
| Profissional clínico explícito + CRO | N/A |
| `contract.version` / freeze | N/A |
| 1 PROFESSIONAL + 1 PATIENT remoto | N/A |
| Hardening CO em novos csigs/PDFs | Código LIVE (10.21CO); não exercitado em segundo tenant |
| Menor / guardian / cancel / rotate | Continua BLOQUEADO |

---

## O que permanece bloqueado (inalterado)

1. menor / guardian  
2. responsável legal  
3. cancel/reissue operacional real  
4. link rotation/revocation em incidente  
5. rollout global (além do kill switch já ligado para o piloto)  
6. habilitação automática de novos tenants  
7. cross-tenant fallback  
8. backfill CTR-00003/00004/00005  
9. regeneração de PDFs históricos  
10. alteração dos pilotos 00003/00004/00005  

**Não feito nesta fase:** allowlist de TENANT_B, contrato, request/link/token, e-mail, assinatura, PDF.

---

## Implicação para 10.22B

A autorização humana de enablement **não pode** ocorrer: não há alvo legítimo.

Caminhos honestos:

1. Provisionar/ativar **uma clínica SaaS real distinta** em produção (não seed, não staging, não clone do TENANT_A) e reexecutar 10.22A.  
2. Adiar expansão até existir esse tenant.  
3. **Não** reutilizar Implanprime como “TENANT_B”.

---

## Rollout flags (somente observação)

| Flag | Escopo | enabled | Mutação 10.22A |
| --- | --- | --- | --- |
| `contracts_operational_ux_global_enabled` | global `*` | true | NENHUMA |
| `contracts_operational_ux_enabled` | tenant TENANT_A | true | NENHUMA |

`GLOBAL_ROLLOUT` no sentido de **todos os tenants** permanece BLOCKED (não há outros tenants; não se ligou allowlist nova).

---

## Conclusão (auditoria 10.22A)

`TENANT_B = UNDEFINED`  
`TENANT_B_ELIGIBLE = NO`  
`ENABLEMENT = NOT_AUTHORIZED`  
`PHASE_10.22B = DO_NOT_START`

---

## Estado formal da PHASE 10.22 (após 10.22A.1)

```text
PHASE_10_22_STATUS = WAITING_EXTERNAL_PREREQUISITE
PREREQUISITE = REAL_SECOND_PRODUCTION_TENANT
FINAL_GATE = PHASE_10_22_SAFELY_PARKED
GLOBAL_ROLLOUT = BLOCKED
PHASE_10.22B = DO_NOT_START
```

### TENANT_B_MUST_BE

Quando o pré-requisito existir, o candidato precisa ser **todos** os itens abaixo:

- clínica SaaS real;
- produção (`uoepkwhqztmsjnzirpev`);
- distinta do TENANT_A (`b721c2c9-d924-41ee-8911-dc00c8208326`);
- ativa;
- com membership legítimo;
- com profissional clínico elegível;
- com paciente adulto;
- com cenário legítimo de atendimento/orçamento.

### O que NÃO conta como TENANT_B

- tenant artificial / seed;
- staging (`tckdjyunwmdpqmewrwvt`);
- clone ou reuso de Implanprime;
- qualquer UUID inventado para “preencher” a expansão.

### NEXT_STEP quando o pré-requisito existir

`PHASE_10.22A_REVALIDATION`

Reexecutar o preflight 10.22A (read-only) contra o novo estado de produção.  
**Não** iniciar 10.22B diretamente. Enablement só após revalidação + aprovação humana.
