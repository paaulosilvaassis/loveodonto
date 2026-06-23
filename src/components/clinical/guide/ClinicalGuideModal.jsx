import { useMemo, useState, useEffect } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalTitle, ModalDescription,
} from '../../ui/Modal.jsx';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { ClinicalGuideDetail } from './ClinicalGuideDetail.jsx';
import { ClinicalGuideFormModal } from './ClinicalGuideFormModal.jsx';
import { ClinicalGuidePresentation } from './ClinicalGuidePresentation.jsx';
import { ClinicalGuideInlineImage } from './ClinicalGuideImageGallery.jsx';
import {
  CLINICAL_GUIDE_CATEGORIES,
  getCategoryLabel,
} from '../../../services/clinicalGuide/clinicalGuideCategories.js';
import {
  duplicateClinicalGuide,
  ensureClinicalGuidesSeeded,
  getClinicalGuide,
  listClinicalGuides,
  searchClinicalGuides,
  softDeleteClinicalGuide,
  canUserManageClinicalGuides,
} from '../../../services/clinicalGuide/clinicalGuideService.js';

export function ClinicalGuideModal({
  open,
  onOpenChange,
  user,
  initialGuideId = null,
  initialCategory = null,
  onAddToBudget,
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialCategory || 'all');
  const [selectedGuideId, setSelectedGuideId] = useState(initialGuideId);
  const [presentationGuide, setPresentationGuide] = useState(null);
  const [formGuide, setFormGuide] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (open && initialGuideId) {
      setSelectedGuideId(initialGuideId);
    }
  }, [open, initialGuideId]);

  ensureClinicalGuidesSeeded();

  const guides = useMemo(() => {
    const opts = { category: category === 'all' ? null : category };
    return query.trim()
      ? searchClinicalGuides(user, query, opts)
      : listClinicalGuides(user, opts);
  }, [user, query, category, refreshKey]);

  const selectedGuide = selectedGuideId ? getClinicalGuide(selectedGuideId, user) : null;
  const canManage = canUserManageClinicalGuides(user);

  const handleOpenChange = (next) => {
    if (!next) {
      setSelectedGuideId(null);
      setQuery('');
      setCategory(initialCategory || 'all');
    }
    onOpenChange(next);
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const handleDuplicate = (guide) => {
    try {
      const copy = duplicateClinicalGuide(guide.id, user);
      refresh();
      setSelectedGuideId(copy.id);
    } catch (error) {
      window.alert(error.message);
    }
  };

  const handleDelete = (guide) => {
    if (!window.confirm(`Excluir o guia "${guide.title}"? Esta ação pode ser revertida apenas por um administrador.`)) return;
    try {
      softDeleteClinicalGuide(user, guide.id);
      setSelectedGuideId(null);
      refresh();
    } catch (error) {
      window.alert(error.message);
    }
  };

  return (
    <>
      <ModalRoot open={open} onOpenChange={handleOpenChange}>
        <ModalContent size="xl" className="clinical-guide-modal">
          <ModalHeader>
            <ModalTitle>Guia Clínico do Dentista</ModalTitle>
            <ModalDescription>
              Biblioteca visual para explicar tratamentos ao paciente durante o orçamento.
            </ModalDescription>
          </ModalHeader>
          <ModalBody className="clinical-guide-modal-body">
            {selectedGuide ? (
              <ClinicalGuideDetail
                guide={selectedGuide}
                user={user}
                onBack={() => setSelectedGuideId(null)}
                onPresent={(guide) => setPresentationGuide(guide)}
                onAddToBudget={onAddToBudget}
                onEdit={(guide) => { setFormGuide(guide); setFormOpen(true); }}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            ) : (
              <div className="clinical-guide-library">
                <aside className="clinical-guide-sidebar">
                  <div className="clinical-guide-search">
                    <Search size={16} aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar tratamento…"
                    />
                  </div>
                  <nav className="clinical-guide-categories">
                    <button
                      type="button"
                      className={category === 'all' ? 'is-active' : ''}
                      onClick={() => setCategory('all')}
                    >
                      Todos
                    </button>
                    {CLINICAL_GUIDE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={category === cat.id ? 'is-active' : ''}
                        onClick={() => setCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </nav>
                  {canManage ? (
                    <ClinicalBtn
                      variant="secondary"
                      size="sm"
                      icon={Plus}
                      onClick={() => { setFormGuide(null); setFormOpen(true); }}
                    >
                      Criar guia do zero
                    </ClinicalBtn>
                  ) : null}
                </aside>

                <div className="clinical-guide-cards">
                  {guides.length ? guides.map((guide) => (
                    <button
                      key={guide.id}
                      type="button"
                      className="clinical-guide-card"
                      onClick={() => setSelectedGuideId(guide.id)}
                    >
                      <div className="clinical-guide-card-cover">
                        {guide.coverImageUrl ? (
                          <ClinicalGuideInlineImage src={guide.coverImageUrl} alt="" />
                        ) : (
                          <BookOpen size={28} aria-hidden />
                        )}
                      </div>
                      <div className="clinical-guide-card-body">
                        <span className="clinical-guide-category-pill">{getCategoryLabel(guide.category)}</span>
                        <strong>{guide.title}</strong>
                        <p>{guide.shortDescription || 'Conteúdo educativo para apresentação ao paciente.'}</p>
                        {guide.isSystemDefault ? (
                          <span className="clinical-guide-badge">Padrão do sistema</span>
                        ) : (
                          <span className="clinical-guide-badge custom">Personalizado</span>
                        )}
                      </div>
                    </button>
                  )) : (
                    <p className="clinical-guide-muted">Nenhum guia encontrado para esta busca.</p>
                  )}
                </div>
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </ModalRoot>

      <ClinicalGuidePresentation
        guide={presentationGuide}
        open={Boolean(presentationGuide)}
        onClose={() => setPresentationGuide(null)}
      />

      <ClinicalGuideFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        user={user}
        guide={formGuide}
        onSaved={() => {
          refresh();
          if (formGuide?.id) setSelectedGuideId(formGuide.id);
        }}
      />
    </>
  );
}
