/**
 * Templates de documentos clínicos
 * Cada template tem:
 * - key: identificador único
 * - category: categoria do documento
 * - title: nome exibido
 * - body: texto com placeholders {{VARIAVEL}}
 * - fields: campos editáveis do formulário
 */

export const DOCUMENT_CATEGORIES = {
  ATESTADOS: 'atestados',
  CONSENTIMENTOS: 'consentimentos',
  ORIENTACOES: 'orientacoes',
  SOLICITACOES: 'solicitacoes',
  PRESCRICOES: 'prescricoes',
};

export const documentTemplates = [
  // ATESTADOS
  {
    key: 'atestado_odontologico',
    category: DOCUMENT_CATEGORIES.ATESTADOS,
    title: 'Atestado Odontológico',
    body: `ATESTADO ODONTOLÓGICO

Eu, {{PROFISSIONAL_NOME}}, CRO {{PROFISSIONAL_CRO}}, atesto que o(a) paciente {{PACIENTE_NOME}}, portador(a) do CPF {{PACIENTE_CPF}}, compareceu ao consultório odontológico em {{DATA_ATENDIMENTO}} às {{HORA_ATENDIMENTO}}.

{{OBSERVACOES}}

{{CIDADE}}, {{DATA_EMISSAO}}.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [
      { key: 'OBSERVACOES', label: 'Observações', type: 'textarea', required: false },
      { key: 'CIDADE', label: 'Cidade', type: 'text', required: true },
    ],
  },
  {
    key: 'comprovante_comparecimento',
    category: DOCUMENT_CATEGORIES.ATESTADOS,
    title: 'Comprovante de Comparecimento',
    body: `COMPROVANTE DE COMPARECIMENTO

Atesto que {{PACIENTE_NOME}}, portador(a) do CPF {{PACIENTE_CPF}}, compareceu ao consultório odontológico em {{DATA_ATENDIMENTO}} às {{HORA_ATENDIMENTO}} para atendimento odontológico.

{{CIDADE}}, {{DATA_EMISSAO}}.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [
      { key: 'CIDADE', label: 'Cidade', type: 'text', required: true },
    ],
  },

  // CONSENTIMENTOS
  {
    key: 'consent_implante',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Implante',
    body: `TERMO DE CONSENTIMENTO INFORMADO PARA IMPLANTE DENTÁRIO

IDENTIFICAÇÃO DA CLÍNICA
Clínica: {{NOME_DA_CLINICA}}
CNPJ: {{CNPJ_DA_CLINICA}}
Endereço: {{ENDERECO_DA_CLINICA}}
Telefone: {{TELEFONE_DA_CLINICA}}

IDENTIFICAÇÃO DO PACIENTE
Nome: {{NOME_PACIENTE}}
CPF: {{CPF_PACIENTE}}
Data de nascimento: {{DATA_NASCIMENTO}}

IDENTIFICAÇÃO DO PROFISSIONAL
Cirurgião-Dentista: {{NOME_PROFISSIONAL}}
CRO: {{CRO_PROFISSIONAL}}

DESCRIÇÃO DO PROCEDIMENTO
Declaro que fui informado(a) sobre o tratamento proposto, que consiste na instalação cirúrgica de implante dentário, dispositivo utilizado como substituto artificial da raiz do dente, com finalidade de reabilitação funcional e estética.
Estou ciente de que o tratamento depende de osseointegração, podendo não ocorrer de forma satisfatória em todos os casos, não havendo garantia de sucesso permanente.

ALTERNATIVAS DE TRATAMENTO
Fui informado(a) sobre alternativas, como próteses removíveis, próteses fixas convencionais ou manutenção da condição atual (sem tratamento). Tive a oportunidade de esclarecer dúvidas e optar livremente.

FATORES QUE INFLUENCIAM O SUCESSO
Estou ciente de que o sucesso depende de comparecimento às consultas, cumprimento das orientações, higiene bucal adequada, não manipular o implante, uso correto de medicações, retornos periódicos e não interromper o tratamento sem orientação.

RISCOS E POSSÍVEIS COMPLICAÇÕES
Fui informado(a) sobre riscos e intercorrências, incluindo: dor e edema, sangramentos, infecção, lesões em dentes adjacentes, limitação de abertura bucal, lesão nervosa com dormência/formigamento temporário ou raramente permanente, comunicação com seio maxilar/cavidade nasal, sinusite, falha de osseointegração, fratura de implante/componentes e necessidade de procedimentos adicionais.

MEDICAÇÕES E ANESTESIA
Estou ciente de que medicamentos e anestésicos podem causar sonolência e redução de atenção/coordenação. Fui orientado(a) a não dirigir ou operar máquinas por no mínimo 24 horas após o procedimento ou enquanto estiver sob efeito das medicações.

Local e data: {{CIDADE}}, {{DATA_ATUAL}} às {{HORA_ATUAL}}.

_________________________________________________
Assinatura do Paciente/Responsável

_________________________________________________
Assinatura do Cirurgião-Dentista
{{NOME_PROFISSIONAL}}
CRO: {{CRO_PROFISSIONAL}}`,
    fields: [],
  },
  {
    key: 'consent_exodontia',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Exodontia',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
EXODONTIA (EXTRAÇÃO DENTÁRIA)

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o procedimento de extração dentária, incluindo riscos possíveis como sangramento, infecção e necessidade de cuidados pós-operatórios.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_ortodontia',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Ortodontia',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
TRATAMENTO ORTODÔNTICO

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o tratamento ortodôntico, incluindo duração estimada, necessidade de uso de aparelho e cuidados de higiene.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_endodontia',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Endodontia',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
TRATAMENTO ENDODÔNTICO (CANAL)

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o tratamento de canal, incluindo possíveis desconfortos pós-operatórios e necessidade de restauração posterior.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_protese',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Prótese',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
CONFECÇÃO DE PRÓTESE DENTÁRIA

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o procedimento de confecção de prótese dentária, incluindo materiais utilizados, duração do tratamento e cuidados necessários.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_enxerto_osseo',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Enxerto Ósseo',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
ENXERTO ÓSSEO

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o procedimento de enxerto ósseo, incluindo riscos, tempo de cicatrização e necessidade de acompanhamento.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_enxerto_conjuntivo',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Enxerto Conjuntivo',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
ENXERTO CONJUNTIVO

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o procedimento de enxerto de tecido conjuntivo, incluindo cuidados pós-operatórios e tempo de cicatrização.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_toxina_botulinica',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Toxina Botulínica',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
APLICAÇÃO DE TOXINA BOTULÍNICA

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o procedimento de aplicação de toxina botulínica, incluindo efeitos esperados, duração e possíveis efeitos colaterais.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },
  {
    key: 'consent_contencao_odontopediatria',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Contenção Odontopediatria',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
CONTENÇÃO EM ODONTOPEDIATRIA

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}
Responsável: {{RESPONSAVEL_NOME}}

Fui informado(a) sobre o procedimento de contenção em odontopediatria, incluindo cuidados necessários e acompanhamento.

Data: {{DATA_EMISSAO}}

Assinatura do Responsável: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [
      { key: 'RESPONSAVEL_NOME', label: 'Nome do Responsável', type: 'text', required: true },
    ],
  },
  {
    key: 'consent_sedacao_consciente',
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
    title: 'Sedação Consciente',
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO
SEDAÇÃO CONSCIENTE

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Fui informado(a) sobre o procedimento de sedação consciente, incluindo riscos, contraindicações e cuidados pré e pós-operatórios.

Data: {{DATA_EMISSAO}}

Assinatura do Paciente: _________________________

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [],
  },

  // ORIENTAÇÕES E CUIDADOS
  {
    key: 'orient_pos_operatorios',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Pós-Operatórios',
    body: `ORIENTAÇÕES PÓS-OPERATÓRIAS

Paciente: {{PACIENTE_NOME}}

Após o procedimento realizado em {{DATA_ATENDIMENTO}}, siga as seguintes orientações:

1. Mantenha repouso relativo nas primeiras 24 horas.
2. Aplique gelo no local por 20 minutos, com intervalos de 20 minutos, nas primeiras 6 horas.
3. Evite alimentos quentes e duros nas primeiras 24 horas.
4. Mantenha higiene oral adequada, evitando a região operada nas primeiras 24 horas.
5. Em caso de sangramento excessivo ou dor intensa, entre em contato imediatamente.

{{OBSERVACOES_ADICIONAIS}}

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [
      { key: 'OBSERVACOES_ADICIONAIS', label: 'Observações Adicionais', type: 'textarea', required: false },
    ],
  },
  {
    key: 'orient_aparelho_fixo',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Aparelho Fixo',
    body: `ORIENTAÇÕES PARA USO DE APARELHO FIXO

Paciente: {{PACIENTE_NOME}}

1. Escove os dentes após cada refeição, com atenção especial aos braquetes.
2. Use fio dental diariamente.
3. Evite alimentos duros e pegajosos.
4. Compareça às consultas de manutenção conforme agendado.
5. Em caso de soltura de braquete ou fio, entre em contato.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_implantes_osseointegrados',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Implantes Osseointegrados',
    body: `ORIENTAÇÕES PARA IMPLANTES OSSEOINTEGRADOS

Paciente: {{PACIENTE_NOME}}

1. Mantenha higiene oral rigorosa, especialmente ao redor do implante.
2. Use escova macia e fio dental específico para implantes.
3. Evite fumar e consumir álcool excessivamente.
4. Compareça às consultas de acompanhamento conforme agendado.
5. Em caso de mobilidade ou desconforto, entre em contato imediatamente.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_pre_operatorio_implantes',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Pré-Operatório de Implantes',
    body: `ORIENTAÇÕES PRÉ-OPERATÓRIAS PARA IMPLANTES

Paciente: {{PACIENTE_NOME}}

Antes do procedimento de implante:

1. Mantenha jejum de 6 horas antes do procedimento (se houver sedação).
2. Informe sobre uso de medicamentos e alergias.
3. Evite álcool e cigarro 48 horas antes.
4. Compareça com acompanhante, se necessário.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_pos_operatorio_implantes',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Pós-Operatório dos Implantes',
    body: `ORIENTAÇÕES PÓS-OPERATÓRIAS PARA IMPLANTES

Paciente: {{PACIENTE_NOME}}

Após a cirurgia de implante:

1. Aplique gelo no local por 20 minutos, com intervalos de 20 minutos, nas primeiras 6 horas.
2. Mantenha dieta líquida e pastosa nas primeiras 48 horas.
3. Evite enxaguantes bucais nas primeiras 24 horas.
4. Mantenha higiene oral adequada, evitando a região operada nas primeiras 24 horas.
5. Compareça às consultas de acompanhamento conforme agendado.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_clareamento_dental',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Clareamento Dental',
    body: `ORIENTAÇÕES PARA CLAREAMENTO DENTAL

Paciente: {{PACIENTE_NOME}}

Após o procedimento de clareamento:

1. Evite alimentos e bebidas que possam manchar os dentes (café, chá, vinho, etc.) nas primeiras 48 horas.
2. Mantenha higiene oral adequada.
3. Use creme dental para dentes sensíveis, se necessário.
4. Em caso de sensibilidade excessiva, entre em contato.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_pos_extracao_dente_leite',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Pós Extração Dente de Leite',
    body: `ORIENTAÇÕES APÓS EXTRAÇÃO DE DENTE DE LEITE

Paciente: {{PACIENTE_NOME}}

1. Mantenha gaze no local por 30 minutos após a extração.
2. Evite bochechos nas primeiras 24 horas.
3. Mantenha dieta líquida e pastosa nas primeiras 24 horas.
4. Evite atividades físicas intensas nas primeiras 24 horas.
5. Em caso de sangramento excessivo, entre em contato.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_protese_protocolo',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Informações sobre cuidado com a prótese protocolo',
    body: `ORIENTAÇÕES PARA CUIDADO COM PRÓTESE PROTOCOLO

Paciente: {{PACIENTE_NOME}}

1. Mantenha higiene oral rigorosa, especialmente ao redor dos implantes.
2. Use escova macia e fio dental específico para implantes.
3. Remova a prótese para limpeza conforme orientado.
4. Evite alimentos muito duros.
5. Compareça às consultas de acompanhamento conforme agendado.

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [],
  },
  {
    key: 'orient_termo_garantia',
    category: DOCUMENT_CATEGORIES.ORIENTACOES,
    title: 'Termo de garantia',
    body: `TERMO DE GARANTIA

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

O procedimento {{PROCEDIMENTO}} realizado em {{DATA_ATENDIMENTO}} possui garantia de {{TEMPO_GARANTIA}}, desde que sejam seguidas as orientações fornecidas e comparecimento às consultas de acompanhamento.

{{CONDICOES_GARANTIA}}

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [
      { key: 'PROCEDIMENTO', label: 'Procedimento', type: 'text', required: true },
      { key: 'TEMPO_GARANTIA', label: 'Tempo de Garantia', type: 'text', required: true },
      { key: 'CONDICOES_GARANTIA', label: 'Condições da Garantia', type: 'textarea', required: false },
    ],
  },

  // SOLICITAÇÕES
  {
    key: 'solicit_exames',
    category: DOCUMENT_CATEGORIES.SOLICITACOES,
    title: 'Solicitações de Exames',
    body: `SOLICITAÇÃO DE EXAMES

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}
Data de Nascimento: {{PACIENTE_NASCIMENTO}}

Solicito a realização dos seguintes exames:

{{EXAMES_SOLICITADOS}}

{{OBSERVACOES}}

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [
      { key: 'EXAMES_SOLICITADOS', label: 'Exames Solicitados', type: 'textarea', required: true },
      { key: 'OBSERVACOES', label: 'Observações', type: 'textarea', required: false },
    ],
  },
  {
    key: 'solicit_proteses',
    category: DOCUMENT_CATEGORIES.SOLICITACOES,
    title: 'Solicitações de Próteses',
    body: `SOLICITAÇÃO DE PRÓTESE

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}

Solicito a confecção da seguinte prótese:

{{PROTESE_SOLICITADA}}

{{OBSERVACOES}}

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}
Data: {{DATA_EMISSAO}}`,
    fields: [
      { key: 'PROTESE_SOLICITADA', label: 'Prótese Solicitada', type: 'textarea', required: true },
      { key: 'OBSERVACOES', label: 'Observações', type: 'textarea', required: false },
    ],
  },

  // PRESCRIÇÕES
  {
    key: 'prescricao_medicamentos',
    category: DOCUMENT_CATEGORIES.PRESCRICOES,
    title: 'Prescrição Médica',
    body: `PRESCRIÇÃO MÉDICA

Paciente: {{PACIENTE_NOME}}
CPF: {{PACIENTE_CPF}}
Data de Nascimento: {{PACIENTE_NASCIMENTO}}
Data: {{DATA_EMISSAO}}

{{MEDICAMENTOS}}

{{INSTRUCOES}}

{{PROFISSIONAL_NOME}}
CRO: {{PROFISSIONAL_CRO}}`,
    fields: [
      { key: 'MEDICAMENTOS', label: 'Medicamentos', type: 'textarea', required: true, placeholder: 'Ex: Amoxicilina 500mg - 1 comprimido de 8/8h por 7 dias' },
      { key: 'INSTRUCOES', label: 'Instruções Adicionais', type: 'textarea', required: false },
    ],
  },
];

/**
 * Busca templates por categoria
 */
export const getTemplatesByCategory = (category) => {
  return documentTemplates.filter((t) => t.category === category);
};

/**
 * Busca template por key
 */
export const getTemplateByKey = (key) => {
  return documentTemplates.find((t) => t.key === key) || null;
};

/**
 * Substitui placeholders no texto do template
 */
export const replaceTemplateVariables = (templateBody, variables) => {
  let result = templateBody;
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value || '');
  });
  return result;
};
