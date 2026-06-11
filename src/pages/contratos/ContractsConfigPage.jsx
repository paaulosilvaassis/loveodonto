import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { getContractSettings, saveContractSettings } from '../../services/contractModuleService.js';

const FIELDS = [
  { key: 'contractRequiredBeforeTreatment', label: 'Contrato obrigatório antes de iniciar tratamento', type: 'checkbox' },
  { key: 'lgpdRequired', label: 'Termo LGPD obrigatório', type: 'checkbox' },
  { key: 'imageUseRequired', label: 'Termo de uso de imagem obrigatório', type: 'checkbox' },
  { key: 'guardianSignatureForMinors', label: 'Assinatura do responsável legal para menores', type: 'checkbox' },
  { key: 'allowEditBeforeSign', label: 'Permitir edição antes da assinatura', type: 'checkbox' },
  { key: 'requireWitness', label: 'Exigir testemunha', type: 'checkbox' },
  { key: 'requireResponsibleProfessional', label: 'Exigir profissional responsável', type: 'checkbox' },
  { key: 'signLinkExpiryDays', label: 'Validade do link de assinatura (dias)', type: 'number' },
  { key: 'pendingAlertDays', label: 'Alertar contrato pendente após (dias)', type: 'number' },
];

export default function ContractsConfigPage() {
  const { user } = useAuth();
  const initial = useMemo(() => getContractSettings(user), [user]);
  const [settings, setSettings] = useState(initial);
  const [toast, setToast] = useState(null);

  const handleSave = () => {
    try {
      saveContractSettings(user, settings);
      setToast({ message: 'Configurações salvas.', type: 'success' });
      setTimeout(() => setToast(null), 3500);
    } catch (e) {
      setToast({ message: e?.message || 'Erro ao salvar.', type: 'error' });
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <div className="ctr-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <section className="ctr-section ctr-config-form">
        <h2 className="ctr-section-title">Configurações do módulo</h2>
        {FIELDS.map((f) => (
          <label key={f.key} className="ctr-config-row">
            {f.type === 'checkbox' ? (
              <>
                <input
                  type="checkbox"
                  checked={Boolean(settings[f.key])}
                  onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.checked }))}
                />
                <span>{f.label}</span>
              </>
            ) : (
              <>
                <span className="ctr-config-label">{f.label}</span>
                <input
                  type="number"
                  className="ctr-input ctr-input--narrow"
                  value={settings[f.key] ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
                />
              </>
            )}
          </label>
        ))}
        <button type="button" className="button primary" onClick={handleSave}>
          Salvar configurações
        </button>
      </section>
    </div>
  );
}
