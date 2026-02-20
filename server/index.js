/**
 * Admin API - comunicação Console -> App
 * Protegido por API key. NUNCA expor ao frontend do app.
 *
 * Variáveis de ambiente:
 * - ADMIN_API_KEY: chave secreta (header X-Admin-API-Key)
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: para operações no banco
 */
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || process.env.ADMIN_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

function requireApiKey(req, res, next) {
  const key = req.headers['x-admin-api-key'];
  if (!ADMIN_API_KEY || key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: 'Admin API: Supabase não configurado' });
  }
  next();
}

function requirePlatformKey(req, res, next) {
  const key = req.headers['x-platform-key'];
  if (!PLATFORM_API_KEY || key !== PLATFORM_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use('/internal/admin', requireApiKey, requireSupabase);
app.use('/internal/platform', requirePlatformKey, requireSupabase);

// POST /internal/admin/tenants - criar tenant
app.post('/internal/admin/tenants', async (req, res) => {
  try {
    const { name, owner_email, plan_id, status } = req.body;
    const { data, error } = await supabase
      .from('platform_tenants')
      .insert({
        name: name || 'Nova Clínica',
        owner_email: owner_email || null,
        plan_id: plan_id || null,
        status: status || 'trial',
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Erro ao criar tenant' });
  }
});

// PATCH /internal/admin/tenants/:id/status
app.patch('/internal/admin/tenants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['trial', 'active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    const { data, error } = await supabase
      .from('platform_tenants')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Erro ao atualizar status' });
  }
});

// PATCH /internal/admin/tenants/:id/plan
app.patch('/internal/admin/tenants/:id/plan', async (req, res) => {
  try {
    const { id } = req.params;
    const { plan_id } = req.body;
    const { data, error } = await supabase
      .from('platform_tenants')
      .update({ plan_id: plan_id || null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Erro ao atualizar plano' });
  }
});

// GET /internal/admin/tenants/:id/usage
app.get('/internal/admin/tenants/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: tenant } = await supabase.from('platform_tenants').select('*').eq('id', id).single();
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    res.json({ tenant, usage: { users: 0, patients: 0 } });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Erro ao buscar usage' });
  }
});

// --- /internal/platform/* (x-platform-key) ---
app.post('/internal/platform/tenants', async (req, res) => {
  try {
    const { name, owner_email, plan_id, status } = req.body;
    const { data, error } = await supabase
      .from('platform_tenants')
      .insert({
        name: name || 'Nova Clínica',
        owner_email: owner_email || null,
        plan_id: plan_id || null,
        status: status || 'trial',
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Erro ao criar tenant' });
  }
});

app.patch('/internal/platform/tenants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['trial', 'active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    const { data, error } = await supabase
      .from('platform_tenants')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Erro ao atualizar status' });
  }
});

app.patch('/internal/platform/tenants/:id/plan', async (req, res) => {
  try {
    const { id } = req.params;
    const { plan_id } = req.body;
    const { data, error } = await supabase
      .from('platform_tenants')
      .update({ plan_id: plan_id || null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Erro ao atualizar plano' });
  }
});

const PORT = process.env.ADMIN_API_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Admin API rodando na porta ${PORT}`);
  if (!ADMIN_API_KEY) console.warn('ADMIN_API_KEY não definida - API rejeitará requisições');
});
