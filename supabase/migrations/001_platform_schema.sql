-- Console da Plataforma: schema separado
-- Execute em um projeto Supabase separado (recomendado) ou no mesmo com RLS rígido

-- 1) platform_users: usuários internos do console (id = auth.users.id)
CREATE TABLE IF NOT EXISTS platform_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SALES', 'SUPPORT', 'FINANCE')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: só platform_users ativos podem ler (exceto própria linha)
ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_users_select" ON platform_users
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active AND pu.role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN'))
  );

CREATE POLICY "platform_users_insert" ON platform_users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "platform_users_update" ON platform_users
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active AND pu.role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN'))
  );

-- 2) platform_audit_logs
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_platform_user_id UUID REFERENCES platform_users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_audit_logs_select" ON platform_audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active)
  );

CREATE POLICY "platform_audit_logs_insert" ON platform_audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active)
  );

-- 3) payment_providers
CREATE TABLE IF NOT EXISTS payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'pagarme')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  config_json JSONB,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_providers_select" ON payment_providers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active)
  );

CREATE POLICY "payment_providers_all" ON payment_providers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active AND pu.role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN'))
  );

-- 4) plans (se não existir)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  limits_json JSONB DEFAULT '{}',
  features_json JSONB DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select" ON plans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active)
  );

CREATE POLICY "plans_all" ON plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active AND pu.role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN'))
  );

-- 5) platform_tenants (registro de clínicas na plataforma)
CREATE TABLE IF NOT EXISTS platform_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_tenant_id TEXT UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended')),
  owner_email TEXT,
  plan_id TEXT REFERENCES plans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_tenants_select" ON platform_tenants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active)
  );

CREATE POLICY "platform_tenants_all" ON platform_tenants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active AND pu.role IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SALES'))
  );

-- 6) subscriptions (simplificado)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform_tenants(id),
  plan_id TEXT REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = auth.uid() AND pu.is_active)
  );
