# PHASE_10.21AL — Controlled production pilot

Data: 2026-08-13  
Ambiente: https://loveodonto.com.br/  
Tenant: Implanprime Odontologia (`b721c2c9-d924-41ee-8911-dc00c8208326`)

## Estado de partida (já validado no Checkpoint 5)

- Appointment: `appt-0181d36a-c8a5-44af-b635-4389e52c7662` (`em_atendimento`, 1 row)
- ClinicalAppointment: `clinical-9df8fac3-12e3-4b59-bf45-616880d1190b`
- Budget: `budget-d8069b7e-11bd-45e5-9a80-892b4d604b84` / `ORC-001` / `RASCUNHO` / total 0 / procedures 0
- Sem duplicatas, sem contratos, sem package, sem assinatura

## Procedimento escolhido (catálogo real — ainda NÃO adicionado)

A Base de Preços `Implanprime` tem 163 procedimentos ativos. Foi escolhido um item clínico simples, preço > 0 (aprovação exige total > 0) e fora de Ortodontia (evita TCLE/manutenção extra):

| Campo | Valor |
| --- | --- |
| Procedimento | Aplicação topica de fluor |
| ID | `procedure-196c3741-ee8d-4fe7-8001-1775cb8cf515` |
| Especialidade | Prevenção |
| Status | ativo |
| Valor | R$ 150,00 |
| Quantidade | 1 |
| Total | R$ 150,00 |

Não foi usada a consulta inicial (R$ 0,00) porque `validateBudgetForApproval` rejeita valor final ≤ 0.

## O que foi executado nesta sessão

- Catálogo e cadastro da clínica lidos em read-only.
- Tentativa de dirigir a aba live `/atendimento-clinico/appt-0181d36a-…`.
- Nenhum procedimento adicionado.
- Nenhum orçamento aprovado.
- Nenhum contrato/TCLE/LGPD/package/assinatura.
- Nenhuma mutation IndexedDB além do que o Checkpoint 5 já tinha persistido.
- Zero comunicação externa, zero deploy, zero migration/RLS/rollout.

## HARD STOP — dois bloqueios reais

### 1) Não foi possível executar o fluxo na aba live

O Chrome em produção está na tela correta, mas:

- JavaScript via AppleScript está desativado.
- Accessibility não enxerga os botões do DOM.
- CDP (`9222`) recusou conexão na instância já aberta.
- Habilitar “Permitir o JavaScript do Eventos da Apple” é necessário para clicar/gravar pelo app real (senão o `cachedDb` da aba aberta sobrescreve qualquer escrita externa no IndexedDB).

Foi aberto o Console do Chrome uma vez (menu Desenvolvedor). Pode ser fechado.

### 2) Contrato não consegue finalizar sem dado humano da clínica

`clinicDocumentation`:

- `responsavelTecnico` = vazio
- `croResponsavelTecnico` / `conselhoRegionalNumero` = vazio

O validador de contrato exige `#responsavelTecnicoNome` e `#responsavelTecnicoCRO` a partir do cadastro da clínica (não do dentista do atendimento). Inventar CRO é proibido.

Juliana (`col-5e1c66f5-342a-4ac8-936c-0eb603df73e8`) também não tem CRO no cadastro de colaborador.

`contractTemplates` = 0 no snapshot; o seed pode ocorrer ao abrir o módulo, não é o blocker atual.

## Retomada

1. Preencher no cadastro da clínica: nome do responsável técnico + CRO reais.
2. No Chrome: Visualização → Desenvolvedor → Permitir o JavaScript do Eventos da Apple.
3. Manter a aba do atendimento piloto aberta.
4. Retomar o modo acelerado: planejamento (flúor R$ 150) → orçamento à vista → aprovar → contrato/documentos/package → parar antes de WhatsApp/assinatura/aceite.

## Gate

`BLOCKED_LIVE_TAB_DRIVE_AND_MISSING_RESPONSAVEL_TECNICO_CRO`
