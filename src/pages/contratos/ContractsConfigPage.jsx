import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { getContractSettings, saveContractSettings } from '../../services/contractModuleService.js';
import {
  SIGNATURE_PROVIDERS,
  SIGNATURE_PROVIDER_LABELS,
  LEGAL_SIGNATURE_TYPES,
  LEGAL_SIGNATURE_TYPE_LABELS,
} from '../../contracts/contractConstants.js';

const CHECKBOX_FIELDS = [
  { key: 'contractRequiredBeforeTreatment', label: 'Contrato obrigatório antes de iniciar tratamento' },
  { key: 'lgpdRequired', label: 'Termo LGPD obrigatório' },
  { key: 'imageUseRequired', label: 'Termo de uso de imagem obrigatório' },
  { key: 'guardianSignatureForMinors', label: 'Assinatura do responsável legal para menores' },
  { key: 'allowEditBeforeSign', label: 'Permitir edição antes da assinatura' },
  { key: 'requireWitness', label: 'Exigir testemunha' },
  { key: 'requireResponsibleProfessional', label: 'Exigir profissional responsável' },
  { key: 'requireCpfForSignature', label: 'Exigir CPF na assinatura' },
  { key: 'requireEmailForSignature', label: 'Exigir e-mail na assinatura' },
  { key: 'requireSmsToken', label: 'Exigir token por SMS/WhatsApp' },
  { key: 'requireSelfie', label: 'Exigir selfie (quando a plataforma permitir)' },
  { key: 'requireIcpCertificate', label: 'Exigir certificado digital ICP-Brasil' },
  { key: 'highValueRequireAdvancedSignature', label: 'Exigir assinatura avançada para alto valor' },
  { key: 'financingRequireAdvancedSignature', label: 'Exigir assinatura avançada com financiamento' },
];

const NUMBER_FIELDS = [
  { key: 'signLinkExpiryDays', label: 'Validade padrão do link de assinatura (dias)' },
  { key: 'pendingAlertDays', label: 'Alertar contrato pendente após (dias)' },
  { key: 'highValueThreshold', label: 'Valor mínimo para assinatura avançada (R$)' },
];

const TEXT_FIELDS = [
  { key: 'clinicNotificationEmail', label: 'E-mail da clínica para notificações', type: 'email' },
  { key: 'technicalResponsibleEmail', label: 'E-mail do responsável técnico', type: 'email' },
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
        <h2 className="ctr-section-title">Assinatura digital</h2>
        <label className="ctr-config-row">
          <span className="ctr-config-label">Plataforma de assinatura</span>
          <select
            className="ctr-input"
            value={settings.signatureProvider || SIGNATURE_PROVIDERS.INTERNAL}
            onChange={(e) => setSettings((s) => ({ ...s, signatureProvider: e.target.value }))}
          >
            {Object.entries(SIGNATURE_PROVIDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="ctr-config-row">
          <span className="ctr-config-label">Tipo de assinatura padrão</span>
          <select
            className="ctr-input"
            value={settings.defaultSignatureType || LEGAL_SIGNATURE_TYPES.SIMPLE}
            onChange={(e) => setSettings((s) => ({ ...s, defaultSignatureType: e.target.value }))}
          >
            {Object.entries(LEGAL_SIGNATURE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <h2 className="ctr-section-title">Configurações do módulo</h2>
        {CHECKBOX_FIELDS.map((f) => (
          <label key={f.key} className="ctr-config-row">
            <input
              type="checkbox"
              checked={Boolean(settings[f.key])}
              onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.checked }))}
            />
            <span>{f.label}</span>
          </label>
        ))}
        {NUMBER_FIELDS.map((f) => (
          <label key={f.key} className="ctr-config-row">
            <span className="ctr-config-label">{f.label}</span>
            <input
              type="number"
              className="ctr-input ctr-input--narrow"
              value={settings[f.key] ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
            />
          </label>
        ))}
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className="ctr-config-row">
            <span className="ctr-config-label">{f.label}</span>
            <input
              type={f.type || 'text'}
              className="ctr-input"
              value={settings[f.key] ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          </label>
        ))}
        <button type="button" className="button primary" onClick={handleSave}>
          Salvar configurações
        </button>
      </section>
    </div>
  );
}
