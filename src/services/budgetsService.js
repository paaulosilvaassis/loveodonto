import { supabase } from '../lib/supabaseClient.ts';

export const createBudget = async ({ patient_id, price_table_id, status }) => {
  if (!supabase) {
    throw new Error('Supabase não configurado. Configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  const { data, error } = await supabase
    .from('budgets')
    .insert([{ patient_id, price_table_id, status }])
    .select('id, status, started_at, finished_at, updated_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const listBudgets = async () => {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from('budgets')
    .select('id, status, started_at, finished_at, updated_at');

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

export const updateBudgetTotal = async (budget_id, total) => {
  if (!supabase) {
    throw new Error('Supabase não configurado. Configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  const { data, error } = await supabase
    .from('budgets')
    .update({ total })
    .eq('id', budget_id)
    .select('id, total')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
