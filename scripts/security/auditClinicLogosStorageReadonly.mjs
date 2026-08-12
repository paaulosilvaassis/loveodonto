/**
 * PHASE_SECURITY_02A — read-only clinic-logos audit probes.
 * Uses SUPABASE_ACCESS_TOKEN (never logged) + .env.local keys.
 * NO mutations to storage objects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'uoepkwhqztmsjnzirpev';
const PILOT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER = 'f2615848-d67d-4a87-96f1-508049953b84'; // from earlier flags scan — other tenant id if exists
const OUT = path.join(ROOT, 'docs/reports/_security02a_audit_result.json');

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

async function managementSql(token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const dotenv = loadDotEnvLocal();
  const url = process.env.SUPABASE_URL || dotenv.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || dotenv.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_PLATFORM_ANON_KEY || dotenv.VITE_SUPABASE_PLATFORM_ANON_KEY;

  const report = {
    projectRef: REF,
    at: new Date().toISOString(),
    hasAccessToken: Boolean(accessToken),
    bucket: null,
    policies: null,
    probes: {},
    clinicProfileLogo: null,
    rollout: null,
  };

  if (!url || !anonKey || !serviceKey) {
    console.error(JSON.stringify({ ok: false, error: 'MISSING_ENV' }));
    process.exit(2);
  }
  if (!new URL(url).host.startsWith(REF)) {
    console.error(JSON.stringify({ ok: false, error: 'REF_MISMATCH' }));
    process.exit(2);
  }

  // Storage API — buckets
  async function listBuckets(role, key) {
    const r = await fetch(`${url}/storage/v1/bucket`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const j = await r.json().catch(() => null);
    const buckets = Array.isArray(j)
      ? j.filter((b) => b.id === 'clinic-logos' || b.name === 'clinic-logos').map((b) => ({
        id: b.id,
        name: b.name,
        public: b.public,
        file_size_limit: b.file_size_limit ?? null,
        allowed_mime_types: b.allowed_mime_types ?? null,
      }))
      : { status: r.status, error: j?.message || j?.error || 'not_array' };
    return { role, status: r.status, buckets };
  }
  report.probes.bucketsAnon = await listBuckets('anon', anonKey);
  report.probes.bucketsService = await listBuckets('service', serviceKey);

  async function listObjects(role, key, prefix) {
    const r = await fetch(`${url}/storage/v1/object/list/clinic-logos`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: prefix || '', limit: 20 }),
    });
    const text = await r.text();
    let summary;
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) {
        summary = {
          status: r.status,
          allowed: r.status >= 200 && r.status < 300,
          count: j.length,
          // names only — tenant folder ids are the finding; keep short
          names: j.map((x) => x.name).slice(0, 10),
          idLike: j.map((x) => (/^[0-9a-f-]{36}$/i.test(String(x.name || '')) ? 'uuid_folder' : 'other')),
        };
      } else {
        summary = { status: r.status, allowed: false, message: j.message || j.error || null };
      }
    } catch {
      summary = { status: r.status, allowed: false, body: text.slice(0, 120) };
    }
    return { role, prefix: prefix || '(root)', ...summary };
  }

  report.probes.listRootAnon = await listObjects('anon', anonKey, '');
  report.probes.listRootService = await listObjects('service', serviceKey, '');
  report.probes.listPilotAnon = await listObjects('anon', anonKey, `${PILOT}/`);
  report.probes.listPilotService = await listObjects('service', serviceKey, `${PILOT}/`);
  report.probes.listOtherAnon = await listObjects('anon', anonKey, `${OTHER}/`);

  // Known object public GET (HEAD) — discover name from service list if needed
  const pilotList = report.probes.listPilotService;
  const objectName = Array.isArray(pilotList.names) && pilotList.names[0]
    ? `${PILOT}/${pilotList.names[0]}`
    : `${PILOT}/logo.webp`;

  async function headPublic(objectPath) {
    const publicUrl = `${url}/storage/v1/object/public/clinic-logos/${objectPath}`;
    const r = await fetch(publicUrl, { method: 'HEAD' });
    return {
      operation: 'public_GET_HEAD',
      objectPath,
      status: r.status,
      allowed: r.status >= 200 && r.status < 300,
      contentType: r.headers.get('content-type'),
      contentLength: r.headers.get('content-length'),
      // no body
    };
  }
  report.probes.publicHeadPilot = await headPublic(objectName);
  // try common extensions if miss
  if (!report.probes.publicHeadPilot.allowed) {
    for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
      const alt = await headPublic(`${PILOT}/logo.${ext}`);
      if (alt.allowed) {
        report.probes.publicHeadPilot = alt;
        break;
      }
    }
  }
  report.probes.publicHeadOtherGuess = await headPublic(`${OTHER}/logo.webp`);

  // Authenticated client without user JWT = same as anon for storage list with anon key
  // clinic_profiles.logo_url shape (service) — columns only + url host/path pattern, not full if sensitive
  const cp = await fetch(`${url}/rest/v1/clinic_profiles?select=tenant_id,logo_url,updated_at&limit=5`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const cpRows = await cp.json();
  report.clinicProfileLogo = {
    status: cp.status,
    rows: Array.isArray(cpRows)
      ? cpRows.map((r) => {
        const logo = String(r.logo_url || '');
        let parsed = null;
        try {
          const u = new URL(logo);
          parsed = {
            host: u.host,
            pathname: u.pathname,
            isPublicObjectPath: u.pathname.includes('/storage/v1/object/public/clinic-logos/'),
            hasQuery: Boolean(u.search),
            looksSigned: u.pathname.includes('/object/sign/') || u.search.includes('token='),
          };
        } catch {
          parsed = { invalid: true, empty: !logo };
        }
        return { tenant_id: r.tenant_id, logo: parsed, updated_at: r.updated_at || null };
      })
      : { error: cpRows?.message },
  };

  // SQL catalog if token available
  if (accessToken) {
    report.bucket = await managementSql(accessToken, `
      select id, name, public, file_size_limit, allowed_mime_types
      from storage.buckets
      where id = 'clinic-logos';
    `);
    report.policies = await managementSql(accessToken, `
      select policyname, cmd, roles, qual, with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (
          qual ilike '%clinic-logos%'
          or with_check ilike '%clinic-logos%'
          or policyname ilike '%clinic_logo%'
        )
      order by policyname;
    `);
    report.objectCount = await managementSql(accessToken, `
      select count(*)::int as n,
             count(distinct (storage.foldername(name))[1])::int as tenant_folders
      from storage.objects
      where bucket_id = 'clinic-logos';
    `);
  }

  const flags = await fetch(`${url}/rest/v1/feature_flags?select=flag_key,scope_type,scope_ref,enabled&or=(flag_key.eq.contracts_operational_ux_global_enabled,flag_key.eq.contracts_operational_ux_enabled)`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  report.rollout = await flags.json();

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    hasAccessToken: report.hasAccessToken,
    anonListRoot: report.probes.listRootAnon,
    anonPublicHead: report.probes.publicHeadPilot,
    bucketPublic: report.probes.bucketsService,
  }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
  process.exit(1);
});
