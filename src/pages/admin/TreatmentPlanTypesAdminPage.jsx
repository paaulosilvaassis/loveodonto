import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import {
  getTreatmentPlanTypesDetailed,
  saveTreatmentPlanTypes,
  DEFAULT_TREATMENT_PLAN_TYPES,
} from '../../services/treatmentPlanCatalogService.js';
import { createId } from '../../services/helpers.js';

export default function TreatmentPlanTypesAdminPage() {
  const { user } = useAuth();
  const [types, setTypes] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTypes(getTreatmentPlanTypesDetailed());
  }, []);

  const handleAdd = () => {
    setTypes((prev) => [...prev, { id: createId('plan-type'), label: '', active: true }]);
    setSaved(false);
  };

  const handleRemove = (id) => {
    setTypes((prev) => prev.filter((item) => item.id !== id));
    setSaved(false);
  };

  const handleChange = (id, label) => {
    setTypes((prev) => prev.map((item) => (item.id === id ? { ...item, label } : item)));
    setSaved(false);
  };

  const handleReset = () => {
    setTypes(
      DEFAULT_TREATMENT_PLAN_TYPES.map((label) => ({
        id: createId('plan-type'),
        label,
        active: true,
      }))
    );
    setSaved(false);
  };

  const handleSave = () => {
    saveTreatmentPlanTypes(user, types);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>Tipos de tratamento</h1>
          <p className="muted">
            Categorias exibidas na etapa de Orçamento do atendimento clínico.
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="button secondary" onClick={handleReset}>
            Restaurar padrão
          </button>
          <button type="button" className="button primary" onClick={handleSave}>
            Salvar
          </button>
        </div>
      </header>

      {saved ? (
        <div className="toast success" role="status">Tipos de tratamento salvos.</div>
      ) : null}

      <div className="card" style={{ padding: '1rem' }}>
        <div className="treatment-plan-types-list">
          {types.map((item) => (
            <div key={item.id} className="treatment-plan-type-row">
              <input
                type="text"
                value={item.label}
                onChange={(e) => handleChange(item.id, e.target.value)}
                placeholder="Nome do tipo de tratamento"
              />
              <button
                type="button"
                className="button ghost"
                onClick={() => handleRemove(item.id)}
                aria-label="Remover"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="button secondary" onClick={handleAdd} style={{ marginTop: '0.75rem' }}>
          <Plus size={16} />
          Adicionar tipo
        </button>
      </div>
    </div>
  );
}
