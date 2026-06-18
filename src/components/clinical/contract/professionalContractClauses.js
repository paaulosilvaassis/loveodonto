import { TREATMENT_TYPES } from '../../../contracts/contractConstants.js';

export const TREATMENT_WARRANTY_CLAUSES = {
  [TREATMENT_TYPES.IMPLANTE_UNITARIO]: 'Quanto aos implantes, a CONTRATADA garante a execução técnica do procedimento cirúrgico e protético, observada a osseointegração, o comparecimento do CONTRATANTE às revisões periódicas, a higiene bucal adequada e a ausência de fatores de risco não informados. Falhas decorrentes de mau uso, tabagismo, trauma, abandono do tratamento ou ausência injustificada aos retornos excluem a cobertura da garantia.',

  [TREATMENT_TYPES.PROTOCOLO_TOTAL]: 'Quanto aos protocolos protéticos sobre implantes, a garantia está condicionada à manutenção periódica obrigatória, ao comparecimento às consultas de revisão, à higiene bucal rigorosa e ao uso adequado da prótese. A garantia protética não abrange fraturas por trauma, desgaste por bruxismo não tratado ou abandono das manutenções prescritas.',

  [TREATMENT_TYPES.PROTESE_IMPLANTE]: 'Quanto às próteses fixas sobre implantes, a garantia abrange defeitos de fabricação e adaptação inicial, desde que respeitadas as orientações de uso, higiene e retornos periódicos. Não estão cobertos desgaste natural, quebra por trauma ou alterações decorrentes de não comparecimento às manutenções.',

  [TREATMENT_TYPES.PROTESE_REMOVIVEL]: 'Quanto às próteses removíveis, a garantia limita-se a defeitos de adaptação e confecção constatados no período inicial de uso, não abrangendo desgaste natural, reabsorção óssea progressiva, quebra por queda ou mau uso.',

  [TREATMENT_TYPES.PROTESE_FLEXIVEL]: 'Quanto às próteses flexíveis, a garantia cobre defeitos de confecção e adaptação inicial, excluindo rupturas por trauma, desgaste prematuro por higiene inadequada ou ausência aos retornos de manutenção.',

  [TREATMENT_TYPES.PONTE_FIXA]: 'Quanto às próteses fixas, a garantia refere-se à execução técnica e adaptação inicial, condicionada ao comparecimento aos retornos e à manutenção da higiene bucal. Fraturas por trauma ou sobrecarga occlusal não informada excluem cobertura.',

  [TREATMENT_TYPES.ORTODONTIA]: 'Quanto ao tratamento ortodôntico, a garantia refere-se à execução técnica do planejamento aprovado, observado o uso contínuo dos aparelhos ou alinhadores, a contenção pós-tratamento e os retornos periódicos. Recidivas por ausência de contenção ou abandono do tratamento excluem a garantia.',

  [TREATMENT_TYPES.LENTE_PORCELANA]: 'Quanto às lentes de contato em porcelana, a garantia abrange defeitos de confecção e cimentação inicial, desde que observados os cuidados de higiene, ausência de bruxismo não tratado e comparecimento às revisões. Fraturas por trauma, hábitos parafuncionais ou mau uso excluem cobertura.',

  [TREATMENT_TYPES.LENTE_RESINA]: 'Quanto às lentes de contato em resina ou facetas estéticas, a garantia limita-se a defeitos de execução e adaptação inicial, não cobrindo manchas por dieta inadequada, fraturas por trauma ou desgaste por bruxismo.',

  [TREATMENT_TYPES.PERIODONTIA]: 'Quanto aos tratamentos periodontais, a garantia depende da adesão do CONTRATANTE às sessões de manutenção periódica, ao controle de placa bacteriana e ao comparecimento aos retornos. Recidivas por higiene inadequada ou abandono do tratamento de suporte periodontal excluem cobertura.',

  [TREATMENT_TYPES.CLAREAMENTO]: 'Quanto ao clareamento dental, a garantia refere-se à execução técnica do procedimento, não garantindo tonalidade específica nem permanência indefinida do resultado, uma vez que hábitos alimentares, tabagismo e envelhecimento tecidual podem alterar a cor dos dentes.',

  [TREATMENT_TYPES.ENDODONTIA]: 'Quanto aos tratamentos de canal, a garantia abrange a execução técnica endodôntica, observado o comparecimento à restauração definitiva e aos retornos. Fraturas radiculares, reinfecções por restaurações inadequadas ou abandono do seguimento excluem cobertura.',

  [TREATMENT_TYPES.CIRURGIA]: 'Quanto aos procedimentos cirúrgicos, a garantia refere-se à execução técnica do ato operatório, não abrangendo complicações decorrentes de não observância das orientações pós-operatórias, tabagismo ou condições sistêmicas não informadas.',

  [TREATMENT_TYPES.RESTAURACAO]: 'Quanto às restaurações, a garantia cobre defeitos de execução no período inicial, excluindo fraturas por trauma, desgaste por bruxismo ou nova cárie por higiene inadequada.',
};

export const LEGAL_CONTRACT_TEXTS = {
  object: 'O presente contrato tem por objeto a prestação de serviços de assistência odontológica pela CONTRATADA ao CONTRATANTE, compreendendo o plano de tratamento aprovado, os procedimentos discriminados neste instrumento e as condições financeiras por ele aceitas, nos termos da legislação vigente e das normas éticas da profissão.',

  duration: 'O prazo para conclusão do tratamento poderá variar conforme a natureza dos procedimentos, a resposta biológica individual do CONTRATANTE, o comparecimento às consultas agendadas, a necessidade de exames complementares, intercorrências clínicas e os critérios técnicos do profissional responsável, não constituindo prazo certo e determinado salvo quando expressamente previsto em documento clínico específico.',

  default: 'O atraso no pagamento de qualquer parcela, entrada ou saldo devido poderá acarretar a suspensão imediata das etapas futuras do tratamento, a cobrança de multa contratual, juros moratórios, correção monetária, honorários de cobrança e demais medidas cabíveis, inclusive protesto, negativação junto aos órgãos de proteção ao crédito e adoção de medidas judiciais, respeitados os limites da legislação consumerista e civil vigente.',

  rescission: [
    'O presente contrato poderá ser rescindido por qualquer das partes, mediante comunicação por escrito, observadas as disposições desta cláusula.',
    'Se a rescisão ocorrer por iniciativa do CONTRATANTE, serão devidos os procedimentos já iniciados, concluídos ou em execução, bem como materiais adquiridos, personalizados ou fabricados exclusivamente para o seu tratamento.',
    'Se a rescisão ocorrer por iniciativa da CONTRATADA, será apurado saldo a pagar ou a restituir, conforme serviços efetivamente prestados, custos incorridos e documentação clínica respectiva.',
    'A rescisão poderá ocorrer de pleno direito em caso de inadimplência, abandono de tratamento, descumprimento das obrigações contratuais ou condutas que impeçam a continuidade segura do atendimento.',
  ],

  warrantiesGeneral: 'As partes reconhecem que os tratamentos odontológicos dependem de fatores biológicos individuais, da colaboração do paciente, da higiene bucal, do comparecimento aos retornos e da manutenção adequada, não existindo garantia absoluta de resultado estético, funcional ou biológico.',

  warranties: [
    'A garantia contratual, quando aplicável, depende do cumprimento integral das orientações clínicas, da higiene bucal e do comparecimento às manutenções periódicas.',
    'Mau uso, trauma, abandono do tratamento, tabagismo, hábitos parafuncionais ou ausência injustificada aos retornos excluem a cobertura da garantia.',
    'Materiais, componentes e insumos poderão seguir garantia própria do fabricante ou laboratório, quando aplicável, sem prejuízo das obrigações da CONTRATADA quanto à execução técnica.',
  ],

  patientObligations: [
    'Comparecer pontualmente às consultas, procedimentos e retornos agendados.',
    'Comunicar ausências com antecedência mínima de 24 (vinte e quatro) horas, ressalvados casos de força maior.',
    'Seguir rigorosamente as orientações clínicas, medicamentosas e de higiene bucal prescritas.',
    'Informar imediatamente alterações de saúde, medicamentos, alergias e intercorrências.',
    'Efetuar os pagamentos nas datas, valores e condições estabelecidas neste instrumento.',
    'Comparecer às manutenções periódicas e revisões indicadas pela CONTRATADA.',
    'Zelar pelos dispositivos, próteses e aparelhos recebidos, comunicando danos ou desconfortos.',
  ],

  clinicObligations: [
    'Executar os serviços contratados com técnica adequada, por profissionais legalmente habilitados.',
    'Manter prontuário odontológico completo e atualizado, nos termos da legislação vigente.',
    'Guardar sigilo sobre informações clínicas e dados pessoais do CONTRATANTE.',
    'Orientar o CONTRATANTE quanto aos riscos, benefícios, alternativas e cuidados do tratamento.',
    'Prestar atendimento em ambiente adequado, observadas as normas de biossegurança.',
    'Informar previamente sobre alterações relevantes no plano de tratamento ou nos valores contratados.',
  ],

  abandonment: 'Será considerado abandono de tratamento a ausência injustificada por 3 (três) consultas consecutivas, a ausência superior a 30 (trinta) dias sem comunicação prévia à CONTRATADA ou o não comparecimento às manutenções obrigatórias expressamente indicadas, facultando à CONTRATADA a suspensão do tratamento e as medidas contratuais cabíveis.',

  lgpd: 'O CONTRATANTE autoriza a CONTRATADA a tratar seus dados pessoais e dados sensíveis de saúde para fins de prestação dos serviços odontológicos contratados, elaboração e guarda de prontuário, faturamento, comunicações relacionadas ao tratamento, cumprimento de obrigações legais e regulatórias, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD).',

  imageUse: 'Autorização para registro fotográfico, videográfico ou de imagem clínica para fins de prontuário, controle de qualidade, documentação técnica e, quando autorizado abaixo, divulgação institucional sem identificação do paciente:',

  forum: 'Fica eleito o foro da comarca de',
};

export const CLINIC_FORUM_VALIDATION_MESSAGE =
  'Cadastre a cidade e UF da clínica para gerar corretamente a cláusula de foro.';

export function buildForumClauseText(clinicForumCity) {
  return `Fica eleito o foro da comarca de ${clinicForumCity} para dirimir quaisquer dúvidas ou controvérsias oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`;
}

export function getTreatmentWarrantyText(treatmentType) {
  return TREATMENT_WARRANTY_CLAUSES[treatmentType] || null;
}

export const LINKED_DOCUMENTS = [
  'Termo de consentimento informado',
  'Anamnese do paciente',
  'Orçamento aprovado',
];
