/**
 * @module domain-events/read-models/shared/readModelRegistry
 * @description Registry oficial de Read Models — Phase 8.0.
 * Registro explícito. Sem auto-bootstrap. Sem execução automática.
 */

import type { ReadModelDefinition, ReadModelRegistryEntry } from './readModelTypes.js';
import { setReadModelTotalMetric } from './readModelMetrics.js';

const registry = new Map<string, ReadModelRegistryEntry>();

export class ReadModelRegistryError extends Error {
  readonly code = 'READ_MODEL_REGISTRY_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ReadModelRegistryError';
  }
}

export function assertReadModelDefinition(definition: ReadModelDefinition): void {
  if (!definition?.readModelId || !String(definition.readModelId).trim()) {
    throw new ReadModelRegistryError('readModelId obrigatório');
  }
  if (!definition.readModelName || !String(definition.readModelName).trim()) {
    throw new ReadModelRegistryError('readModelName obrigatório');
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new ReadModelRegistryError('version deve ser inteiro >= 1');
  }
  if (!Array.isArray(definition.projectionSources) || definition.projectionSources.length === 0) {
    throw new ReadModelRegistryError('projectionSources obrigatório (não vazio)');
  }
  if (typeof definition.builder !== 'function') {
    throw new ReadModelRegistryError('builder obrigatório');
  }
  if (definition.lifecycle?.autoRebuild !== false) {
    throw new ReadModelRegistryError('lifecycle.autoRebuild deve ser false');
  }
  if (!definition.cachePolicy || !definition.snapshotPolicy) {
    throw new ReadModelRegistryError('cachePolicy e snapshotPolicy obrigatórios');
  }
  if (!definition.flagKey || !String(definition.flagKey).trim()) {
    throw new ReadModelRegistryError('flagKey obrigatório');
  }
}

/**
 * Registra Read Model estrutural (testes / adoção futura).
 * Não executa builder. Não bootstrapa no app.
 */
export function registerReadModel(definition: ReadModelDefinition): () => void {
  assertReadModelDefinition(definition);
  const id = String(definition.readModelId).trim();
  if (registry.has(id)) {
    throw new ReadModelRegistryError(`readModelId duplicado: ${id}`);
  }
  registry.set(id, {
    definition: {
      ...definition,
      readModelId: id,
      projectionSources: [...definition.projectionSources],
    },
    registeredAt: new Date().toISOString(),
  });
  setReadModelTotalMetric(registry.size);
  return () => {
    registry.delete(id);
    setReadModelTotalMetric(registry.size);
  };
}

export function unregisterReadModel(readModelId: string): boolean {
  const deleted = registry.delete(String(readModelId || '').trim());
  setReadModelTotalMetric(registry.size);
  return deleted;
}

export function getReadModelDefinition(readModelId: string): ReadModelDefinition | null {
  return registry.get(String(readModelId || '').trim())?.definition ?? null;
}

export function listReadModels(): ReadModelRegistryEntry[] {
  return [...registry.values()].map((e) => ({
    registeredAt: e.registeredAt,
    definition: {
      ...e.definition,
      projectionSources: [...e.definition.projectionSources],
    },
  }));
}

export function getRegisteredReadModelCount(): number {
  return registry.size;
}

export function __clearReadModelRegistryForTest(): void {
  registry.clear();
  setReadModelTotalMetric(0);
}
