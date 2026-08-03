/**
 * @module repositories/contracts/contractsV2Transaction
 * @description Transaction context único — Phase 10.9.
 * Resolve risco de nested BEGIN memory→Postgres da Phase 10.8.
 */

import type { ContractSupabaseClient } from './contractPersistenceTypes.js';

export interface DatabaseTransactionClient extends ContractSupabaseClient {
  /** Identificador opaco da conexão/tx. */
  readonly transactionId?: string;
  /** true quando já dentro de BEGIN ativo. */
  readonly inTransaction?: boolean;
  query?<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

export interface ContractsV2TransactionContext {
  client: DatabaseTransactionClient;
}

export interface ContractsV2TransactionManager {
  /**
   * Executa fn numa única transação.
   * Se já houver contexto ativo na AsyncLocalStorage, reutiliza (sem nested BEGIN).
   */
  withTransaction<T>(
    fn: (ctx: ContractsV2TransactionContext) => Promise<T>,
  ): Promise<T>;

  /** Contexto atual, se existir. */
  getCurrentContext(): ContractsV2TransactionContext | null;
}

type Store = { ctx: ContractsV2TransactionContext };

/** Fallback sem AsyncLocalStorage (browser/test) — stack simples por promise chain. */
let activeStack: Store[] = [];

function getAls(): { run: <T>(s: Store, fn: () => Promise<T>) => Promise<T>; getStore: () => Store | undefined } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    const als = new AsyncLocalStorage<Store>();
    return {
      run: (s, fn) => als.run(s, fn),
      getStore: () => als.getStore(),
    };
  } catch {
    return null;
  }
}

const als = getAls();

/**
 * Cria manager que usa client.query para BEGIN/COMMIT/ROLLBACK quando disponível.
 * Sem query (PostgREST puro): executa fn sem BEGIN real, mas ainda evita nest artificial.
 */
export function createContractsV2TransactionManager(
  rootClient: DatabaseTransactionClient,
): ContractsV2TransactionManager {
  return {
    getCurrentContext() {
      const store = als?.getStore() || activeStack[activeStack.length - 1];
      return store?.ctx || null;
    },

    async withTransaction(fn) {
      const existing = this.getCurrentContext();
      if (existing) {
        // Reutiliza a mesma tx — NÃO inicia nested BEGIN
        return fn(existing);
      }

      const canSql = typeof rootClient.query === 'function';
      const txClient: DatabaseTransactionClient = {
        ...rootClient,
        inTransaction: true,
        transactionId: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        from: rootClient.from.bind(rootClient),
        query: rootClient.query?.bind(rootClient),
      };
      const ctx: ContractsV2TransactionContext = { client: txClient };
      const store: Store = { ctx };

      const run = async () => {
        if (canSql) {
          await rootClient.query!('BEGIN');
        }
        try {
          const result = await fn(ctx);
          if (canSql) {
            await rootClient.query!('COMMIT');
          }
          return result;
        } catch (error) {
          if (canSql) {
            try {
              await rootClient.query!('ROLLBACK');
            } catch {
              // ignore rollback errors
            }
          }
          throw error;
        }
      };

      if (als) {
        return als.run(store, run);
      }
      activeStack.push(store);
      try {
        return await run();
      } finally {
        activeStack.pop();
      }
    },
  };
}

/**
 * Adapter: repositories memory com withTransaction → manager único.
 * Usado em testes unitários / harness sem Postgres.
 */
export function createMemoryTransactionManager(
  repos: Array<{ withTransaction?: <T>(fn: () => Promise<T>) => Promise<T> }>,
): ContractsV2TransactionManager {
  const rootClient: DatabaseTransactionClient = {
    from: () => {
      throw new Error('Memory transaction client não suporta from()');
    },
    inTransaction: false,
  };
  const base = createContractsV2TransactionManager(rootClient);

  return {
    getCurrentContext: () => base.getCurrentContext(),
    async withTransaction(fn) {
      const existing = base.getCurrentContext();
      if (existing) return fn(existing);

      // Snapshot/rollback de todos os repos memory em uma única unidade
      const runNested = async (): Promise<ReturnType<typeof fn>> => {
        const ctx: ContractsV2TransactionContext = {
          client: { ...rootClient, inTransaction: true, transactionId: 'memory_tx' },
        };
        const store: Store = { ctx };
        const exec = async () => fn(ctx);
        if (als) return als.run(store, exec);
        activeStack.push(store);
        try {
          return await exec();
        } finally {
          activeStack.pop();
        }
      };

      // Encadeia withTransaction dos repos (outermost first) — um único rollback lógico
      return repos.reduceRight(
        (next, repo) => {
          if (repo.withTransaction) {
            return () => repo.withTransaction!(next);
          }
          return next;
        },
        runNested,
      )();
    },
  };
}
