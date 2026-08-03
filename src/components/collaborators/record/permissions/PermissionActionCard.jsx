import { memo, useCallback } from 'react';
import { Check } from 'lucide-react';
import { ACTION_HINTS } from './permissionsConstants.js';

function PermissionActionCard({
  actionKey,
  actionLabel,
  permId,
  checked,
  readOnly,
  onToggle,
}) {
  const hint = ACTION_HINTS[actionKey] || actionLabel;

  const handleChange = useCallback((e) => {
    onToggle(permId, e.target.checked);
  }, [onToggle, permId]);

  return (
    <label className={`cr-perms-action ${checked ? 'is-on' : ''}`}>
      <input
        type="checkbox"
        className="cr-perms-action__input"
        checked={checked}
        disabled={readOnly}
        onChange={handleChange}
      />
      <span className="cr-perms-action__check" aria-hidden>
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <span className="cr-perms-action__label">{actionLabel}</span>
      <span className="cr-perms-action__hint">{hint}</span>
    </label>
  );
}

export default memo(PermissionActionCard);
