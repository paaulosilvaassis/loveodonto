/**
 * Phase 4.10 Wave 0 — Validação genérica de payload/query.
 */

import { ApiError } from './errors.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function validateString(value, {
  field = 'value',
  required = false,
  minLength = 0,
  maxLength = Infinity,
  pattern = null,
} = {}) {
  const text = normalizeText(value);
  if (required && !text) {
    throw new ApiError(`Campo "${field}" é obrigatório.`, {
      status: 400,
      code: 'PAYLOAD_INVALID',
      details: { field },
    });
  }
  if (!text) return '';
  if (text.length < minLength) {
    throw new ApiError(`Campo "${field}" é muito curto.`, {
      status: 400,
      code: 'PAYLOAD_INVALID',
      details: { field, minLength },
    });
  }
  if (text.length > maxLength) {
    throw new ApiError(`Campo "${field}" excede o tamanho máximo.`, {
      status: 400,
      code: 'PAYLOAD_INVALID',
      details: { field, maxLength },
    });
  }
  if (pattern && !pattern.test(text)) {
    throw new ApiError(`Campo "${field}" possui formato inválido.`, {
      status: 400,
      code: 'PAYLOAD_INVALID',
      details: { field },
    });
  }
  return text;
}

export function validateBoolean(value, {
  field = 'value',
  required = false,
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ApiError(`Campo "${field}" é obrigatório.`, {
        status: 400,
        code: 'PAYLOAD_INVALID',
        details: { field },
      });
    }
    return undefined;
  }
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ApiError(`Campo "${field}" deve ser true ou false.`, {
    status: 400,
    code: 'PAYLOAD_INVALID',
    details: { field },
  });
}

export function requireFields(source = {}, fieldNames = []) {
  const missing = [];
  for (const field of fieldNames) {
    const value = source[field];
    if (value === undefined || value === null || normalizeText(value) === '') {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new ApiError('Campos obrigatórios ausentes.', {
      status: 400,
      code: 'PAYLOAD_INVALID',
      details: { missing },
    });
  }
}

export function rejectForbiddenFields(source = {}, forbiddenFields = [], {
  code = 'UNSUPPORTED_FIELD',
} = {}) {
  for (const field of forbiddenFields) {
    const value = source[field];
    if (value !== undefined && value !== null && normalizeText(value) !== '') {
      throw new ApiError(`Campo "${field}" não é suportado neste endpoint.`, {
        status: 400,
        code: field === 'tenant_id' ? 'TENANT_BODY_FORBIDDEN' : code,
        details: { field },
      });
    }
  }
}

export function rejectTenantIdQuery(query = {}) {
  const tenantId = normalizeText(query?.tenant_id);
  if (tenantId) {
    throw new ApiError(
      'tenant_id não é aceito na query string. O tenant é resolvido pelo contexto autenticado.',
      {
        status: 400,
        code: 'TENANT_QUERY_FORBIDDEN',
      },
    );
  }
}

export function rejectTenantIdBody(body = {}) {
  const tenantId = normalizeText(body?.tenant_id);
  if (tenantId) {
    throw new ApiError(
      'tenant_id não é aceito no body. O tenant é resolvido pelo contexto autenticado.',
      {
        status: 400,
        code: 'TENANT_BODY_FORBIDDEN',
      },
    );
  }
}
