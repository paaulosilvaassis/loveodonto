import { useMemo, useState } from 'react';
import Button from '../../components/Button.jsx';
import { listInsuredPatients, checkEligibility } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioTable, ConvenioStatusBadge } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosPacientesPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [toast, setToast] = useState(null);
  const patients = useMemo(() => listInsuredPatients(tenantId), [tenantId]);

  const handleEligibility = (insuranceId) => {
    try {
      const result = checkEligibility(user, insuranceId);
      setToast({ message: result.message, type: result.eligible ? 'success' : 'error' });
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      setToast({ message: e.message, type: 'error' });
    }
  };

  const rows = patients.flatMap((p) =>
    p.insurances.map((ins, idx) => ({
      id: `${p.patientId}-${ins.id || idx}`,
      patientName: p.patientName,
      providerName: ins.providerName || ins.insurance_name,
      planName: ins.planName || ins.plan_name || '—',
      membership_number: ins.membership_number || '—',
      validity: ins.validity || '—',
      status: ins.status,
      insuranceId: ins.id,
    }))
  );

  return (
    <div className="conv-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <div className="conv-page-toolbar">
        <h2 className="conv-section-title">Pacientes conveniados</h2>
        <p className="conv-hint">Vincule convênios no cadastro do paciente (aba Convênios).</p>
      </div>
      <ConvenioTable
        columns={[
          { key: 'patientName', label: 'Paciente' },
          { key: 'providerName', label: 'Operadora' },
          { key: 'planName', label: 'Plano' },
          { key: 'membership_number', label: 'Carteirinha' },
          { key: 'validity', label: 'Validade' },
          { key: 'status', label: 'Status', render: (r) => <ConvenioStatusBadge label={r.status} tone="info" /> },
          { key: 'actions', label: '', render: (r) => r.insuranceId ? (
            <button type="button" className="conv-link-btn" onClick={() => handleEligibility(r.insuranceId)}>Verificar elegibilidade</button>
          ) : null },
        ]}
        rows={rows}
        emptyMessage="Nenhum paciente conveniado. Cadastre convênios no prontuário do paciente."
      />
    </div>
  );
}
