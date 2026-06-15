import { useEffect, useRef, useState } from 'react';
import { applyCurrencyMaskBRL, formatCurrencyBRL, parseCurrencyBRL } from '../../../utils/currency.js';

export function PlanningMoneyField({ value, onChange, className = '' }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const display = formatCurrencyBRL(Number(value || 0));

  const commit = (raw) => {
    onChange(parseCurrencyBRL(raw));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={`clinical-planning-money-input ${className}`.trim()}
        defaultValue={display}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(e.target.value);
          }
          if (e.key === 'Escape') setEditing(false);
        }}
        onInput={applyCurrencyMaskBRL}
      />
    );
  }

  return (
    <button
      type="button"
      className={`clinical-planning-money-display ${className}`.trim()}
      onClick={() => setEditing(true)}
      title="Clique para editar"
    >
      {display}
    </button>
  );
}
