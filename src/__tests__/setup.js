import { beforeEach, vi } from 'vitest';
import { applyVitestIsolationContract } from './rhTestFlagContract.js';

const store = new Map();

/** Phase 5.1 — isolamento completo: flags RH, SaaS e Supabase. */
beforeEach(() => {
  applyVitestIsolationContract(vi);
});

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

if (!globalThis.window.dispatchEvent) {
  globalThis.window.dispatchEvent = () => true;
}

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
}

global.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

if (!global.crypto) {
  global.crypto = {};
}

if (!global.crypto.randomUUID) {
  let counter = 0;
  global.crypto.randomUUID = () => {
    counter += 1;
    return `test-uuid-${counter}`;
  };
}
