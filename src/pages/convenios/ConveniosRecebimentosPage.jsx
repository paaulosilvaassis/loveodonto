import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import { ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '../../components/ui/Modal.jsx';
import { listReceipts, listBillingBatches, listProviders, recordReceipt } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosRecebimentosPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    open: false, provider_id: '', batch_id: '', expectedAmount: '', receivedAmount: '',
    receiptDate: new Date().toISOString().slice(0, 10),
  });

  const rows = useMemo(() => listReceipts(tenantId), [tenantId, refresh]);
  const providers = useMemo(() => listProviders(tenantId), [tenantId]);
  const batches = useMemo(() => listBillingBatches(tenantId).filter((b) => b.status === 'enviado' || b.status === 'processado'), [tenantId]);

  const save = (e) => {
    e.preventDefault();
    try {
      const result = recordReceipt(user, {
        ...form,
        tenant_id: tenantId,
        expectedAmount: Number(form.expectedAmount),
        receivedAmount: Number(form.receivedAmount),
      });
      setForm({ open: false, provider_id: '', batch_id: '', expectedAmount: '', receivedAmount: '', receiptDate: new Date().toISOString().slice(0, 10) });
      setRefresh((k) => k + 1);
      const msg = result.differenceAmount > 0
        ? `Recebimento registrado. Glosa de ${formatConvCurrency(result.differenceAmount)} gerada automaticamente.`
        : 'Recebimento registrado com sucesso.';
      setToast({ message: msg, type: result.differenceAmount > 0 ? 'warning' : 'success' });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Recebimentos</h2>
        <Button type="button" variant="primary" onClick={() => setForm((f) => ({ ...f, open: true }))}>Registrar recebimento</Button>
      </div>
      <ConvenioTable
        columns={[
          { key: 'receiptDate', label: 'Data' },
          { key: 'providerName', label: 'Operadora' },
          { key: 'expectedAmount', label: 'Previsto', render: (r) => formatConvCurrency(r.expectedAmount) },
          { key: 'receivedAmount', label: 'Recebido', render: (r) => formatConvCurrency(r.receivedAmount) },
          { key: 'differenceAmount', label: 'Diferença', render: (r) => formatConvCurrency(r.differenceAmount) },
        ]}
        rows={rows}
      />
      <ModalRoot open={form.open} onOpenChange={(o) => !o && setForm({ open: false, provider_id: '', batch_id: '', expectedAmount: '', receivedAmount: '', receiptDate: new Date().toISOString().slice(0, 10) })}>
        <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader><ModalTitle>Registrar recebimento</ModalTitle></ModalHeader>
          <ModalBody>
            <form id="conv-receipt-form" className="conv-form-grid" onSubmit={save}>
              <label className="conv-field">Data
                <input type="date" className="conv-control" required value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} />
              </label>
              <label className="conv-field conv-field--full">Operadora
                <select className="conv-control" required value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="conv-field conv-field--full">Lote
                <select className="conv-control" value={form.batch_id} onChange={(e) => {
                  const batch = batches.find((b) => b.id === e.target.value);
                  setForm((f) => ({ ...f, batch_id: e.target.value, expectedAmount: batch?.totalValue ?? f.expectedAmount, provider_id: batch?.provider_id ?? f.provider_id }));
                }}>
                  <option value="">Opcional</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.competence} — {formatConvCurrency(b.totalValue)}</option>)}
                </select>
              </label>
              <label className="conv-field">Valor previsto
                <input type="number" step="0.01" className="conv-control" required value={form.expectedAmount} onChange={(e) => setForm((f) => ({ ...f, expectedAmount: e.target.value }))} />
              </label>
              <label className="conv-field">Valor recebido
                <input type="number" step="0.01" className="conv-control" required value={form.receivedAmount} onChange={(e) => setForm((f) => ({ ...f, receivedAmount: e.target.value }))} />
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setForm({ open: false, provider_id: '', batch_id: '', expectedAmount: '', receivedAmount: '', receiptDate: new Date().toISOString().slice(0, 10) })}>Cancelar</Button>
            <Button type="submit" form="conv-receipt-form" variant="primary">Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
