#!/usr/bin/env node
/**
 * SPF.1B.0 — porta única para executar um query set READ ONLY aprovado via psql.
 *
 * Uso (connection string SOMENTE por variável de ambiente, nunca por argumento):
 *   LOVE_ODONTO_TARGET_ENV=staging STAGING_DATABASE_URL=… node scripts/safety/run-readonly-db-proof.mjs
 *   [--query-set spf1b-patient-state-proof]
 *
 * PRODUCTION é recusado por padrão (PRODUCTION_READ_EXECUTION_ENABLED = false em readOnlyDbProof.mjs).
 * Regras completas: docs/playbooks/SUPABASE_TARGET_GUARDRAILS.md
 */
import { runReadOnlyDbProof } from './readOnlyDbProof.mjs';

// Interrupções tratáveis não derrubam o pai antes do finally que remove o PGPASSFILE efêmero:
// o psql (mesmo grupo de processos) recebe o sinal e encerra; o runner limpa e só então sai.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => {});

const result = runReadOnlyDbProof({ env: process.env, argv: process.argv.slice(2) });
process.exit(result.exitCode);
