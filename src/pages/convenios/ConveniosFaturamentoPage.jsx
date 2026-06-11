import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import { ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '../../components/ui/Modal.jsx';
import { listBillingBatches, listGuides, listProviders, createBillingBatch, updateBatchStatus, BATCH_STATUS } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable, ConvenioStatusBadge, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosFaturamentoPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ open: false, provider_id: '', competence: new Date().toISOString().slice(0, 7) });

  const batches = useMemo(() => listBillingBatches(tenantId), [tenantId, refresh]);
  const providers = useMemo(() => listProviders(tenantId), [tenantId]);
  const openGuides = useMemo(
    () => listGuides(tenantId).filter((g) => ['fechada', 'enviada'].includes(g.status) && !g.batch_id),
    [tenantId, refresh]
  );

  const createBatch = (e) => {
    e.preventDefault();
    try {
      const guideIds = openGuides.filter((g) => g.provider_id === form.provider_id).map((g) => g.id);
      if (!guideIds.length) throw new Error('Nenhuma guia disponível para faturamento nesta operadora.');
      createBillingBatch(user, { ...form, tenant_id: tenantId, guideIds });
      setForm({ open: false, provider_id: '', competence: new Date().toISOString().slice(0, 7) });
      setRefresh((k) => k + 1);
      setToast({ message: 'Lote de faturamento criado', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Faturamento</h2>
        <Button type="button" variant="primary" onClick={() => setForm((f) => ({ ...f, open: true }))}>Novo lote</Button>
      </div>
      <ConvenioTable
        columns={[
          { key: 'competence', label: 'Competência' },
          { key: 'providerName', label: 'Operadora' },
          { key: 'guideCount', label: 'Qtd. guias' },
          { key: 'totalValue', label: 'Valor total', render: (r) => formatConvCurrency(r.totalValue) },
          { key: 'status', label: 'Status', render: (r) => <ConvenioStatusBadge label={r.status} tone="info" /> },
          { key: 'actions', label: '', render: (r) => r.status === BATCH_STATUS.ABERTO ? (
            <button type="button" className="conv-link-btn" onClick={() => { updateBatchStatus(user, r.id, BATCH_STATUS.ENVIADO); setRefresh((k) => k + 1); }}>Marcar enviado</button>
          ) : null },
        ]}
        rows={batches}
      />
      <ModalRoot open={form.open} onOpenChange={(o) => !o && setForm({ open: false, provider_id: '', competence: new Date().toISOString().slice(0, 7) })}>
        <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader><ModalTitle>Novo lote de faturamento</ModalTitle></ModalHeader>
          <ModalBody>
            <form id="conv-batch-form" className="conv-form-grid" onSubmit={createBatch}>
              <label className="conv-field">Competência
                <input type="month" className="conv-control" required value={form.competence} onChange={(e) => setForm((f) => ({ ...f, competence: e.target.value }))} />
              </label>
              <label className="conv-field conv-field--full">Operadora
                <select className="conv-control" required value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setForm({ open: false, provider_id: '', competence: new Date().toISOString().slice(0, 7) })}>Cancelar</Button>
            <Button type="submit" form="conv-batch-form" variant="primary">Gerar lote</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
