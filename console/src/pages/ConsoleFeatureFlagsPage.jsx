import { useMemo, useState } from 'react';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import { listFeatureFlags, updateFeatureFlag } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

export default function ConsoleFeatureFlagsPage() {
  const { platformUser, hasPermission } = usePlatformAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const rows = useMemo(() => listFeatureFlags(), [reloadKey]);

  const handleToggle = async (flagId, nextValue) => {
    try {
      setError('');
      updateFeatureFlag(platformUser, flagId, nextValue);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao atualizar funcionalidade.');
    }
  };

  return (
    <div className="pc-stack">
      <PageHeader title="Funcionalidades" description="Controle de funcionalidades por clínica, com ativação progressiva." />
      {error ? <p className="pc-error">{error}</p> : null}
      <Panel>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Escopo</th>
                <th>Status</th>
                <th>Atualizado em</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.key}</td>
                  <td>{item.scopeType === 'tenant' ? 'Clínica' : item.scopeType}:{item.scopeRef}</td>
                  <td><StatusBadge status={item.enabled ? 'enabled' : 'disabled'} /></td>
                  <td>{String(item.updatedAt).replace('T', ' ').slice(0, 19)}</td>
                  <td>
                    <button
                      type="button"
                      className="pc-button"
                      disabled={!hasPermission('flags:write')}
                      onClick={() => handleToggle(item.id, !item.enabled)}
                    >
                      {item.enabled ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
