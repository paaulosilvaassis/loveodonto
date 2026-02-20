import { onlyDigits } from '../utils/validators.js';

const DEFAULT_TIMEOUT = 6000;

export const getAddressByCep = async (cep, { timeout = DEFAULT_TIMEOUT } = {}) => {
  const cleaned = onlyDigits(cep);
  if (cleaned.length !== 8) {
    return { ok: false, error: 'invalid', message: 'CEP inválido.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: 'unavailable', message: 'Serviço de CEP indisponível.' };
    }
    const data = await response.json();
    if (data?.erro) {
      return { ok: false, error: 'not_found', message: 'CEP não encontrado.' };
    }
    return {
      ok: true,
      data: {
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade || '',
        state: data.uf || '',
      },
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, error: 'timeout', message: 'Tempo esgotado ao consultar CEP.' };
    }
    return { ok: false, error: 'unavailable', message: 'Serviço de CEP indisponível.' };
  } finally {
    clearTimeout(timer);
  }
};
