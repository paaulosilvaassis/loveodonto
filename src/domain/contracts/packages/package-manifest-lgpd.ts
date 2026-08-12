/**
 * @module domain/contracts/packages/package-manifest-lgpd
 * @description Conteúdo LGPD versionado para freeze/hash — Phase 10.21U.
 * Não usa hash estático genérico; o contentHash deriva deste texto apresentado.
 */

export const LGPD_CLINIC_POLICY_VERSION = 'lgpd_clinic_policy_v1' as const;

/**
 * Texto canônico apresentado ao paciente no freeze (v1).
 * Mudança deste texto ⇒ novo documentVersion + novo contentHash.
 */
export const LGPD_CLINIC_POLICY_TEXT_V1 = [
  'AVISO DE PRIVACIDADE E PROTEÇÃO DE DADOS (LGPD)',
  '',
  'Este estabelecimento de saúde odontológica trata dados pessoais e dados sensíveis',
  'de saúde necessários à prestação do cuidado, com base na Lei nº 13.709/2018 (LGPD)',
  'e nas normas aplicáveis ao prontuário e à ética profissional.',
  '',
  'Finalidades principais: identificação do paciente, anamnese, planejamento clínico,',
  'orçamentos, contratos, consentimentos, faturamento e cumprimento de obrigações legais.',
  '',
  'Seus direitos incluem acesso, correção, portabilidade (quando cabível), oposição e',
  'revogação de consentimentos não essenciais ao tratamento, observados os limites legais.',
  '',
  'Ao aceitar este aviso, você declara ter lido e compreendido as informações acimaidas',
  'e autoriza o tratamento dos dados necessários à execução do plano de tratamento.',
].join('\n');

export function resolveLgpdPresentedContent(input?: {
  version?: string;
  presentedText?: string;
}): { version: string; presentedText: string } {
  const custom = String(input?.presentedText || '').trim();
  if (custom) {
    return {
      version: String(input?.version || 'lgpd_custom').trim() || 'lgpd_custom',
      presentedText: custom,
    };
  }
  return {
    version: LGPD_CLINIC_POLICY_VERSION,
    presentedText: LGPD_CLINIC_POLICY_TEXT_V1,
  };
}
