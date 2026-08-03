# ADR-000 — Fundação da Documentação Love Odonto V2

**Status:** Aceito  
**Data:** 2026-06-29  
**Autores:** Love Odonto Tech  
**Fase:** 6.1 — Organização Oficial da Documentação

---

## Contexto

O Love Odonto V2 acumulou documentação suficiente para operação como **plataforma SaaS empresarial**:

- Constituição Técnica (Architecture)
- Constituição Funcional (Business Rules)
- Constituição do Banco (Database)
- Manual de QA
- Auditorias, módulos e playbooks dispersos em `docs/`

Documentos soltos na raiz de `docs/` dificultam onboarding, governança e crescimento controlado.

---

## Decisão

Adotar estrutura permanente oficial em `docs/`:

```
docs/
├── README.md                 # Índice oficial
├── constitution/             # Constituições (normativo máximo)
├── platform/                 # Docs técnicos transversais
├── playbooks/                # Procedimentos operacionais
├── modules/                  # Docs funcionais por módulo
├── roadmap/                  # Planejamento evolutivo
├── decisions/                # ADRs
└── reports/                  # Auditorias e validações
```

### Hierarquia oficial

```
Constitution   → normas invioláveis (salvo revisão formal)
    ↓
Decisions      → ADRs pontuais ratificados
    ↓
Platform       → especificações técnicas transversais
    ↓
Playbooks      → como executar operacionalmente
    ↓
Modules        → detalhamento funcional por domínio
    ↓
Reports        → evidências e diagnósticos (não normativos)
```

### Constituições (localização canônica)

| Documento | Path |
|-----------|------|
| Master Architecture | `docs/constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md` |
| Master Business Rules | `docs/constitution/LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md` |
| Master Database | `docs/constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md` |
| Master QA | `docs/constitution/LOVE_ODONTO_V2_MASTER_QA.md` |

---

## Como novos documentos devem ser criados

1. **Identificar a camada** (constitution / platform / playbooks / modules / roadmap / decisions / reports).
2. **Verificar** se o conteúdo já existe em Constituição — evitar duplicação normativa.
3. **Criar** apenas dentro da pasta correta — **nunca** na raiz de `docs/`.
4. **Nomear** em kebab-case ou UPPER_SNAKE para Constituições Master existentes.
5. **Linkar** a partir de [`docs/README.md`](../README.md) e README da pasta.
6. **ADRs** para decisões arquiteturais pontuais (`decisions/ADR-NNN-*.md`).
7. **Atualizar links relativos** entre documentos relacionados.

### Proibido

- Criar documento normativo fora de `constitution/` sem ADR de exceção.
- Duplicar regras de negócio fora de Business Rules.
- Colocar playbooks em `reports/` ou Constituições em `modules/`.

---

## Regras obrigatórias

| # | Regra |
|---|-------|
| R1 | **Nenhum documento fora desta estrutura** sem revisão arquitetural + ADR |
| R2 | Constituições prevalecem sobre qualquer outro `.md` |
| R3 | `docs/README.md` é índice oficial — todo doc novo deve ser referenciável a partir dele |
| R4 | Links entre docs usam **paths relativos** (portabilidade git) |
| R5 | Reports JSON permanecem em `scripts/reports/`; resumo executivo opcional em `docs/reports/` |
| R6 | `console/docs/` permanece escopo Console — referenciado, não mergeado |
| R7 | Alteração de Constituição exige incremento de versão no documento |

---

## Consequências

### Positivas

- Onboarding previsível via [`docs/README.md`](../README.md)
- Quádrupla constitucional localizada e linkada
- Crescimento documental escalável por pasta
- Separação clara normativo vs diagnóstico

### Negativas / mitigação

- Links antigos `docs/LOVE_ODONTO_*` quebram → atualizar referências no repo gradualmente
- Duplicata temporária até migrar referências externas → buscar `docs/LOVE_ODONTO` no codebase

---

## Referências

- [docs/README.md](../README.md)
- [constitution/README.md](../constitution/README.md)
- [LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md)
