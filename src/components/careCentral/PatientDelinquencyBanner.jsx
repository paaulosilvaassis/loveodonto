import { AlertOctagon } from 'lucide-react';

export function PatientDelinquencyBanner({
  delinquency,
  onViewFinance,
  onNegotiate,
}) {
  if (!delinquency?.isDelinquent) return null;

  return (
    <div className="patient-delinquency-banner" role="alert">
      <div className="patient-delinquency-banner-icon" aria-hidden>
        <AlertOctagon size={22} />
      </div>
      <div className="patient-delinquency-banner-content">
        <strong>Paciente com inadimplência</strong>
        <p>{delinquency.message}</p>
      </div>
      <div className="patient-delinquency-banner-actions">
        <button type="button" className="button secondary sm" onClick={onViewFinance}>
          Ver financeiro
        </button>
        <button type="button" className="button ghost sm" onClick={onNegotiate}>
          Negociar dívida
        </button>
      </div>
    </div>
  );
}
