import { useMemo } from 'react';
import { ensureContractsModuleSeeded, listTemplatesByCategory } from '../../services/contractModuleService.js';
import {
  CONTRACT_CATEGORIES,
  CONTRACT_CATEGORY_LABELS,
} from '../../contracts/contractConstants.js';
import { ContractDocumentPreview } from '../../contracts/ui/ContractUi.jsx';

const TERM_CATEGORIES = [
  CONTRACT_CATEGORIES.CONSENTIMENTO,
  CONTRACT_CATEGORIES.RISCOS,
  CONTRACT_CATEGORIES.LGPD,
  CONTRACT_CATEGORIES.USO_IMAGEM,
  CONTRACT_CATEGORIES.MENOR_IDADE,
  CONTRACT_CATEGORIES.GARANTIA,
  CONTRACT_CATEGORIES.DESISTENCIA,
  CONTRACT_CATEGORIES.POS_OPERATORIO,
];

export default function ContractsTermosPage() {
  const termGroups = useMemo(() => {
    ensureContractsModuleSeeded();
    return TERM_CATEGORIES.map((cat) => ({
      category: cat,
      label: CONTRACT_CATEGORY_LABELS[cat],
      templates: listTemplatesByCategory(cat),
    })).filter((g) => g.templates.length > 0);
  }, []);

  return (
    <div className="ctr-page space-y-6">
      {termGroups.map((group) => (
        <section key={group.category} className="ctr-section">
          <h2 className="ctr-section-title">{group.label}</h2>
          {group.templates.map((t) => (
            <div key={t.id} className="ctr-term-card">
              <h3 className="ctr-term-title">{t.name}</h3>
              <ContractDocumentPreview html={t.content} className="ctr-term-preview" />
            </div>
          ))}
        </section>
      ))}
      {termGroups.length === 0 && (
        <p className="ctr-empty">Nenhum termo cadastrado. Os modelos padrão serão criados automaticamente.</p>
      )}
    </div>
  );
}
