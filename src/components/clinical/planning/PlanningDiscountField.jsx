import { useEffect, useRef, useState } from 'react';
import { applyCurrencyMaskBRL, formatCurrencyBRL, parseCurrencyBRL } from '../../../utils/currency.js';

export function PlanningDiscountField({
  value,
  discountType = 'percent',
  onChange,
  unitValue,
  quantity,
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(discountType);
  const inputRef = useRef(null);

  useEffect(() => {
    setMode(discountType);
  }, [discountType]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing, mode]);

  const base = Number(quantity || 1) * Number(unitValue || 0);

  const display =
    mode === 'percent'
      ? `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
      : formatCurrencyBRL(Number(value || 0));

  const commit = (raw) => {
    if (mode === 'percent') {
      const pct = Math.min(100, Math.max(0, parseFloat(String(raw).replace(',', '.')) || 0));
      onChange({ discount: pct, discountType: 'percent' });
    } else {
      onChange({ discount: parseCurrencyBRL(raw), discountType: 'fixed' });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="clinical-planning-discount-edit">
        <div className="clinical-planning-discount-toggle">
          <button
            type="button"
            className={mode === 'percent' ? 'is-active' : ''}
            onClick={() => setMode('percent')}
          >
            %
          </button>
          <button
            type="button"
            className={mode === 'fixed' ? 'is-active' : ''}
            onClick={() => setMode('fixed')}
          >
            R$
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          className="clinical-planning-discount-input"
          defaultValue={
            mode === 'percent'
              ? String(value || 0)
              : formatCurrencyBRL(Number(value || 0))
          }
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(e.target.value);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          onInput={mode === 'fixed' ? applyCurrencyMaskBRL : undefined}
        />
        {mode === 'percent' && base > 0 ? (
          <small className="clinical-planning-discount-hint">
            ≈ {formatCurrencyBRL(base * (Number(value || 0) / 100))}
          </small>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="clinical-planning-discount-display"
      onClick={() => setEditing(true)}
      title="Clique para editar desconto"
    >
      {display}
    </button>
  );
}
