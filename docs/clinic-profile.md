# ClinicProfile - Base Central da Clínica

## Visão geral
O módulo “Dados da Clínica” centraliza informações institucionais e operacionais. Ele é a fonte única consumida por:
- Cabeçalhos/rodapés de relatórios e documentos.
- Comunicação (templates com variáveis da clínica).
- Integrações (NFSe, WhatsApp, SMS, webhooks).
- Presença web (links e redes).
- Auditoria de alterações (logs).

## Estrutura de dados (persistência local)
Os dados ficam no `localStorage` via `src/db` e migrações em `src/db/migrations.js`.

### clinicProfile (1 registro)
- `id`
- `pessoa` (FISICA/JURIDICA)
- `nomeMarca`
- `nomeFantasia`
- `razaoSocial`
- `nomeClinica`
- `emailPrincipal`
- `logoUrl`
- `status`
- `createdAt`, `updatedAt`

### clinicDocumentation
- `cnpj`, `ie`, `cnes`, `nire`
- `conselhoRegionalNumero`
- `alvaraPrefeituraNumero`, `alvaraAutorizacao`, `alvaraValidade`
- `vigilanciaSanitariaNumero`, `vigilanciaSanitariaValidade`
- `observacoes`

### clinicPhones
- `tipo`, `ddd`, `numero`, `principal`

### clinicAddresses
- `tipo`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `principal`

### clinicBusinessHours
- `diaSemana`, `abre`, `fecha`, `fechado`, `intervaloInicio`, `intervaloFim`

### clinicFiles
- `categoria`, `nomeArquivo`, `fileUrl`, `validade`, `createdAt`

### clinicMailServers
- `provider`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword` (ofuscado), `fromName`, `fromEmail`, `testStatus`, `lastTestAt`

### clinicCorrespondence
- `addressId`, `preferEmail`, `preferSms`, `preferWhatsApp`, `notes`

### clinicAdditional
- `notes`

### clinicNfse
- `provider`, `municipalCode`, `token`, `lastSyncAt`

### clinicIntegrations
- `whatsappApiUrl`, `smsProvider`, `webhookUrl`

### clinicWebPresence
- `website`, `instagram`, `facebook`, `googleMapsUrl`, `whatsappUrl`

### clinicLicense
- `plan`, `expiresAt`, `seats`

## Serviços (API interna)
Em `src/services/clinicService.js`:
- `getClinic()` → perfil completo.
- `getClinicSummary()` → resumo `{ nomeClinica, nomeFantasia, cnpj, logoUrl, telefonePrincipal, enderecoPrincipal }`.
- CRUD parcial para subentidades: telefones, endereços, arquivos, servidores de email.
- Atualizações: perfil, documentação, horários, correspondência, integrações, NFSe, licença, presença web.

## Integrações no app
- Menu lateral/brand usa `getClinicSummary()` via `useClinicSummary`.
- Comunicação usa variáveis da clínica em templates.
- Relatórios exportáveis incluem `nomeClinica` e `cnpj` nas linhas.

## Permissões
Somente `admin` pode editar dados.
Usuários `recepcao` e `profissional` têm acesso somente leitura.

## Validações
- CNPJ/CEP/telefone validados em `src/utils/validators.js`.
- Uploads: PNG/SVG/PDF com limite de 2MB.

## Observação sobre segredo SMTP
Como persistência é local, a senha do SMTP é armazenada ofuscada em `localStorage`.
Para produção, usar um cofre de segredos no backend.
