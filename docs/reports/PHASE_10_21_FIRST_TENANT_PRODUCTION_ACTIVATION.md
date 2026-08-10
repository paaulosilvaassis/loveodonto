# PHASE_10.21 — FIRST TENANT CONTROLLED PRODUCTION ACTIVATION

## Status / Gate (Parte A — Preflight)

**FIRST_TENANT_ALLOWLIST_AUTHORIZED — AWAITING_PANEL_APPLY_AND_GLOBAL_UNLOCK**

> Frase humana `ATIVAR_TENANT_PILOTO_CONTRATOS` recebida em 2026-08-10 (~13:13 BRT).  
> Allowlist **autorizada** somente para o tenant piloto (ver §10).  
> Persistência do rollout é **local** (painel `/gestao/contratos/rollout` → IndexedDB/localStorage).  
> `productionGlobalEnabled` permanece **OFF** até frase `ATIVAR_PRODUCAO_OPERATIONAL_UX` + unlock env.  
> Domínio técnico Contracts V2 OFF. Harness OFF. Sem migration / cutover. Sem 2º tenant.

---

## 1. Baseline

| Item | Valor |
|------|--------|
| Pré-requisito | PHASE_10.20 `READY_FOR_PRODUCTION_ACTIVATION` |
| Commit oficial | `71997e8` — feat(contracts): add production readiness and staged rollout controls |
| Branch | `main` |
| HEAD | `71997e8542c3150995796727456b95891d2084b9` |
| origin/main | sincronizado (`0 ahead / 0 behind`) |
| Production ref | `uoepkwhqztmsjnzirpev` |
| Staging ref | `tckdjyunwmdpqmewrwvt` |
| Escopo | UX operacional (wizard/fila/package/assinatura pública) sobre V1 |
| Fora de escopo | Cutover V2, migrations, ativação global irrestrita, 2º tenant |

### Git audit

| Check | Resultado |
|-------|-----------|
| branch = main | PASS |
| HEAD contém 71997e8 | PASS (HEAD == 71997e8) |
| origin/main sincronizado | PASS |
| Artefatos 10.20 no tree | PASS (sem pending estrutural da 10.20) |
| Working tree limpa | **WARN** — dirty local **não da 10.20**: churn whitespace-only em arquivos da 10.14 + `.DS_Store` |
| git add/commit nesta fase | NÃO executado |

Arquivos locais sujos (não contaminar operação; não commitar):

- `docs/reports/PHASE_10_14_STAGING_FEATURE_FLAG_PILOT.md` (diff whitespace-only)
- `scripts/supabase/runStagingContractsV2Pilot.mjs` (diff whitespace-only)
- `src/__tests__/phase1014StagingFeatureFlagPilot.test.js` (diff whitespace-only)
- `src/domain/contracts/staging/contracts-v2-staging-pilot.ts` (diff whitespace-only)
- `.DS_Store` (untracked)

---

## 2. Tenant discovery (produção — read-only)

Ambiente: produção Supabase `uoepkwhqztmsjnzirpev`.

**Há exatamente 1 tenant ativo.** Nenhum segundo candidato.

### TENANT CANDIDATE

| Campo | Valor |
|-------|--------|
| Nome (trade) | IP ODONTOLOGIA E ESTETICA |
| Razão social | Implanprime Odontologia |
| Tenant ID | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| Clinic profile ID | `0cb6644a-2a6c-4678-8a59-4891d8b3cff3` |
| Ambiente | production |
| Status tenant | active |
| Billing | ok |
| Plano | Scale |
| Local | Itatiaiuçu / MG |
| Motivo | Única clínica em produção; histórica clínica interna/controlada do produto; equipe acessível ao Paulo; volume SaaS aparentemente baixo |
| Current rollout status | OFF (global OFF, allowlist vazia default) |

### Usuários / admin vinculados (sem PII)

| Métrica | Valor |
|---------|--------|
| `tenant_users` | 1 |
| Roles | master × 1 |
| `collaborators` (SB) | 0 |
| Recepção/CRC em `tenant_users` | **não observados** |

### Volume aproximado

Tabelas operacionais de pacientes/orçamentos/contratos **não estão no schema público Supabase de produção** (offline-first / IndexedDB). Proxies SB:

| Proxy | Resultado |
|-------|-----------|
| patients / appointments / budgets / contracts | tabelas ausentes no schema cache |
| tenant_users | 1 |
| collaborators | 0 |
| feature_flags (contracts-related) | 0 rows |

Volume clínico real: **não mensurável via Supabase** nesta consulta; indício operacional de baixo footprint SaaS.

> **Não ativado.** Aguardando confirmação humana do tenant.

---

## 3. Checklist jurídico

Fonte: `docs/contracts/LEGAL_CHECKLIST.md`  
Tenant confirmado: `b721c2c9-d924-41ee-8911-dc00c8208326` (IP ODONTOLOGIA E ESTETICA).

| # | Item | Status |
|---|------|--------|
| 1 | Modelos/textos revisados | ✅ APROVO (humano) — contratos revisados |
| 2 | LGPD / consentimentos | ✅ APROVO (humano) — LGPD correta |
| 3 | Retenção / evidências | ✅ APROVO (humano) |
| 4 | Canal de envio do link | ✅ APROVO (humano) — somente master (Paulo) neste piloto |
| 5 | Menores / responsável legal | ✅ APROVO (humano) |
| 6 | Política de assinatura | ✅ APROVO (humano) — paciente será informado |
| 7 | Contestação / reemissão | ✅ APROVO (humano) |
| 8 | V1 permanece disponível | ✅ APROVO (humano) |
| 9 | Sem PII nova além do V1 | ✅ APROVO (humano) — nenhum dado novo |
| 10 | Quem autoriza allowlist | ✅ APROVO (humano) — Paulo Assis |

### Políticas aprovadas (itens 3, 5, 7)

- Evidências retidas por **20 anos**.
- Acesso às evidências restrito a **master**, **administrador** e **responsável técnico**.
- Menores: assinatura **somente com responsável legal**.
- Contestação: exige **cancelamento da versão anterior** e **reemissão documentada**.

### Assinatura de liberação (humana)

- Tenant ID: `b721c2c9-d924-41ee-8911-dc00c8208326`
- Clínica: IP ODONTOLOGIA E ESTETICA (Implanprime Odontologia)
- Data: 2026-08-10
- Jurídico / Admin produto: Paulo Assis (master) — checklist 10/10 APROVO
- Escopo operacional: master-only; recepção/CRC não liberados

**Legal checklist: PASS (10/10)**

---

## 4. Treinamento operacional

Fonte: `docs/contracts/TRAINING_10_MIN.md`

| Check | Status |
|-------|--------|
| Doc de 10 min existe | PASS |
| Operação inicial | somente usuário **master** (humano) |
| Recepção/CRC | **não liberados** neste piloto |
| TRAINING_READY | **true** (humano; escopo master-only) |

---

## 5. Rollback (validação sem execução real)

| Check | Resultado |
|-------|-----------|
| Painel `/gestao/contratos/rollout` admin/master | PASS (rolesAllowed + guard na página) |
| V1_ONLY | PASS (testes phase1020) |
| ROLLED_BACK | PASS (testes phase1020) |
| Produção global default OFF | PASS |
| Botão rollback disponível | PASS |
| Motivo | PASS com ressalva: UI aceita vazio e aplica default textual |
| Auditoria registrada | PASS |
| Rollback não exclui contratos / não altera DB / não apaga assinaturas | PASS (modo local + V1 legível) |
| Rollback real em produção | **não executado** |

**ROLLBACK_READY = true**

---

## 6. Segurança de feature flags

| Check | Resultado |
|-------|-----------|
| `productionGlobalEnabled` default | **false** |
| Allowlist default | `[]` (sem tenants inesperados) |
| Contracts V2 technical flags 15/15 default false | PASS (phase1014 defaults) |
| `feature_flags` prod rows contracts-related | 0 |
| Harness em produção | OFF / blocked (`isContractsV2TechnicalHarnessProductionBlocked`) |
| Rotas `*-v2` para usuário operacional | isoladas (TECHNICAL_HARNESS; produção bloqueada) |

---

## 7. Testes pré-produção

| Suite | Resultado |
|-------|-----------|
| phase1016 | PASS 22/22 |
| phase1017 | PASS 16/16 |
| phase1018 | PASS 12/12 |
| phase1020 | PASS 16/16 |
| contractModuleService | PASS 4/4 |
| phase1014 defaults 15/15 | PASS |
| build (`vite build`) | PASS |

Nenhuma migration aplicada. Lint/typecheck global não executados (fora de escopo).

---

## 8. Backup / recovery

| Check | Resultado |
|-------|-----------|
| V1 fallback | PASS |
| Global pode desligar | PASS |
| Allowlist pode remover tenant | PASS |
| Rollback independente de deploy | PASS (estado local + modo) |
| Contratos não apagados pelo rollback | PASS |

**ROLLBACK_READY = true**

---

## 9. PRODUCTION_ACTIVATION_PREFLIGHT

| Campo | Valor |
|-------|--------|
| Tenant | IP ODONTOLOGIA E ESTETICA (Implanprime Odontologia) |
| Tenant ID | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| Git | PASS |
| Tests | PASS |
| Build | PASS |
| Legal checklist | PASS (10/10 humano) |
| Training | PASS (`TRAINING_READY=true`, master-only) |
| Rollback | PASS |
| V1 fallback | PASS |
| Technical V2 | OFF |
| Harness | OFF |
| Production global | OFF |
| Other tenants | OFF (único tenant; allowlist vazia) |
| Migrations | NONE |
| Infrastructure | UNCHANGED |
| **Decision** | **GO** |

---

## 10. Ativação / smoke / monitoramento

### 10.1 Autorização `ATIVAR_TENANT_PILOTO_CONTRATOS`

| Campo | Valor |
|-------|--------|
| Horário autorização | 2026-08-10 (~13:13 BRT) |
| Autorizado por | Paulo Assis (master) |
| Allowlist alvo | **somente** `b721c2c9-d924-41ee-8911-dc00c8208326` |
| Wildcard | proibido / não usado |
| Outros tenants | nenhum |
| Production global | **OFF** (não ligado nesta frase) |
| Technical V2 / Harness | OFF |
| Mecanismo | painel 10.20 — `updateProductionTenantAllowlist` |

### 10.2 Procedimento de apply no painel (obrigatório — persistência local)

1. Login como **master** em produção (`loveodonto.com.br`).
2. Abrir `/gestao/contratos/rollout`.
3. Em **Allowlist tenant-by-tenant**, colar **apenas**:
   `b721c2c9-d924-41ee-8911-dc00c8208326`
4. Clicar **Salvar allowlist**.
5. Confirmar na tela: `Allowlist (tenants): b721c2c9-…` e `Produção global: OFF`.
6. **Não** clicar em “Ligar produção global” ainda.

| Etapa | Status |
|-------|--------|
| Frase `ATIVAR_TENANT_PILOTO_CONTRATOS` | recebida |
| Allowlist autorizada (1 tenant) | SIM |
| Allowlist aplicada no browser prod | **pendente ação no painel** (localStorage/IDB) |
| Global unlock | **OFF** — aguarda `ATIVAR_PRODUCAO_OPERATIONAL_UX` + env unlock |
| Smoke produção | após global ON |
| Primeiro fluxo real | após smoke PASS |
| STABLE_2H / 24H / 48H | não iniciados |
| Rollback incidente | n/a |

---

## 11. Riscos

| Risco | Severidade | Nota |
|-------|------------|------|
| Allowlist só no browser do master | MED | estado não é servidor remoto; apply no painel é a ativação real |
| Dirty local 10.14 whitespace | LOW | não commitar |
| Volume clínico não visível no SB | MED | IndexedDB-first |
| Piloto master-only | MED | recepção/CRC fora |

---

## 12. Blockers restantes

1. ~~Tenant / legal / training / frase allowlist~~  
2. **Apply allowlist no painel** (passo a passo §10.2)  
3. **Global ainda OFF** até frase `ATIVAR_PRODUCAO_OPERATIONAL_UX` + `CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK` / `VITE_…`  
4. Smoke controlado antes de paciente real  

---

## 13. Decisão sobre expansão

**Não expandir.** FIRST TENANT only.

---

## 14. Next action

1. Paulo aplica allowlist no painel (§10.2) e confirma screenshot/leitura: global OFF + 1 tenant.  
2. Em seguida, para UX aparecer em produção: configurar unlock env e digitar `ATIVAR_PRODUCAO_OPERATIONAL_UX` (etapa explícita separada).  
3. Só então smoke fictício → 1 fluxo real supervisionado → monitor 2h/24h/48h.
