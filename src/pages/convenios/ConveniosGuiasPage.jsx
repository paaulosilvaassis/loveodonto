import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import { ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle } from '../../components/ui/Modal.jsx';
import { listGuides, listProviders, saveGuide, GUIDE_STATUS } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable, ConvenioStatusBadge, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';
import { loadDb } from '../../db/index.js';

const STATUS_LABELS = {
  [GUIDE_STATUS.ABERTA]: 'Aberta',
  [GUIDE_STATUS.FECHADA]: 'Fechada',
  [GUIDE_STATUS.ENVIADA]: 'Enviada',
  [GUIDE_STATUS.FATURADA]: 'Faturada',
  [GUIDE_STATUS.RECEBIDA]: 'Recebida',
  [GUIDE_STATUS.GLOSADA]: 'Glosada',
};

export default function ConveniosGuiasPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    open: false, patient_id: '', provider_id: '', procedureName: '', professional_name: '',
    tableValue: '', repasseValue: '', serviceDate: new Date().toISOString().slice(0, 10),
  });

  const rows = useMemo(() => listGuides(tenantId), [tenantId, refresh]);
  const providers = useMemo(() => listProviders(tenantId), [tenantId]);
  const patients = useMemo(() => (loadDb().patients || []).filter((p) => !tenantId || p.tenant_id === tenantId), [tenantId]);

  const save = (e) => {
    e.preventDefault();
    try {
      saveGuide(user, { ...form, tenant_id: tenantId, tableValue: Number(form.tableValue), repasseValue: Number(form.repasseValue || form.tableValue) });
      setForm({ open: false, patient_id: '', provider_id: '', procedureName: '', professional_name: '', tableValue: '', repasseValue: '', serviceDate: new Date().toISOString().slice(0, 10) });
      setRefresh((k) => k + 1);
      setToast({ message: 'Guia TISS criada', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Guias TISS</h2>
        <Button type="button" variant="primary" onClick={() => setForm((f) => ({ ...f, open: true }))}>Nova guia</Button>
      </div>
      <ConvenioTable
        columns={[
          { key: 'patientName', label: 'Paciente' },
          { key: 'providerName', label: 'Convênio' },
          { key: 'procedureName', label: 'Procedimento' },
          { key: 'professionalName', label: 'Dentista' },
          { key: 'serviceDate', label: 'Data' },
          { key: 'repasseValue', label: 'Repasse', render: (r) => formatConvCurrency(r.repasseValue) },
          { key: 'status', label: 'Status', render: (r) => <ConvenioStatusBadge label={STATUS_LABELS[r.status] || r.status} tone="info" /> },
        ]}
        rows={rows}
      />
      <ModalRoot open={form.open} onOpenChange={(o) => !o && setForm({ open: false, patient_id: '', provider_id: '', procedureName: '', professional_name: '', tableValue: '', repasseValue: '', serviceDate: new Date().toISOString().slice(0, 10) })}>
        <ModalContent size="lg" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader><ModalTitle>Nova guia odontológica TISS</ModalTitle></ModalHeader>
          <ModalBody>
            <form id="conv-guide-form" className="conv-form-grid" onSubmit={save}>
              <label className="conv-field">Paciente
                <select className="conv-control" required value={form.patient_id} onChange={(e) => setForm((f) => ({ ...f, patient_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.nickname}</option>)}
                </select>
              </label>
              <label className="conv-field">Operadora
                <select className="conv-control" required value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="conv-field conv-field--full">Procedimento
                <input className="conv-control" required value={form.procedureName} onChange={(e) => setForm((f) => ({ ...f, procedureName: e.target.value }))} />
              </label>
              <label className="conv-field">Dentista
                <input className="conv-control" value={form.professional_name} onChange={(e) => setForm((f) => ({ ...f, professional_name: e.target.value }))} />
              </label>
              <label className="conv-field">Data
                <input type="date" className="conv-control" required value={form.serviceDate} onChange={(e) => setForm((f) => ({ ...f, serviceDate: e.target.value }))} />
              </label>
              <label className="conv-field">Valor tabela
                <input type="number" step="0.01" className="conv-control" required value={form.tableValue} onChange={(e) => setForm((f) => ({ ...f, tableValue: e.target.value }))} />
              </label>
              <label className="conv-field">Valor repasse
                <input type="number" step="0.01" className="conv-control" value={form.repasseValue} onChange={(e) => setForm((f) => ({ ...f, repasseValue: e.target.value }))} />
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setForm({ open: false, patient_id: '', provider_id: '', procedureName: '', professional_name: '', tableValue: '', repasseValue: '', serviceDate: new Date().toISOString().slice(0, 10) })}>Cancelar</Button>
            <Button type="submit" form="conv-guide-form" variant="primary">Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
