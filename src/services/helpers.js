export const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export const assertRequired = (value, message) => {
  if (!value) {
    throw new Error(message);
  }
};

export const normalizeText = (value) => (value || '').trim();

export const ensureArray = (value) => (Array.isArray(value) ? value : []);
