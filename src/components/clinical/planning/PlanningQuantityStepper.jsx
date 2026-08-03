import { Minus, Plus } from 'lucide-react';

export function PlanningQuantityStepper({ value, onChange, min = 1, max = 99, disabled }) {
  const qty = Math.max(min, Number(value || min));

  const setQty = (next) => {
    const clamped = Math.min(max, Math.max(min, next));
    onChange(clamped);
  };

  return (
    <div className="clinical-planning-qty">
      <button
        type="button"
        className="clinical-planning-qty-btn"
        onClick={() => setQty(qty - 1)}
        disabled={disabled || qty <= min}
        aria-label="Diminuir quantidade"
      >
        <Minus size={14} />
      </button>
      <span className="clinical-planning-qty-value" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        className="clinical-planning-qty-btn"
        onClick={() => setQty(qty + 1)}
        disabled={disabled || qty >= max}
        aria-label="Aumentar quantidade"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
