# Constitution — Constituições Oficiais Love Odonto V2

Esta pasta contém as **Constituições Oficiais** do Love Odonto V2 — documentos normativos de mais alta autoridade no repositório.

Em caso de conflito entre qualquer outro documento e uma Constituição, **a Constituição prevalece** até revisão formal versionada.

---

## Documentos

| Documento | Constituição | Escopo |
|-----------|--------------|--------|
| [LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md](./LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) | **Técnica** | Arquitetura, stack, multi-tenant, migrations, deploy |
| [LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md](./LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md) | **Funcional** | Regras de negócio, jornadas, permissões de domínio |
| [LOVE_ODONTO_V2_MASTER_DATABASE.md](./LOVE_ODONTO_V2_MASTER_DATABASE.md) | **Dados** | Modelo, RLS, tabelas, IndexedDB, evolução schema |
| [LOVE_ODONTO_V2_MASTER_QA.md](./LOVE_ODONTO_V2_MASTER_QA.md) | **Qualidade** | Testes, homologação, smoke, critérios de aceite |

---

## Quádrupla constitucional

```
Architecture  →  COMO construir
Business Rules →  O QUÊ o sistema faz
Database      →  COMO persistir
QA            →  COMO validar
```

---

## Referências cruzadas

- Auditoria base: [`../reports/architecture-audit-love-odonto-v2.md`](../reports/architecture-audit-love-odonto-v2.md)
- Índice geral: [`../README.md`](../README.md)
- ADR documentação: [`../decisions/ADR-000-DOCUMENTATION-FOUNDATION.md`](../decisions/ADR-000-DOCUMENTATION-FOUNDATION.md)

---

## Versionamento

Incrementar versão minor/major em cada Constituição ao alterar regras normativas. Alterações devem ser registradas na seção **Controle de revisão** de cada documento.
