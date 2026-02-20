import { FACE_LABELS, FACES, STATUS_OPTIONS } from './odontogramV2Constants.js';
import { useOdontogramV2 } from './odontogramV2Store.jsx';

export default function ToothEditorDrawer() {
  const { state, dispatch } = useOdontogramV2();
  const selectedId = state.selectedToothId;
  const draft = state.draft;
  const isMissing = ['AUSENTE', 'EXTRACAO'].includes(draft.status);

  if (!state.drawerOpen) {
    return (
      <aside className="odontogram-v2-drawer">
        <div className="muted">Selecione um dente para editar.</div>
      </aside>
    );
  }

  return (
    <aside className="odontogram-v2-drawer">
      <div className="odontogram-v2-drawer-header">
        <div>
          <strong>Dente {selectedId}</strong>
          <div className="muted">Editar faces e ação clínica.</div>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => dispatch({ type: 'SET_DRAWER_OPEN', payload: false })}
        >
          Fechar
        </button>
      </div>

      <div className="odontogram-v2-drawer-section">
        <div className="odontogram-v2-drawer-label">Ação clínica</div>
        <div className="odontogram-v2-status-grid">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status.value}
              type="button"
              className={`odontogram-v2-status ${draft.status === status.value ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'SET_DRAFT_STATUS', payload: status.value })}
            >
              <span className="odontogram-v2-status-dot" style={{ background: status.color }} />
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <div className="odontogram-v2-drawer-section">
        <div className="odontogram-v2-drawer-label">Faces</div>
        <div className="odontogram-v2-face-grid">
          {FACES.map((face) => (
            <label key={face} className="odontogram-v2-face-option">
              <input
                type="checkbox"
                checked={Boolean(draft.surfaces[face])}
                onChange={() => dispatch({ type: 'TOGGLE_DRAFT_SURFACE', payload: face })}
                disabled={isMissing}
              />
              <span>{face}</span>
              <small className="muted">{FACE_LABELS[face]}</small>
            </label>
          ))}
        </div>
        <div className="odontogram-v2-drawer-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => dispatch({ type: 'SET_DRAFT_ALL_SURFACES', payload: true })}
            disabled={isMissing}
          >
            Marcar dente todo
          </button>
          <button type="button" className="button secondary" onClick={() => dispatch({ type: 'SET_DRAFT_ALL_SURFACES', payload: false })}>
            Limpar faces
          </button>
        </div>
      </div>

      <div className="odontogram-v2-drawer-section">
        <div className="odontogram-v2-drawer-label">Simbologia</div>
        <button
          type="button"
          className={`odontogram-v2-toggle ${draft.implant ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_DRAFT_IMPLANT' })}
          disabled={isMissing}
        >
          Implante
        </button>
        {isMissing ? <div className="muted">Dente ausente bloqueia faces e implante.</div> : null}
      </div>

      <label className="odontogram-v2-notes">
        Observações (opcional)
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(event) => dispatch({ type: 'SET_DRAFT_NOTES', payload: event.target.value })}
        />
      </label>

      <div className="odontogram-v2-drawer-actions">
        <button type="button" className="button primary" onClick={() => dispatch({ type: 'APPLY_DRAFT' })}>
          Aplicar
        </button>
        <button type="button" className="button secondary" onClick={() => dispatch({ type: 'RESET_DRAFT' })}>
          Cancelar
        </button>
      </div>
    </aside>
  );
}
