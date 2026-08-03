/**
 * Phase 4.10 Wave 0 — Erros tipados e mapeamento HTTP V3.
 */

import { apiErrorPayload } from './response.js';

export class ApiError extends Error {
  constructor(message, {
    status = 400,
    code = 'VALIDATION_ERROR',
    details = undefined,
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiRollbackError extends ApiError {
  constructor(message = 'Falha na operação e rollback também falhou.', details = undefined) {
    super(message, {
      status: 503,
      code: 'ROLLBACK_FAILED',
      details,
    });
    this.name = 'ApiRollbackError';
  }
}

const DEFAULT_UNEXPECTED_MESSAGE = 'Erro interno inesperado.';

export function mapApiError(err, {
  fallbackMessage = DEFAULT_UNEXPECTED_MESSAGE,
  fallbackCode = 'INTERNAL_ERROR',
  fallbackStatus = 500,
} = {}) {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: apiErrorPayload({
        code: err.code,
        message: err.message,
        details: err.details,
      }),
    };
  }

  if (err instanceof Error) {
    return {
      status: fallbackStatus,
      body: apiErrorPayload({
        code: fallbackCode,
        message: err.message || fallbackMessage,
      }),
    };
  }

  return {
    status: fallbackStatus,
    body: apiErrorPayload({
      code: fallbackCode,
      message: fallbackMessage,
    }),
  };
}
