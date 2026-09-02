/**
 * Seeds de modelos por tipo de tratamento e termos de consentimento.
 */
import { createId } from '../services/helpers.js';
import {
  CONTRACT_CATEGORIES,
  TREATMENT_TYPES,
  TREATMENT_TYPE_LABELS,
} from './contractConstants.js';

const TREATMENT_INTRO = (label) =>
  `<p><strong>Tratamento:</strong> ${label}</p><p>Este documento complementa o contrato de prestação de serviços odontológicos, detalhando riscos, benefícios, alternativas e condições específicas do plano aprovado.</p>`;

const CONSENT_BASE = (label) =>
  `<h2>Termo de Consentimento Informado — ${label}</h2>
<p>Declaro ter sido informado(a) de forma clara e adequada sobre o tratamento proposto, incluindo diagnóstico, objetivos, etapas, materiais envolvidos, riscos, benefícios, alternativas e custos estimados.</p>
<p>Autorizo a realização do(s) procedimento(s) descrito(s) no orçamento #orcamento_numero, aprovado em #orcamento_data, conforme tabela:</p>
<p>#procedimentos</p>
<p><strong>Dentes/regiões:</strong> #dentes</p>
<p><strong>Valor total:</strong> R$ #valor_total (#totalContratoExtenso)</p>
<p>Comprometo-me a seguir as orientações pré e pós-operatórias e a comparecer às consultas agendadas.</p>`;

const TREATMENT_BLOCKS = {
  [TREATMENT_TYPES.IMPLANTE_UNITARIO]: {
    risks: '<p>Riscos incluem, sem limitação: falha de osseointegração, infecção, sensibilidade, necessidade de procedimentos complementares e variação de resultado estético/funcional.</p>',
    warranty: '<p>Garantia conforme política da clínica para componentes e trabalho laboratorial, observados cuidados de higiene e comparecimento às revisões.</p>',
  },
  [TREATMENT_TYPES.ORTODONTIA]: {
    risks: '<p>Riscos incluem: desconforto inicial, alterações periodontais, recidiva após remoção do aparelho, necessidade de contenção e tempo prolongado de tratamento.</p>',
    warranty: '<p>Manutenções conforme periodicidade #manutencaoMeses meses. Resultados dependem de adesão do paciente às orientações.</p>',
  },
  [TREATMENT_TYPES.CLAREAMENTO]: {
    risks: '<p>Possível sensibilidade transitória, variação de tonalidade e necessidade de retoques. Resultado depende de hábitos (café, tabaco, etc.).</p>',
    warranty: '<p>Orientações de manutenção serão fornecidas. Retoques podem ser cobrados à parte.</p>',
  },
};

function defaultBlocksFor(type) {
  const custom = TREATMENT_BLOCKS[type];
  return {
    risks: custom?.risks || '<p>Foram esclarecidos os riscos inerentes ao procedimento, benefícios esperados e alternativas terapêuticas.</p>',
    warranty: custom?.warranty || '<p>Condições de garantia e manutenção conforme política da clínica e especificações do plano aprovado.</p>',
  };
}

/**
 * @param {object} db
 * @param {string} clinicId
 */
export function seedTreatmentContractTemplates(db, clinicId, { changedRef } = {}) {
  const mark = () => {
    if (changedRef) changedRef.changed = true;
  };
  if (!Array.isArray(db.contractTemplates)) {
    db.contractTemplates = [];
    mark();
  }
  const now = new Date().toISOString();
  const existing = db.contractTemplates.filter(
    (t) => t.clinicId === clinicId && t.type === 'treatment_template',
  );
  if (existing.length >= Object.keys(TREATMENT_TYPES).length) return;

  for (const type of Object.values(TREATMENT_TYPES)) {
    const has = db.contractTemplates.some(
      (t) => t.clinicId === clinicId && t.treatmentType === type && t.type === 'treatment_template',
    );
    if (has) continue;
    mark();
    const label = TREATMENT_TYPE_LABELS[type] || type;
    const blocks = defaultBlocksFor(type);
    const content = `${TREATMENT_INTRO(label)}
<h3>Riscos e esclarecimentos</h3>${blocks.risks}
<h3>Garantia e manutenção</h3>${blocks.warranty}
<h3>Condições financeiras</h3>
<p>Valor total: R$ #valor_total. Entrada: R$ #entrada. Parcelas: #parcelas. Forma de pagamento: #forma_pagamento.</p>`;

    db.contractTemplates.push({
      id: createId('ctpl'),
      clinicId,
      tenant_id: null,
      name: `Contrato — ${label}`,
      type: 'treatment_template',
      category: CONTRACT_CATEGORIES.SERVICOS,
      treatmentType: type,
      content,
      isActive: true,
      isDefault: false,
      version: 1,
      usageCount: 0,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    });

    const consentContent = CONSENT_BASE(label);
    db.contractTemplates.push({
      id: createId('ctpl'),
      clinicId,
      tenant_id: null,
      name: `Consentimento — ${label}`,
      type: 'treatment_template',
      category: CONTRACT_CATEGORIES.CONSENTIMENTO,
      treatmentType: type,
      content: consentContent,
      isActive: true,
      isDefault: false,
      version: 1,
      usageCount: 0,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const termCategories = [
    { cat: CONTRACT_CATEGORIES.LGPD, name: 'Termo LGPD — Tratamento de Dados', body: '<p>Autorizo o tratamento dos meus dados pessoais e sensíveis de saúde pela clínica #clinica_nome, CNPJ #clinica_cnpj, para fins de atendimento, faturamento, comunicação e cumprimento de obrigações legais, nos termos da LGPD.</p>' },
    { cat: CONTRACT_CATEGORIES.USO_IMAGEM, name: 'Termo de Uso de Imagem', body: '<p>Autorizo o uso de imagens (fotos/vídeos) do meu tratamento para fins de registro clínico, educação interna e divulgação institucional da clínica, sem identificação nominal quando aplicável.</p>' },
    { cat: CONTRACT_CATEGORIES.MENOR_IDADE, name: 'Termo de Autorização — Menor de Idade', body: '<p>Eu, #responsavel_legal, CPF #responsavel_cpf, na qualidade de responsável legal de #paciente_nome, autorizo o tratamento odontológico proposto e assumo responsabilidade pelas obrigações financeiras e comparecimento às consultas.</p>' },
    { cat: CONTRACT_CATEGORIES.RISCOS, name: 'Termo de Ciência de Riscos', body: '<p>Declaro ciência dos riscos gerais e específicos do tratamento, conforme esclarecido pelo profissional #profissional_nome (CRO #profissional_cro).</p>' },
    { cat: CONTRACT_CATEGORIES.DESISTENCIA, name: 'Termo de Desistência / Interrupção', body: '<p>Declaro minha decisão de interromper/desistir do tratamento, ciente das consequências clínicas e financeiras, incluindo valores já prestados e materiais utilizados.</p>' },
    { cat: CONTRACT_CATEGORIES.POS_OPERATORIO, name: 'Termo de Retorno e Pós-operatório', body: '<p>Comprometo-me a comparecer às consultas de retorno e seguir rigorosamente as orientações pós-operatórias fornecidas pela equipe.</p>' },
  ];

  for (const term of termCategories) {
    const has = db.contractTemplates.some(
      (t) => t.clinicId === clinicId && t.category === term.cat && t.type === 'consent_term',
    );
    if (has) continue;
    mark();
    db.contractTemplates.push({
      id: createId('ctpl'),
      clinicId,
      tenant_id: null,
      name: term.name,
      type: 'consent_term',
      category: term.cat,
      treatmentType: null,
      content: term.body,
      isActive: true,
      isDefault: true,
      version: 1,
      usageCount: 0,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}
