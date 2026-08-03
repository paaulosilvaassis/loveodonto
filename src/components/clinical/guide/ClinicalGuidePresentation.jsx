import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  getGuideBeforeAfter,
  listClinicalGuideImages,
  listGuideStepCards,
} from '../../../services/clinicalGuide/clinicalGuideService.js';
import { getCategoryLabel } from '../../../services/clinicalGuide/clinicalGuideCategories.js';
import { ClinicalGuideInlineImage } from './ClinicalGuideImageGallery.jsx';
import { ClinicalGuideBeforeAfter } from './ClinicalGuideBeforeAfter.jsx';
import { ClinicalGuideStepCards } from './ClinicalGuideStepCards.jsx';

const BASE_SLIDES = ['hero', 'about', 'steps', 'beforeAfter', 'benefits', 'care', 'faq'];

function buildSlides(guide, beforeAfter) {
  const slides = [...BASE_SLIDES];
  if ((guide?.videos || []).length) slides.splice(4, 0, 'videos');
  if (!beforeAfter?.before || !beforeAfter?.after) {
    return slides.filter((id) => id !== 'beforeAfter');
  }
  return slides;
}

export function ClinicalGuidePresentation({ guide, open, onClose }) {
  const [slideIndex, setSlideIndex] = useState(0);

  const images = useMemo(
    () => (guide ? listClinicalGuideImages(guide.id, { patientView: true }) : []),
    [guide?.id],
  );
  const beforeAfter = useMemo(() => (guide ? getGuideBeforeAfter(guide) : null), [guide]);
  const stepCards = useMemo(() => (guide ? listGuideStepCards(guide) : []), [guide]);

  useEffect(() => {
    if (!open) return undefined;
    setSlideIndex(0);
    document.body.classList.add('clinical-guide-presentation-open');
    return () => {
      document.body.classList.remove('clinical-guide-presentation-open');
    };
  }, [open, guide?.id]);

  if (!open || !guide) return null;

  const slides = buildSlides(guide, beforeAfter);
  const slide = slides[slideIndex] || 'hero';
  const prev = () => setSlideIndex((i) => (i > 0 ? i - 1 : slides.length - 1));
  const next = () => setSlideIndex((i) => (i < slides.length - 1 ? i + 1 : 0));

  return createPortal(
    <div className="clinical-guide-presentation-fs" role="dialog" aria-modal="true" aria-label={`Apresentação — ${guide.title}`}>
      <button type="button" className="clinical-guide-presentation-fs-close" onClick={onClose} aria-label="Fechar">
        <X size={22} />
      </button>

      <div className="clinical-guide-presentation-fs-slide">
        {slide === 'hero' ? (
          <div className="clinical-guide-presentation-fs-hero">
            <ClinicalGuideInlineImage src={guide.coverImageUrl} alt="" className="clinical-guide-presentation-fs-hero-img" />
            <div className="clinical-guide-presentation-fs-hero-text">
              <span>{getCategoryLabel(guide.category)}</span>
              <h1>{guide.title}</h1>
              <p>{guide.shortDescription}</p>
            </div>
          </div>
        ) : null}

        {slide === 'about' ? (
          <div className="clinical-guide-presentation-fs-content">
            <h2>O que é este tratamento?</h2>
            <p className="clinical-guide-prose">{guide.patientDescription}</p>
          </div>
        ) : null}

        {slide === 'steps' ? (
          <div className="clinical-guide-presentation-fs-content">
            <h2>Como funciona</h2>
            <ClinicalGuideStepCards steps={stepCards} />
          </div>
        ) : null}

        {slide === 'beforeAfter' ? (
          <div className="clinical-guide-presentation-fs-content">
            <ClinicalGuideBeforeAfter beforeUrl={beforeAfter?.before} afterUrl={beforeAfter?.after} />
          </div>
        ) : null}

        {slide === 'videos' ? (
          <div className="clinical-guide-presentation-fs-content">
            <h2>Vídeos explicativos</h2>
            <div className="clinical-guide-video-grid">
              {(guide.videos || []).map((video, index) => (
                <div key={`${video.url}-${index}`} className="clinical-guide-video-item">
                  {video.title ? <h3>{video.title}</h3> : null}
                  <video src={video.url} controls playsInline className="clinical-guide-video-player" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {slide === 'benefits' ? (
          <div className="clinical-guide-presentation-fs-content">
            <h2>Benefícios</h2>
            <ul className="clinical-guide-list">
              {(guide.benefits || []).map((item, index) => <li key={index}>{item}</li>)}
            </ul>
            <h3>Riscos e limitações</h3>
            <ul className="clinical-guide-list">
              {(guide.risks || []).map((item, index) => <li key={index}>{item}</li>)}
            </ul>
            <p className="clinical-guide-disclaimer">Resultados podem variar conforme avaliação clínica individual.</p>
          </div>
        ) : null}

        {slide === 'care' ? (
          <div className="clinical-guide-presentation-fs-content clinical-guide-detail-grid">
            <section>
              <h3>Antes</h3>
              <ul className="clinical-guide-list">{(guide.preCare || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
            </section>
            <section>
              <h3>Depois</h3>
              <ul className="clinical-guide-list">{(guide.postCare || []).map((item, i) => <li key={i}>{item}</li>)}</ul>
            </section>
          </div>
        ) : null}

        {slide === 'faq' ? (
          <div className="clinical-guide-presentation-fs-content">
            <h2>Perguntas frequentes</h2>
            {(guide.faq || []).map((item, index) => (
              <div key={index} className="clinical-guide-faq-item open">
                <strong>{item.question}</strong>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <footer className="clinical-guide-presentation-fs-footer">
        <button type="button" onClick={prev} aria-label="Anterior"><ChevronLeft size={22} /></button>
        <span>{slideIndex + 1} / {slides.length}</span>
        <button type="button" onClick={next} aria-label="Próximo"><ChevronRight size={22} /></button>
      </footer>
    </div>,
    document.body,
  );
}
