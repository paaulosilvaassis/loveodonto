/**
 * @module domain/contracts/runtime/contracts-v2-trusted-client-address
 * @description Resolução segura de IP do cliente — Phase 10.12.
 * Não confia em X-Forwarded-For sem trust proxy configurado.
 */

import { createHash } from 'node:crypto';

export interface TrustedClientAddressResult {
  ip: string | null;
  ipHash: string | null;
  source: 'socket' | 'trusted-proxy' | 'unavailable';
  forwardedIgnored: boolean;
  valid: boolean;
}

export interface TrustedClientAddressResolver {
  resolve(req: TrustedClientAddressRequestLike): TrustedClientAddressResult;
}

export interface TrustedClientAddressRequestLike {
  ip?: string;
  socket?: { remoteAddress?: string | null };
  headers?: Record<string, string | string[] | undefined>;
}

export interface TrustedClientAddressConfig {
  /** Quantidade de proxies confiáveis à frente do app (0 = não confiar em XFF). */
  trustProxyHops: number;
  hashSalt?: string;
}

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 =
  /^(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::1$|^::$/;

export function isValidIp(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim().replace(/^\[|\]$/g, '');
  if (v.startsWith('::ffff:')) {
    return IPV4.test(v.slice(7));
  }
  return IPV4.test(v) || IPV6.test(v);
}

export function hashClientIp(ip: string, salt = 'contracts-v2'): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

function headerValue(
  headers: TrustedClientAddressRequestLike['headers'],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * Extrai IP do hop confiável em X-Forwarded-For.
 * Lista: client, proxy1, proxy2, ... — com N hops confiáveis, usa o IP na posição length-N-1...length-1
 * Prática segura: com trustProxyHops=1, usa o penúltimo quando há 2+; senão o último só se hop=1 e lista curta.
 */
export function pickTrustedForwardedIp(
  xff: string | undefined,
  trustProxyHops: number,
): string | null {
  if (!xff || trustProxyHops <= 0) return null;
  const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  // Com N proxies confiáveis, o client é o elemento em (parts.length - N - 1)? 
  // Padrão Express: trust proxy = N significa confiar nos N últimos hops.
  // Client IP = parts[parts.length - trustProxyHops - 0] quando XFF append by proxies...
  // Se client,proxy1 e trust=1 → client = parts[0]
  // Se client,proxy1,proxy2 e trust=2 → client = parts[0]
  const idx = parts.length - trustProxyHops - 0;
  // When proxies append, leftmost is original client if full chain preserved.
  // Safer conservative: take parts[parts.length - trustProxyHops] as nearest trusted? 
  // Spec: com hops=1, usar o primeiro da lista apenas se length===1; se length>1 usar parts[0] (client) only when we trust the immediate proxy appended correctly.
  // Implementação conservadora alinhada a Express trust proxy hops:
  const clientIdx = Math.max(0, parts.length - trustProxyHops);
  // Actually Express: with trust proxy 1, req.ip is the second-to-last / first from right after stripping 1.
  // Strip trustProxyHops from the right; leftmost remaining is client.
  const remaining = parts.slice(0, Math.max(0, parts.length - trustProxyHops + 1));
  // Simpler explicit rule for tests:
  // hops=1 → use parts[parts.length - 2] if length>=2 else parts[0]
  if (trustProxyHops === 1) {
    const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return isValidIp(candidate) ? candidate! : null;
  }
  const candidate = parts[Math.max(0, parts.length - trustProxyHops - 1)] ?? parts[0];
  void idx;
  void remaining;
  return isValidIp(candidate) ? candidate! : null;
}

export function createTrustedClientAddressResolver(
  config: TrustedClientAddressConfig,
): TrustedClientAddressResolver {
  const hops = Math.max(0, Number(config.trustProxyHops) || 0);
  const salt = config.hashSalt || 'contracts-v2';

  return {
    resolve(req: TrustedClientAddressRequestLike): TrustedClientAddressResult {
      const socketIp = req.socket?.remoteAddress || req.ip || null;
      const xff = headerValue(req.headers, 'x-forwarded-for');

      if (hops <= 0) {
        const ip = isValidIp(socketIp) ? String(socketIp).replace(/^::ffff:/, '') : null;
        return {
          ip,
          ipHash: ip ? hashClientIp(ip, salt) : null,
          source: ip ? 'socket' : 'unavailable',
          forwardedIgnored: Boolean(xff),
          valid: Boolean(ip),
        };
      }

      const fromProxy = pickTrustedForwardedIp(xff, hops);
      if (fromProxy) {
        const ip = fromProxy.replace(/^::ffff:/, '');
        return {
          ip,
          ipHash: hashClientIp(ip, salt),
          source: 'trusted-proxy',
          forwardedIgnored: false,
          valid: true,
        };
      }

      const fallback = isValidIp(socketIp) ? String(socketIp).replace(/^::ffff:/, '') : null;
      return {
        ip: fallback,
        ipHash: fallback ? hashClientIp(fallback, salt) : null,
        source: fallback ? 'socket' : 'unavailable',
        forwardedIgnored: Boolean(xff),
        valid: Boolean(fallback),
      };
    },
  };
}
