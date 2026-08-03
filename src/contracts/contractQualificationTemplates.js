/**
 * Textos de qualificação das partes — modelos A e B.
 */
export const PARTY_MODEL = {
  PATIENT_ONLY: 'patient_only',
  WITH_RESPONSIBLE: 'with_responsible',
};

export const QUALIFICATION_TEMPLATE_PATIENT_ONLY = `Pelo presente instrumento particular de Prestação de Serviços Odontológicos, de um lado #emissorNomeRazaoSocial, inscrita sob nº #emissorCNPJCPF, com sede à #clinicaEndereco, doravante denominada CLÍNICA, e de outro lado #pacienteNomeCompleto, inscrito sob CPF nº #pacienteCPF, domiciliado à #pacienteEndereco, doravante denominado PACIENTE, têm entre si justo e contratado o presente instrumento.`;

export const QUALIFICATION_TEMPLATE_WITH_RESPONSIBLE = `Pelo presente instrumento particular de Prestação de Serviços Odontológicos, de um lado #emissorNomeRazaoSocial, inscrita sob nº #emissorCNPJCPF, com sede à #clinicaEndereco, doravante denominada CLÍNICA, e de outro lado #dependenteNomeCompleto, doravante denominado PACIENTE, representado e/ou assistido por seu responsável financeiro/legal #responsavelNomeCompleto, inscrito sob CPF nº #responsavelCPF, domiciliado à #responsavelEndereco, doravante denominado RESPONSÁVEL, têm entre si justo e contratado o presente instrumento.`;

export function getQualificationTemplate(partyModel) {
  return partyModel === PARTY_MODEL.WITH_RESPONSIBLE
    ? QUALIFICATION_TEMPLATE_WITH_RESPONSIBLE
    : QUALIFICATION_TEMPLATE_PATIENT_ONLY;
}

export const FORUM_CLAUSE_TEMPLATE = 'Fica eleito o foro da comarca de #clinicaCidadeEstado, renunciando as partes a qualquer outro, por mais privilegiado que seja, para dirimir eventuais dúvidas oriundas do presente contrato.';
