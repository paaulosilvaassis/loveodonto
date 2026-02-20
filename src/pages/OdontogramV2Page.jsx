import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Section } from '../components/Section.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import OdontogramV2Canvas from '../components/odontogram-v2/OdontogramV2Canvas.jsx';
import ToothEditorDrawer from '../components/odontogram-v2/ToothEditorDrawer.jsx';
import { FACE_LABELS, FACES, STATUS_OPTIONS } from '../components/odontogram-v2/odontogramV2Constants.js';
import { OdontogramV2Provider, useOdontogramV2 } from '../components/odontogram-v2/odontogramV2Store.jsx';
import { getPatient } from '../services/patientService.js';
import { getOdontogramV2, updateOdontogramV2 } from '../services/patientOdontogramV2Service.js';
import { useAuth } from '../auth/AuthContext.jsx';

const downloadJson = (data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `odontograma-v2-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const CACHE_PREFIX = 'odontogram-v2:';

const getAgeInYears = (birthDate) => {
  if (!birthDate) return null;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return age;
};

const getDentalStage = (birthDate) => {
  const age = getAgeInYears(birthDate);
  if (age === null) return 'adulto';
  if (age <= 5) return 'infantil';
  if (age <= 12) return 'mista';
  return 'adulto';
};

const OdontogramV2Content = ({ patient }) => {
  const { user } = useAuth();
  const { state, dispatch } = useOdontogramV2();
  const [status, setStatus] = useState({ error: '', success: '' });
  const importRef = useRef(null);
  const stage = useMemo(() => getDentalStage(patient?.profile?.birth_date), [patient]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!patient?.profile?.id) return;
    try {
      const record = getOdontogramV2(patient.profile.id);
      if (record?.teeth && Object.keys(record.teeth || {}).length > 0) {
        if (Array.isArray(record.teeth)) {
          dispatch({ type: 'IMPORT_JSON', payload: record.teeth });
        } else {
          dispatch({ type: 'LOAD_STATE', payload: { teeth: record.teeth, history: record.history || [] } });
        }
      } else {
        const cached = localStorage.getItem(`${CACHE_PREFIX}${patient.profile.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.teeth) {
            if (Array.isArray(parsed.teeth)) {
              dispatch({ type: 'IMPORT_JSON', payload: parsed.teeth });
            } else {
              dispatch({ type: 'LOAD_STATE', payload: { teeth: parsed.teeth, history: parsed.history || [] } });
            }
          }
        }
      }
    } catch (error) {
      setStatus({ error: error?.message || 'Falha ao carregar odontograma.', success: '' });
    } finally {
      setLoaded(true);
    }
  }, [dispatch, patient]);

  useEffect(() => {
    if (!loaded || !patient?.profile?.id) return;
    const handler = setTimeout(() => {
      updateOdontogramV2(patient.profile.id, { teeth: state.teeth, history: state.history }, user?.id);
      localStorage.setItem(
        `${CACHE_PREFIX}${patient.profile.id}`,
        JSON.stringify({ teeth: state.teeth, history: state.history })
      );
    }, 200);
    return () => clearTimeout(handler);
  }, [loaded, patient, state.history, state.teeth, user?.id]);

  const handleExport = () => {
    downloadJson({ teeth: state.teeth, history: state.history });
    setStatus({ error: '', success: 'JSON exportado com sucesso.' });
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result || '{}');
        if (Array.isArray(parsed)) {
          dispatch({ type: 'IMPORT_JSON', payload: parsed });
        } else if (parsed?.teeth) {
          dispatch({
            type: 'LOAD_STATE',
            payload: { teeth: parsed.teeth, history: parsed.history || [] },
          });
        } else {
          throw new Error('JSON inválido.');
        }
        setStatus({ error: '', success: 'JSON importado com sucesso.' });
      } catch (error) {
        setStatus({ error: error?.message || 'Falha ao importar JSON.', success: '' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <Section title={`Odontograma V2 — ${patient?.profile?.full_name || 'Paciente'}`}>
      <SectionCard>
        <div className="odontogram-v2-toolbar">
          <div className="odontogram-v2-action-group">
            <span className="muted">Ação ativa:</span>
            {STATUS_OPTIONS.map((statusOption) => (
              <button
                key={statusOption.value}
                type="button"
                className={`odontogram-v2-action ${state.activeStatus === statusOption.value ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE_STATUS', payload: statusOption.value })}
              >
                <span className="odontogram-v2-status-dot" style={{ background: statusOption.color }} />
                {statusOption.label}
              </button>
            ))}
          </div>
          <div className="odontogram-v2-action-group">
            <button type="button" className="button secondary" onClick={handleExport}>
              Exportar JSON
            </button>
            <label className="button secondary">
              Importar JSON
              <input
                ref={importRef}
                type="file"
                hidden
                accept="application/json"
                onChange={handleImport}
              />
            </label>
          </div>
        </div>
        {status.error ? <div className="alert error">{status.error}</div> : null}
        {status.success ? <div className="alert success">{status.success}</div> : null}
        <div className="odontogram-v2-layout">
          <OdontogramV2Canvas stage={stage} />
          <ToothEditorDrawer />
        </div>
        <div className="odontogram-v2-history">
          <strong>Histórico em tempo real</strong>
          {state.history.length === 0 ? <div className="muted">Nenhuma ação registrada.</div> : null}
          {state.history.map((entry) => (
            <div key={entry.id} className="odontogram-v2-history-item">
              <div>
                Dente {entry.tooth} — {entry.statusLabel || entry.status}
                {entry.surfaces?.length ? ` — Face(s): ${entry.surfaces.join(', ')}` : ''}
              </div>
              <div className="muted">{new Date(entry.at).toLocaleString('pt-BR')}</div>
            </div>
          ))}
        </div>
        <div className="odontogram-v2-legend">
          <div>
            <strong>Siglas das faces</strong>
            <div className="odontogram-v2-legend-grid">
              {FACES.map((face) => (
                <div key={face} className="odontogram-v2-legend-item">
                  <span className="odontogram-v2-face-chip">{face}</span>
                  <span>{FACE_LABELS[face]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <strong>Cores das ações</strong>
            <div className="odontogram-v2-legend-grid">
              {STATUS_OPTIONS.map((statusOption) => (
                <div key={statusOption.value} className="odontogram-v2-legend-item">
                  <span className="odontogram-v2-status-dot" style={{ background: statusOption.color }} />
                  <span>{statusOption.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </Section>
  );
};

export default function OdontogramV2Page() {
  const { patientId } = useParams();
  const patient = useMemo(() => getPatient(patientId), [patientId]);

  if (!patient) {
    return (
      <div className="stack">
        <Section title="Odontograma V2">
          <SectionCard>
            <div className="alert warning">Paciente não encontrado.</div>
          </SectionCard>
        </Section>
      </div>
    );
  }

  return (
    <div className="stack odontogram-v2-page">
      <OdontogramV2Provider>
        <OdontogramV2Content patient={patient} />
      </OdontogramV2Provider>
    </div>
  );
}
