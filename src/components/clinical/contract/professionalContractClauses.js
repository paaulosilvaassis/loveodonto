import { TREATMENT_TYPES } from '../../../contracts/contractConstants.js';

/** Garantias específicas por tipo de tratamento (Seção 6). */
export const TREATMENT_WARRANTY_CLAUSES = {
  [TREATMENT_TYPES.IMPLANTE_UNITARIO]: 'Em tratamentos com implantes, a garantia abrange os procedimentos executados conforme normas técnicas, observada a osseointegração e manutenção periódica. Falhas por mau uso, tabagismo, doenças sistêmicas não controladas ou ausência a retornos excluem cobertura.',
  [TREATMENT_TYPES.PROTOCOLO_TOTAL]: 'Tratamentos protocolo exigem manutenção periódica obrigatória e comparecimento a retornos programados. A garantia protética está condicionada ao cumprimento das orientações clínicas e higiene adequada.',
  [TREATMENT_TYPES.PROTESE_REMOVIVEL]: 'Próteses removíveis possuem garantia limitada a defeitos de fabricação e adaptação inicial, não cobrindo desgaste natural, rebases necessários por alteração óssea ou quebra por mau uso.',
  [TREATMENT_TYPES.PROTESE_FLEXIVEL]: 'Próteses flexíveis possuem garantia restrita a defeitos de material no período inicial, excluindo fraturas, manchas e desgaste decorrente de uso contínuo.',
  [TREATMENT_TYPES.PONTE_FIXA]: 'Próteses fixas têm garantia sobre execução técnica e adaptação, excluindo fraturas por trauma, carie em dentes pilares e descolamento por falta de higiene.',
  [TREATMENT_TYPES.ORTODONTIA]: 'Tratamentos ortodônticos exigem contenção após a fase ativa. A garantia não cobre recidiva por ausência de uso de contenção ou abandono de manutenções.',
  [TREATMENT_TYPES.LENTE_RESINA]: 'Lentes em resina possuem garantia limitada contra defeitos de execução inicial, excluindo manchas, desgaste e fraturas por hábitos parafuncionais.',
  [TREATMENT_TYPES.LENTE_PORCELANA]: 'Lentes de porcelana possuem garantia sobre adaptação e fixação inicial, excluindo fraturas por trauma, bruxismo não tratado e descolamento por higiene inadequada.',
  [TREATMENT_TYPES.CLAREAMENTO]: 'Clareamentos possuem garantia sobre execução do procedimento, não sobre manutenção de tonalidade, que depende de hábitos alimentares e higiene do paciente.',
  [TREATMENT_TYPES.ENDODONTIA]: 'Tratamentos de canal possuem garantia sobre execução técnica do procedimento realizado, excluindo falhas por fratura radicular, reinfecção por nova carie ou restauração inadequada.',
  [TREATMENT_TYPES.EXTRACAO]: 'Procedimentos de extração possuem garantia sobre execução cirúrgica, não cobrindo alveolite, infecções ou complicações por descumprimento de orientações pós-operatórias.',
  [TREATMENT_TYPES.CIRURGIA]: 'Procedimentos cirúrgicos possuem garantia sobre execução técnica, excluindo complicações por condições sistêmicas não informadas ou descumprimento de cuidados pós-operatórios.',
  [TREATMENT_TYPES.PERIODONTIA]: 'Tratamentos periodontais exigem manutenção periódica obrigatória. Sem retornos e higiene adequada, não há garantia contra recidiva da doença periodontal.',
};

export const LEGAL_CONTRACT_TEXTS = {
  object: 'O presente contrato tem por objeto a prestação de serviços odontológicos referentes ao plano de tratamento aprovado pelo CONTRATANTE, observadas as condições clínicas, técnicas e financeiras descritas neste instrumento, bem como os procedimentos especificados na cláusula terceira.',

  duration: 'O prazo estimado para execução do tratamento será contado a partir da data prevista de início, podendo ser alterado em razão de intercorrências clínicas, necessidade de exames complementares, comparecimento do paciente ou fatores biológicos individuais, mediante comunicação prévia e registro em prontuário.',

  warrantiesGeneral: 'As garantias aplicáveis limitam-se aos serviços executados pela CONTRATADA em conformidade com as normas técnicas e éticas da Odontologia, não abrangendo mau uso, trauma, descumprimento de orientações, ausência a retornos programados ou manutenções obrigatórias. Materiais seguem garantia do fabricante ou laboratório quando aplicável.',

  warrantiesMaintenance: 'Tratamentos que exijam manutenção periódica — incluindo, mas não se limitando a, ortodontia, implantes, próteses, protocolos e periodontia — dependem de comparecimento regular do CONTRATANTE. A ausência de manutenção poderá invalidar garantias e comprometer o resultado clínico.',

  warrantiesReturns: 'O CONTRATANTE deverá comparecer aos retornos clínicos agendados pela CONTRATADA. Consultas de urgência decorrentes de descumprimento de orientações ou ausência a retornos poderão ser cobradas separadamente.',

  patientObligations: [
    'Comparecer pontualmente às consultas e procedimentos agendados, comunicando impossibilidade com antecedência mínima de 24 (vinte e quatro) horas.',
    'Manter rigorosa higiene bucal conforme orientação profissional.',
    'Comparecer aos retornos e manutenções periódicas indicados.',
    'Comunicar imediatamente qualquer intercorrência, dor, sensibilidade ou complicação clínica.',
    'Informar condições de saúde, medicamentos em uso, alergias e histórico clínico relevante.',
    'Efetuar os pagamentos nas datas e condições estabelecidas neste contrato.',
  ],

  clinicObligations: [
    'Executar os serviços contratados com observância das normas éticas e técnicas da Odontologia.',
    'Manter sigilo profissional sobre informações clínicas do paciente.',
    'Manter prontuário odontológico atualizado conforme legislação vigente.',
    'Prestar atendimento em ambiente adequado, com biossegurança e profissionais habilitados.',
    'Informar o paciente sobre riscos, alternativas e limitações do tratamento.',
  ],

  default: [
    'O atraso no pagamento de qualquer parcela ensejará multa de 2% (dois por cento) sobre o valor devido, acrescido de juros de mora de 1% (um por cento) ao mês e correção monetária pelo índice legalmente aplicável.',
    'A inadimplência superior a 30 (trinta) dias poderá ensejar a suspensão de etapas futuras do tratamento até a regularização do débito.',
    'Persistindo a inadimplência, a CONTRATADA poderá adotar medidas de cobrança extrajudicial ou judicial, inclusive protesto de título e inclusão em cadastros de proteção ao crédito, conforme permitido em lei.',
    'Os encargos moratórios não eximem o CONTRATANTE da obrigação principal.',
  ],

  rescission: [
    'O CONTRATANTE poderá rescindir o presente contrato a qualquer tempo, mediante comunicação por escrito, permanecendo responsável pelo pagamento de procedimentos já executados, materiais adquiridos ou etapas concluídas.',
    'A CONTRATADA poderá rescindir o contrato em caso de inadimplência reiterada, descumprimento de orientações que coloque em risco o resultado clínico ou conduta incompatível com o atendimento.',
    'O abandono de tratamento, caracterizado pela ausência injustificada a 3 (três) ou mais consultas agendadas consecutivas, poderá ensejar rescisão automática, sem prejuízo das obrigações financeiras pendentes.',
    'Eventual reembolso de valores pagos por serviços não executados será calculado de forma proporcional, deduzidos custos administrativos, materiais personalizados e procedimentos já realizados.',
  ],

  lgpd: [
    'O CONTRATANTE declara ciência de que seus dados pessoais e sensíveis de saúde serão tratados pela CONTRATADA para fins de atendimento, faturamento, prontuário eletrônico, comunicação e cumprimento de obrigações legais, nos termos da Lei nº 13.709/2018 (LGPD).',
    'Os dados serão armazenados pelo prazo necessário ao cumprimento das finalidades descritas e exigências legais aplicáveis à área da saúde.',
    'O compartilhamento de dados ocorrerá apenas quando necessário a laboratórios, convênios, operadoras ou autoridades, sempre em conformidade com a legislação.',
    'O CONTRATANTE poderá exercer seus direitos de acesso, correção e demais previstos na LGPD mediante solicitação formal à CONTRATADA.',
  ],

  imageUse: 'O CONTRATANTE, quando aplicável, autoriza ou não autoriza o registro e uso de imagens clínicas para fins de prontuário, controle de qualidade e divulgação institucional, conforme opção expressa abaixo:',

  forum: 'Fica eleito o foro da comarca da sede da CONTRATADA para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.',
};

export function getTreatmentWarrantyText(treatmentType) {
  return TREATMENT_WARRANTY_CLAUSES[treatmentType] || null;
}

/** @deprecated Use LEGAL_CONTRACT_TEXTS */
export const PROFESSIONAL_LEGAL_CLAUSES = [];

export const LINKED_DOCUMENTS = [
  'Termo LGPD — Tratamento de dados pessoais',
  'Termo de consentimento informado',
  'Termo de uso de imagem',
  'Anamnese do paciente',
  'Planejamento clínico',
  'Orçamento aprovado',
];

export function getTreatmentSpecificClause() {
  return null;
}
