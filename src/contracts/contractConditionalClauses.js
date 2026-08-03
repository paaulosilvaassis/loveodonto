import { TREATMENT_TYPES } from './contractConstants.js';

function clause(title, paragraphs) {
  return { title, html: paragraphs.map((p) => `<p>${p}</p>`).join('') };
}

export const CONDITIONAL_CLAUSES = {
  [TREATMENT_TYPES.ORTODONTIA]: clause('Disposições específicas — Ortodontia', [
    'A duração estimada do tratamento ortodôntico é de #manutencaoMeses meses, podendo variar conforme resposta biológica e cooperação do paciente.',
    'O paciente compromete-se a comparecer às manutenções mensais e a seguir as orientações de higiene e uso de aparelhos.',
    'Há risco de reabsorção radicular, alterações de ATM e necessidade de contenção após o tratamento ativo.',
    'A contenção pode ser cobrada à parte quando não incluída no orçamento aprovado.',
    'Queda de bráquete, banda ou fio poderá gerar cobrança conforme tabela vigente.',
    'A remoção antecipada do aparelho a pedido do paciente poderá gerar custos de remoção, limpeza e reposição.',
  ]),
  [TREATMENT_TYPES.IMPLANTE_UNITARIO]: clause('Disposições específicas — Implantes', [
    'A osseointegração depende de exames, condição óssea, higiene, tabagismo, diabetes e comparecimento às revisões.',
    'Não há garantia absoluta de sucesso da integração óssea em todos os casos.',
    'Prótese sobre implante pode ter custo separado quando indicado no orçamento.',
    'Perda por mau uso, trauma, higiene deficiente ou abandono não caracteriza garantia automática.',
  ]),
  [TREATMENT_TYPES.PROTOCOLO_TOTAL]: clause('Disposições específicas — Protocolo / Implantes', [
    'Tratamentos de protocolo exigem exames pré-operatórios e revisões periódicas obrigatórias.',
    'A resposta óssea e a adaptação protética são individuais e podem exigir ajustes adicionais.',
    'Peças protéticas personalizadas possuem custo mesmo em caso de desistência após início laboratorial.',
  ]),
  [TREATMENT_TYPES.PROTESE_REMOVIVEL]: clause('Disposições específicas — Prótese removível', [
    'A adaptação pode exigir ajustes sucessivos; cor e forma devem ser aprovadas antes da finalização.',
    'Peças laboratoriais personalizadas possuem custo mesmo em caso de desistência.',
    'Manutenção e higienização são de responsabilidade do paciente.',
  ]),
  [TREATMENT_TYPES.PROTESE_FLEXIVEL]: clause('Disposições específicas — Prótese flexível', [
    'A adaptação pode exigir ajustes; fratura por queda ou mau uso não é garantia automática.',
    'Peças personalizadas possuem custo laboratorial mesmo em caso de desistência.',
  ]),
  [TREATMENT_TYPES.PONTE_FIXA]: clause('Disposições específicas — Prótese fixa', [
    'Cor, forma e estética devem ser aprovadas antes da cementação definitiva.',
    'Manutenção e higiene são indispensáveis à longevidade da restauração.',
  ]),
  [TREATMENT_TYPES.LENTE_PORCELANA]: clause('Disposições específicas — Lentes / Estética', [
    'O resultado depende de cor inicial, anatomia, mordida, hábitos e higiene.',
    'Simulações são previsões, não promessa de resultado idêntico.',
    'Procedimentos estéticos exigem TCLE específico e autorização expressa do paciente.',
  ]),
  [TREATMENT_TYPES.LENTE_RESINA]: clause('Disposições específicas — Facetas em resina', [
    'O resultado depende de hábitos, pigmentação e manutenção periódica.',
    'Simulações não constituem promessa absoluta de resultado.',
  ]),
  [TREATMENT_TYPES.CLAREAMENTO]: clause('Disposições específicas — Clareamento', [
    'O resultado varia conforme organismo, hábitos e cor inicial.',
    'Pode ocorrer sensibilidade transitória e recidiva de cor.',
  ]),
  [TREATMENT_TYPES.CIRURGIA]: clause('Disposições específicas — Cirurgia', [
    'Há riscos de dor, edema, sangramento, infecção, parestesia e alveolite.',
    'O descumprimento das orientações pós-operatórias pode comprometer o resultado.',
  ]),
  [TREATMENT_TYPES.EXTRACAO]: clause('Disposições específicas — Extração', [
    'Podem ocorrer dor, edema, sangramento e alveolite.',
    'Repouso e medicação conforme prescrição são obrigatórios.',
  ]),
  [TREATMENT_TYPES.ENDODONTIA]: clause('Disposições específicas — Endodontia', [
    'Pode ocorrer dor pós-operatória e necessidade de restauração ou prótese posterior.',
    'Há risco de fratura dental e possibilidade de retratamento ou cirurgia parendodôntica.',
  ]),
};

export function getConditionalClausesForTreatments(treatmentTypes = []) {
  const seen = new Set();
  return treatmentTypes
    .map((type) => CONDITIONAL_CLAUSES[type])
    .filter((clauseItem) => {
      if (!clauseItem || seen.has(clauseItem.title)) return false;
      seen.add(clauseItem.title);
      return true;
    });
}

export const FIXED_LEGAL_CLAUSES = {
  object: 'Prestação de serviços odontológicos conforme plano de tratamento, orçamento aprovado, procedimentos descritos, prontuário, odontograma e documentos anexos.',
  patientObligations: [
    'Comparecer pontualmente às consultas agendadas, avisando faltas com 24 horas de antecedência.',
    'Seguir orientações clínicas, manter higiene bucal e informar doenças, medicamentos, alergias e alterações de saúde.',
    'Realizar exames solicitados, manter pagamentos em dia e comparecer às revisões e manutenções.',
    'Não interromper o tratamento sem orientação profissional.',
  ],
  clinicObligations: [
    'Aplicar técnica adequada e prestar atendimento conforme planejamento aprovado.',
    'Registrar evolução em prontuário, resguardar sigilo e cumprir normas éticas.',
    'Informar riscos, limites e alternativas; assumir responsabilidade pelos serviços efetivamente prestados.',
  ],
  default: 'Em caso de atraso superior a 30 dias, poderá haver suspensão de procedimentos eletivos, cobrança administrativa e manutenção da obrigação pelos serviços já executados.',
  abandonment: 'Considera-se abandono: três faltas consecutivas, ausência superior a 30 dias sem acordo, inadimplência superior a 30 dias ou ausência de resposta aos contatos da clínica.',
  warranties: 'O tratamento odontológico envolve resposta biológica individual. A obrigação técnica é de meio, salvo previsão legal específica. Não há garantia de resultado idêntico a simulações ou expectativas subjetivas.',
  lgpd: 'O paciente autoriza o tratamento de dados pessoais e sensíveis para cadastro, prontuário, exames, comunicação, faturamento, cobrança, assinatura eletrônica, auditoria e obrigações legais, podendo exercer direitos previstos na LGPD.',
  imageUse: 'O uso de imagem para publicidade depende de autorização expressa e separada; a ausência de autorização limita o uso ao prontuário e fins clínicos.',
};
