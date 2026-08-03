import { useEffect, useMemo, useState } from 'react';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalTitle, ModalDescription,
} from '../../ui/Modal.jsx';
import { CLINICAL_GUIDE_CATEGORIES } from '../../../services/clinicalGuide/clinicalGuideCategories.js';
import {
  createClinicalGuide,
  updateClinicalGuide,
  uploadClinicalGuideImageFile,
  uploadClinicalGuidePdfFile,
  listClinicalGuideImages,
  removeClinicalGuideImage,
  getClinicalGuide,
} from '../../../services/clinicalGuide/clinicalGuideService.js';
import { ClinicalGuideInlineImage } from './ClinicalGuideImageGallery.jsx';

function linesToArray(text) {
  return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function arrayToLines(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function stepsToText(steps) {
  if (!Array.isArray(steps)) return '';
  return steps.map((s) => `${s.title || ''}|${s.description || ''}`).join('\n');
}

function textToSteps(text) {
  return linesToArray(text).map((line) => {
    const [title, ...rest] = line.split('|');
    return { title: title?.trim() || line, description: rest.join('|').trim() };
  });
}

function videosToText(videos) {
  if (!Array.isArray(videos)) return '';
  return videos.map((v) => (typeof v === 'string' ? v : `${v.title || ''}|${v.url || ''}`)).join('\n');
}

function textToVideos(text) {
  return linesToArray(text).map((line) => {
    const [title, ...rest] = line.split('|');
    const url = rest.join('|').trim() || title?.trim();
    return { title: rest.length ? title?.trim() : '', url };
  }).filter((v) => v.url);
}

const EMPTY = {
  title: '',
  category: 'dentistica_estetica',
  shortDescription: '',
  patientDescription: '',
  technicalDescription: '',
  indications: '',
  contraindications: '',
  treatmentSteps: '',
  preCare: '',
  postCare: '',
  benefits: '',
  risks: '',
  averageDuration: '',
  faq: '',
  internalNotes: '',
  visibility: 'all',
  active: true,
  videos: '',
  pdfUrl: '',
};

const IMAGE_TYPE_LABELS = {
  cover: 'Capa',
  step: 'Etapa',
  gallery: 'Galeria',
  before: 'Antes',
  after: 'Depois',
};

export function ClinicalGuideFormModal({
  open,
  onOpenChange,
  user,
  guide = null,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageType, setImageType] = useState('gallery');
  const [mediaKey, setMediaKey] = useState(0);

  const guideImages = useMemo(
    () => (guide?.id ? listClinicalGuideImages(guide.id) : []),
    [guide?.id, mediaKey],
  );

  useEffect(() => {
    if (!open) return;
    if (guide) {
      setForm({
        title: guide.title || '',
        category: guide.category || 'dentistica_estetica',
        shortDescription: guide.shortDescription || '',
        patientDescription: guide.patientDescription || '',
        technicalDescription: guide.technicalDescription || '',
        indications: arrayToLines(guide.indications),
        contraindications: arrayToLines(guide.contraindications),
        treatmentSteps: stepsToText(guide.treatmentSteps),
        preCare: arrayToLines(guide.preCare),
        postCare: arrayToLines(guide.postCare),
        benefits: arrayToLines(guide.benefits),
        risks: arrayToLines(guide.risks),
        averageDuration: guide.averageDuration || '',
        faq: '',
        internalNotes: guide.internalNotes || '',
        visibility: guide.visibility || 'all',
        active: guide.active !== false,
        videos: videosToText(guide.videos),
        pdfUrl: guide.pdfUrl || '',
      });
    } else {
      setForm(EMPTY);
    }
    setError('');
  }, [open, guide]);

  const patch = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const refreshMedia = () => setMediaKey((k) => k + 1);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        category: form.category,
        shortDescription: form.shortDescription,
        patientDescription: form.patientDescription,
        technicalDescription: form.technicalDescription,
        indications: linesToArray(form.indications),
        contraindications: linesToArray(form.contraindications),
        treatmentSteps: textToSteps(form.treatmentSteps),
        preCare: linesToArray(form.preCare),
        postCare: linesToArray(form.postCare),
        benefits: linesToArray(form.benefits),
        risks: linesToArray(form.risks),
        averageDuration: form.averageDuration,
        internalNotes: form.internalNotes,
        visibility: form.visibility,
        active: form.active,
        videos: textToVideos(form.videos),
        pdfUrl: form.pdfUrl,
      };
      const saved = guide
        ? updateClinicalGuide(user, guide.id, payload)
        : createClinicalGuide(user, payload);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Erro ao salvar guia.');
    } finally {
      setBusy(false);
    }
  };

  const handleImageUpload = async (event, type = imageType) => {
    const file = event.target.files?.[0];
    if (!file || !guide?.id) return;
    setBusy(true);
    try {
      await uploadClinicalGuideImageFile(user, guide.id, file, {
        imageType: type,
        setAsCover: type === 'cover',
      });
      refreshMedia();
      onSaved?.(getClinicalGuide(guide.id, user));
    } catch (err) {
      setError(err.message || 'Erro ao enviar imagem.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !guide?.id) return;
    setBusy(true);
    try {
      const pdfUrl = await uploadClinicalGuidePdfFile(user, guide.id, file);
      patch('pdfUrl', pdfUrl);
      onSaved?.(getClinicalGuide(guide.id, user));
    } catch (err) {
      setError(err.message || 'Erro ao enviar PDF.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleRemoveImage = async (imageId) => {
    if (!guide?.id || !window.confirm('Remover esta imagem do guia?')) return;
    setBusy(true);
    try {
      removeClinicalGuideImage(user, imageId);
      refreshMedia();
      onSaved?.(getClinicalGuide(guide.id, user));
    } catch (err) {
      setError(err.message || 'Erro ao remover imagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>{guide ? 'Editar guia clínico' : 'Criar guia do zero'}</ModalTitle>
          <ModalDescription>
            Conteúdo educativo com fotos reais para apresentação ao paciente. Evite promessas de resultado.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <form id="clinical-guide-form" className="clinical-guide-form" onSubmit={handleSubmit}>
            <label>
              Nome do tratamento
              <input value={form.title} onChange={(e) => patch('title', e.target.value)} required />
            </label>
            <label>
              Categoria
              <select value={form.category} onChange={(e) => patch('category', e.target.value)}>
                {CLINICAL_GUIDE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </label>
            <label>
              Resumo curto
              <input value={form.shortDescription} onChange={(e) => patch('shortDescription', e.target.value)} />
            </label>
            <label>
              Descrição para o paciente
              <textarea rows={4} value={form.patientDescription} onChange={(e) => patch('patientDescription', e.target.value)} />
            </label>
            <label>
              Descrição técnica
              <textarea rows={3} value={form.technicalDescription} onChange={(e) => patch('technicalDescription', e.target.value)} />
            </label>
            <label>
              Indicações (uma por linha)
              <textarea rows={3} value={form.indications} onChange={(e) => patch('indications', e.target.value)} />
            </label>
            <label>
              Contraindicações (uma por linha)
              <textarea rows={3} value={form.contraindications} onChange={(e) => patch('contraindications', e.target.value)} />
            </label>
            <label>
              Etapas (formato: Título|Descrição — uma por linha)
              <textarea rows={4} value={form.treatmentSteps} onChange={(e) => patch('treatmentSteps', e.target.value)} />
            </label>
            <label>
              Cuidados antes (uma por linha)
              <textarea rows={2} value={form.preCare} onChange={(e) => patch('preCare', e.target.value)} />
            </label>
            <label>
              Cuidados depois (uma por linha)
              <textarea rows={2} value={form.postCare} onChange={(e) => patch('postCare', e.target.value)} />
            </label>
            <label>
              Benefícios (uma por linha)
              <textarea rows={2} value={form.benefits} onChange={(e) => patch('benefits', e.target.value)} />
            </label>
            <label>
              Riscos e limitações (uma por linha)
              <textarea rows={2} value={form.risks} onChange={(e) => patch('risks', e.target.value)} />
            </label>
            <label>
              Tempo médio de tratamento
              <input value={form.averageDuration} onChange={(e) => patch('averageDuration', e.target.value)} />
            </label>
            <label>
              Vídeos (formato: Título|URL — uma por linha)
              <textarea rows={2} value={form.videos} onChange={(e) => patch('videos', e.target.value)} placeholder="Apresentação do tratamento|https://..." />
            </label>
            <label>
              PDF explicativo (URL)
              <input value={form.pdfUrl} onChange={(e) => patch('pdfUrl', e.target.value)} placeholder="https://... ou envie arquivo abaixo" />
            </label>

            {guide?.id ? (
              <fieldset className="clinical-guide-form-media">
                <legend>Mídia visual</legend>
                <p className="clinical-guide-muted">
                  Use fotos reais da clínica. A foto principal aparece em destaque na apresentação ao paciente.
                </p>

                {guide.coverImageUrl ? (
                  <div className="clinical-guide-form-cover-preview">
                    <ClinicalGuideInlineImage src={guide.coverImageUrl} alt="Capa atual" className="clinical-guide-form-cover-img" />
                    <span>Foto principal atual</span>
                  </div>
                ) : null}

                <div className="clinical-guide-form-media-row">
                  <label>
                    Foto principal
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'cover')} disabled={busy} />
                  </label>
                  <label>
                    Antes
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'before')} disabled={busy} />
                  </label>
                  <label>
                    Depois
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'after')} disabled={busy} />
                  </label>
                </div>

                <div className="clinical-guide-form-media-row">
                  <label>
                    Tipo da próxima imagem
                    <select value={imageType} onChange={(e) => setImageType(e.target.value)}>
                      <option value="gallery">Galeria</option>
                      <option value="step">Etapa do tratamento</option>
                    </select>
                  </label>
                  <label>
                    Adicionar à galeria / etapas
                    <input type="file" accept="image/*" onChange={handleImageUpload} disabled={busy} />
                  </label>
                  <label>
                    Enviar PDF
                    <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={busy} />
                  </label>
                </div>

                {guideImages.length ? (
                  <div className="clinical-guide-form-image-list">
                    {guideImages.map((img) => (
                      <div key={img.id} className="clinical-guide-form-image-item">
                        <ClinicalGuideInlineImage src={img.imageUrl} alt={img.caption} />
                        <div>
                          <strong>{IMAGE_TYPE_LABELS[img.imageType] || img.imageType}</strong>
                          <p>{img.caption || 'Sem legenda'}</p>
                          <button type="button" className="button ghost sm" onClick={() => handleRemoveImage(img.id)} disabled={busy}>
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </fieldset>
            ) : (
              <p className="clinical-guide-muted">Salve o guia primeiro para enviar fotos, antes/depois e PDF.</p>
            )}

            <label>
              Observações internas
              <textarea rows={2} value={form.internalNotes} onChange={(e) => patch('internalNotes', e.target.value)} />
            </label>
            <div className="clinical-guide-form-row">
              <label>
                Visibilidade
                <select value={form.visibility} onChange={(e) => patch('visibility', e.target.value)}>
                  <option value="all">Todos os dentistas</option>
                  <option value="creator_only">Apenas quem criou</option>
                </select>
              </label>
              <label className="clinical-guide-checkbox">
                <input type="checkbox" checked={form.active} onChange={(e) => patch('active', e.target.checked)} />
                Ativo
              </label>
            </div>
            {error ? <p className="clinical-guide-error" role="alert">{error}</p> : null}
          </form>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button ghost" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button type="submit" form="clinical-guide-form" className="button primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar guia'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
