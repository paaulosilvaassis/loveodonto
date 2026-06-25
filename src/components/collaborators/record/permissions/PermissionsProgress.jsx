import { memo } from 'react';
import { progressVariant } from './permissionsConstants.js';

function PermissionsProgress({ selected, total, className = '' }) {
  const pct = total ? Math.round((selected / total) * 100) : 0;
  const variant = progressVariant(selected, total);

  return (
    <div className={`cr-perms-progress cr-perms-progress--${variant} ${className}`.trim()} aria-hidden>
      <div className="cr-perms-progress__track">
        <span className="cr-perms-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default memo(PermissionsProgress);
