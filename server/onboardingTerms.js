import { createHash, randomBytes } from 'node:crypto';
import { USABILITY_TERMS_VERSION, USABILITY_TERMS_TITLE, getUsabilityTermsPlainText } from './contracts/usabilityTerms.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashAcceptanceToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function createAcceptanceToken() {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashAcceptanceToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    termsVersion: USABILITY_TERMS_VERSION,
  };
}

export function buildAcceptTermsUrl(token) {
  const appUrl = String(process.env.APP_URL || 'http://localhost:5176').replace(/\/+$/, '');
  return `${appUrl}/aceitar-termos?token=${encodeURIComponent(token)}`;
}

export async function findLegalProfileByToken(supabase, token) {
  const tokenHash = hashAcceptanceToken(token);
  const { data, error } = await supabase
    .from('tenant_legal_profiles')
    .select(`
      id,
      tenant_id,
      legal_representative_name,
      legal_representative_email,
      liability_status,
      liability_terms_version,
      liability_acceptance_expires_at,
      liability_accepted_at,
      tenants ( trade_name, legal_name, plan_code )
    `)
    .eq('liability_acceptance_token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function buildTermsPreview(profile) {
  if (!profile) return null;
  const tenant = profile.tenants || {};
  const expired = profile.liability_acceptance_expires_at
    && new Date(profile.liability_acceptance_expires_at).getTime() < Date.now();
  return {
    clinicName: tenant.trade_name || tenant.legal_name || 'Clínica',
    planCode: tenant.plan_code || '—',
    representativeName: profile.legal_representative_name,
    representativeEmail: profile.legal_representative_email,
    termsVersion: profile.liability_terms_version || USABILITY_TERMS_VERSION,
    termsTitle: USABILITY_TERMS_TITLE,
    termsText: getUsabilityTermsPlainText(),
    status: profile.liability_status,
    alreadyAccepted: profile.liability_status === 'accepted',
    expired: Boolean(expired) || profile.liability_status === 'expired',
    acceptedAt: profile.liability_accepted_at,
  };
}

export async function acceptTermsByToken(supabase, token) {
  const profile = await findLegalProfileByToken(supabase, token);
  if (!profile?.id) {
    throw new Error('Link de aceite inválido ou expirado.');
  }
  if (profile.liability_status === 'accepted') {
    return { alreadyAccepted: true, acceptedAt: profile.liability_accepted_at };
  }
  const expired = profile.liability_acceptance_expires_at
    && new Date(profile.liability_acceptance_expires_at).getTime() < Date.now();
  if (expired) {
    throw new Error('Este link de aceite expirou. Solicite um novo envio à plataforma.');
  }

  const acceptedAt = new Date().toISOString();
  const { error } = await supabase
    .from('tenant_legal_profiles')
    .update({
      liability_status: 'accepted',
      liability_accepted_at: acceptedAt,
      liability_acceptance_token_hash: null,
      liability_acceptance_expires_at: null,
    })
    .eq('id', profile.id);
  if (error) throw error;

  return {
    alreadyAccepted: false,
    acceptedAt,
    clinicName: profile.tenants?.trade_name || profile.tenants?.legal_name || 'Clínica',
    representativeEmail: profile.legal_representative_email,
  };
}
