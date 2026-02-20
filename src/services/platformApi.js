import { supabasePlatformClient } from '../lib/supabaseClients.js';

export async function fetchPlatformTenants(filters = {}) {
  if (!supabasePlatformClient) return { data: [], error: new Error('Supabase Plataforma não configurado') };
  let q = supabasePlatformClient.from('platform_tenants').select('*').order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  return { data: data ?? [], error };
}

export async function fetchPlatformTenant(id) {
  if (!supabasePlatformClient) return { data: null, error: new Error('Supabase Plataforma não configurado') };
  const { data, error } = await supabasePlatformClient.from('platform_tenants').select('*').eq('id', id).single();
  return { data, error };
}

export async function fetchPlatformPlans() {
  if (!supabasePlatformClient) return { data: [], error: new Error('Supabase Plataforma não configurado') };
  const { data, error } = await supabasePlatformClient.from('plans').select('*').order('id');
  return { data: data ?? [], error };
}

export async function fetchPlatformUsers() {
  if (!supabasePlatformClient) return { data: [], error: new Error('Supabase Plataforma não configurado') };
  const { data, error } = await supabasePlatformClient.from('platform_users').select('*').order('created_at', { ascending: false });
  return { data: data ?? [], error };
}

export async function fetchPaymentProviders() {
  if (!supabasePlatformClient) return { data: [], error: new Error('Supabase Plataforma não configurado') };
  const { data, error } = await supabasePlatformClient.from('payment_providers').select('*');
  return { data: data ?? [], error };
}
