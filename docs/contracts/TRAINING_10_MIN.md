# Treinamento rápido — Pacote documental (10 minutos)

Público: recepção, CRC/comercial, administrador, dentista (visão).

## Objetivo

Gerar e acompanhar o pacote documental a partir de orçamento aprovado, sem jargão técnico.

## Roteiro (10 min)

| Min | Tópico | Onde |
|-----|--------|------|
| 0–1 | Orçamento aprovado | `/orcamentos` |
| 1–4 | Gerar / Continuar contrato | CTA no card → assistente (7 passos) |
| 4–6 | Pacote (contrato, TCLE, LGPD) | Mesmo assistente / painel clínico |
| 6–8 | Fila de assinaturas | `/gestao/contratos/fila` |
| 8–9 | Pendência e “Como resolver” | Fila → atalho “Com pendência” |
| 9–10 | Paciente assina no celular | Link público (simulado em staging) |

## Regras de ouro

1. Só gerar após orçamento **aprovado** e dados mínimos do paciente.
2. Se o assistente pedir contato, complete telefone/e-mail antes de enviar.
3. Status na fila: em português (ex.: “Aguardando assinatura”, “Com pendência”).
4. Em dúvida, use a Fila — não o harness técnico `*-v2`.
5. Rollback / modo clássico: admin em `/gestao/contratos/rollout`.

## O que NÃO treinar nesta sessão

- Telas `modelos-v2`, `instancias-v2`, ledger, storage técnico.
- Ativação de produção ou flags de domínio Contracts V2.

## Checklist pós-treinamento

- [ ] Conseguiu gerar ou continuar um contrato fictício
- [ ] Localizou o item na fila
- [ ] Entendeu o hint de pendência
- [ ] Sabe para quem pedir ajuda (admin / suporte interno)
