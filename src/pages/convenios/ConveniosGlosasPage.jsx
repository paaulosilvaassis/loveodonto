import { useMemo, useState } from 'react';
import { listGlosas, saveGlosa, GLOSA_STATUS } from '../../services/convenioService.js';
import { getConvenioDashboard } from '../../services/convenioDashboardService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { useAuth } from '../../auth/useAuth.js';
import { ConvenioKpiGrid, ConvenioTable, ConvenioStatusBadge, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';
import { listProviders } from '../../services/convenioService.js';

const STATUS_LABELS = {
  [GLOSA_STATUS.ABERTA]: 'Aberta',
  [GLOSA_STATUS.CONTESTADA]: 'Contestada',
  [GLOSA_STATUS.RECUPERADA]: 'Recuperada',
  [GLOSA_STATUS.PERDIDA]: 'Perdida',
};

export default function ConveniosGlosasPage() {
  const { user } = useAuth();
  const tenantId = useConvenioTenant();
  const [refresh, setRefresh] = useState(0);
  const dashboard = useMemo(() => getConvenioDashboard(tenantId), [tenantId, refresh]);
  const rows = useMemo(() => listGlosas(tenantId), [tenantId, refresh]);

  const contest = (row) => {
    saveGlosa(user, { ...row, status: GLOSA_STATUS.CONTESTADA, tenant_id: tenantId });
    setRefresh((k) => k + 1);
  };

  return (
    <div className="conv-page">
      <ConvenioKpiGrid items={[
        { key: 'g', label: 'Valor glosado', value: formatConvCurrency(dashboard.glosaKpis.valorGlosado), variant: 'danger' },
        { key: 'r', label: 'Valor recuperado', value: formatConvCurrency(dashboard.glosaKpis.valorRecuperado), variant: 'success' },
        { key: 'p', label: '% glosa', value: `${dashboard.glosaKpis.percentualGlosa}%`, variant: 'warning' },
      ]} />
      <h2 className="conv-section-title">Glosas</h2>
      <ConvenioTable
        columns={[
          { key: 'patientName', label: 'Paciente', render: (r) => r.patientName || '—' },
          { key: 'providerName', label: 'Convênio' },
          { key: 'procedureName', label: 'Procedimento' },
          { key: 'reason', label: 'Motivo' },
          { key: 'glosaAmount', label: 'Valor', render: (r) => formatConvCurrency(r.glosaAmount) },
          { key: 'glosaDate', label: 'Data' },
          { key: 'status', label: 'Status', render: (r) => <ConvenioStatusBadge label={STATUS_LABELS[r.status] || r.status} tone="danger" /> },
          { key: 'actions', label: '', render: (r) => r.status === GLOSA_STATUS.ABERTA ? (
            <button type="button" className="conv-link-btn" onClick={() => contest(r)}>Contestar</button>
          ) : null },
        ]}
        rows={rows}
      />
    </div>
  );
}
