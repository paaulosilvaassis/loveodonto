import { PlanningDiscountField } from './PlanningDiscountField.jsx';
import { PlanningMoneyField } from './PlanningMoneyField.jsx';
import { PlanningQuantityStepper } from './PlanningQuantityStepper.jsx';
import { PlanningRegionField } from './PlanningRegionField.jsx';
import { PlanningRowActions } from './PlanningRowActions.jsx';
import { PlanningStageBadge } from './PlanningStageBadge.jsx';
import { calcItemTotal, formatPlanningMoney } from './planningUtils.js';

export function PlanningProcedureRow({
  proc,
  isNew,
  isHighlighted,
  rowRef,
  onFieldChange,
  onPatch,
  onDuplicate,
  onEdit,
  onRemove,
}) {
  const meta = [proc.code, proc.category].filter(Boolean).join(' • ');
  const rowClass = [
    'clinical-planning-row',
    isNew ? 'clinical-planning-row--enter' : '',
    isHighlighted ? 'clinical-planning-row--highlight' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rowRef} className={rowClass} data-planned-id={proc.id}>
      <div className="clinical-planning-cell clinical-planning-cell--procedure">
        <strong className="clinical-planning-proc-name">{proc.name}</strong>
        {meta ? <span className="clinical-planning-proc-meta">{meta}</span> : null}
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--stage">
        <PlanningStageBadge
          value={proc.stage || 'inicial'}
          onChange={(stage) => onFieldChange(proc.id, 'stage', stage)}
        />
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--region">
        <PlanningRegionField
          item={proc}
          onChange={(patch) => onPatch(proc.id, patch)}
        />
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--qty">
        <PlanningQuantityStepper
          value={proc.quantity || 1}
          onChange={(qty) => onFieldChange(proc.id, 'quantity', qty)}
        />
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--money">
        <PlanningMoneyField
          value={proc.unitValue || 0}
          onChange={(val) => onFieldChange(proc.id, 'unitValue', val)}
        />
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--discount">
        <PlanningDiscountField
          value={proc.discount || 0}
          discountType={proc.discountType || 'percent'}
          unitValue={proc.unitValue || 0}
          quantity={proc.quantity || 1}
          onChange={(patch) => onPatch(proc.id, patch)}
        />
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--total">
        <span className="clinical-planning-final-value">
          {formatPlanningMoney(calcItemTotal(proc))}
        </span>
      </div>

      <div className="clinical-planning-cell clinical-planning-cell--actions">
        <PlanningRowActions
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
