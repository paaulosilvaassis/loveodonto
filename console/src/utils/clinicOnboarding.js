import {
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  isCepValid,
  isCnpjValid,
  isCpfValid,
  isPhoneValid,
  onlyDigits,
} from './validators.js';

export const LIABILITY_TERMS_VERSION = '2026-06-v1';

export const LIABILITY_TERMS_TEXT = [
  'Ao provisionar esta clínica, a Love Odonto registra o responsável legal e o contato de cobrança informados.',
  'Em caso de inadimplência, esses dados serão utilizados para comunicação, cobrança, suspensão do serviço e medidas contratuais cabíveis.',
  'A clínica declara que as informações prestadas são verdadeiras e autoriza o tratamento dos dados para fins de faturamento, compliance e auditoria da plataforma.',
].join(' ');

export const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const WIZARD_STEPS = [
  { id: 1, label: 'Empresa' },
  { id: 2, label: 'Endereço' },
  { id: 3, label: 'Responsável' },
  { id: 4, label: 'Plano' },
  { id: 5, label: 'Revisão' },
];

export const EMPTY_ONBOARDING_FORM = {
  tradeName: '',
  legalName: '',
  cnpj: '',
  clinicPhone: '',
  zipCode: '',
  street: '',
  streetNumber: '',
  addressComplement: '',
  neighborhood: '',
  city: '',
  state: '',
  legalRepresentativeName: '',
  legalRepresentativeCpf: '',
  legalRepresentativeEmail: '',
  legalRepresentativePhone: '',
  legalRepresentativeRole: 'Sócio administrador',
  billingSameAsLegal: true,
  billingContactName: '',
  billingContactEmail: '',
  billingContactPhone: '',
  adminPassword: '',
  planCode: 'Start',
};

export function resolveAdminFromForm(form) {
  return {
    adminName: form.legalRepresentativeName.trim(),
    adminEmail: form.legalRepresentativeEmail.trim().toLowerCase(),
    adminCpf: onlyDigits(form.legalRepresentativeCpf),
    adminPhone: onlyDigits(form.legalRepresentativePhone),
  };
}

export function maskOnboardingField(field, value) {
  if (field === 'cnpj') return formatCnpj(value);
  if (field === 'zipCode') return formatCep(value);
  if (field === 'legalRepresentativeCpf') return formatCpf(value);
  if (field === 'clinicPhone' || field === 'legalRepresentativePhone' || field === 'billingContactPhone') {
    return formatPhone(value);
  }
  return value;
}

export function validateOnboardingStep(step, form) {
  if (step === 1) {
    if (!form.tradeName.trim()) return 'Nome fantasia é obrigatório.';
    if (!form.legalName.trim()) return 'Razão social é obrigatória.';
    if (!onlyDigits(form.cnpj)) return 'CNPJ é obrigatório.';
    if (!isCnpjValid(form.cnpj)) return 'CNPJ inválido.';
    if (!onlyDigits(form.clinicPhone)) return 'Telefone comercial é obrigatório.';
    if (!isPhoneValid(form.clinicPhone)) return 'Telefone comercial inválido.';
    return '';
  }
  if (step === 2) {
    if (!onlyDigits(form.zipCode)) return 'CEP é obrigatório.';
    if (!isCepValid(form.zipCode)) return 'CEP inválido.';
    if (!form.street.trim()) return 'Logradouro é obrigatório.';
    if (!form.streetNumber.trim()) return 'Número é obrigatório.';
    if (!form.neighborhood.trim()) return 'Bairro é obrigatório.';
    if (!form.city.trim()) return 'Cidade é obrigatória.';
    if (!form.state.trim()) return 'UF é obrigatória.';
    if (!BRAZIL_STATES.includes(form.state.trim().toUpperCase())) return 'Selecione uma UF válida.';
    return '';
  }
  if (step === 3) {
    if (!form.legalRepresentativeName.trim()) return 'Nome do responsável legal é obrigatório.';
    if (!onlyDigits(form.legalRepresentativeCpf)) return 'CPF do responsável legal é obrigatório.';
    if (!isCpfValid(form.legalRepresentativeCpf)) return 'CPF do responsável legal inválido.';
    if (!form.legalRepresentativeEmail.trim()) return 'E-mail do responsável legal é obrigatório.';
    if (!onlyDigits(form.legalRepresentativePhone)) return 'Telefone do responsável legal é obrigatório.';
    if (!isPhoneValid(form.legalRepresentativePhone)) return 'Telefone do responsável legal inválido.';
    if (!form.billingSameAsLegal) {
      if (!form.billingContactName.trim()) return 'Nome do contato de cobrança é obrigatório.';
      if (!form.billingContactEmail.trim()) return 'E-mail de cobrança é obrigatório.';
      if (!onlyDigits(form.billingContactPhone)) return 'Telefone de cobrança é obrigatório.';
      if (!isPhoneValid(form.billingContactPhone)) return 'Telefone de cobrança inválido.';
    }
    return '';
  }
  if (step === 4) {
    if (!form.planCode) return 'Selecione um plano.';
    return '';
  }
  if (step === 5) {
    for (let current = 1; current <= 4; current += 1) {
      const err = validateOnboardingStep(current, form);
      if (err) return err;
    }
    return '';
  }
  return '';
}

export function buildOnboardingPayload(form) {
  const billingSameAsLegal = Boolean(form.billingSameAsLegal);
  const admin = resolveAdminFromForm(form);
  return {
    tradeName: form.tradeName.trim(),
    legalName: form.legalName.trim(),
    cnpj: onlyDigits(form.cnpj),
    clinicPhone: onlyDigits(form.clinicPhone),
    zipCode: onlyDigits(form.zipCode),
    street: form.street.trim(),
    streetNumber: form.streetNumber.trim(),
    addressComplement: form.addressComplement.trim(),
    neighborhood: form.neighborhood.trim(),
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    legalRepresentativeName: form.legalRepresentativeName.trim(),
    legalRepresentativeCpf: onlyDigits(form.legalRepresentativeCpf),
    legalRepresentativeEmail: form.legalRepresentativeEmail.trim().toLowerCase(),
    legalRepresentativePhone: onlyDigits(form.legalRepresentativePhone),
    legalRepresentativeRole: form.legalRepresentativeRole.trim(),
    billingSameAsLegal,
    billingContactName: billingSameAsLegal ? form.legalRepresentativeName.trim() : form.billingContactName.trim(),
    billingContactEmail: billingSameAsLegal
      ? form.legalRepresentativeEmail.trim().toLowerCase()
      : form.billingContactEmail.trim().toLowerCase(),
    billingContactPhone: billingSameAsLegal
      ? onlyDigits(form.legalRepresentativePhone)
      : onlyDigits(form.billingContactPhone),
    adminName: admin.adminName,
    adminEmail: admin.adminEmail,
    adminCpf: admin.adminCpf,
    adminPhone: admin.adminPhone,
    plan: form.planCode,
    status: 'active',
  };
}

export function formatAddressSummary(form) {
  const parts = [
    `${form.street || '—'}, ${form.streetNumber || 'S/N'}`,
    form.addressComplement || null,
    form.neighborhood,
    `${form.city}/${form.state}`,
    form.zipCode ? `CEP ${formatCep(form.zipCode)}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
