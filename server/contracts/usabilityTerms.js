export const USABILITY_TERMS_VERSION = '2026-06-v1';

export const USABILITY_TERMS_TITLE = 'Contrato de usabilidade e responsabilidade financeira';

export const USABILITY_TERMS_SECTIONS = [
  {
    title: 'Objeto',
    body: 'Este contrato regula o uso da plataforma Love Odonto SaaS pela clínica contratante e vincula o responsável legal informado no cadastro.',
  },
  {
    title: 'Responsabilidade financeira',
    body: 'O responsável legal declara ciência de que, em caso de inadimplência, a Love Odonto poderá utilizar os dados cadastrados para cobrança, comunicação, suspensão do serviço e medidas contratuais cabíveis.',
  },
  {
    title: 'Veracidade dos dados',
    body: 'A clínica garante que CNPJ, endereço fiscal, contatos e representante legal são verdadeiros e autoriza o tratamento desses dados para faturamento, compliance e auditoria.',
  },
  {
    title: 'Primeiro acesso',
    body: 'O aceite eletrônico deste contrato, registrado com data, hora e identificação do responsável, é condição para utilização plena do sistema após o provisionamento.',
  },
];

export function getUsabilityTermsPlainText() {
  return USABILITY_TERMS_SECTIONS.map((section) => `${section.title}: ${section.body}`).join('\n\n');
}
