import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import {
  ModalRoot, ModalContent, ModalBody,
} from '../../ui/Modal.jsx';

export function ClinicalGuideInlineImage({ src, alt = '', className = '', style, onDoubleClick }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`clinical-guide-image-fallback ${className}`.trim()} role="img" aria-label={alt || 'Imagem indisponível'}>
        <ImageOff size={28} aria-hidden />
        <span>{alt || 'Imagem indisponível'}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
      onDoubleClick={onDoubleClick}
    />
  );
}

export function ClinicalGuideImageGallery({ images = [], patientView = false }) {
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const visible = images.filter((img) => !patientView || img.visibleToPatient !== false);

  if (!visible.length) {
    return <p className="clinical-guide-muted">Nenhuma imagem cadastrada para este tratamento.</p>;
  }

  const closeFullscreen = () => {
    setFullscreenIndex(null);
    setZoom(1);
  };
  const showPrev = () => {
    setFullscreenIndex((i) => (i > 0 ? i - 1 : visible.length - 1));
    setZoom(1);
  };
  const showNext = () => {
    setFullscreenIndex((i) => (i < visible.length - 1 ? i + 1 : 0));
    setZoom(1);
  };
  const toggleZoom = () => setZoom((z) => (z > 1 ? 1 : 2));

  return (
    <>
      <div className="clinical-guide-gallery">
        {visible.map((img, index) => (
          <button
            key={img.id}
            type="button"
            className="clinical-guide-gallery-item"
            onClick={() => setFullscreenIndex(index)}
          >
            <ClinicalGuideInlineImage src={img.imageUrl} alt={img.caption || 'Imagem do tratamento'} />
            {img.caption ? <span>{img.caption}</span> : null}
          </button>
        ))}
      </div>

      <ModalRoot open={fullscreenIndex != null} onOpenChange={(open) => { if (!open) closeFullscreen(); }}>
        <ModalContent size="xl" className="clinical-guide-fullscreen-modal">
          <ModalBody>
            <div className="clinical-guide-fullscreen">
              <button type="button" className="clinical-guide-fullscreen-close" onClick={closeFullscreen} aria-label="Fechar">
                <X size={20} />
              </button>
              {fullscreenIndex != null ? (
                <>
                  <button type="button" className="clinical-guide-fullscreen-nav prev" onClick={showPrev} aria-label="Anterior">
                    <ChevronLeft size={24} />
                  </button>
                  <figure className="clinical-guide-fullscreen-figure">
                    <ClinicalGuideInlineImage
                      src={visible[fullscreenIndex].imageUrl}
                      alt={visible[fullscreenIndex].caption || ''}
                      className="clinical-guide-fullscreen-img"
                      style={{ transform: `scale(${zoom})` }}
                      onDoubleClick={toggleZoom}
                    />
                    <div className="clinical-guide-fullscreen-toolbar">
                      <button type="button" className="button ghost sm" onClick={toggleZoom}>
                        {zoom > 1 ? 'Reduzir' : 'Ampliar'}
                      </button>
                      <span>{fullscreenIndex + 1} / {visible.length}</span>
                    </div>
                    {visible[fullscreenIndex].caption ? (
                      <figcaption>{visible[fullscreenIndex].caption}</figcaption>
                    ) : null}
                  </figure>
                  <button type="button" className="clinical-guide-fullscreen-nav next" onClick={showNext} aria-label="Próxima">
                    <ChevronRight size={24} />
                  </button>
                </>
              ) : null}
            </div>
          </ModalBody>
        </ModalContent>
      </ModalRoot>
    </>
  );
}
