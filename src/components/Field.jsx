export const Field = ({ label, children, hint, error }) => (
  <label className={`field ${error ? 'has-error' : ''}`}>
    <span className="field-label">{label}</span>
    {children}
    {error ? <span className="field-error">{error}</span> : null}
    {hint ? <span className="field-hint">{hint}</span> : null}
  </label>
);
