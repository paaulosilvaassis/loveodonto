import { useState, useEffect, useRef } from 'react';
import { createPatientQuick, addPatientPhone, searchPatients } from '../../services/patientService.js';
import { convertLeadToPatient } from '../../services/crmService.js';
import { updateAppointment } from '../../services/appointmentService.js';
import { formatCpf, isCpfValid, onlyDigits } from '../../utils/validators.js';
import { normalizeText } from '../../services/helpers.js';

const parseLeadPhone = (digits) => {
  if (!digits || digits.length < 10) return { ddd: '', number: '' };
  if (digits.length >= 10) {
    return { ddd: digits.slice(0, 2), number: digits.slice(2, 11) };
  }
  return { ddd: '', number: digits };
};

export function RegisterPatientFromLeadModal({ open, onClose, lead, appointmentId, user, onSuccess }) {
  const [full_name, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [sex, setSex] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingPatient, setExistingPatient] = useState(null);
  const ignoreNextBackdropClick = useRef(false);

  useEffect(() => {
    if (open && lead) {
      ignoreNextBackdropClick.current = true;
      setFullName(normalizeText(lead.name) || '');
      setCpf('');
      setSex('');
      setBirthDate('');
      setError('');
      setExistingPatient(null);
    }
  }, [open, lead]);

  const handleLinkExisting = () => {
    if (!existingPatient) return;
    setSubmitting(true);
    setError('');
    try {
      convertLeadToPatient(user, lead.id, existingPatient.id);
      updateAppointment(user, appointmentId, { patientId: existingPatient.id });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Erro ao vincular paciente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    setError('');
    setExistingPatient(null);
    const fullNameTrim = normalizeText(full_name);
    const cpfDigits = onlyDigits(cpf);

    if (!fullNameTrim) {
      setError('Nome completo é obrigatório.');
      return;
    }
    if (!cpfDigits || cpfDigits.length !== 11) {
      setError('CPF é obrigatório (11 dígitos).');
      return;
    }
    if (!isCpfValid(cpf)) {
      setError('CPF inválido.');
      return;
    }
    if (!normalizeText(sex)) {
      setError('Sexo é obrigatório.');
      return;
    }
    if (!normalizeText(birth_date)) {
      setError('Data de nascimento é obrigatória.');
      return;
    }

    const { exactMatch } = searchPatients('cpf', cpfDigits);
    if (exactMatch) {
      setExistingPatient(exactMatch);
      setError('CPF já cadastrado. Você pode vincular este paciente ao agendamento e abrir o atendimento.');
      return;
    }

    setSubmitting(true);
    try {
      const created = createPatientQuick(user, {
        full_name: fullNameTrim,
        sex: normalizeText(sex),
        birth_date: normalizeText(birth_date),
        cpf: cpfDigits,
      });
      const patientId = created.patientId || created.profile?.id;
      if (!patientId) throw new Error('ID do paciente inválido.');

      const leadPhone = lead.phone ? onlyDigits(String(lead.phone)) : '';
      if (leadPhone && leadPhone.length >= 10) {
        try {
          const { ddd, number } = parseLeadPhone(leadPhone);
          if (ddd && number) {
            addPatientPhone(user, patientId, {
              ddd,
              number,
              is_primary: true,
              is_whatsapp: true,
            });
          }
        } catch (phoneErr) {
          console.warn('Telefone do lead não adicionado:', phoneErr?.message);
        }
      }

      convertLeadToPatient(user, lead.id, patientId);
      updateAppointment(user, appointmentId, { patientId });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      const msg = err?.message || 'Falha ao cadastrar paciente.';
      if (String(msg).includes('CPF já cadastrado')) {
        const { exactMatch: match } = searchPatients('cpf', onlyDigits(cpf));
        if (match) {
          setExistingPatient(match);
          setError('CPF já cadastrado. Você pode vincular este paciente ao agendamento e abrir o atendimento.');
        } else {
          setError(msg);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RegisterPatientFromLeadModal.jsx:renderCheck',message:'open/lead check',data:{open,hasLead:!!lead,leadId:lead?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (ignoreNextBackdropClick.current) {
      ignoreNextBackdropClick.current = false;
      return;
    }
    onClose();
  };

  if (!open || !lead) return null;

  return (
    <div className="appointment-details-backdrop register-from-lead-backdrop" role="dialog" aria-modal="true" onClick={handleBackdropClick} style={{ zIndex: 1300 }}>
      <div className="appointment-details-modal register-from-lead-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-details-header">
          <div>
            <strong>Cadastrar paciente (agendamento do lead)</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="appointment-details-body register-from-lead-body">
          <p className="register-from-lead-intro">
            Preencha os dados mínimos para vincular o lead ao cadastro de paciente e liberar edição e confirmação de chegada.
          </p>
          {error ? (
            <div className="register-from-lead-error" role="alert">
              {error}
              {existingPatient ? (
                <div className="register-from-lead-link-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleLinkExisting}
                    disabled={submitting}
                  >
                    {submitting ? 'Vinculando…' : 'Vincular este paciente ao agendamento'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="register-from-lead-form">
            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Nome completo</span>
              <input
                type="text"
                value={full_name}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome do lead"
                className="register-from-lead-input"
              />
            </label>
            <label className="register-from-lead-field">
              <span className="register-from-lead-label">CPF</span>
              <input
                type="text"
                value={formatCpf(cpf)}
                onChange={(e) => {
                  setCpf(e.target.value);
                  setExistingPatient(null);
                  if (error) setError('');
                }}
                placeholder="000.000.000-00"
                className="register-from-lead-input"
              />
            </label>
            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Sexo</span>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="register-from-lead-input register-from-lead-select"
              >
                <option value="">Selecione</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
              </select>
            </label>
            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Data de nascimento</span>
              <input
                type="date"
                value={birth_date}
                onChange={(e) => setBirthDate(e.target.value)}
                className="register-from-lead-input"
              />
            </label>
          </div>
        </div>
        <div className="appointment-details-footer register-from-lead-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Salvando…' : 'Cadastrar e vincular ao agendamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
