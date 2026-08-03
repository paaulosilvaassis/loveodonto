# Template — Relatório Técnico de Phase (Repository V3)

Copie este template para `docs/reports/PHASE_{NUM}_{DOMAIN}_{NAME}.md`.

---

```markdown
# Phase {N.M} — {Título}

**Status:** CONCLUÍDA | EM ANDAMENTO | BLOQUEADA  
**Baseline testes:** {X pass | Y skip}  
**Regressão final:** {X pass | Y skip} ({delta})  
**Commit:** não realizado | {hash}

---

## 1. Objetivo

{1–3 frases}

## 2. Escopo

| In scope | Out of scope |
|----------|--------------|
| ... | ... |

## 3. Auditoria dos métodos / operações

| Método | Authority | Wired | Flags necessárias |
|--------|-----------|-------|-------------------|
| ... | IDB / Remote | ✅/❌ | ... |

## 4. Arquitetura implementada

{Diagrama ou fluxo}

## 5. Feature flags

| Flag | Default | Produção lock |
|------|---------|---------------|
| ... | false | ✅ |

## 6. Dual Write / Shadow / Primary / Hydrate

{Descrever o que foi ativado e o que ficou preparado}

## 7. Idempotência e audit

{Se aplicável}

## 8. Fallback e rollback

{Comportamento em falha remota; rollback por flag}

## 9. Admin API

| Método | Rota | Tabela |
|--------|------|--------|
| GET | /internal/app/... | ... |

## 10. Arquivos criados

| Arquivo |
|---------|
| ... |

## 11. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| ... |

## 12. Testes adicionados

| Arquivo | Testes |
|---------|--------|
| ... |

## 13. Resultado da regressão

\`\`\`
Test Files  X passed
Tests       Y passed | Z skipped
\`\`\`

## 14. Riscos residuais

1. ...
2. ...

## 15. Recomendações — próxima phase

1. ...
2. ...

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅/❌ |
| Banco não alterado | ✅/❌ |
| Migrations não executadas | ✅/❌ |
| Supabase remoto não alterado | ✅/❌ |
| Storage remoto não alterado | ✅/❌ |
| IndexedDB preservado | ✅/❌ |
| Frontend idêntico (flags OFF) | ✅/❌ |
| Commit não realizado | ✅/❌ |

---

**FIM Phase {N.M} — aguardar aprovação formal.**
```

---

## Seções opcionais

- **Soak Validation** — métricas, divergências, pendências operador
- **Matriz método → Repository** — para write cutover
- **Correções** — bugs encontrados na fase
