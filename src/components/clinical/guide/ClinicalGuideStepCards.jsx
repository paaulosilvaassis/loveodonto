import { ClinicalGuideInlineImage } from './ClinicalGuideImageGallery.jsx';

export function ClinicalGuideStepCards({ steps = [] }) {
  if (!steps.length) {
    return <p className="clinical-guide-muted">Nenhuma etapa cadastrada.</p>;
  }

  return (
    <div className="clinical-guide-step-cards">
      {steps.map((step, index) => (
        <article key={`${step.title}-${index}`} className="clinical-guide-step-card-premium">
          <div className="clinical-guide-step-card-premium-media">
            <ClinicalGuideInlineImage
              src={step.imageUrl}
              alt={step.title}
              className="clinical-guide-step-card-premium-img"
            />
            <span className="clinical-guide-step-card-premium-index">{index + 1}</span>
          </div>
          <div className="clinical-guide-step-card-premium-body">
            <h4>{step.title}</h4>
            <p>{step.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
