import { supabase } from '../lib/supabaseClient.ts';

export const createBudgetItems = async (budget_id, items) => {
  if (!supabase) {
    throw new Error('Supabase não configurado. Configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  const payload = items.map((item) => ({
    budget_id,
    name: item.name,
    quantity: item.quantity ?? 1,
    unit_price: item.unit_price ?? 0,
    tooth: item.tooth || null,
    region: item.region || null,
    notes: item.notes || null,
  }));

  const { data, error } = await supabase
    .from('budget_items')
    .insert(payload)
    .select('id, budget_id, name, quantity, unit_price, tooth, region, notes');

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

export const listBudgetItemsByBudget = async (budget_id) => {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from('budget_items')
    .select('id, budget_id, name, quantity, unit_price, tooth, region, notes, status')
    .eq('budget_id', budget_id);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

export const listBudgetItemsByBudgetIds = async (budgetIds) => {
  if (!budgetIds.length) return [];
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from('budget_items')
    .select('id, budget_id, name, quantity, unit_price, tooth, region, notes, status')
    .in('budget_id', budgetIds);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};
