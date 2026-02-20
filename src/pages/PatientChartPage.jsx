import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Section } from '../components/Section.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { SectionHeaderActions } from '../components/SectionHeaderActions.jsx';
import OdontogramModule from '../components/odontogram/OdontogramModule.jsx';
import { BASIC_CONDITIONS } from '../components/odontogram/odontogramConstants.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { roles } from '../permissions/permissions.js';
import { getPatient } from '../services/patientService.js';
import { getPatientChart, touchPatientChart } from '../services/patientChartService.js';
import { getCharacteristics, updateCharacteristics } from '../services/patientCharacteristicsService.js';
import {
  getAtmAnamnesis,
  getClinicalAnamnesis,
  updateAtmAnamnesis,
  updateClinicalAnamnesis,
} from '../services/patientAnamnesisService.js';
import { getOdontogram, updateOdontogram } from '../services/patientOdontogramService.js';
import { addFile, listFiles } from '../services/patientFilesService.js';
import { addAlbumPhoto, createAlbum, listAlbumPhotos, listAlbums } from '../services/patientAlbumService.js';
import { logAccess } from '../services/accessAuditService.js';
import { validateFileMeta } from '../utils/validators.js';

const TAB_CONFIG = [
  { value: 'characteristics', label: 'Características' },
  { value: 'anamnesisClinical', label: 'Anamnese Clínica' },
  { value: 'anamnesisAtm', label: 'Anamnese ATM' },
  { value: 'odontogram', label: 'Situação Bucal Atual' },
  { value: 'files', label: 'Arquivos e Documentos' },
  { value: 'confidential', label: 'Documentos Confidenciais' },
  { value: 'albums', label: 'Álbuns de Fotografias' },
];

const CLINICAL_QUESTIONS = [
  { code: 'vicios', label: 'Vícios' },
  { code: 'medicamentos', label: 'Uso de Medicamentos' },
  { code: 'cicatrizacao', label: 'Cicatrização' },
  { code: 'anestesia', label: 'Reação a Anestesia' },
  { code: 'antibiotico', label: 'Reação a Antibiótico' },
  { code: 'alergias', label: 'Alergias' },
  { code: 'reacao_medicamentos', label: 'Reação a Medicamentos' },
  { code: 'diabetes', label: 'Diabetes' },
  { code: 'hepatite', label: 'Hepatite' },
  { code: 'doenca_familiar', label: 'Doença Familiar' },
  { code: 'doencas_infecciosas', label: 'Doenças Infecciosas' },
  { code: 'asma_bronquite', label: 'Asma ou Bronquite' },
  { code: 'pressao_alta', label: 'Pressão Alta' },
  { code: 'cardiopatia', label: 'Cardiopatia' },
  { code: 'deficiencia_imune', label: 'Deficiência Imunológica' },
  { code: 'hemorragia', label: 'Hemorragia' },
  { code: 'ulcera', label: 'Úlcera' },
  { code: 'epilepsia', label: 'Epilepsia' },
  { code: 'tumor_neoplasia', label: 'Tumor-Neoplasia' },
  { code: 'febre_reumatica', label: 'Febre Reumática' },
  { code: 'sinusite', label: 'Sinusite' },
  { code: 'anemia', label: 'Anemia' },
  { code: 'herpes', label: 'Herpes' },
  { code: 'enxaqueca', label: 'Enxaqueca (com frequência/mês)' },
  { code: 'glaucoma', label: 'Glaucoma' },
];

const ATM_QUESTIONS = [
  { code: 'bruxismo', label: 'Bruxismo' },
  { code: 'dor_muscular', label: 'Dor Muscular' },
  { code: 'dor_atms', label: 'Dor ATMS' },
  { code: 'barulho_atms', label: 'Barulho nas ATMS' },
  { code: 'deslizes_rc_mih', label: 'Deslizes de RC para MIH' },
  { code: 'desvio_abertura', label: 'Desvio Durante a Abertura' },
];

const DEFAULT_ANSWER = { answer: 'nao_respondido', details: '' };
const FILE_CATEGORIES = ['Exame', 'Receita', 'Plano de tratamento', 'Orçamento', 'Outros'];
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const FILE_ACCEPT = `${ALLOWED_FILE_TYPES.join(',')},.pdf,.png,.jpg,.jpeg,.doc,.docx`;
const ALBUM_PRESETS = ['Pré-operatório', 'Pós-operatório', 'Evolução', 'Outros'];

const snapshot = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value || {}));
};

const deviceInfo = () => ({
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
});

const ensureAnswers = (questions, stored = []) =>
  questions.map((question) => {
    const match = stored.find((item) => item.code === question.code);
    return {
      code: question.code,
      label: question.label,
      answer: match?.answer || DEFAULT_ANSWER.answer,
      details: match?.details || DEFAULT_ANSWER.details,
    };
  });

const canViewChart = (role) =>
  [roles.admin, roles.gerente, roles.profissional, roles.recepcao].includes(role);

const canEditChart = (role) =>
  [roles.admin, roles.gerente, roles.profissional].includes(role);

const canViewConfidential = (role) =>
  [roles.admin, roles.profissional].includes(role);

const canEditFiles = (role) =>
  [roles.admin, roles.gerente, roles.profissional].includes(role);

export default function PatientChartPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [activeTab, setActiveTab] = useState('characteristics');
  const [editingTab, setEditingTab] = useState(null);
  const [characteristics, setCharacteristics] = useState(null);
  const [clinicalAnswers, setClinicalAnswers] = useState([]);
  const [atmAnswers, setAtmAnswers] = useState([]);
  const [odontogram, setOdontogram] = useState(null);
  const [files, setFiles] = useState([]);
  const [confidentialFiles, setConfidentialFiles] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [albumPhotos, setAlbumPhotos] = useState({});
  const [albumForms, setAlbumForms] = useState({});
  const [fileForm, setFileForm] = useState({ category: 'Outros', validity: '' });
  const [confidentialForm, setConfidentialForm] = useState({ category: 'Outros', validity: '' });
  const [confidentialConfirmed, setConfidentialConfirmed] = useState(false);
  const [odontogramNote, setOdontogramNote] = useState('');
  const [status, setStatus] = useState({ error: '', success: '' });
  const [chartViewLogged, setChartViewLogged] = useState(false);

  useEffect(() => {
    setPatient(getPatient(patientId));
  }, [patientId]);

  useEffect(() => {
    if (!patientId || !user) return;
    if (!canViewChart(user.role)) return;
    getPatientChart(patientId);
    setCharacteristics(getCharacteristics(patientId));
    setClinicalAnswers(ensureAnswers(CLINICAL_QUESTIONS, getClinicalAnamnesis(patientId).answers));
    setAtmAnswers(ensureAnswers(ATM_QUESTIONS, getAtmAnamnesis(patientId).answers));
    setOdontogram(getOdontogram(patientId));
    setFiles(listFiles(patientId, { confidential: false }));
    setConfidentialFiles(listFiles(patientId, { confidential: true }));
    const existingAlbums = listAlbums(patientId);
    setAlbums(existingAlbums);
    const photos = existingAlbums.reduce((acc, album) => {
      acc[album.id] = listAlbumPhotos(album.id);
      return acc;
    }, {});
    setAlbumPhotos(photos);
  }, [patientId, user]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'confidential' && canViewConfidential(user.role) && confidentialConfirmed) {
      logAccess({
        entityType: 'CONFIDENTIAL_DOC',
        entityId: patientId,
        action: 'VIEW',
        userId: user.id,
        metadata: { tab: 'confidential', confirmed: true },
        deviceInfo: deviceInfo(),
      });
    }
  }, [activeTab, confidentialConfirmed, patientId, user]);

  useEffect(() => {
    if (!patientId || !user || chartViewLogged) return;
    if (!canViewChart(user.role)) return;
    logAccess({
      entityType: 'CHART',
      entityId: patientId,
      action: 'VIEW',
      userId: user.id,
      metadata: { tab: activeTab },
      deviceInfo: deviceInfo(),
    });
    setChartViewLogged(true);
  }, [activeTab, chartViewLogged, patientId, user]);

  useEffect(() => {
    setChartViewLogged(false);
  }, [patientId]);

  useEffect(() => {
    if (activeTab !== 'confidential') {
      setConfidentialConfirmed(false);
    }
  }, [activeTab]);

  const tabTitle = useMemo(() => {
    const current = TAB_CONFIG.find((tab) => tab.value === activeTab);
    return current?.label || 'Prontuário';
  }, [activeTab]);

  const startEdit = () => {
    if (!user || !canEditChart(user.role)) return;
    setStatus({ error: '', success: '' });
    setEditingTab(activeTab);
    if (activeTab === 'odontogram') {
      setOdontogramNote('');
    }
  };

  const cancelEdit = () => {
    setEditingTab(null);
    setStatus({ error: '', success: '' });
    if (patientId) {
      setCharacteristics(getCharacteristics(patientId));
      setClinicalAnswers(ensureAnswers(CLINICAL_QUESTIONS, getClinicalAnamnesis(patientId).answers));
      setAtmAnswers(ensureAnswers(ATM_QUESTIONS, getAtmAnamnesis(patientId).answers));
      setOdontogram(getOdontogram(patientId));
      setOdontogramNote('');
    }
  };

  const saveEdit = () => {
    if (!patientId) return;
    setStatus({ error: '', success: '' });
    try {
      if (editingTab === 'characteristics') {
        const before = snapshot(getCharacteristics(patientId));
        const after = updateCharacteristics(patientId, characteristics);
        logAccess({
          entityType: 'CHARACTERISTICS',
          entityId: patientId,
          action: 'UPDATE',
          userId: user?.id,
          metadata: { before, after },
          deviceInfo: deviceInfo(),
        });
      }
      if (editingTab === 'anamnesisClinical') {
        const before = snapshot(getClinicalAnamnesis(patientId).answers);
        const after = updateClinicalAnamnesis(patientId, clinicalAnswers).answers;
        logAccess({
          entityType: 'ANAMNESIS_CLINICAL',
          entityId: patientId,
          action: 'UPDATE',
          userId: user?.id,
          metadata: { before, after },
          deviceInfo: deviceInfo(),
        });
      }
      if (editingTab === 'anamnesisAtm') {
        const before = snapshot(getAtmAnamnesis(patientId).answers);
        const after = updateAtmAnamnesis(patientId, atmAnswers).answers;
        logAccess({
          entityType: 'ANAMNESIS_ATM',
          entityId: patientId,
          action: 'UPDATE',
          userId: user?.id,
          metadata: { before, after },
          deviceInfo: deviceInfo(),
        });
      }
      if (editingTab === 'odontogram') {
        const before = snapshot(getOdontogram(patientId).tooth_status || {});
        const lastChange = odontogram?.lastChange || {};
        const nextStatus = odontogram?.tooth_status || {};
        updateOdontogram(
          patientId,
          {
            tooth_status: nextStatus,
            tooth: lastChange.tooth || '',
            action: lastChange.condition || '',
            note: odontogramNote,
            previous_value: before,
            new_value: nextStatus,
          },
          user?.id,
        );
        logAccess({
          entityType: 'ODONTOGRAM',
          entityId: patientId,
          action: 'UPDATE',
          userId: user?.id,
          metadata: { before, after: nextStatus, note: odontogramNote },
          deviceInfo: deviceInfo(),
        });
        setOdontogramNote('');
        setOdontogram(getOdontogram(patientId));
      }
      touchPatientChart(patientId);
      setEditingTab(null);
      setStatus({ error: '', success: 'Seção atualizada com sucesso.' });
    } catch (error) {
      setStatus({ error: error?.message || 'Não foi possível salvar.', success: '' });
    }
  };

  if (!patient) {
    return (
      <div className="stack">
        <Section title="Prontuário do Paciente">
          <SectionCard>
            <div className="alert warning">Paciente não encontrado.</div>
          </SectionCard>
        </Section>
      </div>
    );
  }

  return (
    <div className="stack">
      <Section title={`Prontuário — ${patient.profile?.full_name || 'Paciente'}`}>
        <div className="prontuario-header">
          <Tabs tabs={TAB_CONFIG} active={activeTab} onChange={setActiveTab} />
          <button
            type="button"
            className="button secondary"
            onClick={() => navigate(`/prontuario/${patientId}/odontograma-v2`)}
          >
            Odontograma V2 (Beta)
          </button>
        </div>
        {!canViewChart(user?.role) ? (
          <SectionCard>
            <div className="alert warning">Acesso restrito ao prontuário clínico.</div>
          </SectionCard>
        ) : (
          <SectionCard>
            <SectionHeaderActions
              title={tabTitle}
              isEditing={editingTab === activeTab}
              onEdit={startEdit}
              onCancel={cancelEdit}
              onSave={saveEdit}
            />
            {status.error ? <div className="alert error">{status.error}</div> : null}
            {status.success ? <div className="alert success">{status.success}</div> : null}

            {activeTab === 'characteristics' ? (
              <div className="patient-form-grid">
                <label>
                  Tipo Sanguíneo
                  <input
                    value={characteristics?.blood_type || ''}
                    onChange={(event) => setCharacteristics((prev) => ({ ...prev, blood_type: event.target.value }))}
                    disabled={editingTab !== activeTab}
                  />
                </label>
                <label>
                  Cor Natural da Pele
                  <input
                    value={characteristics?.skin_color || ''}
                    onChange={(event) => setCharacteristics((prev) => ({ ...prev, skin_color: event.target.value }))}
                    disabled={editingTab !== activeTab}
                  />
                </label>
                <label>
                  Cor Natural do Cabelo
                  <input
                    value={characteristics?.hair_color || ''}
                    onChange={(event) => setCharacteristics((prev) => ({ ...prev, hair_color: event.target.value }))}
                    disabled={editingTab !== activeTab}
                  />
                </label>
                <label>
                  Cor dos Olhos
                  <input
                    value={characteristics?.eye_color || ''}
                    onChange={(event) => setCharacteristics((prev) => ({ ...prev, eye_color: event.target.value }))}
                    disabled={editingTab !== activeTab}
                  />
                </label>
                <label>
                  Formato do Rosto
                  <input
                    value={characteristics?.face_shape || ''}
                    onChange={(event) => setCharacteristics((prev) => ({ ...prev, face_shape: event.target.value }))}
                    disabled={editingTab !== activeTab}
                  />
                </label>
              </div>
            ) : null}

            {activeTab === 'anamnesisClinical' ? (
              <div className="anamnesis-grid">
                {clinicalAnswers.map((item, index) => (
                  <div key={item.code} className="anamnesis-item">
                    <div className="anamnesis-question">{index + 1}. {item.label}</div>
                    <select
                      value={item.answer}
                      onChange={(event) => {
                        const next = [...clinicalAnswers];
                        next[index] = { ...next[index], answer: event.target.value };
                        setClinicalAnswers(next);
                      }}
                      disabled={editingTab !== activeTab}
                    >
                      <option value="nao_respondido">Não respondido</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                    <input
                      placeholder="Descrição/detalhes"
                      value={item.details}
                      onChange={(event) => {
                        const next = [...clinicalAnswers];
                        next[index] = { ...next[index], details: event.target.value };
                        setClinicalAnswers(next);
                      }}
                      disabled={editingTab !== activeTab || item.answer !== 'sim'}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === 'anamnesisAtm' ? (
              <div className="anamnesis-grid">
                {atmAnswers.map((item, index) => (
                  <div key={item.code} className="anamnesis-item">
                    <div className="anamnesis-question">{index + 1}. {item.label}</div>
                    <select
                      value={item.answer}
                      onChange={(event) => {
                        const next = [...atmAnswers];
                        next[index] = { ...next[index], answer: event.target.value };
                        setAtmAnswers(next);
                      }}
                      disabled={editingTab !== activeTab}
                    >
                      <option value="nao_respondido">Não respondido</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                    <input
                      placeholder="Descrição/detalhes"
                      value={item.details}
                      onChange={(event) => {
                        const next = [...atmAnswers];
                        next[index] = { ...next[index], details: event.target.value };
                        setAtmAnswers(next);
                      }}
                      disabled={editingTab !== activeTab || item.answer !== 'sim'}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === 'odontogram' ? (
              <div className="odontogram-core">
                <div className="odontogram-core-header">
                  <div className="muted">Selecione o dente e marque a condição.</div>
                  {editingTab === activeTab ? (
                    <button type="button" className="button secondary" onClick={() => {
                      if (!patientId) return;
                      setOdontogram(getOdontogram(patientId));
                      setOdontogramNote('');
                    }}>
                      Desfazer sessão
                    </button>
                  ) : null}
                </div>
                <div className="odontogram-core-layout">
                  <OdontogramModule
                    patientId={patientId}
                    value={odontogram}
                    onChange={(next) => setOdontogram(next)}
                    readOnly={editingTab !== activeTab}
                  />
                  <div className="odontogram-sidebar">
                    <div className="odontogram-legend">
                      <strong>Legenda</strong>
                      <div className="odontogram-legend-grid">
                        {BASIC_CONDITIONS.map((condition) => (
                          <div key={condition.key} className="odontogram-legend-item">
                            <span className={`odontogram-legend-dot ${condition.key}`} />
                            <span>{condition.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <label className="odontogram-note">
                      Observação (opcional)
                      <textarea
                        rows={3}
                        value={odontogramNote}
                        onChange={(event) => setOdontogramNote(event.target.value)}
                        disabled={editingTab !== activeTab}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'files' ? (
              <div className="files-grid">
                <div className="files-actions">
                  <label>
                    Categoria
                    <select
                      value={fileForm.category}
                      onChange={(event) => setFileForm((prev) => ({ ...prev, category: event.target.value }))}
                      disabled={!canEditFiles(user?.role)}
                    >
                      {FILE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Validade (opcional)
                    <input
                      type="date"
                      value={fileForm.validity}
                      onChange={(event) => setFileForm((prev) => ({ ...prev, validity: event.target.value }))}
                      disabled={!canEditFiles(user?.role)}
                    />
                  </label>
                  <label className="button secondary">
                    Upload
                    <input
                      type="file"
                      hidden
                      accept={FILE_ACCEPT}
                      disabled={!canEditFiles(user?.role)}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file || !patientId) return;
                        const validation = validateFileMeta(file, ALLOWED_FILE_TYPES);
                        if (!validation.ok) {
                          setStatus({ error: validation.message, success: '' });
                          return;
                        }
                        const url = URL.createObjectURL(file);
                        const entry = addFile(patientId, {
                          category: fileForm.category,
                          file_name: file.name,
                          mime_type: file.type,
                          file_url: url,
                          validity: fileForm.validity,
                        }, user?.id, { confidential: false });
                        setFiles((prev) => [entry, ...prev]);
                        logAccess({
                          entityType: 'FILE',
                          entityId: patientId,
                          action: 'UPLOAD',
                          userId: user?.id,
                          metadata: { file_name: entry.file_name, category: entry.category, validity: entry.validity },
                          deviceInfo: deviceInfo(),
                        });
                        setStatus({ error: '', success: 'Arquivo enviado com sucesso.' });
                      }}
                    />
                  </label>
                </div>
                <div className="files-list">
                  {files.length === 0 ? <div className="muted">Nenhum arquivo enviado.</div> : null}
                  {files.map((file) => (
                    <div key={file.id} className="file-item">
                      <div>
                        <strong>{file.file_name}</strong>
                        <div className="muted">{file.category}</div>
                        <div className="muted">Enviado em {new Date(file.uploaded_at).toLocaleString('pt-BR')}</div>
                        {file.validity ? <div className="muted">Validade: {file.validity}</div> : null}
                      </div>
                      {file.file_url ? (
                        <a className="button secondary" href={file.file_url} target="_blank" rel="noreferrer">Abrir</a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === 'confidential' ? (
              !canViewConfidential(user?.role) ? (
                <div className="alert warning">Acesso restrito. Apenas Admin e Profissional.</div>
              ) : (
                <div className="files-grid">
                  {!confidentialConfirmed ? (
                    <div className="alert warning">
                      Conteúdo sensível. Confirme para visualizar documentos confidenciais.
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          const confirmed = window.confirm('Você confirma o acesso a documentos confidenciais?');
                          if (!confirmed) return;
                          setConfidentialConfirmed(true);
                        }}
                      >
                        Confirmar acesso
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="files-actions">
                        <label>
                          Categoria
                          <select
                            value={confidentialForm.category}
                            onChange={(event) => setConfidentialForm((prev) => ({ ...prev, category: event.target.value }))}
                            disabled={!canEditFiles(user?.role)}
                          >
                            {FILE_CATEGORIES.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Validade (opcional)
                          <input
                            type="date"
                            value={confidentialForm.validity}
                            onChange={(event) => setConfidentialForm((prev) => ({ ...prev, validity: event.target.value }))}
                            disabled={!canEditFiles(user?.role)}
                          />
                        </label>
                        <label className="button secondary">
                          Upload confidencial
                          <input
                            type="file"
                            hidden
                            accept={FILE_ACCEPT}
                            disabled={!canEditFiles(user?.role)}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file || !patientId) return;
                              const validation = validateFileMeta(file, ALLOWED_FILE_TYPES);
                              if (!validation.ok) {
                                setStatus({ error: validation.message, success: '' });
                                return;
                              }
                              const url = URL.createObjectURL(file);
                              const entry = addFile(patientId, {
                                category: confidentialForm.category,
                                file_name: file.name,
                                mime_type: file.type,
                                file_url: url,
                                validity: confidentialForm.validity,
                              }, user?.id, { confidential: true });
                              setConfidentialFiles((prev) => [entry, ...prev]);
                              logAccess({
                                entityType: 'CONFIDENTIAL_DOC',
                                entityId: patientId,
                                action: 'UPLOAD',
                                userId: user?.id,
                                metadata: { file_name: entry.file_name, category: entry.category, validity: entry.validity },
                                deviceInfo: deviceInfo(),
                              });
                              setStatus({ error: '', success: 'Documento confidencial enviado.' });
                            }}
                          />
                        </label>
                      </div>
                      <div className="files-list">
                        {confidentialFiles.length === 0 ? <div className="muted">Nenhum arquivo confidencial.</div> : null}
                        {confidentialFiles.map((file) => (
                          <div key={file.id} className="file-item">
                            <div>
                              <strong>{file.file_name}</strong>
                              <div className="muted">{file.category}</div>
                              <div className="muted">Enviado em {new Date(file.uploaded_at).toLocaleString('pt-BR')}</div>
                              {file.validity ? <div className="muted">Validade: {file.validity}</div> : null}
                            </div>
                            {file.file_url ? (
                              <a className="button secondary" href={file.file_url} target="_blank" rel="noreferrer">Abrir</a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            ) : null}

            {activeTab === 'albums' ? (
              <div className="album-grid">
                <div className="files-actions">
                  {ALBUM_PRESETS.map((preset) => {
                    const exists = albums.some((album) => album.name.toLowerCase() === preset.toLowerCase());
                    return (
                      <button
                        key={preset}
                        className="button secondary"
                        type="button"
                        disabled={!canEditFiles(user?.role) || exists}
                        onClick={() => {
                          if (!patientId) return;
                          const album = createAlbum(patientId, { name: preset }, user?.id);
                          setAlbums((prev) => [album, ...prev]);
                          setAlbumPhotos((prev) => ({ ...prev, [album.id]: [] }));
                          logAccess({
                            entityType: 'PHOTO_ALBUM',
                            entityId: patientId,
                            action: 'CREATE',
                            userId: user?.id,
                            metadata: { album_id: album.id, name: album.name },
                            deviceInfo: deviceInfo(),
                          });
                        }}
                      >
                        Criar {preset}
                      </button>
                    );
                  })}
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!canEditFiles(user?.role)}
                    onClick={() => {
                      const name = window.prompt('Nome do álbum');
                      if (!name || !patientId) return;
                      const album = createAlbum(patientId, { name }, user?.id);
                      setAlbums((prev) => [album, ...prev]);
                      setAlbumPhotos((prev) => ({ ...prev, [album.id]: [] }));
                      logAccess({
                        entityType: 'PHOTO_ALBUM',
                        entityId: patientId,
                        action: 'CREATE',
                        userId: user?.id,
                        metadata: { album_id: album.id, name: album.name },
                        deviceInfo: deviceInfo(),
                      });
                    }}
                  >
                    Novo álbum
                  </button>
                </div>
                {albums.length === 0 ? <div className="muted">Nenhum álbum criado.</div> : null}
                {albums.map((album) => (
                  <div key={album.id} className="album-card">
                    <strong>{album.name}</strong>
                    <div className="muted">Criado em {new Date(album.created_at).toLocaleDateString('pt-BR')}</div>
                    <div className="album-upload">
                      <label>
                        Data
                        <input
                          type="date"
                          value={albumForms[album.id]?.taken_at || ''}
                          onChange={(event) => setAlbumForms((prev) => ({
                            ...prev,
                            [album.id]: { ...prev[album.id], taken_at: event.target.value },
                          }))}
                          disabled={!canEditFiles(user?.role)}
                        />
                      </label>
                      <label>
                        Procedimento (opcional)
                        <input
                          value={albumForms[album.id]?.procedure || ''}
                          onChange={(event) => setAlbumForms((prev) => ({
                            ...prev,
                            [album.id]: { ...prev[album.id], procedure: event.target.value },
                          }))}
                          disabled={!canEditFiles(user?.role)}
                        />
                      </label>
                      <label>
                        Observação (opcional)
                        <input
                          value={albumForms[album.id]?.note || ''}
                          onChange={(event) => setAlbumForms((prev) => ({
                            ...prev,
                            [album.id]: { ...prev[album.id], note: event.target.value },
                          }))}
                          disabled={!canEditFiles(user?.role)}
                        />
                      </label>
                      <label className="button secondary">
                        Upload fotos
                        <input
                          type="file"
                          hidden
                          multiple
                          accept="image/*"
                          disabled={!canEditFiles(user?.role)}
                          onChange={(event) => {
                            const filesList = Array.from(event.target.files || []);
                            if (filesList.length === 0) return;
                            const meta = albumForms[album.id] || {};
                            const nextPhotos = filesList
                              .map((file) => {
                                const validation = validateFileMeta(file, ['image/jpeg', 'image/png']);
                                if (!validation.ok) {
                                  setStatus({ error: validation.message, success: '' });
                                  return null;
                                }
                                const url = URL.createObjectURL(file);
                                const photo = addAlbumPhoto(album.id, {
                                  file_url: url,
                                  caption: file.name,
                                  taken_at: meta.taken_at || '',
                                  note: meta.note || '',
                                  procedure: meta.procedure || '',
                                }, user?.id);
                                logAccess({
                                  entityType: 'PHOTO_ALBUM',
                                  entityId: patientId,
                                  action: 'UPLOAD',
                                  userId: user?.id,
                                  metadata: { album_id: album.id, file_name: photo.caption },
                                  deviceInfo: deviceInfo(),
                                });
                                return photo;
                              })
                              .filter(Boolean);
                            if (nextPhotos.length > 0) {
                              setAlbumPhotos((prev) => ({
                                ...prev,
                                [album.id]: [...nextPhotos, ...(prev[album.id] || [])],
                              }));
                              setStatus({ error: '', success: 'Fotos adicionadas ao álbum.' });
                            }
                          }}
                        />
                      </label>
                      <div
                        className="album-dropzone"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (!canEditFiles(user?.role)) return;
                          const filesList = Array.from(event.dataTransfer.files || []);
                          if (filesList.length === 0) return;
                          const meta = albumForms[album.id] || {};
                          const nextPhotos = filesList
                            .map((file) => {
                              const validation = validateFileMeta(file, ['image/jpeg', 'image/png']);
                              if (!validation.ok) {
                                setStatus({ error: validation.message, success: '' });
                                return null;
                              }
                              const url = URL.createObjectURL(file);
                              const photo = addAlbumPhoto(album.id, {
                                file_url: url,
                                caption: file.name,
                                taken_at: meta.taken_at || '',
                                note: meta.note || '',
                                procedure: meta.procedure || '',
                              }, user?.id);
                              logAccess({
                                entityType: 'PHOTO_ALBUM',
                                entityId: patientId,
                                action: 'UPLOAD',
                                userId: user?.id,
                                metadata: { album_id: album.id, file_name: photo.caption },
                                deviceInfo: deviceInfo(),
                              });
                              return photo;
                            })
                            .filter(Boolean);
                          if (nextPhotos.length > 0) {
                            setAlbumPhotos((prev) => ({
                              ...prev,
                              [album.id]: [...nextPhotos, ...(prev[album.id] || [])],
                            }));
                            setStatus({ error: '', success: 'Fotos adicionadas ao álbum.' });
                          }
                        }}
                      >
                        Arraste e solte as imagens aqui
                      </div>
                    </div>
                    <div className="album-photos">
                      {(albumPhotos[album.id] || []).map((photo) => (
                        <div key={photo.id} className="album-photo">
                          {photo.file_url ? <img src={photo.file_url} alt={photo.caption || 'Foto'} /> : null}
                          <div className="album-photo-meta">
                            <div>{photo.caption}</div>
                            {photo.note ? <div>{photo.note}</div> : null}
                            {photo.procedure ? <div>Procedimento: {photo.procedure}</div> : null}
                            {photo.taken_at ? <div>Data: {photo.taken_at}</div> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </SectionCard>
        )}
      </Section>
    </div>
  );
}
