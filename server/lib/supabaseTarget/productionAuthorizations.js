/**
 * SPF.1A.1 — allowlist versionada de operações autorizadas contra PRODUCTION.
 *
 * Uma escrita em production só passa pelo OperationGate quando
 * LOVE_ODONTO_PRODUCTION_AUTHORIZATION = <id> e existe aqui uma entrada com o mesmo
 * `id`, o mesmo `operationId` da ferramenta e `expiresAt` no futuro.
 * Entradas só entram por PR revisado e aprovado externamente para a fase.
 *
 * Formato de entrada:
 *   { id: 'SPF-XX-2026-10-01', operationId: 'security.apply037', expiresAt: '2026-10-02T00:00:00Z',
 *     approvedBy: 'responsável', phase: 'SPF.x', note: 'escopo' }
 *
 * Operações destrutivas em production NÃO são liberadas por esta lista
 * (ver DESTRUCTIVE_PRODUCTION_ENABLED em supabaseTargetGuard.js).
 *
 * Estado atual: nenhuma autorização — toda escrita em production é negada.
 */
export const PRODUCTION_OPERATION_AUTHORIZATIONS = Object.freeze([]);
