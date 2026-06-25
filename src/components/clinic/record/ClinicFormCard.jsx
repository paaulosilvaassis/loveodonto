export default function ClinicFormCard({ title, description, children, id }) {
  return (
    <section className="clinic-form-card" id={id}>
      {(title || description) ? (
        <header className="clinic-form-card__header">
          {title ? <h3 className="clinic-form-card__title">{title}</h3> : null}
          {description ? <p className="clinic-form-card__desc">{description}</p> : null}
        </header>
      ) : null}
      <div className="clinic-form-card__body">{children}</div>
    </section>
  );
}
