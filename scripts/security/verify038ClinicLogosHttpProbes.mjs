/**
 * PHASE_SECURITY_02C — AFTER probes only (no DDL).
 * Run in Terminal with network. Never logs secrets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'uoepkwhqztmsjnzirpev';
const PILOT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER = 'f2615848-d67d-4a87-96f1-508049953b84';
const OUT = path.join(ROOT, 'docs/reports/_security02c_http_probes.json');

function loadDotEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  const env = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

async function listObjects(url, key, role, prefix) {
  const r = await fetch(`${url}/storage/v1/object/list/clinic-logos`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: prefix || '', limit: 10 }),
  });
  const text = await r.text();
  let allowed = r.status >= 200 && r.status < 300;
  let count = null;
  let message = null;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) count = j.length;
    else {
      allowed = false;
      message = String(j.message || j.error || '').slice(0, 120);
    }
  } catch {
    allowed = false;
    message = text.slice(0, 80);
  }
  return {
    operation: `list:${prefix || 'root'}`,
    role,
    status: r.status,
    allowed,
    count,
    message,
  };
}

async function publicHead(url, objectPath) {
  const r = await fetch(`${url}/storage/v1/object/public/clinic-logos/${objectPath}`, {
    method: 'HEAD',
  });
  return {
    operation: 'public_GET_HEAD',
    status: r.status,
    allowed: r.status >= 200 && r.status < 300,
    contentType: r.headers.get('content-type'),
    contentLength: r.headers.get('content-length'),
  };
}

async function main() {
  const dotenv = loadDotEnvLocal();
  const url = process.env.SUPABASE_URL || dotenv.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PLATFORM_ANON_KEY || dotenv.VITE_SUPABASE_PLATFORM_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || dotenv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    console.error(JSON.stringify({ ok: false, error: 'MISSING_ENV' }));
    process.exit(2);
  }
  if (!new URL(url).host.startsWith(REF)) {
    console.error(JSON.stringify({ ok: false, error: 'REF_MISMATCH' }));
    process.exit(2);
  }

  const report = {
    at: new Date().toISOString(),
    projectRef: REF,
    after: {
      listRootAnon: await listObjects(url, anonKey, 'anon', ''),
      listPilotAnon: await listObjects(url, anonKey, 'anon', `${PILOT}/`),
      listOtherAnon: await listObjects(url, anonKey, 'anon', `${OTHER}/`),
      listPilotService: await listObjects(url, serviceKey, 'service', `${PILOT}/`),
      publicHead: await publicHead(url, `${PILOT}/logo.webp`),
    },
  };

  const anonRoot = report.after.listRootAnon;
  const anonPilot = report.after.listPilotAnon;
  // Supabase Storage frequentemente retorna 200 [] sob RLS (não 403).
  // Enumeração está negada se anon não recebe nomes/pastas (count===0).
  const anonEnumerationDenied =
    Number(anonRoot.count || 0) === 0
    && Number(anonPilot.count || 0) === 0
    && (anonRoot.allowed === false || anonRoot.status === 200);
  const publicOk = report.after.publicHead.allowed === true;
  report.checks = {
    ANON_LIST_HTTP: anonRoot.allowed ? '200_EMPTY_OR_ERROR' : 'DENIED_HTTP',
    ANON_ENUMERATION: anonEnumerationDenied ? 'DENIED' : 'ALLOWED',
    KNOWN_OBJECT_PUBLIC_GET: publicOk ? 'PASS' : 'FAIL',
  };
  report.ok = anonEnumerationDenied && publicOk;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    checks: report.checks,
    after: report.after,
    out: OUT,
  }));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
  process.exit(1);
});
