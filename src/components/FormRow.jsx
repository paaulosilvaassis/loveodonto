export const FormRow = ({ label, hint, error, optional, children }) => (
  <label className={`form-row ${error ? 'has-error' : ''}`}>
    <span className="form-row-label">
      {label}
      {optional ? <span className="form-row-optional">Opcional</span> : null}
    </span>
    <div className="form-row-control">
      {children}
      {error ? <span className="form-row-error">{error}</span> : null}
      {hint ? <span className="form-row-hint">{hint}</span> : null}
    </div>
  </label>
);
