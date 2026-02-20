export default function ConsoleProvidersPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Provedores de Pagamento</h1>
      <p className="text-slate-400 mb-6">Stripe, Pagarme e webhooks.</p>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <p className="text-slate-500">Configurações de provedores virão do Supabase (payment_providers).</p>
      </div>
    </div>
  );
}
