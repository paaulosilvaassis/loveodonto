# Checklist jurídico — ativação gradual da UX operacional de contratos

Escopo: pacote documental + assinatura pública sobre **Contratos V1**.  
Não cobre cutover do domínio Contracts V2 nem desligamento do V1.

## Antes de incluir um tenant na allowlist de produção

| # | Item | Responsável | Status |
|---|------|-------------|--------|
| 1 | Modelos/textos de contrato e termos revisados para a clínica | Jurídico / RT | ☐ |
| 2 | LGPD e consentimentos obrigatórios mapeados na UI pública | Jurídico + Produto | ☐ |
| 3 | Política de retenção e acesso a evidências de assinatura definida | Jurídico + DPO | ☐ |
| 4 | Canal e responsabilidade pelo envio do link ao paciente definidos | Operações | ☐ |
| 5 | Menores: fluxo de responsável legal validado | Jurídico | ☐ |
| 6 | Comunicação ao paciente sobre natureza da assinatura (simples/avançada) alinhada às configs da clínica | Jurídico | ☐ |
| 7 | Procedimento de contestação / reemissão documentado | Jurídico + Suporte | ☐ |
| 8 | Confirmação de que V1 permanece disponível (sem exclusividade forçada da UX nova) | Produto | ☐ |
| 9 | Sem coleta nova de PII além do já existente no V1 | Engenharia + DPO | ☐ |
| 10 | Registro de quem autorizou a inclusão do tenant na allowlist | Admin / Jurídico | ☐ |

## Não fazer nesta fase

- Alterar schema, RLS, bucket ou ledger.
- Desligar Contratos V1.
- Ativar harness técnico `*-v2` em produção.
- Prometer validade jurídica além do tipo de assinatura configurado na clínica.

## Assinatura de liberação (por tenant)

- Tenant ID: _______________
- Clínica: _______________
- Data: _______________
- Jurídico: _______________
- Admin produto: _______________
