#!/usr/bin/env node
/**
 * Exporta colaboradores/RH para collaborators-export.json (somente leitura).
 *
 * O IndexedDB do navegador NÃO é acessível diretamente pelo Node.
 * Fluxo recomendado para usuário leigo:
 *   1) Rodar snippet do navegador (gera collaborators-export.json)
 *   2) Opcional: reprocessar/validar com este script
 *
 * Uso:
 *   node scripts/rh-export-indexeddb.mjs --tenant-id <uuid> --input-dump ./collaborators-export.json
 *   node scripts/rh-export-indexeddb.mjs --tenant-id <uuid> --input-dump ./appgestaoodonto.db.json --output ./out.json
 *   node scripts/rh-export-indexeddb.mjs --print-browser-snippet
 *
 * Não altera IndexedDB, localStorage nem Supabase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORAGE_CONFIG,
  buildBrowserExportSnippet,
  buildRhExportPayload,
  parseInputJson,
} from '../server/lib/rhExportIndexedDb.js';
import { REPO_ROOT } from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'scripts', 'reports');
const SNIPPET_PATH = path.join(REPO_ROOT, 'scripts', 'snippets', 'rh-export-browser-snippet.js');

function parseArgs(argv) {
  const args = {
    tenantId: null,
    inputDump: null,
    output: null,
    json: false,
    printBrowserSnippet: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--print-browser-snippet') args.printBrowserSnippet = true;
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--input-dump') args.inputDump = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
  }
  return args;
}

function printHelp() {
  process.stdout.write(`
rh-export-indexeddb — exporta colaboradores para backfill (SOMENTE LEITURA)

Onde os dados ficam no Love Odonto:
  • Principal: IndexedDB "${STORAGE_CONFIG.idbDatabase}" → store "${STORAGE_CONFIG.idbStore}" → chave "${STORAGE_CONFIG.idbCollaboratorsKey}"
  • Legado:    localStorage "${STORAGE_CONFIG.legacyLocalStorageKey}" (JSON inteiro do app)

O Node NÃO lê o IndexedDB do Chrome diretamente.
Use o snippet do navegador primeiro, depois este script para validar/reprocessar.

Passo a passo (usuário leigo):
  1) node scripts/rh-export-indexeddb.mjs --print-browser-snippet
  2) Abra Love Odonto → F12 → Console → cole o snippet → Enter
  3) Baixe collaborators-export.json
  4) node scripts/rh-export-indexeddb.mjs --tenant-id <UUID> --input-dump ./collaborators-export.json
  5) node scripts/rh-backfill-to-supabase.mjs --tenant-id <UUID> --rh-export ./collaborators-export.json

Flags:
  --tenant-id <uuid>     Obrigatório (exceto --print-browser-snippet)
  --input-dump <path>    JSON: export do navegador, dump completo ou store IndexedDB
  --output <path>        Saída (padrão: ./collaborators-export.json)
  --print-browser-snippet  Imprime snippet para Console do navegador
  --json                 Relatório resumido em JSON no stdout

`);
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function writeSnippetFile() {
  const dir = path.dirname(SNIPPET_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const snippet = buildBrowserExportSnippet();
  fs.writeFileSync(SNIPPET_PATH, snippet, 'utf8');
  return snippet;
}

function printSummary(report, outputPath, reportPath) {
  const s = report.summary;
  process.stdout.write('\n=== RH Export — resumo ===\n\n');
  process.stdout.write(`Tenant: ${report.tenant_id}\n`);
  process.stdout.write(`Origem detectada: ${report.source} (${report.source_format})\n\n`);
  process.stdout.write(`Total encontrado (bruto):     ${s.total_found}\n`);
  process.stdout.write(`Total exportado:              ${s.total_exported}\n`);
  process.stdout.write(`Total ignorado:               ${s.total_ignored}\n`);
  process.stdout.write(`E-mails duplicados:           ${s.duplicate_emails}\n`);
  process.stdout.write(`legacy_id duplicados:         ${s.duplicate_legacy_ids}\n`);
  process.stdout.write(`Rejeitados sem nome:          ${s.missing_name_rejected}\n`);
  process.stdout.write(`Com cargo ausente (exportados): ${s.missing_cargo_flagged}\n`);
  process.stdout.write(`Com categoria ausente:        ${s.missing_category_flagged}\n`);
  process.stdout.write(`Fotos base64 (fotoUrl vazio): ${s.base64_photos}\n\n`);

  if (report.warnings.length > 0) {
    process.stdout.write('Avisos (base64 → migrar para Storage depois):\n');
    for (const w of report.warnings.slice(0, 10)) {
      process.stdout.write(`  - ${w.id || w.email}: ${w.message}\n`);
    }
    if (report.warnings.length > 10) {
      process.stdout.write(`  ... +${report.warnings.length - 10} aviso(s)\n`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`Arquivo export: ${outputPath}\n`);
  process.stdout.write(`Relatório:      ${reportPath}\n\n`);
  process.stdout.write('Próximo passo (dry-run, sem alterar Supabase):\n');
  process.stdout.write(`  node scripts/rh-backfill-to-supabase.mjs --tenant-id ${report.tenant_id} --rh-export "${outputPath}"\n`);
}

function runExport(args) {
  if (!args.tenantId) {
    throw new Error('--tenant-id é obrigatório.');
  }
  if (!args.inputDump) {
    throw new Error(
      '--input-dump é obrigatório.\n'
      + 'Gere o arquivo primeiro com o snippet do navegador:\n'
      + '  node scripts/rh-export-indexeddb.mjs --print-browser-snippet',
    );
  }

  const inputPath = path.resolve(args.inputDump);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Arquivo não encontrado: ${inputPath}`);
  }

  const rawText = fs.readFileSync(inputPath, 'utf8');
  const { collaborators, detection } = parseInputJson(rawText);

  if (detection.format === 'unknown') {
    throw new Error(
      'Formato de dump não reconhecido. Use collaborators-export.json do navegador '
      + 'ou dump completo do app (localStorage legado).',
    );
  }

  const { payload, report } = buildRhExportPayload({
    rawCollaborators: collaborators,
    tenantId: args.tenantId,
    source: detection.source,
    sourceFormat: detection.format,
  });

  report.input_file = inputPath;
  report.detection = detection;

  const outputPath = path.resolve(args.output || path.join(process.cwd(), 'collaborators-export.json'));
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `rh-export-report-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ report, outputPath, reportPath }, null, 2)}\n`);
  } else {
    printSummary(report, outputPath, reportPath);
  }

  return { payload, report, outputPath, reportPath };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.printBrowserSnippet) {
    const snippet = writeSnippetFile();
    process.stdout.write('\n=== Snippet salvo em ===\n');
    process.stdout.write(`${SNIPPET_PATH}\n\n`);
    process.stdout.write('=== Cole no Console do navegador (F12) ===\n\n');
    process.stdout.write(`${snippet}\n`);
    process.exit(0);
  }

  runExport(args);
}

try {
  main();
} catch (err) {
  process.stderr.write(`\nErro: ${err?.message || err}\n`);
  process.exit(1);
}
