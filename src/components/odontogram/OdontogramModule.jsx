import { useMemo, useState } from 'react';
import odontogramBase from '../../assets/odontogram-base.svg';
import { BASIC_CONDITIONS, FDI_LOWER, FDI_UPPER } from './odontogramConstants.js';
import OdontogramActionButtons from './OdontogramActionButtons.jsx';
import { listOdontogramHistory } from '../../services/patientOdontogramService.js';

const VIEWBOX = { width: 1024.5, height: 576 };

const buildToothPositions = () => {
  const startX = 120;
  const endX = 904;
  const gap = (endX - startX) / 15;
  const xPositions = Array.from({ length: 16 }, (_, index) => startX + index * gap);
  const upper = FDI_UPPER.map((fdi, index) => ({ fdi, x: xPositions[index], y: 180 }));
  const lower = FDI_LOWER.map((fdi, index) => ({ fdi, x: xPositions[index], y: 400 }));
  return [...upper, ...lower];
};

const FACE_OFFSETS = {
  M: { dx: -16, dy: 0 },
  D: { dx: 16, dy: 0 },
  V: { dx: 0, dy: -16 },
  L: { dx: 0, dy: 16 },
  O: { dx: 0, dy: 0 },
};

const requiresFaces = (actionKey) => {
  const action = BASIC_CONDITIONS.find((item) => item.key === actionKey);
  return action?.requiresFaces;
};

const resolveActionLabel = (actionKey) => {
  const action = BASIC_CONDITIONS.find((item) => item.key === actionKey);
  return action?.label || actionKey || 'Atualização';
};

export default function OdontogramModule({ patientId, value, onChange, readOnly }) {
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [selectedFaces, setSelectedFaces] = useState([]);

  const positions = useMemo(() => buildToothPositions(), []);
  const history = useMemo(() => listOdontogramHistory(patientId).slice(0, 6), [patientId, value]);

  const toothStatus = value?.tooth_status || {};

  const applyAction = (faceCode) => {
    if (readOnly) return;
    if (!selectedTooth || !selectedAction) return;
    const faces = requiresFaces(selectedAction) ? (faceCode ? [faceCode] : selectedFaces) : [];
    const next = {
      ...toothStatus,
      [selectedTooth]: {
        condition: selectedAction,
        faces,
      },
    };
    onChange?.({
      ...value,
      tooth_status: next,
      lastChange: {
        tooth: selectedTooth,
        condition: selectedAction,
        faces,
      },
    });
    setSelectedFaces([]);
  };

  return (
    <div className="odontogram-panel">
      <div className="odontogram-wrapper">
        <svg
          className="odontogram-canvas"
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          role="img"
          aria-label="Odontograma"
        >
          <image href={odontogramBase} width={VIEWBOX.width} height={VIEWBOX.height} />
          <g className="odontogram-hitbox-layer">
            {positions.map((item) => {
              const isSelected = selectedTooth === item.fdi;
              const hasMark = Boolean(toothStatus[item.fdi]);
              return (
                <g key={item.fdi}>
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r={18}
                    className={`odontogram-hitbox ${isSelected ? 'odontogram-tooth-selected' : ''}`}
                    fill="transparent"
                    onClick={() => {
                      if (readOnly) return;
                      setSelectedTooth(item.fdi);
                      setSelectedAction(null);
                      setSelectedFaces([]);
                    }}
                  />
                  {hasMark ? (
                    <circle
                      cx={item.x}
                      cy={item.y}
                      r={14}
                      className={`odontogram-face-overlay ${toothStatus[item.fdi]?.condition || ''}`}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
          {selectedTooth && selectedAction && requiresFaces(selectedAction) ? (
            <g className="odontogram-face-layer">
              {Object.entries(FACE_OFFSETS).map(([code, offset]) => (
                <circle
                  key={`${selectedTooth}-${code}`}
                  cx={(positions.find((pos) => pos.fdi === selectedTooth)?.x || 0) + offset.dx}
                  cy={(positions.find((pos) => pos.fdi === selectedTooth)?.y || 0) + offset.dy}
                  r={8}
                  className={`odontogram-face-hitbox ${selectedFaces.includes(code) ? 'active' : ''}`}
                  onClick={() => {
                    if (readOnly) return;
                    const next = selectedFaces.includes(code)
                      ? selectedFaces.filter((face) => face !== code)
                      : [...selectedFaces, code];
                    setSelectedFaces(next);
                    if (next.length === 1) applyAction(code);
                  }}
                />
              ))}
            </g>
          ) : null}
        </svg>
      </div>
      <div className="odontogram-sidebar">
        <div className="muted">Dente selecionado: {selectedTooth || 'Nenhum'}</div>
        <OdontogramActionButtons
          actions={BASIC_CONDITIONS}
          selectedAction={selectedAction}
          onSelect={(action) => {
            if (!selectedTooth || readOnly) return;
            setSelectedAction(action);
            setSelectedFaces([]);
            if (!requiresFaces(action)) {
              applyAction();
            }
          }}
          disabled={!selectedTooth || readOnly}
        />
        <div className="odontogram-history">
          <strong>Histórico recente</strong>
          {history.length === 0 ? <div className="muted">Sem registros.</div> : null}
          {history.map((entry) => (
            <div key={entry.id} className="muted">
              Dente {entry.tooth || '—'} — {entry.note || resolveActionLabel(entry.action)}.
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
