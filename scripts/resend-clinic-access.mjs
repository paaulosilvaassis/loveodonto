#!/usr/bin/env node
/**
 * Reenvia convite de acesso master (usa service role local — server/.env).
 *
 * Uso:
 *   node scripts/resend-clinic-access.mjs <tenant_id> [email]
 *
 * Exemplo:
 *   node scripts/resend-clinic-access.mjs b8fdd7e3-354b-45cf-a8e1-36974c80f0c4 paaulosilvaassis@hotmail.com
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resendClinicOwnerAccess } from '../server/clinicOwnerAccessDispatch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../server/.env') });
config({ path: path.join(__dirname, '../.env') });
config({ path: path.join(__dirname, '../.env.local'), override: true });

const tenantId = process.argv[2];
const emailArg = process.argv[3];

if (!tenantId) {
  console.error('Uso: node scripts/resend-clinic-access.mjs <tenant_id> [email]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em server/.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: tenant, error: tenantError } = await supabase
  .from('tenants')
  .select('id, trade_name, legal_name, owner_email')
  .eq('id', tenantId)
  .maybeSingle();
if (tenantError) throw tenantError;
if (!tenant?.id) {
  console.error('Clínica não encontrada:', tenantId);
  process.exit(1);
}

const { data: legalProfile } = await supabase
  .from('tenant_legal_profiles')
  .select('legal_representative_name, legal_representative_email')
  .eq('tenant_id', tenantId)
  .maybeSingle();

const email = (emailArg || legalProfile?.legal_representative_email || tenant.owner_email || '').trim().toLowerCase();
if (!email) {
  console.error('E-mail não informado e não encontrado no cadastro da clínica.');
  process.exit(1);
}

const fullName = legalProfile?.legal_representative_name || tenant.trade_name || tenant.legal_name;

console.log('[resend-clinic-access]', { tenantId, email, fullName });

const result = await resendClinicOwnerAccess(supabase, {
  tenantId,
  email,
  fullName,
  roleSlug: 'master',
});

console.log(JSON.stringify(result, null, 2));

if (result.accessEmailSent || result.sent) {
  console.log('\nConvite enviado. Verifique a caixa de entrada (e spam).');
} else if (result.setupLink) {
  console.log('\nE-mail não enviado automaticamente. Link manual:');
  console.log(result.setupLink);
} else {
  console.log('\nFalha no envio. Veja o JSON acima.');
  process.exit(1);
}
