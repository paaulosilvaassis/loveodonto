import { useMemo, useState } from 'react';
import {
  ArrowLeft, Copy, Edit, Monitor, Plus, Trash2,
} from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { ClinicalGuideImageGallery, ClinicalGuideInlineImage } from './ClinicalGuideImageGallery.jsx';
import { ClinicalGuideBeforeAfter } from './ClinicalGuideBeforeAfter.jsx';
import { ClinicalGuideStepCards } from './ClinicalGuideStepCards.jsx';
import {
  canManageGuide,
  canUserManageClinicalGuides,
  getGuideBeforeAfter,
  listClinicalGuideImages,
  listGuideStepCards,
} from '../../../services/clinicalGuide/clinicalGuideService.js';
import { getCategoryLabel } from '../../../services/clinicalGuide/clinicalGuideCategories.js';

const DETAIL_TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'steps', label: 'Etapas' },
  { id: 'beforeAfter', label: 'Antes e Depois' },
  { id: 'gallery', label: 'Galeria' },
  { id: 'care', label: 'Cuidados' },
  { id: 'faq', label: 'FAQ' },
  { id: 'technical', label: 'Técnico' },
];

function BulletList({ items }) {
  if (!items?.length) return <p className="clinical-guide-muted">Não informado.</p>;
  return (
    <ul className="clinical-guide-list">
      {items.map((item, index) => (
        <li key={`${index}-${typeof item === 'string' ? item : item.title}`}>
          {typeof item === 'string' ? item : (
            <>
              <strong>{item.title}</strong>
              {item.description ? ` — ${item.description}` : null}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ClinicalGuideDetail({
  guide,
  user,
  onBack,
  onPresent,
  onAddToBudget,
  onEdit,
  onDuplicate,
  onDelete,
  patientView = false,
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const galleryImages = useMemo(
    () => listClinicalGuideImages(guide.id, { patientView }),
    [guide.id, patientView],
  );
  const beforeAfter = useMemo(() => getGuideBeforeAfter(guide), [guide]);
  const stepCards = useMemo(() => listGuideStepCards(guide), [guide]);

  const canEdit = canManageGuide(guide, user) || (guide.isSystemDefault && canUserManageClinicalGuides(user));
  const canDuplicate = guide.isSystemDefault;
  const canDelete = guide.isCustom && canManageGuide(guide, user);

  return (
    <div className="clinical-guide-detail clinical-guide-detail--premium">
      <div className="clinical-guide-detail-toolbar">
        <button type="button" className="clinical-guide-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          Biblioteca
        </button>
        <div className="clinical-guide-detail-actions">
          {onAddToBudget ? (
            <ClinicalBtn variant="secondary" size="sm" icon={Plus} onClick={() => onAddToBudget(guide)}>
              Adicionar ao orçamento
            </ClinicalBtn>
          ) : null}
          <ClinicalBtn variant="primary" size="sm" icon={Monitor} onClick={() => onPresent(guide)}>
            Apresentar ao paciente
          </ClinicalBtn>
          {canDuplicate ? (
            <ClinicalBtn variant="ghost" size="sm" icon={Copy} onClick={() => onDuplicate(guide)}>
              Duplicar e personalizar
            </ClinicalBtn>
          ) : null}
          {canEdit && !guide.isSystemDefault ? (
            <ClinicalBtn variant="ghost" size="sm" icon={Edit} onClick={() => onEdit(guide)}>
              Editar
            </ClinicalBtn>
          ) : null}
          {canDelete ? (
            <ClinicalBtn variant="ghost" size="sm" icon={Trash2} onClick={() => onDelete(guide)}>
              Excluir
            </ClinicalBtn>
          ) : null}
        </div>
      </div>

      <div className="clinical-guide-hero-premium">
        <div className="clinical-guide-hero-premium-photo">
          <ClinicalGuideInlineImage
            src={guide.coverImageUrl}
            alt={guide.title}
            className="clinical-guide-hero-premium-img"
          />
        </div>
        <div className="clinical-guide-hero-premium-info">
          <span className="clinical-guide-category-pill">{getCategoryLabel(guide.category)}</span>
          <h2>{guide.title}</h2>
          <p>{guide.shortDescription || guide.patientDescription?.slice(0, 220)}</p>
          {guide.averageDuration ? (
            <p className="clinical-guide-duration">
              <strong>Tempo médio:</strong>
              {' '}
              {guide.averageDuration}
            </p>
          ) : null}
        </div>
      </div>

      <div className="clinical-guide-detail-tabs clinical-guide-detail-tabs--premium">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`clinical-guide-detail-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="clinical-guide-detail-panel">
        {activeTab === 'overview' ? (
          <div className="clinical-guide-detail-grid">
            <section className="clinical-guide-detail-span-2">
              <h3>Para o paciente</h3>
              <p className="clinical-guide-prose">{guide.patientDescription}</p>
            </section>
            <section>
              <h3>Indicações</h3>
              <BulletList items={guide.indications} />
            </section>
            <section>
              <h3>Benefícios</h3>
              <BulletList items={guide.benefits} />
            </section>
            <section>
              <h3>Contraindicações</h3>
              <BulletList items={guide.contraindications} />
            </section>
            <section>
              <h3>Riscos e limitações</h3>
              <BulletList items={guide.risks} />
            </section>
          </div>
        ) : null}

        {activeTab === 'steps' ? (
          <section>
            <h3>Etapas do Tratamento</h3>
            <ClinicalGuideStepCards steps={stepCards} />
          </section>
        ) : null}

        {activeTab === 'beforeAfter' ? (
          <ClinicalGuideBeforeAfter
            beforeUrl={beforeAfter?.before}
            afterUrl={beforeAfter?.after}
          />
        ) : null}

        {activeTab === 'gallery' ? (
          <section>
            <h3>Galeria fotográfica</h3>
            <ClinicalGuideImageGallery images={galleryImages.filter((i) => !['before', 'after'].includes(i.imageType))} patientView={patientView} />
          </section>
        ) : null}

        {activeTab === 'care' ? (
          <div className="clinical-guide-detail-grid">
            <section>
              <h3>Cuidados antes</h3>
              <BulletList items={guide.preCare} />
            </section>
            <section>
              <h3>Cuidados depois</h3>
              <BulletList items={guide.postCare} />
            </section>
          </div>
        ) : null}

        {activeTab === 'faq' ? (
          <section className="clinical-guide-faq">
            {(guide.faq || []).length ? guide.faq.map((item, index) => (
              <details key={index} className="clinical-guide-faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            )) : <p className="clinical-guide-muted">Nenhuma pergunta frequente cadastrada.</p>}
          </section>
        ) : null}

        {activeTab === 'technical' ? (
          <div className="clinical-guide-detail-grid">
            <section>
              <h3>Descrição técnica</h3>
              <p className="clinical-guide-prose">{guide.technicalDescription}</p>
            </section>
            {!patientView && guide.internalNotes ? (
              <section>
                <h3>Observações clínicas internas</h3>
                <p className="clinical-guide-prose">{guide.internalNotes}</p>
              </section>
            ) : null}
            {guide.pdfUrl ? (
              <section>
                <h3>Material PDF</h3>
                <a href={guide.pdfUrl} target="_blank" rel="noopener noreferrer" className="button secondary sm">
                  Abrir PDF explicativo
                </a>
              </section>
            ) : null}
            {(guide.videos || []).length ? (
              <section className="clinical-guide-detail-span-2">
                <h3>Vídeos explicativos</h3>
                <div className="clinical-guide-video-grid">
                  {guide.videos.map((video, index) => (
                    <div key={`${video.url}-${index}`} className="clinical-guide-video-item">
                      {video.title ? <h4>{video.title}</h4> : null}
                      <video src={video.url} controls playsInline className="clinical-guide-video-player" />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
