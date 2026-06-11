import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle,
} from '../../components/ui/Modal.jsx';
import { listProviders, saveProvider, PROVIDER_STATUS } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable, ConvenioStatusBadge } from '../../convenios/ui/ConvenioUi.jsx';

const EMPTY = {
  id: '', name: '', ansRegistration: '', cnpj: '', phone: '', email: '',
  portalUrl: '', commercialContact: '', billingContact: '', notes: '', status: PROVIDER_STATUS.ATIVO,
};

export default function ConveniosOperadorasPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState({ open: false, form: EMPTY });
  const [toast, setToast] = useState(null);

  const rows = useMemo(() => listProviders(tenantId, { includeInactive: true }), [tenantId, refresh]);

  const openNew = () => setModal({ open: true, form: { ...EMPTY } });
  const openEdit = (row) => setModal({ open: true, form: { ...row } });

  const handleSave = (e) => {
    e.preventDefault();
    try {
      saveProvider(user, { ...modal.form, tenant_id: tenantId });
      setModal({ open: false, form: EMPTY });
      setRefresh((k) => k + 1);
      setToast({ message: 'Operadora salva', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  };

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Operadoras</h2>
        <Button type="button" variant="primary" onClick={openNew}>Nova operadora</Button>
      </div>
      <ConvenioTable
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'ans', label: 'Registro ANS', render: (r) => r.ansRegistration || '—' },
          { key: 'cnpj', label: 'CNPJ', render: (r) => r.cnpj || '—' },
          { key: 'status', label: 'Status', render: (r) => (
            <ConvenioStatusBadge
              label={r.status === PROVIDER_STATUS.ATIVO ? 'Ativo' : 'Inativo'}
              tone={r.status === PROVIDER_STATUS.ATIVO ? 'success' : 'muted'}
            />
          ) },
          { key: 'actions', label: '', render: (r) => (
            <button type="button" className="conv-link-btn" onClick={() => openEdit(r)}>Editar</button>
          ) },
        ]}
        rows={rows}
      />

      <ModalRoot open={modal.open} onOpenChange={(o) => { if (!o) setModal({ open: false, form: EMPTY }); }}>
        <ModalContent size="lg" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader><ModalTitle>{modal.form.id ? 'Editar operadora' : 'Nova operadora'}</ModalTitle></ModalHeader>
          <ModalBody>
            <form id="conv-provider-form" className="conv-form-grid" onSubmit={handleSave}>
              {['name', 'ansRegistration', 'cnpj', 'phone', 'email', 'portalUrl', 'commercialContact', 'billingContact'].map((field) => (
                <label key={field} className="conv-field">
                  {field === 'ansRegistration' ? 'Registro ANS' : field === 'portalUrl' ? 'Portal' : field === 'commercialContact' ? 'Contato comercial' : field === 'billingContact' ? 'Contato faturamento' : field.charAt(0).toUpperCase() + field.slice(1)}
                  <input
                    className="conv-control"
                    value={modal.form[field] || ''}
                    onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, [field]: e.target.value } }))}
                    required={field === 'name'}
                  />
                </label>
              ))}
              <label className="conv-field conv-field--full">
                Observações
                <textarea
                  className="conv-control"
                  rows={2}
                  value={modal.form.notes || ''}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, notes: e.target.value } }))}
                />
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setModal({ open: false, form: EMPTY })}>Cancelar</Button>
            <Button type="submit" form="conv-provider-form" variant="primary">Salvar</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
