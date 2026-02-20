const SECRET_KEY = 'clinic-secret-key';

export const encryptSecret = (value) => {
  if (!value) return '';
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return `${SECRET_KEY}.${encoded}`;
};

export const decryptSecret = (value) => {
  if (!value || !value.startsWith(`${SECRET_KEY}.`)) return '';
  const encoded = value.replace(`${SECRET_KEY}.`, '');
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return '';
  }
};
