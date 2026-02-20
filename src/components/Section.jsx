export const Section = ({ title, actions, children }) => (
  <section className="section">
    <div className="section-header">
      <h2>{title}</h2>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
    <div className="section-body">{children}</div>
  </section>
);
