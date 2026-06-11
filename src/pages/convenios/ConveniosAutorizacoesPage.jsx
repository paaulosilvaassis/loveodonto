import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import { ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '../../components/ui/Modal.jsx';
import { listAuthorizations, listProviders, saveAuthorization, AUTH_STATUS } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable, ConvenioStatusBadge } from '../../convenios/ui/ConvenioUi.jsx';
import { loadDb } from '../../db/index.js';

const STATUS_LABELS = {
  [AUTH_STATUS.SOLICITADA]: 'Solicitada',
  [AUTH_STATUS.PENDENTE]: 'Pendente',
  [AUTH_STATUS.APROVADA]: 'Aprovada',
  [AUTH_STATUS.NEGADA]: 'Negada',
  [AUTH_STATUS.EXECUTADA]: 'Executada',
};

export default function ConveniosAutorizacoesPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ open: false, patient_id: '', provider_id: '', procedureName: '', authNumber: '' });

  const rows = useMemo(() => listAuthorizations(tenantId), [tenantId, refresh]);
  const providers = useMemo(() => listProviders(tenantId), [tenantId]);
  const patients = useMemo(() => (loadDb().patients || []).filter((p) => !tenantId || p.tenant_id === tenantId), [tenantId]);

  const save = (e) => {
    e.preventDefault();
    try {
      saveAuthorization(user, { ...form, tenant_id: tenantId, requestDate: new Date().toISOString().slice(0, 10) });
      setForm({ open: false, patient_id: '', provider_id: '', procedureName: '', authNumber: '' });
      setRefresh((k) => k + 1);
      setToast({ message: 'Autorização registrada', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Autorizações</h2>
        <Button type="button" variant="primary" onClick={() => setForm((f) => ({ ...f, open: true }))}>Nova autorização</Button>
      </div>
      <ConvenioTable
        columns={[
          { key: 'patientName', label: 'Paciente' },
          { key: 'providerName', label: 'Convênio' },
          { key: 'procedureName', label: 'Procedimento' },
          { key: 'requestDate', label: 'Solicitação' },
          { key: 'authNumber', label: 'Nº autorização', render: (r) => r.authNumber || '—' },
          { key: 'status', label: 'Status', render: (r) => <ConvenioStatusBadge label={STATUS_LABELS[r.status] || r.status} tone="warning" /> },
        ]}
        rows={rows}
      />
      <ModalRoot open={form.open} onOpenChange={(o) => !o && setForm({ open: false, patient_id: '', provider_id: '', procedureName: '', authNumber: '' })}>
        <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader><ModalTitle>Nova autorização</ModalTitle></ModalHeader>
          <ModalBody>
            <form id="conv-auth-form" className="conv-form-grid" onSubmit={save}>
              <label className="conv-field conv-field--full">Paciente
                <select className="conv-control" required value={form.patient_id} onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.nickname}</option>)}
                </select>
              </label>
              <label className="conv-field conv-field--full">Operadora
                <select className="conv-control" required value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="conv-field conv-field--full">Procedimento
                <input className="conv-control" required value={form.procedureName} onChange={(e) => setForm((f) => ({ ...f, procedureName: e.target.value }))} />
              </label>
              <label className="conv-field">Nº autorização
                <input className="conv-control" value={form.authNumber} onChange={(e) => setForm((f) => ({ ...f, authNumber: e.target.value }))} />
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setForm({ open: false, patient_id: '', provider_id: '', procedureName: '', authNumber: '' })}>Cancelar</Button>
            <Button type="submit" form="conv-auth-form" variant="primary">Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
