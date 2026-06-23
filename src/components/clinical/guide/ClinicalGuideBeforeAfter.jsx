import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { ClinicalGuideInlineImage } from './ClinicalGuideImageGallery.jsx';
import {
  ModalRoot, ModalContent, ModalBody,
} from '../../ui/Modal.jsx';

export function ClinicalGuideBeforeAfter({ beforeUrl, afterUrl, title = 'Antes e Depois' }) {
  const [position, setPosition] = useState(50);
  const [fullscreen, setFullscreen] = useState(false);

  if (!beforeUrl || !afterUrl) {
    return <p className="clinical-guide-muted">Imagens de antes e depois não cadastradas para este tratamento.</p>;
  }

  const CompareView = ({ className = '' }) => (
    <div className={`clinical-guide-compare ${className}`.trim()}>
      <ClinicalGuideInlineImage src={afterUrl} alt="Depois" className="clinical-guide-compare-after" />
      <div className="clinical-guide-compare-before-wrap" style={{ width: `${position}%` }}>
        <ClinicalGuideInlineImage src={beforeUrl} alt="Antes" className="clinical-guide-compare-before" />
      </div>
      <div className="clinical-guide-compare-handle" style={{ left: `${position}%` }} aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="clinical-guide-compare-slider"
        aria-label="Comparar antes e depois"
      />
      <div className="clinical-guide-compare-labels">
        <span>Antes</span>
        <span>Depois</span>
      </div>
    </div>
  );

  return (
    <section className="clinical-guide-before-after">
      <div className="clinical-guide-before-after-header">
        <h3>{title}</h3>
        <button type="button" className="button ghost sm" onClick={() => setFullscreen(true)}>
          <Maximize2 size={14} />
          Tela cheia
        </button>
      </div>
      <CompareView />
      <p className="clinical-guide-disclaimer">
        Imagens ilustrativas de referência. Resultados podem variar conforme avaliação clínica de cada paciente.
      </p>

      <ModalRoot open={fullscreen} onOpenChange={setFullscreen}>
        <ModalContent size="xl" className="clinical-guide-fullscreen-modal">
          <ModalBody>
            <CompareView className="clinical-guide-compare--fullscreen" />
          </ModalBody>
        </ModalContent>
      </ModalRoot>
    </section>
  );
}
