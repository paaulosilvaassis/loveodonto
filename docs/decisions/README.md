# Decisions — Architecture Decision Records (ADRs)

Registro de **decisões arquiteturais e organizacionais** pontuais do Love Odonto V2.

ADRs **complementam** as Constituições — não as substituem. Em conflito não resolvido, prevalece a Constituição.

---

## Índice de ADRs

| ADR | Título | Status |
|-----|--------|--------|
| [ADR-000](./ADR-000-DOCUMENTATION-FOUNDATION.md) | Fundação da documentação V2 | Aceito |

---

## Formato ADR

```
docs/decisions/ADR-{NNN}-{TITULO-KEBAB-CASE}.md
```

Cada ADR deve conter: **Contexto**, **Decisão**, **Consequências**, **Status** (Proposto | Aceito | Depreciado | Substituído).

---

## Quando criar um ADR

- Escolha de tecnologia ou padrão duradouro  
- Mudança organizacional (estrutura docs, branching)  
- Trade-off arquitetural com impacto multi-módulo  
- Depreciação de padrão legado

Não criar ADR para detalhes já cobertos integralmente pelas Constituições.
