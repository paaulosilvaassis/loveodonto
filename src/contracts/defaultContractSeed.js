/**
 * Seed do contrato padrão (cláusulas) por clínica.
 * Texto base profissional em PT-BR; revisão jurídica pela clínica é recomendada.
 */
import { createId } from '../services/helpers.js';

const DISCLAIMER =
  '<p><em>Modelo base do sistema Love Odonto — sujeito à adequação à realidade da clínica e revisão por profissional habilitado.</em></p>';

/** Bloco 1: variantes condicionais (has_financial_responsible no paciente) */
const BLOCK1_NO_FIN = `Pelo presente instrumento particular de prestação de serviços odontológicos, de um lado, #emissorNomeRazaoSocial, inscrito sob o nº #emissorCNPJCPF, com sede à #clinicaEndereco, doravante denominado simplesmente CLÍNICA, e, de outro lado, #pacienteNomeCompleto, inscrito sob o CPF nº #pacienteCPF, residente e domiciliado à #pacienteEndereco, doravante denominado PACIENTE, têm entre si justo e contratado o que segue:`;

const BLOCK1_WITH_FIN = `Pelo presente instrumento particular de prestação de serviços odontológicos, de um lado, #emissorNomeRazaoSocial, inscrito sob o nº #emissorCNPJCPF, com sede à #clinicaEndereco, doravante denominado simplesmente CLÍNICA, e, de outro lado, o paciente #dependenteNomeCompleto, neste ato representado por seu responsável financeiro #pacienteNomeCompleto, inscrito no CPF nº #pacienteCPF, residente e domiciliado à #pacienteEndereco, doravante denominado RESPONSÁVEL, têm entre si justo e contratado o que segue:`;

const STANDARD_BLOCKS = [
  { blockNumber: 1, title: 'Das Partes', conditionType: 'parties_no_financial', orderIndex: 1, content: BLOCK1_NO_FIN },
  { blockNumber: 1, title: 'Das Partes (responsável financeiro)', conditionType: 'parties_with_financial', orderIndex: 2, content: BLOCK1_WITH_FIN },
  { blockNumber: 2, title: 'Do Objeto', conditionType: 'always', orderIndex: 10, content: '<p>O presente contrato tem por objeto a prestação de serviços odontológicos descritos no plano de tratamento vinculado ao orçamento aprovado, observadas as normas técnicas e éticas do Conselho Federal de Odontologia e do Código de Defesa do Consumidor.</p>' },
  { blockNumber: 3, title: 'Dos Procedimentos', conditionType: 'always', orderIndex: 20, content: '<p>Constam do presente contrato os procedimentos descritos na tabela abaixo, decorrentes do orçamento aprovado:</p><p>#procedimentos</p><p><strong>Observações do orçamento:</strong> #orcamentoObservacoes</p>' },
  { blockNumber: 4, title: 'Da Duração do Tratamento', conditionType: 'always', orderIndex: 30, content: '<p>A duração estimada do tratamento observará o plano clínico, podendo ser ajustada por indicação profissional, respeitando a evolução clínica e a adesão do paciente às orientações.</p>' },
  { blockNumber: 5, title: 'Ortodontia', conditionType: 'optional_orthodontics', orderIndex: 40, content: '<p>Quando aplicável ao plano aprovado, poderão constar procedimentos de Ortodontia, nos termos orientados pelo profissional responsável, com esclarecimentos sobre riscos, benefícios e alternativas.</p>' },
  { blockNumber: 6, title: 'Manutenção Ortodôntica', conditionType: 'optional_orthodontics', orderIndex: 50, content: '<p>Em tratamentos ortodônticos, o paciente compromete-se a comparecer às consultas de manutenção conforme periodicidade indicada (#manutencaoMeses). O descumprimento poderá impactar prazos, resultados e custos adicionais.</p>' },
  { blockNumber: 7, title: 'Do Pagamento', conditionType: 'always', orderIndex: 60, content: '<p>O valor total do contrato é de <strong>R$ #totalContrato</strong> (#totalContratoExtenso), sendo as parcelas/títulos conforme tabela:</p><p>#parcelas</p><p>Manutenções ortodônticas, quando houver: total de <strong>R$ #totalManutencoes</strong> (#totalManutencoesExtenso).</p><p><strong>Total geral:</strong> R$ #totalGeralContrato (#totalGeralContratoExtenso).</p>' },
  { blockNumber: 8, title: 'Da Rescisão do Contrato', conditionType: 'always', orderIndex: 70, content: '<p>A rescisão observará a legislação aplicável, quitando-se valores devidos pelos serviços já prestados e materiais utilizados, conforme política da clínica e comprovação documental.</p>' },
  { blockNumber: 9, title: 'Das Garantias', conditionType: 'always', orderIndex: 80, content: '<p>As garantias legais aplicáveis ao fornecimento de serviços de saúde são observadas, sem prejuízo de esclarecimentos específicos por procedimento quando necessário.</p>' },
  { blockNumber: 10, title: 'Das Obrigações do Paciente', conditionType: 'always', orderIndex: 90, content: '<p>O paciente e/ou responsável comprometem-se a fornecer informações verídicas, cumprir orientações, comparecer às consultas agendadas e realizar os pagamentos nos vencimentos acordados.</p>' },
  { blockNumber: 11, title: 'Das Obrigações da Clínica', conditionType: 'always', orderIndex: 100, content: '<p>A clínica compromete-se a prestar os serviços com zelo técnico, em ambiente adequado, por profissionais legalmente habilitados, resguardando a dignidade e a privacidade do paciente.</p>' },
  { blockNumber: 12, title: 'Do Abandono de Tratamento', conditionType: 'always', orderIndex: 110, content: '<p>O abandono ou interrupção prolongada sem justificativa poderá ensejar arquivamento do caso, cobrança de valores em aberto e necessidade de novo planejamento para retomada.</p>' },
  { blockNumber: 13, title: 'Do Foro', conditionType: 'always', orderIndex: 120, content: '<p>Fica eleito o foro da comarca de #clinicaCidadeEstado, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir questões oriundas deste contrato.</p>' },
];

/**
 * Garante template padrão do sistema e blocos para a clínica, se ainda não existirem.
 * @param {object} db estado do IndexedDB (withDb)
 */
export function seedDefaultContractsForDb(db) {
  const clinicId = db?.clinicProfile?.id || 'clinic-1';
  if (!Array.isArray(db.contractTemplates)) db.contractTemplates = [];
  if (!Array.isArray(db.contractBlocks)) db.contractBlocks = [];
  if (!Array.isArray(db.generatedContracts)) db.generatedContracts = [];
  if (!Array.isArray(db.contractAuditLogs)) db.contractAuditLogs = [];
  if (!db.contractSeqByClinic || typeof db.contractSeqByClinic !== 'object') db.contractSeqByClinic = {};

  const hasSystem = db.contractTemplates.some(
    (t) => t.clinicId === clinicId && t.type === 'system_default' && t.isActive !== false
  );
  if (hasSystem) return;

  const now = new Date().toISOString();
  const templateId = createId('ctpl');
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
