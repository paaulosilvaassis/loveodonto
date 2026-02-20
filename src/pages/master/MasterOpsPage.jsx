import { useMemo } from 'react';
import { loadDb } from '../../db/index.js';
import { Section } from '../../components/Section.jsx';

export default function MasterOpsPage() {
  const db = useMemo(() => loadDb(), []);
  const logs = useMemo(() => (db.auditLogs || []).slice(0, 50), [db.auditLogs]);

  return (
    <div className="stack">
      <Section title="Operações" description="Logs e integrações.">
        <h4 style={{ marginBottom: '0.75rem' }}>Últimos logs</h4>
        <div className="card" style={{ maxHeight: '400px', overflow: 'auto' }}>
          <pre style={{ fontSize: '0.8rem', margin: 0 }}>
            {logs.length === 0 ? 'Nenhum log.' : logs.map((l, i) => <div key={i}>{l.timestamp} {l.action} {JSON.stringify(l.data || {})}</div>)}
          </pre>
        </div>
      </Section>
    </div>
  );
}
