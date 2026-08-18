# PHASE_10_CONTRACTS_ARCHITECTURE

**Módulo:** Contratos e Consentimentos — Love Odonto  
**Status:** APROVADA COMO ARQUITETURA-ALVO DE PRODUTO  
**Baseline:** `main` @ `b95eff1`  
**Infraestrutura:** congelada — este documento não autoriza migration, RLS, storage, deploy ou cutover  
**Autoridade normativa:** [Master Business Rules §8](../constitution/LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md)  
**Domínio de código:** `src/domain/contracts/` (V2) · runtime operacional atual: IndexedDB V1  
**Não substitui:** Constituições. Em conflito, prevalece a Constituição.

---

## 0. Veredito

O Love Odonto já gera, envia e assina contratos no fluxo clínico. O que falta não é outro stack de infraestrutura: é **um módulo de produto único**, no qual contrato, consentimento, LGPD, odontograma, orçamento, financeiro e prontuário compartilham o mesmo grafo jurídico.

Este documento define esse módulo.

| Decisão | Valor |
|---------|--------|
| Unidade jurídica | `Contract` + `ContractVersion` imutável após lock |
| Unidade clínica operacional | `ContractPackage` (orçamento → pacote de documentos) |
| Contratos e consentimentos | O mesmo agregado, discriminado por `documentType` |
| Assinatura | `SignatureEnvelope` + manifesto criptográfico do pacote |
| Fonte de verdade-alvo | Domínio V2 (`src/domain/contracts/`) |
| Superfície de clínica | Jornada única (atendimento / orçamento / paciente) — **não** as telas `*-v2` |
| Telas `*-v2` | Harness técnico, nunca jornada da clínica |
| Efeito financeiro canônico | Confirmado em `contract.signed` (orçamento aprovado apenas provisiona) |
| Validade jurídica | Declarada pelo **nível de assinatura** + evidências; nunca implícita |

---

## 1. Arquitetura

### 1.1 Problema de produto

Hoje coexistam três mundos:

1. **Contratos V1** — IndexedDB, hashtags, PDF no cliente, link `/assinatura/:token`. É o que a clínica usa.
2. **Contratos V2** — domínio tipado, versões, envelopes, ledger, storage privado, manifesto de pacote. É o que o sistema já modelou, em grande parte atrás de flags e harness.
3. **Documentos clínicos / TCLE** — `documentTemplates` + `documentRecords`, paralelos ao contrato, sem hash jurídico no mesmo envelope.

O módulo definitivo **absorve os três** em um único fluxo: orçamento aprovado abre um pacote documental; cada item do pacote é um `Contract`; a cerimônia de assinatura prova o pacote inteiro.

### 1.2 Princípios

1. **Um documento, uma versão locked, um hash.** Conteúdo assinado não se edita.
2. **Pacote é a unidade da clínica; contrato é a unidade jurídica.** A recepção trabalha o pacote; o ledger registra cada documento.
3. **Snapshot no lock, nunca no clique de “gerar”.** Rascunho pode mutar. Após `PENDING_SIGNATURES`, o conteúdo é gelo.
4. **Efeitos laterais só depois de `SIGNED` + evidência.** Financeiro, prontuário, CRM e jornada consomem eventos, não o clique da UI.
5. **Assinatura não é validade automática.** O sistema declara o nível (simples / avançada / qualificada) e guarda a prova. Texto jurídico da clínica é responsabilidade do tenant.
6. **LGPD não é checkbox enfeite.** É documento do pacote **e** aceite por signatário, com finalidade explícita.
7. **Master SaaS não lê conteúdo clínico.** Break-glass exige trilha e permissão elevada.
8. **V1 permanece até cutover explícito por tenant.** Esta arquitetura é o alvo; não apaga o operacional atual.

### 1.3 Camadas

```text
┌─────────────────────────────────────────────────────────────┐
│  Superfície de produto                                       │
│  Atendimento · Hub orçamentos · Paciente · Prontuário        │
│  Shell /gestao/contratos (fila, pendentes, modelos, auditoria)│
│  Portal público de assinatura (pacote)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │ application services (tenant-scoped)
┌───────────────────────────▼─────────────────────────────────┐
│  Domínio V2                                                  │
│  Package · Contract · Version · Template · Envelope          │
│  Policy · Files · Audit operacional · Ledger jurídico        │
│  State machine · validators · signed-effects policy          │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Persistência         Object storage      Domain events
   (Postgres V2 /       (PDF, evidência,    contract.* →
    IDB V1 até cutover)  anexos, manifesto)  financeiro,
                                             prontuário, CRM
```

### 1.4 Bounded context

O contexto **Contratos** é dono de:

- templates e cláusulas
- instâncias, versões, pacotes
- envelopes, signatários, políticas de assinatura
- arquivos jurídicos e evidências
- auditoria e ledger do documento

Ele **não é dono** de orçamento, odontograma, recebíveis ou evolução clínica. Consome snapshots e emite eventos.

### 1.5 Relação V1 × V2

| Camada | V1 (operacional hoje) | V2 (alvo deste documento) |
|--------|------------------------|---------------------------|
| Persistência | `generatedContracts` IDB | `Contract` + `ContractVersion` |
| Status | enum expandido legado | máquina canônica §3.3 |
| Consentimento | categoria + `documentRecords` | `documentType` no mesmo agregado |
| Pacote | checklist UX | `ContractPackage` + manifesto SHA-256 |
| PDF | html2canvas/jsPDF no browser | artefato versionado em storage privado |
| Assinatura | link/token IDB | envelope + sessão + evidência |
| Hash | djb2-like | SHA-256 do conteúdo locked |
| Eventos | arrays locais | `contract.*` no bus V3 |

Mapeamento legado já existe em `legacy/legacy-contract.mapper.ts`. Cutover é trabalho posterior, **por tenant**, com flags. Não faz parte desta arquitetura como pré-requisito de produto.

---

## 2. Entidades

IDs, tipos e snapshots canônicos já estão em `src/domain/contracts/`. Esta seção é o contrato de produto sobre essas entidades — não um segundo modelo.

### 2.1 Diagrama de domínio

```text
Tenant
  └── ContractTemplate 1──N ContractTemplateVersion (PUBLISHED = imutável)
  └── SignaturePolicy
  └── ContractPackage  (patient + budget)
        └── items[] → Contract
              └── ContractVersion[]  (N imutável após lockedAt)
              └── SignatureEnvelope? (cerimônia; pode cobrir o package via manifesto)
                    └── SignatureSigner[]  (PATIENT, GUARDIAN, PROFESSIONAL,
                                           CLINIC_REPRESENTATIVE, WITNESS, …)
              └── ContractFile[]     (PDF unsigned/signed, evidence, attachments)
              └── ContractAuditEvent[]   (operacional)
              └── ContractLedgerEntry[]  (jurídico, hash chain)
```

### 2.2 Catálogo de entidades

| Entidade | Papel de produto | Cardinalidade |
|----------|------------------|---------------|
| `ContractTemplate` | Modelo da clínica ou do sistema | 1 por tipo/especialidade/procedimento |
| `ContractTemplateVersion` | Texto + schema de variáveis + requisitos | N; só `PUBLISHED` gera documento |
| `ContractPackage` | Pasta clínica do tratamento/orçamento | 1 ativo por `(patient, budget)` |
| `Contract` | Documento jurídico (contrato **ou** consentimento) | N por pacote |
| `ContractVersion` | Snapshot imutável do conteúdo e das partes | N; current = locked ou draft |
| `SignaturePolicy` | Nível, métodos, OTP, testemunhas, expiração | N por tenant; 1 default |
| `SignatureEnvelope` | Cerimônia de assinatura | 1 ativo por contrato **ou** 1 por pacote (manifesto) |
| `SignatureSigner` | Parte que assina, com ordem e evidência | N por envelope |
| `ContractFile` | PDF, evidência, anexo, manifesto | N; referência de storage, nunca data URL definitiva |
| `ContractAuditEvent` | Trilha operacional (quem fez o quê) | append-only |
| `ContractLedgerEntry` | Trilha jurídica (hash encadeado) | append-only, sequence |

### 2.3 Tipos de documento (`ContractDocumentType`)

Um único agregado cobre contrato e consentimento.

| Tipo | Uso clínico | Obrigatório no pacote padrão |
|------|-------------|------------------------------|
| `SERVICE_CONTRACT` | Prestação de serviços / tratamento | Sim, se há orçamento |
| `INFORMED_CONSENT` | TCLE genérico | Conforme procedimento |
| `SURGICAL_CONSENT` | Cirurgia | Se item cirúrgico |
| `IMPLANT_CONSENT` | Implante | Se item de implante |
| `ANESTHESIA_CONSENT` / `SEDATION_CONSENT` | Anestesia / sedação | Se aplicável |
| `PROSTHESIS_CONSENT` / `ORTHODONTIC_CONSENT` / `ENDODONTIC_CONSENT` | Especialidade | Se aplicável |
| `LGPD_TERM` | Tratamento de dados pessoais / saúde | **Sempre** |
| `IMAGE_AUTHORIZATION` | Uso de imagem | Opcional (finalidade distinta da LGPD) |
| `FINANCIAL_ACKNOWLEDGEMENT` | Ciência das condições financeiras | Se financiamento / alto valor |
| `TREATMENT_REFUSAL` | Recusa de tratamento | Sob demanda |
| `CANCELLATION_TERM` / `TERMINATION_AGREEMENT` | Desistência / rescisão | Sob demanda |
| `CONTRACT_ADDENDUM` | Aditivo | Quando o assinado precisa mudar |
| `CUSTOM` | Modelo da clínica sem tipo clínico específico | Nunca como fallback silencioso de tipo conhecido |

Mapeamento das categorias da Constituição §8.1:

| Constituição | `documentType` |
|--------------|----------------|
| Prestação de Serviços | `SERVICE_CONTRACT` |
| Consentimento Informado | `INFORMED_CONSENT` (+ especialidades) |
| Ciência de Riscos | seção obrigatória do TCLE (`requiresRisksSection`) |
| Autorização de Tratamento | `INFORMED_CONSENT` ou `CUSTOM` publicado |
| Menor de Idade | não é tipo — é `guardianSnapshot` + signer `LEGAL_GUARDIAN` |
| Uso de Imagem | `IMAGE_AUTHORIZATION` |
| LGPD | `LGPD_TERM` |
| Garantia e Manutenção | cláusulas do `SERVICE_CONTRACT` ou `CUSTOM` |
| Desistência / Interrupção | `CANCELLATION_TERM` / `TERMINATION_AGREEMENT` |
| Pós-operatório | `CUSTOM` ou cláusulas do TCLE |

### 2.4 Snapshots da versão (congelados no lock)

Toda `ContractVersion` locked carrega:

| Snapshot | Origem | Obrigatório |
|----------|--------|-------------|
| `patientSnapshot` | cadastro do paciente | sim |
| `guardianSnapshot` | responsável legal | se menor / `requiresGuardian` |
| `clinicSnapshot` | dados da clínica + RT | sim |
| `professionalSnapshot` | dentista responsável | se o template exigir |
| `budgetSnapshot` | orçamento aprovado (itens, dentes, valores) | se `requiresBudget` |
| `treatmentSnapshot` | plano de tratamento | se originado de planejamento |
| `odontogramSnapshot` | odontograma do paciente + hash | se `requiresOdontogram` **ou** itens tiverem dente |
| `financialSnapshot` | entrada, parcelas, método, juros | se `SERVICE_CONTRACT` / `FINANCIAL_ACKNOWLEDGEMENT` |
| `consentsSnapshot[]` | TCLEs / riscos / alternativas do pacote | se consentimento |
| `signersSnapshot[]` | partes e ordem | sim |
| `attachmentsSnapshot[]` | anexos incluídos na prova | se houver |
| `termsSnapshot` | versão do aviso LGPD / termos | sim na cerimônia |

Regra: o PDF renderiza **somente** o snapshot. Se o cadastro do paciente mudar depois, o documento assinado não muda.

### 2.5 Pacote documental

```text
ContractPackage
  patientId + budgetId + (treatmentPlanId?)
  status: DRAFT | PENDING | PARTIALLY_COMPLETE | COMPLETED | CANCELLED
  requirements[]  → documentType + required + procedureCode?
  items[]         → contractId + documentType + status
  packageManifest → sha256 de { documentId, versionId, documentHash }[]
```

Regras:

- Um orçamento aprovado gera **no máximo um pacote ativo**.
- Itens obrigatórios incompletos bloqueiam “iniciar tratamento” quando `contractRequiredBeforeTreatment=true`.
- `LGPD_TERM` é sempre `required: true`.
- TCLE especialidade é `required` quando o item do orçamento casa com `procedureCodes` / `specialtyCodes` do template.
- `IMAGE_AUTHORIZATION` nunca substitui `LGPD_TERM`.

### 2.6 Manifesto criptográfico do pacote (decisão 10.21S — OPTION_C)

O envelope V2 prova 1 `ContractVersion`. O produto precisa provar o **pacote**.

**Decisão:** a cerimônia assina o manifesto do pacote.

1. Cada documento do pacote é locked (próprio `documentHash`).
2. O manifesto lista `{ contractId, versionId, documentType, documentHash }` ordenado e estável.
3. `packageManifestHash = SHA-256(manifesto canônico)`.
4. O envelope referencia `packageId` + `packageManifestHash` **além** do contrato âncora (`SERVICE_CONTRACT` quando existir).
5. O signatário **visualiza e aceita cada documento** antes de assinar.
6. Recusa de um item obrigatório recusa o pacote.
7. PDF assinado do âncora inclui o manifesto (ou QR apontando para o evidence report).

Isso fecha o gap “package UX ≠ prova jurídica multi-documento” sem multiplicar cerimônias.

### 2.7 Partes e testemunhas

| Role | Quando |
|------|--------|
| `PATIENT` | maior capaz |
| `LEGAL_GUARDIAN` | menor ou incapaz (`RN-ATD-012`) |
| `FINANCIAL_RESPONSIBLE` | pagador ≠ paciente |
| `PROFESSIONAL` | CRO do executor / prescritor |
| `CLINIC_REPRESENTATIVE` | clínica (admin/gerente autorizado) |
| `WITNESS` | opcional; 0–2 |
| `INTERPRETER` | se o paciente não compreende o idioma do documento |

Testemunhas:

- Default: **não obrigatórias**.
- Template / policy pode exigir (`requiresWitnesses`, `witnessesMin`).
- Alto valor (`highValueThreshold`) ou financiamento: policy da clínica **pode** exigir 1 testemunha — não é regra universal do produto.
- Testemunha é signer com evidência própria; não é hashtag de texto (`#testemunha1Nome` vira dado do signer, não campo solto).

### 2.8 Anexos

Anexos entram na prova somente se referenciados no snapshot da versão **antes do lock**.

Tipos aceitos: PDF, JPEG, PNG. Limites já definidos em `contract-file-limits.ts`.

Exemplos: exame, planejamento impresso, foto do odontograma, documento de identidade (se a policy exigir). PII de anexo segue a mesma RLS/storage privada do contrato.

Após lock: só **adicionar anexo não-probatório** (ex.: comprovante posterior) como `ContractFile` ligado ao contrato, sem alterar `documentHash`. Anexo que muda o acordo exige **aditivo**.

### 2.9 Numeração

`CTR-YYYY-NNNNN` por tenant (sequence já modelada). Pacote: `PKG-YYYY-NNNNN`. Aditivo: `CTR-YYYY-NNNNN/A01`. Número não se reutiliza após cancelamento.

---

## 3. Fluxo completo

### 3.1 Jornada feliz (produto)

```text
Paciente identificado
  → Odontograma / planejamento (dentes e procedimentos)
  → Orçamento (itens + condição de pagamento)
  → Aprovar orçamento
       ├─ snapshot imutável do orçamento (RN-ORC-003)
       ├─ provisiona financeiro (previsto / aguardando contrato)
       └─ abre ContractPackage
  → Resolver pré-requisitos (CPF, e-mail, responsável, RT, modelos)
  → Gerar documentos do pacote (rascunhos a partir de templates publicados)
  → Revisão interna (opcional por policy)
  → Lock das versões + manifesto
  → Enviar envelope (link / OTP)
  → Paciente (e demais signers) lê cada doc, aceita LGPD, assina
  → Clínica / profissional assinam se exigido
  → Completion: PDF assinado + evidence report + ledger CONTRACT_SIGNED
  → Efeitos: financeiro confirma, prontuário registra, jornada avança, CRM atualiza
```

### 3.2 Máquina de estados do contrato

Estados canônicos V2 (não o enum V1):

```text
DRAFT
  → READY_FOR_REVIEW
      → PENDING_INTERNAL_APPROVAL   (se requiresInternalApproval)
      → APPROVED
          → PENDING_SIGNATURES      (versão locked + envelope enviado)
              → PARTIALLY_SIGNED
              → SIGNED
              → DECLINED | EXPIRED | CANCELLED
SIGNED → SUPERSEDED | TERMINATED
```

`VOIDED` é estado excepcional (erro material / ordem judicial) — não é cancelamento operacional.

Compatibilidade V1 (`draft`, `generated`, `sent`, `completed`, …) permanece no mapper. UI de produto deve falar a língua da clínica:

| Estado canônico | Label na UI |
|-----------------|-------------|
| `DRAFT` | Rascunho |
| `READY_FOR_REVIEW` | Em revisão |
| `PENDING_INTERNAL_APPROVAL` | Aguardando aprovação |
| `APPROVED` | Pronto para enviar |
| `PENDING_SIGNATURES` | Aguardando assinatura |
| `PARTIALLY_SIGNED` | Parcialmente assinado |
| `SIGNED` | Assinado / vigente |
| `DECLINED` | Recusado |
| `EXPIRED` | Expirado |
| `CANCELLED` | Cancelado |
| `SUPERSEDED` | Substituído |
| `TERMINATED` | Rescindido |
| `VOIDED` | Anulado |

`vigente` da Constituição = `SIGNED` com `effectiveDate` e sem `TERMINATED`.  
`rescindido` = `TERMINATED`.

### 3.3 Regras de transição (produto)

- `SIGNED` **não volta** a rascunho (`RN-CTR-001`).
- Conteúdo trava em `PENDING_SIGNATURES` e depois.
- Cancelamento exige motivo + `admin_contratos:cancel` / `contracts:cancel`.
- Cancelar orçamento **não** cancela contrato assinado (`RN-ORC-014`).
- Recusa de signatário obrigatório → `DECLINED` no contrato e no pacote.
- Expiração do link (`signLinkExpiryDays` 7/15/30, `RN-CTR-003`) → `EXPIRED`; reenvio cria novo envelope sobre a **mesma** versão locked, se o conteúdo não mudou.
- Mudança de orçamento / tratamento / signatário após lock → nova versão (`BUDGET_CHANGE`, `TREATMENT_CHANGE`, `SIGNER_CHANGE`) e envelope novo. Versão anterior → não assinar.

### 3.4 Versionamento e aditivo

| Situação | Mecanismo |
|----------|-----------|
| Correção antes de qualquer assinatura | nova `ContractVersion` (`CORRECTION` / `DATA_CORRECTION`); anterior descartada no current |
| Correção depois de envio, sem assinatura | nova versão + cancela envelope |
| Mudança depois de `SIGNED` que altera acordo | `CONTRACT_ADDENDUM` ligado ao contrato pai **ou** `SUPERSEDED` por novo `SERVICE_CONTRACT` |
| Erro material grave | `VOIDED` + reemissão (`REISSUE`) |

Histórico: lista de versões com hash, autor, motivo, PDF. UI nunca “edita o assinado”.

### 3.5 Cerimônia de assinatura

```text
Envelope DRAFT
  → READY (signers + acceptances seedados)
  → SENT
  → IN_PROGRESS (primeiro view)
      signer: INVITED → DELIVERED → VIEWED → AUTHENTICATED
            → termos aceitos (inclui LGPD_NOTICE_ACKNOWLEDGED)
            → SIGNED | DECLINED
  → COMPLETED  ⇒  completion service  ⇒  Contract SIGNED
```

Ordem: `SEQUENTIAL` quando há responsável + paciente + clínica; `PARALLEL` quando só paciente + clínica e a policy permitir.

Métodos por nível:

| Nível | Métodos típicos | O que o produto pode afirmar |
|-------|-----------------|------------------------------|
| `SIMPLE` | `CLICK_ACCEPT`, `DRAWN_SIGNATURE`, `SECURE_LINK`, `OTP_EMAIL` | Assinatura eletrônica simples (Lei 14.063/2020), com trilha |
| `ADVANCED` | OTP + checagem de documento + hash de integridade + evidência | Assinatura eletrônica avançada, se a policy estiver completa |
| `QUALIFIED` | certificado ICP-Brasil via provider | Assinatura qualificada — **somente** com provider/certificado |
| `EXTERNAL_PROVIDER` | ClickSign, D4Sign, etc. | O que o provider atestar + webhook server-side (`RN-CTR-007`) |

`RN-CTR-004`: alto valor ou financiamento **pode** exigir `ADVANCED`. Não promover automaticamente a `QUALIFIED`.

A UI pública **declara o nível** antes do aceite. É proibido copy do tipo “assinatura com validade de cartório” em fluxo `SIMPLE`.

### 3.6 Completion e efeitos

Somente o completion service promove para `SIGNED` (já modelado na Phase 10.8):

1. Envelope `COMPLETED`
2. Todos os signers obrigatórios `SIGNED`
3. Versão locked + hashes batem com o manifesto
4. PDF assinado + evidence report persistidos
5. Ledger append `CONTRACT_SIGNED` (idempotente)
6. Efeitos **preparados**, depois executados por consumers:

| Efeito | Quando | Idempotência |
|--------|--------|--------------|
| `financialActivation` | há `financialSnapshot` | `fx_fin_{contractId}` |
| `prontuarioRegistration` | contrato de serviço ou consentimento clínico | `fx_pront_{contractId}` |
| `patientJourneyRegistration` | sempre | `fx_journey_{contractId}` |
| `crmRegistration` | origin CRM | `fx_crm_{contractId}` |
| `patientDelivery` | PDF assinado existe | `fx_delivery_{contractId}` |
| `notificationDispatch` | sempre | `fx_notify_{contractId}` |
| `analyticsRegistration` | sempre | `fx_analytics_{contractId}` |

Nenhum efeito roda no `onClick` da tela de assinatura.

### 3.7 Fluxos alternativos

| Fluxo | Comportamento |
|-------|----------------|
| Menor de idade | `LEGAL_GUARDIAN` obrigatório; paciente pode ser signer adicional se policy permitir |
| Recusa de tratamento | gera `TREATMENT_REFUSAL`; não ativa financeiro |
| Assinatura presencial | `ON_SCREEN` / `DRAWN_SIGNATURE` no tablet da clínica, mesma evidência |
| Upload de PDF assinado em papel | `UPLOAD` — vira evidência; nível `SIMPLE`; hash do arquivo anexado |
| Paciente sem e-mail | OTP SMS ou presencial; bloqueia envio digital se policy exigir e-mail (`RN-CTR-005`) |
| Link expirado | reenvio; não altera versão |
| Contestação | processo operacional (checklist jurídico) + `view_audit` / `view_ledger`; reemissão se necessário |

---

## 4. Telas

Princípio: a clínica **não navega o harness V2**. As páginas `*-v2` continuam atrás de flag para engenharia. A jornada de produto vive onde o trabalho já acontece.

### 4.1 Mapa de superfícies

| Superfície | Rota / inserção | Persona | Papel |
|------------|-----------------|---------|--------|
| Wizard no atendimento | `/atendimento-clinico/:id` aba Contrato | Recepção, dentista, comercial | Gerar / enviar / acompanhar o pacote |
| Hub de orçamentos | `/orcamentos` | Recepção, comercial | CTA por estado (aprovar / gerar / enviar / ver) |
| Aba do paciente | cadastro / Care Central — Orçamentos e Contratos | Recepção | Ver o que falta no paciente |
| Prontuário | `/prontuario/:patientId` aba Contratos e Consentimentos | Dentista, admin | Documentos vigentes + TCLEs |
| Shell de gestão | `/gestao/contratos` | Admin, gerente, recepção (fila) | Fila, pendentes, assinados, modelos, termos, auditoria |
| Assinatura pública | `/assinatura/:token` (V1) → unificar visualmente com pacote | Paciente / responsável | Ler, aceitar LGPD, assinar |
| Configurações | `/gestao/contratos/configuracoes` | Admin, gerente | Policies, validade do link, obrigatoriedade |

### 4.2 Telas de produto (alvo)

#### A. Pacote do tratamento (núcleo)

Substituir a seção atual “gerar contrato” por um **painel de pacote**:

1. Resumo: paciente, orçamento, valor, parcelas, dentes.
2. Checklist de documentos (obrigatório / opcional / status).
3. Bloqueios acionáveis (CPF, e-mail, responsável, modelo ausente) — padrão já iniciado no readiness.
4. Ações: Gerar rascunhos → Revisar → Enviar para assinatura.
5. Após envio: status por signer, reenviar, cancelar envio.

Não é uma página nova no menu. É o centro da aba Contrato do atendimento e da aba do paciente.

#### B. Revisão / preview

Preview paginado de cada documento com variáveis já resolvidas. Destaque de cláusulas de risco, valor e LGPD. Sem editor livre no documento gerado (edição é no template ou em campos variáveis permitidos no draft).

#### C. Assinatura pública (paciente)

Uma sessão, vários documentos:

1. Identificação do paciente / responsável.
2. Resumo em linguagem clara: procedimentos, dentes, valor, parcelas, validade.
3. Lista do pacote com “lido” por documento.
4. Aceite LGPD explícito (finalidades: tratamento clínico; comunicação operacional; imagem se houver doc separado).
5. Assinatura (desenho / clique / OTP conforme policy).
6. Recibo: baixar PDF não é obrigatório na hora, mas o comprovante de envio sim.

#### D. Shell `/gestao/contratos`

Reduzir carga cognitiva. Menu operacional:

| Item | Conteúdo |
|------|----------|
| Fila | Tudo que precisa de ação hoje (gerar, enviar, cobrar assinatura, expirando) |
| Pendentes | Enviados / parciais |
| Assinados | Vigentes + busca por paciente |
| Modelos | Templates da clínica (não harness) |
| Termos | LGPD, imagem, recusa — atalhos de tipo |
| Assinaturas | Políticas, nível padrão, providers |
| Configurações | Obrigatoriedade pré-tratamento, validade do link, alto valor |
| Auditoria | Acesso com `view_audit` / `view_ledger` |

Dashboard permanece como visão de KPIs (pendentes, expirando, assinados no período), não como tela de trabalho.

#### E. Editor de modelos (clínica)

Editor visual sobre templates V2:

- Duplicar modelo do sistema → modelo da clínica.
- Variáveis por hashtag (manter o motor atual na UI; internamente a versão V2 já tem `variablesSchema`).
- Requisitos: orçamento, odontograma, responsável, testemunhas, riscos.
- Publicar gera `ContractTemplateVersion` imutável.
- Histórico de versões do modelo.
- Cláusulas de sistema: somente `admin_contratos:edit_system_clause`.

#### F. Prontuário — aba Contratos e Consentimentos

Lista por paciente: tipo, número, status, data, PDF, evidência. Consentimentos vigentes em destaque. Sem edição do conteúdo assinado. Deep-link de volta ao pacote / orçamento.

#### G. Odontograma

Não há tela nova. No preview e no PDF: miniatura / tabela de dentes do `odontogramSnapshot` + lista `#dentes` / procedimentos. Clique no dente no odontograma **não** abre o contrato; o contrato é que congela o odontograma.

### 4.3 Telas que **não** são produto

`/gestao/contratos/modelos-v2`, `instancias-v2`, `assinaturas-v2`, `documentos-v2`, `conclusao-v2`, `entregas-v2`, `/assinar/v2/:token` — harness. Continuam gated. A evolução de produto **não** adiciona abas técnicas no menu da clínica.

### 4.4 Componentes de UI (padrão do projeto)

Novos modais usam exclusivamente `src/components/ui/Modal.jsx` (Radix). Toasts via `.toast`. Sem overlay legado, sem `z-index` inline.

---

## 5. Permissões

### 5.1 Modelo

Dois eixos, já no catálogo:

- **Operação clínica** — `prontuario_contratos_*` / `prontuario_consentimentos_*` (no atendimento e no prontuário).
- **Administração do módulo** — `admin_contratos_*` + recursos V2 `contracts`, `contract_templates`, `contract_signatures`.

A tela de produto consulta o eixo clínico; o shell de gestão consulta o administrativo. Gerar a partir do orçamento exige `admin_contratos:generate` **ou** `prontuario_contratos:create` (união inclusiva, para dentista e comercial).

### 5.2 Matriz operacional (alvo)

| Ação | Permissão | administrativo | gerente | comercial | dentista / profissional | recepção | financeiro |
|------|-----------|----------------|---------|-----------|-------------------------|----------|------------|
| Ver fila / pendentes | `admin_contratos:view` ou `prontuario_contratos:view` | sim | sim | sim | sim | **sim** | view |
| Gerar pacote | `admin_contratos:generate` | sim | sim | sim | sim | **sim** | não |
| Editar rascunho | `prontuario_contratos:edit` | sim | sim | não | sim | não | não |
| Enviar assinatura | `prontuario_contratos:send` | sim | sim | sim | sim | **sim** | não |
| Assinar pela clínica | `prontuario_contratos:sign` / `admin_contratos:sign` | sim | sim | não | sim (próprio CRO) | não | não |
| Cancelar | `admin_contratos:cancel` | sim | sim | não | não | não | não |
| Publicar modelo | `contract_templates:publish` | sim | sim | não | não | não | não |
| Editar cláusula sistema | `admin_contratos:edit_system_clause` | sim | sim | não | não | não | não |
| Ver auditoria / ledger | `admin_contratos:view_audit` / `contracts:view_ledger` | sim | sim | não | não | não | não |
| Download evidência | `contracts:download_evidence` | sim | sim | não | sim (próprios) | não | não |

**Gap a fechar na Wave A de produto:** recepção está no menu UI e **não** tem permissões default de contrato. Sem isso a fila operacional quebra. Incluir `view` + `generate` + `send` no default de recepção.

### 5.3 Recursos V2 já catalogados (não inventar outros)

Usar os actions existentes em `src/permissions/catalog.js`:

- `contract_templates`: `view`, `create`, `update_draft`, `review`, `publish`, `archive`, `duplicate`, `view_history`, `manage_clauses`
- `contracts`: `view`, `create`, `update_draft`, `review`, `approve`, `cancel`, `view_audit`, `generate_pdf`, `generate_signed_artifacts`, `download`, `download_evidence`, `verify_integrity`, `view_files`, `manage_attachments`, `complete_signing`, `view_ledger`, `verify_ledger`, `view_signed_effects`, `reconcile_signed_state`
- `contract_signatures`: `view`, `create_envelope`, `manage_signers`, `send`, `cancel_envelope`, `view_evidence`, `manage_policies`, `reconcile`, `send_invitation`, `resend_invitation`, `view_delivery`, `revoke_session`

Não criar `contracts:create_addendum` separado: aditivo é `contracts:create` com `documentType=CONTRACT_ADDENDUM`.

### 5.4 Assinatura pública

Paciente não tem RBAC. Autorização = token de sessão de assinatura, tenant-scoped, expirável, com tentativas limitadas. Master/support **não** usa a URL pública para ler PII sem `ADMIN_ACCESS` auditado.

### 5.5 Segregação

| Perfil | Conteúdo clínico do contrato |
|--------|------------------------------|
| Financeiro | metadados + `financialSnapshot` (valores), não TCLE completo |
| Comercial | pacote e status, preview comercial, não documentos confidenciais extras |
| Master SaaS | sem leitura de HTML/PDF clínico no default |

---

## 6. Eventos

Eventos de domínio já tipados em `contract.events.ts`. O produto **não** adiciona um segundo vocabulário. Publicação no bus V3 é o que falta ligar na jornada (hoje o completion gera o evento de domínio internamente, sem o registry legado `CONTRACT_SIGNED` como efeito).

### 6.1 Eventos que a jornada de produto consome

| Evento | Publisher | Consumers de produto |
|--------|-----------|----------------------|
| `contract.package_created` | geração do pacote pós-orçamento | fila, atendimento, CRM |
| `contract.created` / `contract.version_created` | draft | fila |
| `contract.version_locked` | lock pré-envio | PDF unsigned |
| `contract.sent_for_signature` | envelope SENT | notificação paciente, fila |
| `contract.signer.viewed` | sessão pública | KPI “visualizado” |
| `contract.signer.terms_accepted` | aceite LGPD / docs | auditoria LGPD |
| `contract.signer.signed` / `declined` | sessão | fila, pacote |
| `contract.partially_signed` | reconciliação envelope | UI |
| `contract.signed` | completion | **financeiro, prontuário, jornada, CRM, delivery** |
| `contract.declined` / `expired` / `cancelled` | SM | fila, orçamento (não desfaz aprovação) |
| `contract.superseded` / `terminated` | aditivo / rescisão | prontuário, financeiro (não apaga histórico) |
| `contract.addendum_created` | aditivo | prontuário |
| `contract.integration.financial_activated` | consumer financeiro | contas a receber |
| `contract.integration.prontuario_registered` | consumer prontuário | `patientFiles` + timeline |
| `contract.integration.failed` | qualquer consumer | reconciliação, alerta admin |
| `contract.ledger.entry_appended` | ledger | verificação |
| `contract.ledger.chain_invalid` | verify | incidente de segurança |

### 6.2 Contrato com o financeiro (evento)

Payload mínimo de `contract.signed` para o consumer financeiro:

```text
tenantId, contractId, versionId, patientId,
budgetId, budgetVersionId, documentType,
financialSnapshot.hash, contractTotal, installmentCount,
packageId, packageManifestHash, occurredAt
```

O consumer **não** relê o HTML. Confia no snapshot.

### 6.3 Idempotência

Toda publicação e todo consumer usam a chave já padronizada (`COMPLETE_CONTRACT_SIGNING`, `fx_fin_{id}`, etc.). Replay não duplica recebível nem arquivo no prontuário.

---

## 7. Integrações

### 7.1 Orçamento

| Momento | Contrato faz | Orçamento faz |
|---------|--------------|---------------|
| Aprovar | — | snapshot imutável (`RN-ORC-003`); status `APROVADO` |
| Pós-aprovação | cria `ContractPackage` | CTA “Gerar documentos” |
| Geração | `budgetSnapshot` + itens/dentes | lock de edição estrutural se pacote ativo |
| Assinado | evento | status comercial “contratado”; não reabre itens |
| Nova versão de orçamento | pacote anterior `CANCELLED` ou aditivo | `HISTORICO` + novo `RASCUNHO` (`RN-ORC-004`) |

Origem: `CLINICAL_BUDGET` ou `CRM_BUDGET`. Uma API de produto (`createPackageFromApprovedBudget`) — as duas UIs chamam o mesmo serviço.

`canStartTreatmentWithoutContract` permanece setting da clínica.

### 7.2 Paciente

- Cadastro incompleto bloqueia envio, não a criação do rascunho (readiness acionável).
- Menor: `guardianSnapshot` + signer `LEGAL_GUARDIAN`.
- Care Central / aba Orçamentos e Contratos mostra o pacote, não uma lista solta de HTML.
- Timeline: gerado, enviado, assinado, recusado, aditivo.

### 7.3 Odontograma

Hoje o contrato só herda dentes do item do orçamento. Alvo:

1. Na geração, ler o odontograma vigente do paciente (`patientOdontograms` / histórico).
2. Gravar `odontogramSnapshot` `{ odontogramVersion, summary, hash, capturedAt, imageFileId? }`.
3. Incluir no PDF a lista de dentes/faces dos procedimentos contratados.
4. Divergência orçamento × odontograma = **warning** no readiness (não bloqueio duro, salvo policy da clínica).
5. Odontograma posterior **não** altera contrato assinado; tratamento extra → novo orçamento / aditivo.

### 7.4 Financeiro

Estado atual: recebível nasce na **aprovação do orçamento**. Isso permanece como **provisionamento** para não quebrar caixa/CRM.

Alvo em duas etapas explícitas:

| Etapa | Status financeiro | Trigger |
|-------|-------------------|---------|
| 1. Provisionado | títulos `previsto` / `aguardando_contrato`, `contract_id` nulo ou preliminar | orçamento `APROVADO` |
| 2. Confirmado | títulos vinculados a `contract_id` + versão + hash do `financialSnapshot` | `contract.signed` + `financialActivation` |
| 3. Divergência | fila de reconciliação | snapshot assinado ≠ títulos provisionados |

Regras:

- Contrato assinado **não cria segundo cronograma** se o provisionado já existe e o hash bate.
- Aditivo financeiro gera novo snapshot e `RN-FIN-019` (renegociação) — cronograma novo, original em histórico.
- `TERMINATED` não apaga recebíveis; cancela saldo aberto com permissão financeira.
- Comissão de produção contratada (`RN-FIN-015`) usa a data de `contract.signed`, não a do clique em aprovar orçamento, quando a flag `contract_financial_activation_on_signed_enabled` estiver on **e** o tenant homologado.

Default da flag: **off** até a Wave C. Sem surpresa em clínicas que já faturam na aprovação.

### 7.5 Prontuário

| Artefato | Destino |
|----------|---------|
| PDF assinado do contrato | `patientFiles` categoria Contratos |
| TCLE / consentimentos | categoria Consentimentos |
| LGPD | categoria Consentimentos (finalidade dados) |
| Evidence report | arquivo vinculado, acesso `download_evidence` |
| Evento | timeline + `accessAuditLogs` |

Consentimento informado vigente é visível no prontuário **antes** de procedimento invasivo (`RN-ATD-011`). A ausência de TCLE obrigatório no pacote `COMPLETED` é bloqueio clínico configurável.

Documentos confidenciais extras do prontuário **não** entram no envelope a menos que anexados antes do lock.

### 7.6 CRM / jornada

- Origin `CRM_BUDGET`: card do funil reflete status do pacote.
- `contract.signed` move jornada (ex.: “contratado” / libera execução).
- Recusa / expiração gera atividade, não apaga o lead.

### 7.7 Notificação

Canal: e-mail transacional (real, não simulado) e, se consentido, SMS/WhatsApp para OTP ou lembrete de assinatura. Opt-out LGPD respeitado (`RN-JRN-029`). Falha de envio não corrompe o envelope (`DELIVERED` vs `FAILED` no signer).

### 7.8 Providers externos (fase posterior)

Interface `SignatureProvider` já existe. Produto só liga ClickSign/D4Sign/etc. depois da cerimônia interna estável. Webhook **server-side** atualiza envelope (`RN-CTR-007`). Frontend nunca “marca assinado” sozinho.

---

## 8. Validade jurídica, LGPD e auditoria

Esta seção é **arquitetura de produto**, não parecer jurídico. Cada tenant precisa revisar textos (`docs/contracts/LEGAL_CHECKLIST.md`).

### 8.1 O que o sistema garante

1. Integridade do conteúdo (hash SHA-256 da versão locked + manifesto).
2. Autoria aparente (identificação do signer + método + OTP se exigido).
3. Trilha: IP, user-agent, timestamps, views, aceites, recusas.
4. Imutabilidade pós-assinatura.
5. Disponibilidade do PDF e do evidence report no storage privado.
6. Ledger com hash chain verificável (`contract_audit_ledger_enabled`).

### 8.2 O que o sistema **não** garante sozinho

- Equivalência automática a reconhecimento de firma.
- Validade de cláusulas abusivas (CDC) ou de TCLE incompleto (CFO).
- Qualificação ICP-Brasil sem certificado.
- Que o paciente “entendeu” o tratamento — só que visualizou e aceitou.

### 8.3 LGPD (duas camadas)

**Camada documento:** `LGPD_TERM` obrigatório no pacote, versãoada, com `termsSnapshot.privacyNoticeVersion`.

**Camada aceite da cerimônia** (`SignatureAcceptanceCode`):

| Código | Obrigatório |
|--------|-------------|
| `DOCUMENT_READ` | sim |
| `CONTENT_CONFIRMED` | sim |
| `PERSONAL_DATA_CONFIRMED` | sim |
| `LGPD_NOTICE_ACKNOWLEDGED` | sim |
| `CLINICAL_CONSENT_CONFIRMED` | nos TCLEs |
| `SIGNATURE_INTENT_CONFIRMED` | sim |

Finalidades separadas:

- Tratamento clínico / execução do contrato (base legal: contrato + saúde).
- Comunicação operacional (agendamento) — pode estar no termo LGPD.
- Marketing / uso de imagem — **somente** `IMAGE_AUTHORIZATION`, opt-in, revogável.

Retenção: documentos de saúde seguem política da clínica (referência típica de prontuário odontológico: prazo longo / permanente clínico). O produto versiona; não oferece “apagar o assinado”. Direito do titular (`RN-PRO-004`) = processo administrativo + export, não delete físico do ledger.

### 8.4 Auditoria (duas trilhas)

| Trilha | Para quê | Quem vê |
|--------|----------|---------|
| `ContractAuditEvent` | operação (enviou, reenviou, baixou, imprimiu) | `view_audit` |
| `ContractLedgerEntry` | prova jurídica (lock, signed, PDF, manifesto) | `view_ledger` |

Ambas append-only. `chain_invalid` é incidente, não “log warning”.

---

## 9. Riscos

| ID | Risco | Severidade | Mitigação de produto |
|----|-------|------------|----------------------|
| R1 | Clínica trata V1 como “assinatura de cartório” | alta | copy obrigatório do nível; checklist jurídico por tenant |
| R2 | Pacote UX assinado sem hash dos TCLEs | alta | manifesto OPTION_C; sem “completo” se item obrigatório sem hash |
| R3 | Dois mundos TCLE (`documentRecords` × `Contract`) | alta | Wave B: TCLE vira `Contract` do pacote; records viram origem de conteúdo até cutover |
| R4 | Financeiro duplicado (aprovação + signed) | alta | provisionado vs confirmado; flag off por default |
| R5 | Recepção sem permissão e com menu | média | default de role na Wave A |
| R6 | Menor assinado pelo próprio paciente | alta | gate `requiresGuardian` + idade |
| R7 | Edição de template publicada | alta | só nova versão; published imutável |
| R8 | PII em data URL no IDB | média | storage privado já modelado; produto não adiciona base64 novo |
| R9 | Harness `*-v2` vaza para usuário de clínica | média | menu operacional sem surface TECHNICAL_HARNESS |
| R10 | Cutover V1→V2 no meio da jornada | alta | tenant-by-tenant; V1 permanece até flag |
| R11 | Odontograma divergente do contrato | média | warning no readiness + snapshot |
| R12 | Provider externo “assina” só no front | alta | webhook server-side; completion único |
| R13 | Master SaaS lê contrato clínico | alta | RLS + negação default + audit `ADMIN_ACCESS` |
| R14 | Texto jurídico genérico inadequado à especialidade | média | modelos por `procedureCodes`; clínica publica os seus |
| R15 | Infra reaberta “para o módulo ficar definitivo” | alta | **proibido neste ciclo** — ver §10 |

---

## 10. Roadmap técnico (produto)

Infraestrutura, migrations novas, RLS, buckets, Railway, Vercel e Console estão **fora**. O domínio V2, o ledger, o storage privado e o manifesto já foram construídos nas Phases 10.2–10.21. Este roadmap só evolui **produto** sobre essa base.

Nenhuma wave abaixo autoriza `apply_migration` em produção.

### Wave A — Jornada única (primeiro valor clínico)

**Objetivo:** a clínica conclui orçamento → pacote → assinatura sem harness e sem passo escondido.

- Painel de pacote no atendimento e na aba do paciente (sobre o package operacional já existente).
- CTAs reais no hub `/orcamentos` (gerar / enviar / ver).
- Readiness acionável (pré-requisitos).
- Permissão default da recepção (`view` + `generate` + `send`).
- Assinatura pública: resumo de tratamento, parcelas, dentes, aceite LGPD explícito.
- Aba Contratos e Consentimentos no prontuário (lista + PDF V1/V2 transparente para o usuário).
- Esconder surfaces `TECHNICAL_HARNESS` do menu operacional.

**Fora:** novo schema, provider ICP, cutover IDB.

**Gate:** jornada feliz em tenant piloto, só produto, flags V2 de harness off.

### Wave B — Pacote jurídico (contratos + consentimentos + LGPD)

**Objetivo:** cada item do pacote é um `Contract` com hash; a cerimônia prova o manifesto.

- Materializar TCLE / LGPD / imagem como documentos do pacote (não só checklist).
- Congelar snapshots + manifesto antes do envio (código 10.21T/U já existe — **ligar na UX operacional**, não no harness).
- View/aceite por documento na sessão pública.
- Testemunhas opcionais como `SignatureSigner` na UI (não hashtag solta).
- Anexos pré-lock na prova; pós-lock só não-probatórios.

**Gate:** recusar “pacote completo” se TCLE obrigatório não tiver `documentHash`.

### Wave C — Integrações de efeito

**Objetivo:** assinar muda o resto do produto de forma previsível.

- Consumer de `contract.signed`: prontuário, timeline, jornada.
- `odontogramSnapshot` real (hash + summary) na geração.
- Financeiro: modelo provisionado → confirmado, **flag off**.
- Homologar flag financeira com 1 tenant antes de default on.
- Reconciliação visível quando snapshot ≠ títulos.

**Gate:** assinar não duplica recebível; prontuário recebe o PDF uma vez.

### Wave D — Modelos, versões e aditivos

**Objetivo:** a clínica vive de modelos próprios e histórico jurídico.

- Editor de modelos na superfície operacional (`/gestao/contratos/modelos`).
- Publicação imutável + histórico.
- Nova versão / aditivo / substituir, com UI que impede editar o assinado.
- Ciência financeira e termos de recusa/rescisão como tipos de primeira classe.

**Gate:** publicar modelo não altera contratos já gerados.

### Wave E — Rigor jurídico e entrega ao paciente

**Objetivo:** evidência exportável e honestidade do nível de assinatura.

- Evidence report + verificação de integridade na UI admin (`download_evidence`, `verify_integrity`).
- Declaração persistida do nível SIMPLE/ADVANCED no PDF.
- Entrega do PDF ao paciente (e-mail real).
- Fluxo de menor / responsável 100% coberto na UI.
- Política de retenção visível (não necessariamente enforcement novo).
- Verificação pública por QR **somente** com flag `contract_public_verification_enabled`.

**Fora:** ICP-Brasil, ClickSign produção.

### Wave F — Providers e assinatura qualificada (opcional, depois)

- Adapter real `EXTERNAL_PROVIDER` / `QUALIFIED`.
- Webhook idempotente.
- Policy por valor / financiamento exigindo ADVANCED ou QUALIFIED.

Só inicia com tenant que pede e jurídico alinhado.

### Ordem e dependências

```text
A (jornada) ──► B (pacote jurídico) ──► C (efeitos)
                      │
                      └──► D (modelos/aditivo)
                                │
                                └──► E (evidência/entrega)
                                          │
                                          └──► F (providers)  [opcional]
```

A não depende de C. B não depende de D. Financeiro confirmado (C) não bloqueia A.

### Explicitamente fora deste ciclo

- Novas migrations / RLS / buckets
- Cutover global IndexedDB → Postgres
- Desligar Contratos V1
- Console SaaS, Railway, Vercel, Session Bridge, Auth
- Dívida TypeScript (backlog isolado)
- Laboratório, estoque, convênios

---

## 11. Critérios de aceite do módulo definitivo

O módulo está **definitivo para produto** quando, em um tenant piloto, sem harness visível:

1. Orçamento aprovado abre um pacote com contrato + TCLEs aplicáveis + LGPD.
2. Odontograma/dentes do tratamento aparecem no preview e no PDF.
3. Paciente lê cada documento, aceita LGPD por finalidade, assina.
4. Testemunhas podem ser incluídas ou omitidas conforme o modelo.
5. Anexos pré-lock entram na prova; o assinado não se edita.
6. PDF e evidência ficam no prontuário do paciente.
7. Histórico de versões e aditivo funcionam.
8. Financeiro não duplica títulos; confirmação é rastreável.
9. Toda transição está no audit; `SIGNED` está no ledger.
10. A UI declara o nível de assinatura; textos jurídicos são da clínica.

Até lá, V1 continua o operacional, V2 continua o domínio, e este documento é o alvo.

---

## 12. Referências

| Documento | Uso |
|-----------|-----|
| [Master Business Rules §7–10](../constitution/LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md) | RN-ORC, RN-CTR, RN-FIN, RN-PRO, RN-ATD |
| [PHASE_10_1 Discovery](../reports/PHASE_10_1_CONTRACTS_DISCOVERY_AND_LEGACY_AUDIT.md) | as-is V1 |
| [PHASE_10_2 Domain Foundation](../reports/PHASE_10_2_CONTRACTS_DOMAIN_FOUNDATION.md) | tipos e SM |
| [PHASE_10_5 Generation](../reports/PHASE_10_5_CONTRACT_INSTANCE_LIFECYCLE_AND_GENERATION_PIPELINE.md) | pipeline |
| [PHASE_10_8 Signed + ledger](../reports/PHASE_10_8_CONTRACT_SIGNED_TRANSITION_AUDIT_LEDGER_GATED_SIDE_EFFECTS.md) | completion |
| [PHASE_10_15 UX](../reports/PHASE_10_15_UX_ODONTOLOGY_REVIEW.md) | jornada clínica |
| [PHASE_10_21S Multi-doc](../reports/PHASE_10_21S_MULTI_DOCUMENT_SIGNATURE_ARCHITECTURE_AUDIT.md) | OPTION_C |
| [LEGAL_CHECKLIST](../contracts/LEGAL_CHECKLIST.md) | ativação por tenant |
| `src/domain/contracts/` | implementação canônica |

---

**FIM PHASE_10_CONTRACTS_ARCHITECTURE — infraestrutura permanece congelada; próxima execução é Wave A de produto.**
