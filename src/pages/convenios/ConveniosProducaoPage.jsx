import { useMemo, useState } from 'react';
import { listProduction, listProviders } from '../../services/convenioService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { ConvenioTable, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosProducaoPage() {
  const tenantId = useConvenioTenant();
  const [providerId, setProviderId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const providers = useMemo(() => listProviders(tenantId), [tenantId]);
  const rows = useMemo(
    () => listProduction(tenantId, { providerId: providerId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    [tenantId, providerId, dateFrom, dateTo]
  );

  return (
    <div className="conv-page">
      <h2 className="conv-section-title">Produção convênio</h2>
      <div className="conv-filters">
        <label className="conv-field">Convênio
          <select className="conv-control" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">Todos</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="conv-field">De
          <input type="date" className="conv-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="conv-field">Até
          <input type="date" className="conv-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>
      <ConvenioTable
        columns={[
          { key: 'patientName', label: 'Paciente' },
          { key: 'procedureName', label: 'Procedimento' },
          { key: 'professionalName', label: 'Dentista' },
          { key: 'providerName', label: 'Convênio' },
          { key: 'tableValue', label: 'Valor tabela', render: (r) => formatConvCurrency(r.tableValue) },
          { key: 'repasseValue', label: 'Repasse', render: (r) => formatConvCurrency(r.repasseValue) },
          { key: 'status', label: 'Situação' },
        ]}
        rows={rows}
      />
    </div>
  );
}
