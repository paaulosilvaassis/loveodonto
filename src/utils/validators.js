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

export const formatCnpj = (value) => {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

export const formatCep = (value) => {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, '$1-$2');
};

export const formatCpf = (value) => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

export const formatPhone = (value) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d)/, '($1) $2-$3');
  }
  return digits.replace(/(\d{2})(\d{5})(\d)/, '($1) $2-$3');
};

export const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;

export const validateFileMeta = ({ type, size }, allowedTypes) => {
  if (!allowedTypes.includes(type)) {
    return { ok: false, message: 'Tipo de arquivo inválido.' };
  }
  if (size > MAX_UPLOAD_SIZE) {
    return { ok: false, message: 'Arquivo excede o tamanho máximo de 2MB.' };
  }
  return { ok: true };
};