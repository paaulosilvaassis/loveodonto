import { getFinancialStatusMeta } from './billingUtils.js';

export default function FinancialStatusBadge({ status }) {
  const meta = getFinancialStatusMeta(status);
  return (
    <span className={`rc-badge rc-badge--${meta.tone}`}>
      {meta.label}
    </span>
  );
}
