import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getAppointmentDetails, APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { buildPatientCareContext } from '../services/patientCareCentralService.js';
import { PatientCareCentralPanel } from '../components/careCentral/PatientCareCentralPanel.jsx';
import { ClinicalBtn } from '../components/clinical/ClinicalStageShell.jsx';

export default function PatientCareCentralPage() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    const details = getAppointmentDetails(appointmentId);
    if (!details?.appointment) {
      setError('Atendimento não encontrado.');
      setLoading(false);
      return;
    }
    if (details.appointment.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      setError('Atendimento não está em andamento.');
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [appointmentId, refreshKey]);

  const context = useMemo(
    () => (appointmentId && !error ? buildPatientCareContext(appointmentId) : null),
    [appointmentId, error, refreshKey],
  );

  if (loading) {
    return <div className="care-central-loading">Carregando central de atendimento…</div>;
  }

  if (error) {
    return (
      <div className="care-central-error">
        <p>{error}</p>
        <ClinicalBtn variant="secondary" onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}>
          Voltar para Jornada
        </ClinicalBtn>
      </div>
    );
  }

  return (
    <div className="care-central-shell">
      <div className="care-central-topbar">
        <ClinicalBtn variant="ghost" icon={ArrowLeft} onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}>
          Jornada do Paciente
        </ClinicalBtn>
        <span>Central de Atendimento do Paciente</span>
      </div>
      <PatientCareCentralPanel
        context={context}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
