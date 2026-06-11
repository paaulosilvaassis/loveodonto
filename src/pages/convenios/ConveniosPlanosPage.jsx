import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import { ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '../../components/ui/Modal.jsx';
import { listPlans, listProviders, savePlan } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosPlanosPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ open: false, name: '', provider_id: '', coparticipation: 0, waitingPeriodDays: 0 });

  const providers = useMemo(() => listProviders(tenantId), [tenantId]);
  const plans = useMemo(() => listPlans(tenantId, { includeInactive: true }), [tenantId, refresh]);

  const rows = plans.map((p) => ({
    ...p,
    providerName: providers.find((pr) => pr.id === p.provider_id)?.name || '—',
  }));

  const save = (e) => {
    e.preventDefault();
    try {
      savePlan(user, { ...form, tenant_id: tenantId });
      setForm({ open: false, name: '', provider_id: '', coparticipation: 0, waitingPeriodDays: 0 });
      setRefresh((k) => k + 1);
      setToast({ message: 'Plano salvo', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Planos</h2>
        <Button type="button" variant="primary" onClick={() => setForm((f) => ({ ...f, open: true }))}>Novo plano</Button>
      </div>
      <ConvenioTable
        columns={[
          { key: 'name', label: 'Plano' },
          { key: 'providerName', label: 'Operadora' },
          { key: 'coparticipation', label: 'Coparticipação %', render: (r) => `${r.coparticipation || 0}%` },
          { key: 'waitingPeriodDays', label: 'Carência (dias)' },
        ]}
        rows={rows}
      />
      <ModalRoot open={form.open} onOpenChange={(o) => !o && setForm({ open: false, name: '', provider_id: '', coparticipation: 0, waitingPeriodDays: 0 })}>
        <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader><ModalTitle>Novo plano</ModalTitle></ModalHeader>
          <ModalBody>
            <form id="conv-plan-form" className="conv-form-grid" onSubmit={save}>
              <label className="conv-field conv-field--full">Operadora
                <select className="conv-control" required value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="conv-field conv-field--full">Nome
                <input className="conv-control" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: OdontoPrev Ouro" />
              </label>
              <label className="conv-field">Coparticipação %
                <input type="number" className="conv-control" value={form.coparticipation} onChange={(e) => setForm((f) => ({ ...f, coparticipation: e.target.value }))} />
              </label>
              <label className="conv-field">Carência (dias)
                <input type="number" className="conv-control" value={form.waitingPeriodDays} onChange={(e) => setForm((f) => ({ ...f, waitingPeriodDays: e.target.value }))} />
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setForm({ open: false, name: '', provider_id: '', coparticipation: 0, waitingPeriodDays: 0 })}>Cancelar</Button>
            <Button type="submit" form="conv-plan-form" variant="primary">Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
