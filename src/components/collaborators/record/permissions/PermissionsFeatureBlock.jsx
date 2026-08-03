import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import PermissionActionCard from './PermissionActionCard.jsx';
import PermissionsProgress from './PermissionsProgress.jsx';
import { checkboxTriState } from './permissionsConstants.js';

function TriStateCheckbox({ id, label, checked, indeterminate, disabled, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="cr-perms-check" htmlFor={id}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

function PermissionsFeatureBlock({
  row,
  actionLabels,
  readOnly,
  effectivePermission,
  onTogglePermission,
  onToggleRow,
}) {
  const selected = useMemo(
    () => row.perms.filter((p) => effectivePermission(p.id)).length,
    [row.perms, effectivePermission],
  );
  const total = row.perms.length;
  const { checked, indeterminate } = checkboxTriState(selected, total);

  const handleRowToggle = useCallback((e) => {
    onToggleRow(row, e.target.checked);
  }, [onToggleRow, row]);

  return (
    <article className="cr-perms-feature">
      <header className="cr-perms-feature__head">
        <TriStateCheckbox
          id={`feature-${row.key}`}
          label={row.label}
          checked={checked}
          indeterminate={indeterminate}
          disabled={readOnly}
          onChange={handleRowToggle}
        />
        <span className="cr-perms-feature__counter" aria-live="polite">
          {selected}/{total}
        </span>
      </header>
      <PermissionsProgress selected={selected} total={total} className="cr-perms-feature__progress" />
      <div className="cr-perms-feature__grid">
        {row.actions.map((actionKey) => {
          const perm = row.permByAction[actionKey];
          if (!perm) return null;
          return (
            <PermissionActionCard
              key={actionKey}
              actionKey={actionKey}
              actionLabel={actionLabels[actionKey] || actionKey}
              permId={perm.id}
              checked={effectivePermission(perm.id)}
              readOnly={readOnly}
              onToggle={onTogglePermission}
            />
          );
        })}
      </div>
    </article>
  );
}

export default memo(PermissionsFeatureBlock);
