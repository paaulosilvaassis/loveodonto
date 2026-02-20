# Módulo de Colaboradores

## Visão geral
O módulo “Colaboradores” centraliza o cadastro de funcionários e profissionais da clínica.
Ele integra com:
- Agenda (seleção do profissional no agendamento).
- Financeiro (comissão/repasse por profissional).
- Acessos (vincular usuário e perfil).
- Relatórios (produtividade por colaborador).

## Estrutura de dados (localStorage)
Persistência em `src/db/schema.js` com migração em `src/db/migrations.js`.

### collaborators (registro principal)
- `id`
- `status` (ativo/inativo)
- `apelido`
- `nomeCompleto`
- `nomeSocial`
- `sexo`
- `dataNascimento`
- `fotoUrl`
- `cargo`
- `especialidades` (array)
- `registroProfissional`
- `email`
- `createdAt`, `updatedAt`

### collaboratorDocuments
- `collaboratorId`
- `cpf`, `rg`, `pisPasep`, `ctps`, `cnpj`
- `tipoContratacao`, `dataAdmissao`, `dataDemissao`
- `observacoes`

### collaboratorEducation
- `collaboratorId`
- `formacao`, `instituicao`, `anoConclusao`, `cursos`

### collaboratorNationality
- `collaboratorId`
- `naturalidadeCidade`, `naturalidadeUf`, `nacionalidade`

### collaboratorPhones
- `collaboratorId`
- `tipo`, `ddd`, `numero`, `principal`

### collaboratorAddresses
- `collaboratorId`
- `tipo`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `principal`

### collaboratorRelationships
- `collaboratorId`
- `estadoCivil`, `dependentes`, `contatoEmergenciaNome`, `contatoEmergenciaTelefone`

### collaboratorCharacteristics
- `collaboratorId`
- `observacoesGerais`

### collaboratorAdditional
- `collaboratorId`
- `notes`

### collaboratorInsurances
- `collaboratorId`
- `convenioNome`, `detalhes`, `validade`

### collaboratorAccess
- `collaboratorId`
- `userId`, `role`, `permissions`, `lastLoginAt`

### collaboratorWorkHours
- `collaboratorId`
- `diaSemana`, `inicio`, `fim`, `intervaloInicio`, `intervaloFim`, `ativo`

### collaboratorFinance
- `collaboratorId`
- `tipoRemuneracao`, `percentualComissao`, `valorFixo`, `proLabore`, `contaBancaria`, `observacoes`

## Serviços
Em `src/services/collaboratorService.js`:
- `listCollaborators(filters)`
- `getCollaborator(id)`
- `createCollaborator(...)`
- `updateCollaborator(...)`
- CRUD das subseções (documentos, formação, telefones, endereços, etc.)
- `updateCollaboratorAccess`, `updateCollaboratorFinance`, `updateCollaboratorWorkHours`
- `uploadCollaboratorPhoto`

## Integrações
- Agenda e Financeiro usam `getProfessionalOptions()`, que prioriza colaboradores do tipo profissional.
- Comissões calculadas em `src/services/financeService.js` considerando `collaboratorFinance`.

## Permissões
- `collaborators:write` para dados gerais.
- `collaborators:finance` para dados financeiros.
- `collaborators:access` para acessos.

## Validações
- CPF/CEP/telefone em `src/utils/validators.js`.
- Uploads: PNG/JPG com limite de 2MB.
