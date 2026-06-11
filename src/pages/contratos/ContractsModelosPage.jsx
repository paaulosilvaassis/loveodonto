import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import {
  listContractTemplates,
  createClinicCustomTemplate,
  duplicateClinicTemplate,
  deleteClinicTemplate,
  restoreSystemDefaultTemplate,
} from '../../services/contractService.js';
import { ensureContractsModuleSeeded, listTemplatesByCategory } from '../../services/contractModuleService.js';
import { CONTRACT_CATEGORIES, TREATMENT_TYPE_LABELS } from '../../contracts/contractConstants.js';
import ContractRichEditor from '../../components/contracts/ContractRichEditor.jsx';
import { CONTRACT_HASHTAG_DEFS } from '../../contracts/hashtagRegistry.js';

export default function ContractsModelosPage() {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [customName, setCustomName] = useState('');
  const [customContent, setCustomContent] = useState('<p></p>');
  const [toast, setToast] = useState(null);

  const templates = useMemo(() => {
    void refresh;
    ensureContractsModuleSeeded();
    return listTemplatesByCategory(CONTRACT_CATEGORIES.SERVICOS);
  }, [refresh]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="ctr-page space-y-6">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <section className="ctr-section">
        <h2 className="ctr-section-title">Modelos de contrato</h2>
        <p className="ctr-hint">Use hashtags (#paciente_nome, #valor_total, etc.) para variáveis dinâmicas. Clique nas tags abaixo para inserir.</p>
        <div className="ctr-tag-chips">
          {CONTRACT_HASHTAG_DEFS.slice(0, 12).map((d) => (
            <code key={d.tag} className="ctr-tag-chip" title={d.description}>{d.tag}</code>
          ))}
        </div>
        <ul className="ctr-template-list">
          {templates.map((t) => (
            <li key={t.id} className="ctr-template-item">
              <div>
                <strong>{t.name}</strong>
                <span className="ctr-template-meta">
                  {TREATMENT_TYPE_LABELS[t.treatmentType] || t.type}
                  {t.isDefault ? ' · Padrão' : ''}
                  {' · v'}{t.version}
                </span>
              </div>
              {t.type === 'clinic_custom' && (
                <div className="ctr-actions">
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={() => {
                      duplicateClinicTemplate(user, t.id);
                      setRefresh((x) => x + 1);
                      showToast('Modelo duplicado.');
                    }}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={() => {
                      try {
                        deleteClinicTemplate(user, t.id);
                        setRefresh((x) => x + 1);
                        showToast('Excluído.');
                      } catch (e) {
                        showToast(e?.message || 'Erro.', 'error');
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="button secondary text-sm"
          onClick={() => {
            try {
              restoreSystemDefaultTemplate(user);
              setRefresh((x) => x + 1);
              showToast('Padrão do sistema restaurado.');
            } catch (e) {
              showToast(e?.message || 'Erro.', 'error');
            }
          }}
        >
          Restaurar modelo padrão
        </button>
      </section>
      <section className="ctr-section">
        <h2 className="ctr-section-title">Criar modelo personalizado</h2>
        <input
          className="ctr-input"
          placeholder="Nome do modelo"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />
        <ContractRichEditor initialHtml={customContent} onChange={setCustomContent} />
        <button
          type="button"
          className="button primary"
          onClick={() => {
            try {
              createClinicCustomTemplate(user, { name: customName || 'Contrato personalizado', content: customContent });
              setCustomName('');
              setCustomContent('<p></p>');
              setRefresh((x) => x + 1);
              showToast('Modelo criado.');
            } catch (e) {
              showToast(e?.message || 'Erro.', 'error');
            }
          }}
        >
          Salvar modelo
        </button>
      </section>
    </div>
  );
}
