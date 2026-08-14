const HASH_OMIT_KEYS = Object.freeze(['snapshotHash', 'snapshot_hash']);

export class CanonicalJsonError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CanonicalJsonError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function compareCodeUnit(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertDenseArray(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new CanonicalJsonError('SPARSE_ARRAY', 'Array esparso não é serializável canonicamente.');
    }
  }
}

function canonicalizeNode(value, seen) {
  if (value === undefined) {
    throw new CanonicalJsonError('UNSUPPORTED_VALUE', 'undefined não é permitido.');
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new CanonicalJsonError('UNSUPPORTED_VALUE', `Tipo ${typeof value} não é permitido.`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError('UNSUPPORTED_VALUE', 'NaN e Infinity não são permitidos.');
    }
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (typeof value !== 'object') {
    throw new CanonicalJsonError('UNSUPPORTED_VALUE', 'Valor não JSON-serializável.');
  }
  if (seen.has(value)) {
    throw new CanonicalJsonError('CYCLIC_REFERENCE', 'Referência cíclica não é permitida.');
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new CanonicalJsonError('UNSUPPORTED_VALUE', 'Array não canônico rejeitado.');
    }
    assertDenseArray(value);
    seen.add(value);
    const items = value.map((item) => canonicalizeNode(item, seen));
    seen.delete(value);
    return items;
  }
  if (!isPlainObject(value)) {
    throw new CanonicalJsonError('UNSUPPORTED_VALUE', 'Date, Map, Set e instâncias de classe não são permitidos.');
  }
  seen.add(value);
  const keys = Object.keys(value).sort(compareCodeUnit);
  const out = {};
  for (const key of keys) {
    out[key] = canonicalizeNode(value[key], seen);
  }
  seen.delete(value);
  return out;
}

export function canonicalizeJson(value) {
  return JSON.stringify(canonicalizeNode(value, new Set()));
}

function omitHashKeys(value) {
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value)) {
    if (HASH_OMIT_KEYS.includes(key)) continue;
    out[key] = value[key];
  }
  return out;
}

export async function hashCanonicalSnapshot(snapshot) {
  const canonical = canonicalizeJson(omitHashKeys(snapshot));
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    throw new CanonicalJsonError(
      'HASH_UNAVAILABLE',
      'API criptográfica SHA-256 indisponível.',
    );
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function cloneCanonicalJson(value) {
  return JSON.parse(canonicalizeJson(value));
}
