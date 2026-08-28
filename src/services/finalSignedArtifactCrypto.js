/**
 * PHASE_10.21CO — SHA-256 dos bytes finais do PDF persistido.
 * Não usa hash legado do documento, hash de HTML, nem hash da data URL textual.
 */
import { sha256Bytes } from '../domain/contracts/files/contract-binary-hash.ts';

export const FINAL_ARTIFACT_HASH_FAILED = 'FINAL_ARTIFACT_HASH_FAILED';

function hashFailed(message) {
  const err = new Error(message);
  err.code = FINAL_ARTIFACT_HASH_FAILED;
  return err;
}

export function decodePdfDataUrlToBytes(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const comma = raw.indexOf(',');
  if (comma < 0 || !raw.toLowerCase().startsWith('data:application/pdf')) {
    throw hashFailed('PDF data URL inválido.');
  }
  if (!/;base64/i.test(raw.slice(0, comma))) {
    throw hashFailed('PDF data URL não está em base64.');
  }
  const b64 = raw.slice(comma + 1);
  let bytes;
  if (typeof Buffer !== 'undefined') {
    bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  } else if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  } else {
    throw hashFailed('Decodificador base64 indisponível.');
  }
  if (
    bytes.byteLength < 5
    || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF'
  ) {
    throw hashFailed('Bytes persistidos não são um PDF.');
  }
  return bytes;
}

export function assertArtifactCryptoFields({
  artifactBinarySha256,
  artifactByteLength,
  artifactGeneratedAt,
} = {}) {
  if (
    !/^[a-f0-9]{64}$/.test(String(artifactBinarySha256 || ''))
    || !Number.isFinite(artifactByteLength)
    || artifactByteLength <= 0
    || !artifactGeneratedAt
  ) {
    throw hashFailed('Metadados criptográficos do PDF final ausentes.');
  }
}

export async function hashPersistedPdfBytes(bytes) {
  if (!bytes || !bytes.byteLength) {
    throw hashFailed('PDF vazio.');
  }
  try {
    const artifactBinarySha256 = await sha256Bytes(bytes);
    if (!/^[a-f0-9]{64}$/.test(String(artifactBinarySha256 || ''))) {
      throw hashFailed('SHA-256 do PDF inválido.');
    }
    return {
      artifactBinarySha256,
      artifactByteLength: bytes.byteLength,
    };
  } catch (err) {
    if (err?.code === FINAL_ARTIFACT_HASH_FAILED) throw err;
    throw hashFailed(err?.message || 'Falha ao calcular SHA-256 do PDF.');
  }
}
