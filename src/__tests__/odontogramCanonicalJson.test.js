import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CanonicalJsonError,
  canonicalizeJson,
  hashCanonicalSnapshot,
} from '../domain/odontogram/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOMAIN_DIR = path.resolve(__dirname, '../domain/odontogram');

describe('OD-1C JSON canônico', () => {
  it('ordena chaves de objeto de forma recursiva por code-unit', () => {
    const serialized = canonicalizeJson({
      zeta: 1,
      alpha: { delta: true, beta: { n: 2, m: 1 } },
    });
    expect(serialized).toBe('{"alpha":{"beta":{"m":1,"n":2},"delta":true},"zeta":1}');
  });

  it('preserva a ordem de arrays', () => {
    expect(canonicalizeJson({ items: [3, 1, { b: 1, a: 2 }, 2] })).toBe(
      '{"items":[3,1,{"a":2,"b":1},2]}',
    );
  });

  it('usa comparação lexical de code-unit, não localeCompare', () => {
    expect(canonicalizeJson({ a: 1, A: 2 })).toBe('{"A":2,"a":1}');
  });

  it('distingue null de propriedade ausente', () => {
    expect(canonicalizeJson({ a: null })).toBe('{"a":null}');
    expect(canonicalizeJson({})).toBe('{}');
    expect(canonicalizeJson({ a: null })).not.toBe(canonicalizeJson({}));
  });

  it('produz JSON válido e não muta a entrada', () => {
    const input = { b: 1, a: [2, { d: 3, c: 4 }] };
    const frozen = { ...input, a: [...input.a] };
    const before = JSON.stringify(input);
    const output = canonicalizeJson(input);
    expect(() => JSON.parse(output)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
    expect(input).toEqual(frozen);
  });

  it('rejeita cíclicos e valores não suportados', () => {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    const unsupported = [
      undefined,
      () => 1,
      Symbol('x'),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      cyclic,
      new Date('2026-03-01T12:00:00.000Z'),
      new Map(),
      new Set(),
      new (class Clinical {})(),
    ];
    for (const value of unsupported) {
      expect(() => canonicalizeJson(value)).toThrow(CanonicalJsonError);
    }
    const sparse = [];
    sparse[1] = 'gap';
    expect(() => canonicalizeJson(sparse)).toThrow(CanonicalJsonError);
  });
});

describe('OD-1C SHA-256 canônico', () => {
  it('é estável para Unicode/UTF-8 e objetos semanticamente iguais', async () => {
    const left = { note: 'café 🦷', b: 2, a: 1 };
    const right = { a: 1, b: 2, note: 'café 🦷' };
    const hash = await hashCanonicalSnapshot(left);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hash.toLowerCase());
    expect(await hashCanonicalSnapshot(right)).toBe(hash);
  });

  it('muda quando o conteúdo clínico muda e ignora snapshot_hash no conteúdo', async () => {
    const base = { chartId: 'chart-test-1', teeth: { 16: { conditionCode: 'caries' } } };
    const changed = { chartId: 'chart-test-1', teeth: { 16: { conditionCode: 'restoration' } } };
    const withHash = { ...base, snapshot_hash: 'x'.repeat(64), snapshotHash: 'y'.repeat(64) };
    expect(await hashCanonicalSnapshot(base)).not.toBe(await hashCanonicalSnapshot(changed));
    expect(await hashCanonicalSnapshot(base)).toBe(await hashCanonicalSnapshot(withHash));
  });
});

describe('OD-1C isolamento do serializador', () => {
  it('não importa React, Supabase, IndexedDB, Three.js, finance/contracts nem odontograma legado', () => {
    const files = ['canonicalJson.js', 'eventEngine.js', 'projection.js', 'versioning.js'];
    const importPattern = /\bfrom\s+['"]([^'"]+)['"]/g;
    const forbidden = /^(react|react-dom|three|@supabase|@supabase\/)/;
    const forbiddenPath = /(indexedDB|localStorage|budget|finance|\/contracts(?:\/|$)|supabase|three)/i;
    for (const file of files) {
      const source = readFileSync(path.join(DOMAIN_DIR, file), 'utf8');
      const specifiers = [...source.matchAll(importPattern)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(forbidden.test(specifier)).toBe(false);
        expect(forbiddenPath.test(specifier)).toBe(false);
        expect(specifier).not.toMatch(/components|services|pages|\/db\/|legacyOdontogram|odontogramV2/i);
      }
      expect(source).not.toMatch(/\bnode:crypto\b/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/\bindexedDB\b/);
      expect(source).not.toMatch(/\blocalStorage\b/);
      expect(source).not.toMatch(/\bDate\.now\s*\(/);
      expect(source).not.toMatch(/\bMath\.random\s*\(/);
    }
    expect(readdirSync(DOMAIN_DIR).filter((name) => name.endsWith('.js')).length).toBeGreaterThan(0);
  });
});
