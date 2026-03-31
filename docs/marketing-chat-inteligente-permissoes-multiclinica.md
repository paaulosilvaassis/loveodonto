# ETAPA 7 — Permissões e Multi-clínica (Marketing > Chat Inteligente)

## Princípios

- Sem login separado: autenticação do LoveOdonto.
- Autorização por role já existente + evolução para permissões granulares.
- Isolamento rígido por `tenant_id` e `clinic_id` em todas as consultas/escritas.
- Perfis com princípio do menor privilégio.

## Matriz mínima de acesso

Legenda:
- `R` leitura
- `RW` leitura/escrita
- `-` sem acesso

| Área/Função | Administrador | Comercial | Atendimento | Financeiro | Dentista |
|---|---|---|---|---|---|
| Dashboard marketing | RW | RW | RW | R | R (limitado) |
| Caixa de entrada (conversas) | RW | RW | RW | - | - |
| Contatos/leads | RW | RW | RW | - | R (somente vínculo próprio quando aplicável) |
| Campanhas/disparos | RW | RW | R | - | - |
| Automações | RW | RW | R | - | - |
| Funis/Kanban | RW | RW | RW | - | - |
| Configurações (IA/canais/webhook) | RW | R | - | - | - |
| Relatórios e métricas | RW | R | R | R | R (escopo reduzido) |

## Mapeamento para roles atuais do LoveOdonto

- `admin` -> Administrador
- `gerente` -> Administrador (escopo operacional alto)
- `comercial` -> Comercial
- `recepcao` -> Atendimento
- `financeiro` -> Financeiro
- `profissional` -> Dentista (escopo reduzido)
- `atendimento` / `dentista` (novos aliases) -> podem ser mapeados progressivamente no RBAC.

## Regras por tela no módulo

- Dashboard: todos os perfis da matriz, com widgets condicionais por role.
- Conversas/Contatos/Campanhas/Funis: negar acesso para `financeiro` e `profissional`.
- Configurações: permitir apenas `admin` e `gerente`.
- Relatórios: liberar para todos da matriz; esconder métricas sensíveis por role.

## Regras multi-clínica

- Toda query filtra `tenant_id` obrigatório.
- Quando usuário não é master, filtrar também `clinic_id` de sessão.
- Troca de clínica (quando suportada) invalida cache e recarrega datasets.
- Não permitir referência cruzada entre clínicas em IDs de conversa/contato/campanha.

## Auditoria e trilha de segurança

- Registrar quem alterou:
  - status da conversa
  - modo IA da conversa
  - conteúdo de campanha
  - configurações de integração/webhook
- Estrutura mínima de log:
  - `actor_user_id`
  - `tenant_id`
  - `clinic_id`
  - `action`
  - `target_type`
  - `target_id`
  - `before_json`
  - `after_json`
  - `created_at`

## Regras de UI por role (implementação incremental)

- Tab-level guard no shell do módulo:
  - `financeiro` e `profissional`: focar em Dashboard/Relatórios.
  - perfis operacionais: acesso completo operacional.
- Botões de escrita devem ser ocultados quando role for somente leitura.

## Próxima evolução recomendada

- Introduzir permissões explícitas por recurso, exemplo:
  - `marketing:dashboard:read`
  - `marketing:inbox:write`
  - `marketing:campaigns:write`
  - `marketing:settings:write`
  - `marketing:reports:read`
- Sincronizar com `accessService` para abandonar gradualmente apenas `rolesAllowed`.
