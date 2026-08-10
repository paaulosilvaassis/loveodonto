# Plano de emergência e rollback imediato

## Quando acionar

- Taxa de conclusão da assinatura pública &lt; 70% com volume ≥ 5 aberturas
- Bug crítico que impede geração/assinatura
- Incidente de segurança ou vazamento suspeito
- Equipe operacional não consegue operar sem suporte contínuo
- Pedido explícito do jurídico / admin da clínica

## Ação imediata (≤ 2 minutos)

1. Admin/master abre `/gestao/contratos/rollout`
2. Preenche o motivo
3. Clica **Executar rollback imediato**
4. Confirma que o modo passou a `ROLLED_BACK`
5. Confirma que **produção global** está OFF

Efeito esperado:

- CTA “Gerar/Continuar contrato” some do hub
- Fluxo clássico V1 (seção Contratos do orçamento) permanece
- Contratos já gerados continuam legíveis
- Flags de domínio Contracts V2 **não** são alteradas por este botão (já devem estar OFF em produção)

## Comunicação

| Quem | Mensagem |
|------|----------|
| Recepção / CRC | “Usem Abrir orçamento → Contratos (modo clássico) até novo aviso.” |
| Suporte | Abrir incidente com motivo do painel + prints de métricas |
| Engenharia | Revisar alertas em Rollout → Métricas; não reativar sem RCA |

## Reativação

1. RCA documentado
2. Correção validada em staging
3. Checklist jurídico revalidado se o incidente for legal/compliance
4. Admin: **Habilitar UX operacional** no painel
5. Em produção: manter allowlist restrita; só ampliar após 48h estáveis

## O que NÃO fazer no incidente

- Não dropar dados
- Não desligar o módulo V1 inteiro
- Não “corrigir” com migration de emergência sem revisão
- Não reativar produção global sem unlock + confirmação
