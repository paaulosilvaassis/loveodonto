export const SectionCard = ({ title, description, actions, header, children }) => (
  <div className="section-card">
    {(header || title || description || actions) ? (
      <div className="section-card-header">
        {header ? (
          header
        ) : (
          <>
            <div>
              {title ? <h3>{title}</h3> : null}
              {description ? <p className="section-card-description">{description}</p> : null}
            </div>
            {actions ? <div className="section-card-actions">{actions}</div> : null}
          </>
        )}
      </div>
    ) : null}
    <div className="section-card-body">{children}</div>
  </div>
);
