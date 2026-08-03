# Repository V3 — Matriz de Feature Flags

**Phase 5.15** — Referência consolidada dos 4 domínios migrados.

---

## Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Implementado |
| ➖ | Não aplicável ao domínio |
| 🔒 | Production locked (default false + lock) |

---

## Matriz por domínio

| Capacidade | Collaborators (RH) | Clinic Profile | Agenda | Financeiro |
|------------|-------------------|----------------|--------|------------|
| **Read remoto** | `RH_SUPABASE_READ` 🔒 | `CLINIC_PROFILE_READ` 🔒 | `AGENDA_READ` 🔒 | `FINANCIAL_READ` 🔒 |
| **Read primary** | `RH_SUPABASE_READ_PRIMARY` 🔒 | `CLINIC_PROFILE_READ_PRIMARY` 🔒 | `AGENDA_READ_PRIMARY` 🔒 | `FINANCIAL_READ_PRIMARY` 🔒 |
| **Write remoto** | `RH_SUPABASE_WRITE` 🔒 | `CLINIC_PROFILE_WRITE` 🔒 | `AGENDA_WRITE` 🔒 | `FINANCIAL_WRITE` 🔒 |
| **Dual-write shadow** | ➖ (write direto) | ➖ (write direto) | ➖ (write direto) | `FINANCIAL_DUAL_WRITE` 🔒 |
| **Write primary** | ➖ | ➖ | ➖ | `FINANCIAL_WRITE_PRIMARY` 🔒 |
| **Shadow read** | `RH_SHADOW_READ` 🔒 | `CLINIC_PROFILE_SHADOW_READ` 🔒 | `AGENDA_SHADOW` 🔒 | `FINANCIAL_SHADOW` 🔒 |
| **Compare IDB/remote** | `RH_COMPARE_IDB_SUPABASE` 🔒 | `CLINIC_PROFILE_COMPARE_IDB_REMOTE` 🔒 | `AGENDA_COMPARE` 🔒 | `FINANCIAL_COMPARE` 🔒 |
| **Write compare** | ➖ | ➖ | ➖ | `FINANCIAL_WRITE_COMPARE` 🔒 |
| **IDB write disable** | `RH_IDB_WRITE_DISABLED` 🔒 | ➖ | ➖ | ➖ |
| **Synthetic stubs** | `RH_ALLOW_SYNTHETIC_STUBS` | ➖ | ➖ | ➖ |

---

## Dependências de validação (padrão)

| Flag dependente | Exige |
|-----------------|-------|
| `*_READ_PRIMARY` | `*_READ` |
| `*_WRITE` | `*_READ` (Clinic, Agenda, Financial) |
| `*_DUAL_WRITE` | `*_WRITE` + `*_READ` |
| `*_WRITE_PRIMARY` | `*_WRITE` |
| `*_COMPARE` | path read ou shadow ativo |
| `*_WRITE_COMPARE` | path write ativo |

---

## Variáveis de ambiente (Vite)

| Domínio | Prefixo env |
|---------|-------------|
| RH | `VITE_RH_*` |
| Clinic Profile | `VITE_CLINIC_PROFILE_*` |
| Agenda | `VITE_AGENDA_*` |
| Financeiro | `VITE_FINANCIAL_*` |

**Contrato Vitest:** `src/__tests__/rhTestFlagContract.js` — todas default `'false'`.

---

## Flags resolvidas para testes (staging/dev)

| Constante | Uso |
|-----------|-----|
| `RH_STAGING_SOAK_FLAGS_RESOLVED` | RH write soak |
| `CLINIC_PROFILE_READ_PRIMARY_FLAGS_RESOLVED` | Read primary |
| `CLINIC_PROFILE_WRITE_FLAGS_RESOLVED` | Write cutover |
| `AGENDA_READ_PRIMARY_FLAGS_RESOLVED` | Read primary |
| `AGENDA_WRITE_FLAGS_RESOLVED` | Write cutover |
| `AGENDA_STAGING_SOAK_FLAGS_RESOLVED` | Soak completo |
| `FINANCIAL_READ_PRIMARY_FLAGS_RESOLVED` | Read primary |
| `FINANCIAL_DUAL_WRITE_FLAGS_RESOLVED` | Dual-write wave 1 |
| `FINANCIAL_WRITE_PRIMARY_FLAGS_RESOLVED` | Primary write |
| `FINANCIAL_STAGING_SOAK_FLAGS_RESOLVED` | Soak completo |

---

## Modelo alvo para novos domínios

```
{DOMAIN}_READ=false
{DOMAIN}_READ_PRIMARY=false
{DOMAIN}_WRITE=false
{DOMAIN}_WRITE_PRIMARY=false
{DOMAIN}_DUAL_WRITE=false
{DOMAIN}_SHADOW=false
{DOMAIN}_COMPARE=false
{DOMAIN}_WRITE_COMPARE=false
```

Adotar naming **curto e consistente** (preferir padrão Agenda/Financial sobre variantes RH/Clinic).
