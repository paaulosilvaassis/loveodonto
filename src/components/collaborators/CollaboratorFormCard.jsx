/**
 * Card de seção da ficha do colaborador — visual SaaS.
 */
export default function CollaboratorFormCard({ title, description, children, id, className = '' }) {
  return (
    <section className={`collaborator-form-card ${className}`.trim()} id={id}>
      <header className="collaborator-form-card__header">
        <h3 className="collaborator-form-card__title">{title}</h3>
        {description ? <p className="collaborator-form-card__desc">{description}</p> : null}
      </header>
      <div className="collaborator-form-card__body">{children}</div>
    </section>
  );
}
