import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cwd = process.cwd();
const rootFiles = fs.existsSync(cwd) ? fs.readdirSync(cwd) : [];
const indexHtmlPath = path.join(cwd, 'index.html');
const publicIndexPath = path.join(cwd, 'public', 'index.html');
const srcDirPath = path.join(cwd, 'src');
const viteConfigCandidates = [
  'vite.config.js',
  'vite.config.ts',
  'vite.config.mjs',
  'vite.config.cjs',
].map((name) => path.join(cwd, name));

const scriptRunId = 'parse-scan-1';
const scanExtensions = new Set(['.js', '.jsx']);
const scanIgnoreDirs = new Set(['node_modules', 'dist', 'public']);

const collectFiles = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!scanIgnoreDirs.has(entry.name)) {
        collectFiles(path.join(dir, entry.name), acc);
      }
      continue;
    }
    const ext = path.extname(entry.name);
    if (scanExtensions.has(ext)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
};

// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:19',
    message: 'debug-dev start',
    data: { cwd, rootFiles },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'pre-fix',
    hypothesisId: 'H1',
  }),
}).catch(() => {});
// #endregion

let parseError = null;
const scanFiles = collectFiles(srcDirPath);
// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:53',
    message: 'parse scan start',
    data: { srcDirPath, fileCount: scanFiles.length },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: scriptRunId,
    hypothesisId: 'H8',
  }),
}).catch(() => {});
// #endregion

for (const filePath of scanFiles) {
  try {
    const source = fs.readFileSync(filePath, 'utf8');
    const loader = filePath.endsWith('.jsx') ? 'jsx' : 'js';
    esbuild.transformSync(source, { loader });
  } catch (error) {
    parseError = {
      filePath,
      message: String(error?.message || error),
      name: String(error?.name || ''),
    };
    break;
  }
}

// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:83',
    message: 'parse scan result',
    data: parseError ? parseError : { ok: true },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: scriptRunId,
    hypothesisId: 'H8',
  }),
}).catch(() => {});
// #endregion

// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:33',
    message: 'index.html presence',
    data: {
      indexHtmlExists: fs.existsSync(indexHtmlPath),
      publicIndexExists: fs.existsSync(publicIndexPath),
      indexHtmlPath,
      publicIndexPath,
    },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'pre-fix',
    hypothesisId: 'H1',
  }),
}).catch(() => {});
// #endregion

// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:50',
    message: 'src directory presence',
    data: {
      srcDirExists: fs.existsSync(srcDirPath),
      srcDirPath,
    },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'pre-fix',
    hypothesisId: 'H2',
  }),
}).catch(() => {});
// #endregion

// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:66',
    message: 'vite config presence',
    data: {
      viteConfigFiles: viteConfigCandidates.filter((file) => fs.existsSync(file)),
      searched: viteConfigCandidates,
    },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'pre-fix',
    hypothesisId: 'H3',
  }),
}).catch(() => {});
// #endregion

// #region agent log
fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    location: 'scripts/debug-dev.js:83',
    message: 'debug-dev end',
    data: { cwd, scriptDir: __dirname },
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'pre-fix',
    hypothesisId: 'H4',
  }),
}).catch(() => {});
// #endregion
