/**
 * @module domain/contracts/runtime/contracts-v2-security-headers
 * @description Headers HTTP de segurança para endpoints/página pública v2 — Phase 10.12.
 */

export interface ContractsV2SecurityHeadersPolicy {
  cacheControl: string;
  pragma: string;
  referrerPolicy: string;
  xContentTypeOptions: string;
  xFrameOptions: string;
  contentSecurityPolicy: string;
  xRobotsTag: string;
  permissionsPolicy: string;
}

/** CSP conservadora para página/API pública de assinatura. */
export const CONTRACTS_V2_PUBLIC_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

export const DEFAULT_CONTRACTS_V2_SECURITY_HEADERS: ContractsV2SecurityHeadersPolicy = {
  cacheControl: 'no-store, private',
  pragma: 'no-cache',
  referrerPolicy: 'no-referrer',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  contentSecurityPolicy: CONTRACTS_V2_PUBLIC_CSP,
  xRobotsTag: 'noindex, nofollow, noarchive',
  permissionsPolicy: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

export function applyContractsV2SecurityHeaders(
  setHeader: (name: string, value: string) => void,
  policy: ContractsV2SecurityHeadersPolicy = DEFAULT_CONTRACTS_V2_SECURITY_HEADERS,
): void {
  setHeader('Cache-Control', policy.cacheControl);
  setHeader('Pragma', policy.pragma);
  setHeader('Referrer-Policy', policy.referrerPolicy);
  setHeader('X-Content-Type-Options', policy.xContentTypeOptions);
  setHeader('X-Frame-Options', policy.xFrameOptions);
  setHeader('Content-Security-Policy', policy.contentSecurityPolicy);
  setHeader('X-Robots-Tag', policy.xRobotsTag);
  setHeader('Permissions-Policy', policy.permissionsPolicy);
}

export function securityHeadersAsRecord(
  policy: ContractsV2SecurityHeadersPolicy = DEFAULT_CONTRACTS_V2_SECURITY_HEADERS,
): Record<string, string> {
  return {
    'Cache-Control': policy.cacheControl,
    Pragma: policy.pragma,
    'Referrer-Policy': policy.referrerPolicy,
    'X-Content-Type-Options': policy.xContentTypeOptions,
    'X-Frame-Options': policy.xFrameOptions,
    'Content-Security-Policy': policy.contentSecurityPolicy,
    'X-Robots-Tag': policy.xRobotsTag,
    'Permissions-Policy': policy.permissionsPolicy,
  };
}
