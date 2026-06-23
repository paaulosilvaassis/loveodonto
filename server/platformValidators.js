export const onlyDigits = (value) => (value || '').replace(/\D/g, '');

export const isCnpjValid = (value) => {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base, factors) => {
    let total = 0;
    factors.forEach((factor, index) => {
      total += Number(base[index]) * factor;
    });
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const base = cnpj.slice(0, 12);
  const dig1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dig2 = calc(base + dig1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj === base + String(dig1) + String(dig2);
};

export const isCepValid = (value) => onlyDigits(value).length === 8;

export const isPhoneValid = (value) => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
};

export const isCpfValid = (value) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  const calc = (base, factor) => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) {
      total += Number(base[i]) * (factor - i);
    }
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const base = cpf.slice(0, 9);
  const dig1 = calc(base, 10);
  const dig2 = calc(base + dig1, 11);
  return cpf === base + String(dig1) + String(dig2);
};

export const LIABILITY_TERMS_VERSION = '2026-06-v1';

export const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function normalizeOnboardingPayload(body = {}) {
  const billingSameAsLegal = body.billingSameAsLegal !== false;
  return {
    tradeName: String(body.tradeName || '').trim(),
    legalName: String(body.legalName || body.tradeName || '').trim(),
    cnpj: onlyDigits(body.cnpj),
    clinicPhone: onlyDigits(body.clinicPhone),
    zipCode: onlyDigits(body.zipCode),
    street: String(body.street || '').trim(),
    streetNumber: String(body.streetNumber || '').trim(),
    addressComplement: String(body.addressComplement || '').trim(),
    neighborhood: String(body.neighborhood || '').trim(),
    city: String(body.city || '').trim(),
    state: String(body.state || '').trim().toUpperCase(),
    legalRepresentativeName: String(body.legalRepresentativeName || '').trim(),
    legalRepresentativeCpf: onlyDigits(body.legalRepresentativeCpf),
    legalRepresentativeEmail: String(body.legalRepresentativeEmail || '').trim().toLowerCase(),
    legalRepresentativePhone: onlyDigits(body.legalRepresentativePhone),
    legalRepresentativeRole: String(body.legalRepresentativeRole || '').trim(),
    billingSameAsLegal,
    billingContactName: billingSameAsLegal
      ? String(body.legalRepresentativeName || '').trim()
      : String(body.billingContactName || '').trim(),
    billingContactEmail: billingSameAsLegal
      ? String(body.legalRepresentativeEmail || '').trim().toLowerCase()
      : String(body.billingContactEmail || '').trim().toLowerCase(),
    billingContactPhone: billingSameAsLegal
      ? onlyDigits(body.legalRepresentativePhone)
      : onlyDigits(body.billingContactPhone),
    adminName: String(body.adminName || body.responsibleName || body.legalRepresentativeName || '').trim(),
    adminEmail: String(body.adminEmail || body.responsibleEmail || body.legalRepresentativeEmail || '').trim().toLowerCase(),
    adminPassword: String(body.adminPassword || body.responsiblePassword || '').trim(),
    adminCpf: onlyDigits(body.adminCpf || body.legalRepresentativeCpf),
    adminPhone: onlyDigits(body.adminPhone || body.legalRepresentativePhone),
    plan: String(body.plan || '').trim(),
    status: String(body.status || 'active').trim(),
  };
}

export function validateOnboardingPayload(payload) {
  if (!payload.tradeName) return 'Nome fantasia é obrigatório.';
  if (!payload.legalName) return 'Razão social é obrigatória.';
  if (!payload.cnpj) return 'CNPJ é obrigatório.';
  if (!isCnpjValid(payload.cnpj)) return 'CNPJ inválido.';
  if (!payload.clinicPhone) return 'Telefone comercial é obrigatório.';
  if (!isPhoneValid(payload.clinicPhone)) return 'Telefone comercial inválido.';
  if (!payload.zipCode) return 'CEP é obrigatório.';
  if (!isCepValid(payload.zipCode)) return 'CEP inválido.';
  if (!payload.street) return 'Logradouro é obrigatório.';
  if (!payload.streetNumber) return 'Número é obrigatório.';
  if (!payload.neighborhood) return 'Bairro é obrigatório.';
  if (!payload.city) return 'Cidade é obrigatória.';
  if (!payload.state) return 'UF é obrigatória.';
  if (!BRAZIL_STATES.includes(payload.state)) return 'UF inválida.';
  if (!payload.legalRepresentativeName) return 'Nome do responsável legal é obrigatório.';
  if (!payload.legalRepresentativeCpf) return 'CPF do responsável legal é obrigatório.';
  if (!isCpfValid(payload.legalRepresentativeCpf)) return 'CPF do responsável legal inválido.';
  if (!payload.legalRepresentativeEmail) return 'E-mail do responsável legal é obrigatório.';
  if (!payload.legalRepresentativePhone) return 'Telefone do responsável legal é obrigatório.';
  if (!isPhoneValid(payload.legalRepresentativePhone)) return 'Telefone do responsável legal inválido.';
  if (!payload.billingSameAsLegal) {
    if (!payload.billingContactName) return 'Nome do contato de cobrança é obrigatório.';
    if (!payload.billingContactEmail) return 'E-mail de cobrança é obrigatório.';
    if (!payload.billingContactPhone) return 'Telefone de cobrança é obrigatório.';
    if (!isPhoneValid(payload.billingContactPhone)) return 'Telefone de cobrança inválido.';
  }
  if (!payload.adminName) return 'Nome do administrador é obrigatório.';
  if (!payload.adminEmail) return 'E-mail do administrador é obrigatório.';
  if (payload.adminPassword && payload.adminPassword.length < 8) {
    return 'Senha do administrador deve ter pelo menos 8 caracteres ou ficar vazia.';
  }
  if (payload.adminCpf && !isCpfValid(payload.adminCpf)) return 'CPF do administrador inválido.';
  if (payload.adminPhone && !isPhoneValid(payload.adminPhone)) return 'Telefone do administrador inválido.';
  if (!['Start', 'Growth', 'Scale'].includes(payload.plan)) return 'Plano inválido.';
  return '';
}
