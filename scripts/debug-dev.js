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


let parseError = null;
const scanFiles = collectFiles(srcDirPath);

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





