import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Button from '../../../components/Button.jsx';
import {
  STAGE_TYPE,
  STAGE_TYPE_LABELS,
  savePipelineStagesForTenant,
} from '../../../services/crmPipelineStageService.js';

let draftSeq = 0;
const nextDraftId = () => {
  draftSeq += 1;
  return `draft-${draftSeq}`;
};

const toDraft = (stage) => ({
  draftId: stage.id,
  id: stage.id,
  label: stage.label,
  color: stage.color || '#94a3b8',
  isActive: stage.isActive !== false,
  stageType: stage.stageType || STAGE_TYPE.NORMAL,
});

const newDraftStage = () => ({
  draftId: nextDraftId(),
  id: null,
  label: '',
  color: '#60a5fa',
  isActive: true,
  stageType: STAGE_TYPE.NORMAL,
});

/**
 * Editor inline das fases do pipeline (reutilizado em Configurações e no modal do Pipeline).
 */
export function PipelineStagesEditor({ user, stages, leadCounts = {}, onSaved, showCancel, onCancel }) {
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(stages.map(toDraft));
    setError('');
  }, [stages]);

  const stageKeyById = new Map(stages.map((s) => [s.id, s.key]));
  const countFor = (draft) => (draft.id ? leadCounts[stageKeyById.get(draft.id)] || 0 : 0);

  const updateDraft = (draftId, patch) => {
    setError('');
    setDrafts((prev) => prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d)));
  };

  const handleToggleActive = (draft) => {
    if (draft.isActive && countFor(draft) > 0) {
      const ok = window.confirm(
        `A fase “${draft.label}” possui ${countFor(draft)} lead(s). ` +
        'Ao desativá-la, esses leads ficarão ocultos no quadro até a fase ser reativada. Continuar?'
      );
      if (!ok) return;
    }
    updateDraft(draft.draftId, { isActive: !draft.isActive });
  };

  const handleMove = (index, direction) => {
    setDrafts((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleDelete = (draft) => {
    if (countFor(draft) > 0) {
      setError(`A fase “${draft.label}” possui leads e não pode ser excluída.`);
      return;
    }
    setError('');
    setDrafts((prev) => prev.filter((d) => d.draftId !== draft.draftId));
  };

  const handleSave = () => {
    setSaving(true);
    setError('');
    try {
      savePipelineStagesForTenant(
        user,
        drafts.map((d) => ({
          id: d.id,
          label: d.label,
          color: d.color,
          isActive: d.isActive,
          stageType: d.stageType,
        }))
      );
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar as fases.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-settings-panel-body">
      {error && <div className="crm-stages-config-error" role="alert">{error}</div>}
      <div className="crm-stages-config-list">
        {drafts.map((draft, index) => (
          <div key={draft.draftId} className={`crm-stages-config-row ${draft.isActive ? '' : 'is-inactive'}`.trim()}>
            <div className="crm-stages-config-order">
              <button type="button" aria-label="Mover fase para cima" disabled={index === 0} onClick={() => handleMove(index, -1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" aria-label="Mover fase para baixo" disabled={index === drafts.length - 1} onClick={() => handleMove(index, 1)}>
                <ArrowDown size={14} />
              </button>
            </div>
            <input
              type="color"
              className="crm-stages-config-color"
              value={draft.color}
              aria-label={`Cor da fase ${draft.label || index + 1}`}
              onChange={(e) => updateDraft(draft.draftId, { color: e.target.value })}
            />
            <input
              type="text"
              className="crm-stages-config-name"
              value={draft.label}
              placeholder="Nome da fase"
              onChange={(e) => updateDraft(draft.draftId, { label: e.target.value })}
            />
            <select
              className="crm-stages-config-type"
              value={draft.stageType}
              onChange={(e) => updateDraft(draft.draftId, { stageType: e.target.value })}
            >
              {Object.values(STAGE_TYPE).map((type) => (
                <option key={type} value={type}>{STAGE_TYPE_LABELS[type]}</option>
              ))}
            </select>
            <span className="crm-stages-config-count">{countFor(draft)} lead(s)</span>
            <label className="crm-stages-config-active">
              <input type="checkbox" checked={draft.isActive} onChange={() => handleToggleActive(draft)} />
              Ativa
            </label>
            <button
              type="button"
              className="crm-stages-config-delete"
              disabled={countFor(draft) > 0}
              onClick={() => handleDelete(draft)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="crm-settings-panel-actions">
        <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={() => setDrafts((p) => [...p, newDraftStage()])}>
          Adicionar fase
        </Button>
        <div className="crm-settings-panel-actions-end">
          {showCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
          )}
          <Button type="button" variant="primary" loading={saving} onClick={handleSave}>Salvar pipeline</Button>
        </div>
      </div>
    </div>
  );
}
