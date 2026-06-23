import { BookOpen } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';

export function ClinicalGuideMatchBanner({ matches = [], onOpenGuide }) {
  if (!matches.length) return null;

  return (
    <div className="clinical-guide-match-banner" role="region" aria-label="Guias clínicos sugeridos">
      <BookOpen size={18} aria-hidden />
      <div className="clinical-guide-match-banner-content">
        <strong>Guias clínicos sugeridos para este orçamento</strong>
        <div className="clinical-guide-match-banner-actions">
          {matches.map((guide) => (
            <button
              key={guide.id}
              type="button"
              className="button secondary sm"
              onClick={() => onOpenGuide(guide.id)}
            >
              Ver guia de
              {' '}
              {guide.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ClinicalGuideOpenButton({ onClick, size = 'sm', variant = 'secondary' }) {
  return (
    <ClinicalBtn variant={variant} size={size} icon={BookOpen} onClick={onClick}>
      Guia Clínico
    </ClinicalBtn>
  );
}
