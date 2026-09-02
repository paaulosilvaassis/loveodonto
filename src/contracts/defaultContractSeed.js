/**
 * Seed do contrato padrão (cláusulas) por clínica.
 * Texto base profissional em PT-BR; revisão jurídica pela clínica é recomendada.
 */
import { createId } from '../services/helpers.js';

const DISCLAIMER =
  '<p><em>Modelo base do sistema Love Odonto — sujeito à adequação à realidade da clínica e revisão por profissional habilitado.</em></p>';

import { QUALIFICATION_TEMPLATE_PATIENT_ONLY, QUALIFICATION_TEMPLATE_WITH_RESPONSIBLE } from './contractQualificationTemplates.js';
import { FIXED_LEGAL_CLAUSES } from './contractConditionalClauses.js';

/** Bloco 1: variantes condicionais (has_financial_responsible / menor / responsável) */
const BLOCK1_NO_FIN = QUALIFICATION_TEMPLATE_PATIENT_ONLY;

const BLOCK1_WITH_FIN = QUALIFICATION_TEMPLATE_WITH_RESPONSIBLE;

const STANDARD_BLOCKS = [
  { blockNumber: 1, title: 'Das Partes', conditionType: 'parties_no_financial', orderIndex: 1, content: BLOCK1_NO_FIN },
  { blockNumber: 1, title: 'Das Partes (responsável financeiro)', conditionType: 'parties_with_financial', orderIndex: 2, content: BLOCK1_WITH_FIN },
  { blockNumber: 2, title: 'Do Objeto', conditionType: 'always', orderIndex: 10, content: `<p>${FIXED_LEGAL_CLAUSES.object}</p>` },
  { blockNumber: 3, title: 'Dos Serviços Contratados', conditionType: 'always', orderIndex: 20, content: '<p>Constam do presente contrato os procedimentos aprovados no orçamento vinculado:</p><p>#procedimentos</p><p><strong>Observações:</strong> #orcamentoObservacoes</p>' },
  { blockNumber: 4, title: 'Da Duração do Tratamento', conditionType: 'always', orderIndex: 30, content: '<p>A duração do tratamento poderá variar conforme resposta biológica, comparecimento, exames, intercorrências, necessidade clínica, laboratório, cicatrização, colaboração do paciente e planejamento profissional.</p>' },
  { blockNumber: 5, title: 'Ortodontia', conditionType: 'optional_orthodontics', orderIndex: 40, content: '<p>Quando aplicável ao plano aprovado, poderão constar procedimentos de Ortodontia, nos termos orientados pelo profissional responsável, com esclarecimentos sobre riscos, benefícios e alternativas.</p>' },
  { blockNumber: 6, title: 'Manutenção Ortodôntica', conditionType: 'optional_orthodontics', orderIndex: 50, content: '<p>Em tratamentos ortodônticos, o paciente compromete-se a comparecer às consultas de manutenção conforme periodicidade indicada (#manutencaoMeses). O descumprimento poderá impactar prazos, resultados e custos adicionais.</p>' },
  { blockNumber: 7, title: 'Do Pagamento', conditionType: 'always', orderIndex: 60, content: '<p>Valor do tratamento: <strong>R$ #totalContrato</strong> (#totalContratoExtenso). Entrada: R$ #entrada. Saldo: R$ #saldo. Forma: #formaPagamento. Parcelas: #quantidadeParcelas de R$ #valorParcela. Primeiro vencimento: #dataPrimeiroVencimento.</p><p>#parcelas</p><p><strong>Total geral:</strong> R$ #totalGeralContrato (#totalGeralContratoExtenso).</p>' },
  { blockNumber: 8, title: 'Da Inadimplência', conditionType: 'always', orderIndex: 65, content: `<p>${FIXED_LEGAL_CLAUSES.default}</p>` },
  { blockNumber: 9, title: 'Da Rescisão do Contrato', conditionType: 'always', orderIndex: 70, content: '<p>A rescisão poderá ocorrer por qualquer das partes. Tratamentos iniciados, executados ou personalizados serão apurados. Serviços laboratoriais e peças personalizadas podem ser cobrados conforme fase. Reembolso apenas do não executado, quando cabível.</p>' },
  { blockNumber: 10, title: 'Das Garantias e Limites', conditionType: 'always', orderIndex: 80, content: `<p>${FIXED_LEGAL_CLAUSES.warranties}</p>` },
  { blockNumber: 11, title: 'Das Obrigações do Paciente', conditionType: 'always', orderIndex: 90, content: `<ul>${FIXED_LEGAL_CLAUSES.patientObligations.map((t) => `<li>${t}</li>`).join('')}</ul>` },
  { blockNumber: 12, title: 'Das Obrigações da Clínica', conditionType: 'always', orderIndex: 100, content: `<ul>${FIXED_LEGAL_CLAUSES.clinicObligations.map((t) => `<li>${t}</li>`).join('')}</ul>` },
  { blockNumber: 13, title: 'Do Abandono de Tratamento', conditionType: 'always', orderIndex: 110, content: `<p>${FIXED_LEGAL_CLAUSES.abandonment}</p>` },
  { blockNumber: 14, title: 'LGPD e Dados Sensíveis', conditionType: 'always', orderIndex: 115, content: `<p>${FIXED_LEGAL_CLAUSES.lgpd}</p>` },
  { blockNumber: 15, title: 'Uso de Imagem', conditionType: 'always', orderIndex: 118, content: `<p>${FIXED_LEGAL_CLAUSES.imageUse}</p>` },
  { blockNumber: 16, title: 'Do Foro', conditionType: 'always', orderIndex: 120, content: '<p>Fica eleito o foro da comarca de #clinicaCidadeEstado, renunciando as partes a qualquer outro, por mais privilegiado que seja, para dirimir eventuais dúvidas oriundas do presente contrato.</p>' },
];

/**
 * Garante template padrão do sistema e blocos para a clínica, se ainda não existirem.
 * @param {object} db estado do IndexedDB (withDb)
 */
export function seedDefaultContractsForDb(db, { changedRef } = {}) {
  const mark = () => {
    if (changedRef) changedRef.changed = true;
  };
  const clinicId = db?.clinicProfile?.id || 'clinic-1';
  if (!Array.isArray(db.contractTemplates)) {
    db.contractTemplates = [];
    mark();
  }
  if (!Array.isArray(db.contractBlocks)) {
    db.contractBlocks = [];
    mark();
  }
  if (!Array.isArray(db.generatedContracts)) {
    db.generatedContracts = [];
    mark();
  }
  if (!Array.isArray(db.contractAuditLogs)) {
    db.contractAuditLogs = [];
    mark();
  }
  if (!db.contractSeqByClinic || typeof db.contractSeqByClinic !== 'object') {
    db.contractSeqByClinic = {};
    mark();
  }

  const hasSystem = db.contractTemplates.some(
    (t) => t.clinicId === clinicId && t.type === 'system_default' && t.isActive !== false
  );
  if (hasSystem) return;

  const now = new Date().toISOString();
  const templateId = createId('ctpl');
  mark();
  db.contractTemplates.push({
    id: templateId,
    clinicId,
    name: 'Contrato odontológico — padrão Love Odonto',
    type: 'system_default',
    content: DISCLAIMER,
    isActive: true,
    version: 1,
    usageCount: 0,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  });

  for (const row of STANDARD_BLOCKS) {
    db.contractBlocks.push({
      id: createId('cblk'),
      clinicId,
      templateId,
      blockNumber: row.blockNumber,
      title: row.title,
      content: row.content,
      isActive: true,
      conditionType: row.conditionType,
      orderIndex: row.orderIndex,
      createdAt: now,
      updatedAt: now,
    });
  }
}
