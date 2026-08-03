/**
 * Responsável técnico da clínica (CRO) — fonte: cadastro da clínica, nunca o dentista do atendimento.
 */
export function resolveClinicTechnicalResponsible(docs = {}, clinic = {}) {
  const name = String(
    docs.responsavelTecnico
    || docs.responsavel_tecnico
    || clinic.responsavelTecnico
    || '',
  ).trim();
  const cro = String(
    docs.croResponsavelTecnico
    || docs.cro_responsavel
    || docs.conselhoRegionalNumero
    || '',
  ).trim();
  return { name, cro };
}

export function resolveAttendingProfessionalCro(source = {}) {
  return String(
    source.cro
    || source.registroProfissional
    || source.conselhoNumero
    || source.conselho_numero
    || '',
  ).trim();
}
