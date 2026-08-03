import { useMemo, useState } from 'react';
import { Pencil, Trash2, Star } from 'lucide-react';
import { Field } from '../Field.jsx';
import {
  addClinicPhone,
  removeClinicPhone,
  updateClinicPhone,
} from '../../services/clinicService.js';
import { onlyDigits } from '../../utils/validators.js';
import {
  CLINIC_PHONE_TYPES,
  formatBrazilianPhoneDisplay,
  formatPhoneNumberOnly,
  getClinicPhoneTypeLabel,
  sanitizePhoneNumberInput,
} from '../../utils/phoneUtils.js';

const EMPTY_PHONE = { tipo: '', ddd: '', numero: '', principal: false };

export function ClinicPhonesSection({
  user,
  phones = [],
  isAdmin,
  isEditing,
  onRefresh,
  onError,
  onSuccess,
}) {
  const [form, setForm] = useState(EMPTY_PHONE);
  const [editingId, setEditingId] = useState(null);
  const [fieldError, setFieldError] = useState('');

  const disabled = !isAdmin || !isEditing;

  const resetForm = () => {
    setForm(EMPTY_PHONE);
    setEditingId(null);
    setFieldError('');
  };

  const patchForm = (partial) => {
    setFieldError('');
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const handleDddChange = (value) => {
    const ddd = onlyDigits(value).slice(0, 2);
    const numero = sanitizePhoneNumberInput(form.numero, ddd);
    patchForm({ ddd, numero });
  };

  const handleNumeroChange = (value) => {
    const numero = sanitizePhoneNumberInput(value, form.ddd);
    patchForm({ numero });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setFieldError('');
    onError?.('');
    try {
      if (editingId) {
        updateClinicPhone(user, editingId, form);
        onSuccess?.('Telefone atualizado com sucesso.');
      } else {
        addClinicPhone(user, form);
        onSuccess?.('Telefone adicionado com sucesso.');
      }
      resetForm();
      onRefresh?.();
    } catch (err) {
      const message = err?.message || 'Não foi possível salvar o telefone.';
      setFieldError(message);
      onError?.(message);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      tipo: item.tipo || '',
      ddd: onlyDigits(item.ddd).slice(0, 2),
      numero: onlyDigits(item.numero),
      principal: Boolean(item.principal),
    });
    setFieldError('');
    onError?.('');
  };

  const handleDelete = (phoneId) => {
    onError?.('');
    try {
      removeClinicPhone(user, phoneId);
      if (editingId === phoneId) resetForm();
      onSuccess?.('Telefone removido.');
      onRefresh?.();
    } catch (err) {
      onError?.(err?.message || 'Não foi possível remover o telefone.');
    }
  };

  const sortedPhones = useMemo(
    () => [...phones].sort((a, b) => Number(b.principal) - Number(a.principal)),
    [phones],
  );

  return (
    <div className="clinic-phones-section stack">
      <form className="clinic-phones-form" onSubmit={handleSubmit} noValidate>
        <div className="clinic-phones-field clinic-phones-field--type">
          <Field label="Tipo">
            <select
            value={form.tipo}
            onChange={(e) => patchForm({ tipo: e.target.value })}
            disabled={disabled}
            required
          >
            <option value="">Selecione</option>
            {CLINIC_PHONE_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          </Field>
        </div>

        <div className="clinic-phones-field clinic-phones-field--ddd">
          <Field label="DDD">
            <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-area-code"
            placeholder="31"
            maxLength={2}
            value={form.ddd}
            onChange={(e) => handleDddChange(e.target.value)}
            disabled={disabled}
            aria-label="DDD"
          />
          </Field>
        </div>

        <div className="clinic-phones-field clinic-phones-field--number">
          <Field label="Número">
            <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="97119-6315"
            value={formatPhoneNumberOnly(form.numero)}
            onChange={(e) => handleNumeroChange(e.target.value)}
            disabled={disabled}
            aria-label="Número do telefone"
          />
          </Field>
        </div>

        <label className="clinic-phones-principal">
          <input
            type="checkbox"
            checked={form.principal}
            onChange={(e) => patchForm({ principal: e.target.checked })}
            disabled={disabled}
          />
          <span>Principal</span>
        </label>

        <div className="clinic-phones-actions">
          {editingId ? (
            <button
              type="button"
              className="button secondary"
              onClick={resetForm}
              disabled={disabled}
            >
              Cancelar
            </button>
          ) : null}
          <button type="submit" className="button primary" disabled={disabled}>
            {editingId ? 'Salvar alterações' : 'Adicionar telefone'}
          </button>
        </div>

        {fieldError ? (
          <p className="clinic-phones-field-error" role="alert">{fieldError}</p>
        ) : null}
      </form>

      {sortedPhones.length ? (
        <ul className="clinic-phones-list">
          {sortedPhones.map((item) => (
            <li key={item.id} className="clinic-phones-card">
              <div className="clinic-phones-card-body">
                <span className="clinic-phones-card-type">{getClinicPhoneTypeLabel(item.tipo)}</span>
                <span className="clinic-phones-card-number">
                  {formatBrazilianPhoneDisplay(item.ddd, item.numero)}
                </span>
                {item.principal ? (
                  <span className="clinic-phones-badge">
                    <Star size={12} aria-hidden="true" />
                    Principal
                  </span>
                ) : null}
              </div>
              {isAdmin ? (
                <div className="clinic-phones-card-actions">
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => handleEdit(item)}
                    disabled={!isEditing}
                    aria-label={`Editar telefone ${formatBrazilianPhoneDisplay(item.ddd, item.numero)}`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="button secondary small clinic-phones-delete"
                    onClick={() => handleDelete(item.id)}
                    disabled={!isEditing}
                    aria-label={`Excluir telefone ${formatBrazilianPhoneDisplay(item.ddd, item.numero)}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Excluir
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="clinic-phones-empty" role="status">
          <p>Nenhum telefone cadastrado.</p>
          <p className="clinic-phones-empty-hint">Adicione o telefone principal da clínica para contato com pacientes.</p>
        </div>
      )}
    </div>
  );
}
