# Phase 7.2 — Financial Domain Event Adoption (Wave A)

**Data:** 2026-07-10  
**Baseline anterior:** 1629 pass | 1 skip (Phase 7.1)  
**Regressão Phase 7.2:** **1647 pass | 1 skipped** (+18)

**Commit:** não realizado

---

## 1. Auditoria dos fluxos financeiros

| Fluxo | Service | Side-effects | Dual/Primary | Domain Event |
|-------|---------|--------------|--------------|--------------|
| `createReceivable` | `receivablesService` | IDB `accountsReceivable` + commission best-effort | `scheduleFinancialDualWriteCreateReceivable` | `RECEIVABLE_CREATED` |
| `updateReceivable` | `receivablesService` | IDB update | `scheduleFinancialDualWriteUpdateReceivable` | `RECEIVABLE_UPDATED` |
| `createPayable` | `payablesService` | IDB + parcelas recorrentes filhas | `scheduleFinancialDualWriteCreatePayable` | `PAYABLE_CREATED` (só pai) |
| `updatePayable` | `payablesService` | IDB update | `scheduleFinancialDualWriteUpdatePayable` | `PAYABLE_UPDATED` |
| `deletePayable` | `payablesService` | IDB splice | `scheduleFinancialDualWriteDeletePayable` | `PAYABLE_DELETED` |
| `createFinancingProposal` | `financingsService` | IDB + timeline log | `scheduleFinancialDualWriteCreateFinancing` | `FINANCING_CREATED` |
| `updateFinancingTerms` | `financingsService` | IDB + timeline + clinical sync | `scheduleFinancialDualWriteUpdateFinancing` | `FINANCING_UPDATED` |
| `registerReceivablePayment` | `receivablesService` | IDB payment + receivable status + financing refresh | **sem** dual-write ativo | `PAYMENT_RECEIVED` |
| `registerFinancingPayment` | `financingsService` | chama `registerReceivablePayment` | herda evento | **não** republica |
| `payPayable` | `payablesService` | IDB paid + cash txn | sem dual-write de payment | **legado** (saída ≠ RECEIVED) |
| `receiveInstallment` | stub adapter only | — | não ativado | **legado** |

**Integrações:** orçamento clínico pode criar financing/receivables via services canônicos → herdam eventos. Caixa/DRE/dashboard não consomem Domain Events.

---

## 2. Pontos canônicos de publicação

Único ponto por operação: **service financeiro após IDB ok**, fora de `financialWriteAdapter`.

Motivo: dual/primary compartilham o adapter; publicar no service = 1 evento por operação lógica.

---

## 3. Eventos adotados

Registry estendido (necessidade comprovada pela Phase 7.2) + existentes:

| Evento | Operação |
|--------|----------|
| `RECEIVABLE_CREATED` | createReceivable |
| `RECEIVABLE_UPDATED` | updateReceivable |
| `PAYABLE_CREATED` | createPayable (título pai) |
| `PAYABLE_UPDATED` | updatePayable |
| `PAYABLE_DELETED` | deletePayable |
| `FINANCING_CREATED` | createFinancingProposal |
| `FINANCING_UPDATED` | updateFinancingTerms |
| `PAYMENT_RECEIVED` | registerReceivablePayment |

`PAYMENT_REGISTERED` **não** existe no registry → não criado; usa-se `PAYMENT_RECEIVED`.

---

## 4. Fluxos de pagamento

| Fluxo | Decisão |
|-------|---------|
| `registerReceivablePayment` | **Integrado** — ponto canônico único, registry `PAYMENT_RECEIVED`, sem dual-write paralelo |
| `registerFinancingPayment` | **Herdado** — chama `registerReceivablePayment` (1 evento) |
| `payPayable` | **Legado** — pagamento de saída; não mapear para `PAYMENT_RECEIVED` |
| `receiveInstallment` | **Legado** — stub não ativado no adapter |

---

## 5. Payloads definidos

Mínimos: ids, tenantId, amount/dueDate/status, changeSet sanitizado, originType/originId para payments. Sem `payer_data`, cartão, conta bancária ou documentos.

---

## 6. Sanitização

`buildChangeSet` ignora objetos aninhados e chaves `payer_data` / `card` / `bank_account` / `document`.

---

## 7. Correlation e causation

- **Preserva** `correlationId` recebido
- **Gera** `de-corr-{uuid}` quando ausente — **não** usa aggregateId como correlation permanente (follow-up 7.1)
- `aggregateId` = receivable/payable/financing/payment id
- `causationId` propagável via meta

---

## 8. Deduplicação

Opt-in Toolkit com `eventId` estável por operação (`de-recv-created-{id}`, etc.). Sem persistência.

---

## 9. Audit

Com `DOMAIN_EVENTS` + `DOMAIN_EVENT_AUDIT`: `prepared` / `published` / `skipped` / `rejected`. Sem banco.

---

## 10. Tratamento de falhas

`queueMicrotask` + catch → log DEV; sem rollback IDB; sem reexecução de cobrança/pagamento.

---

## 11. Ausência de consumers

Nenhum subscriber em services financeiros; `financialWriteAdapter` sem Domain Events; sem caixa/DRE/WhatsApp/IA/webhooks.

---

## 12. Arquivos criados

| Arquivo | Papel |
|---------|-------|
| `src/services/financialDomainEventPublisher.js` | Publisher Wave A |
| `src/__tests__/financialDomainEventsAdoption.test.js` | Testes |
| `docs/reports/PHASE_7_2_FINANCIAL_DOMAIN_EVENT_ADOPTION_WAVE_A.md` | Este relatório |

---

## 13. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/domain-events/domainEventTypes.ts` | Aggregates + event names financeiros |
| `src/domain-events/domainEventRegistry.ts` | +6 eventos financeiros |
| `src/services/receivablesService.js` | Wiring create/update/payment |
| `src/services/payablesService.js` | Wiring create/update/delete |
| `src/services/financingsService.js` | Wiring create/update terms |
| `src/__tests__/domainEventsFoundation.test.js` | Registry length 22 |
| `docs/reports/README.md` | Índice 7.2 |

---

## 14. Testes adicionados

Receivable/Payable/Financing/Payment · flags OFF · falha isolada · correlation gerada ≠ aggregateId · causation · dedup · sem dual/primary dup · audit · guards · sem consumers · payload sanitizado.

---

## 15. Resultado da regressão

```text
Test Files  156 passed (156)
Tests       1647 passed | 1 skipped (1648)
```

Nenhuma regressão. Baseline 7.1: 1629 → 7.2: 1647 (+18).

---

## 16. Riscos residuais

1. Financing sem `tenant_id` nativo — tenant resolvido via user/meta.
2. Parcelas recorrentes de payable não emitem evento (só pai) — by design.
3. `createReceivable` via aprovação de financing gera N× `RECEIVABLE_CREATED` (1 por parcela) — esperado.
4. `payPayable` / `receiveInstallment` ainda sem Domain Event.

---

## 17. Recomendações para Phase 7.3 — Agenda Domain Event Adoption (Wave A)

1. Auditar `createAppointment` / confirm / update / cancel.
2. Publicar `APPOINTMENT_CREATED` / `APPOINTMENT_CONFIRMED` no service canônico (não no agendaWriteAdapter).
3. Correlation de operação (não appointmentId permanente).
4. Sem consumers (WhatsApp/CRM/Journey).

---

## 18. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico (flags OFF) | ✅ |
| Nenhum consumer funcional criado | ✅ |
| Commit não realizado | ✅ |

---

**Phase 7.2 concluída. Aguardando aprovação formal para Phase 7.3.**
