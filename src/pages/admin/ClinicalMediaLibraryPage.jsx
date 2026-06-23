import { useMemo, useState } from 'react';
import { Search, Star, Trash2, Upload } from 'lucide-react';
import { Section } from '../../components/Section.jsx';
import { SectionCard } from '../../components/SectionCard.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { CLINICAL_GUIDE_CATEGORIES } from '../../services/clinicalGuide/clinicalGuideCategories.js';
import {
  listClinicalMedia,
  toggleClinicalMediaFavorite,
  uploadClinicalMediaFile,
  softDeleteClinicalMedia,
} from '../../services/clinicalGuide/clinicalMediaLibraryService.js';
import { ClinicalGuideInlineImage } from '../../components/clinical/guide/ClinicalGuideImageGallery.jsx';

export default function ClinicalMediaLibraryPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const items = useMemo(
    () => listClinicalMedia(user, {
      category: category === 'all' ? null : category,
      query,
      favoritesOnly,
    }),
    [user, category, query, favoritesOnly, refreshKey],
  );

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadClinicalMediaFile(user, file, { category: category === 'all' ? 'geral' : category });
      setToast('Imagem enviada com sucesso.');
      setRefreshKey((k) => k + 1);
    } catch (error) {
      setToast(error.message || 'Erro ao enviar imagem.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  return (
    <div className="stack">
      <Section title="Biblioteca de Imagens Clínicas">
        <SectionCard>
          <p className="clinical-guide-muted" style={{ marginBottom: '1rem' }}>
            Centralize fotos reais da clínica para usar nos Guias Clínicos. Organize por categoria, marque favoritos e substitua as imagens padrão nos guias personalizados.
          </p>

          <div className="clinical-media-toolbar">
            <label className="clinical-guide-search clinical-media-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título ou tag…"
              />
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">Todas as categorias</option>
              {CLINICAL_GUIDE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
            <label className="clinical-guide-checkbox">
              <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
              Somente favoritos
            </label>
            <label className="button primary sm clinical-media-upload">
              <Upload size={14} />
              {busy ? 'Enviando…' : 'Upload de foto'}
              <input type="file" accept="image/*" onChange={handleUpload} disabled={busy} hidden />
            </label>
          </div>

          <div className="clinical-media-grid">
            {items.length ? items.map((item) => (
              <article key={item.id} className="clinical-media-card">
                <ClinicalGuideInlineImage src={item.imageUrl} alt={item.title} className="clinical-media-card-img" />
                <div className="clinical-media-card-body">
                  <strong>{item.title}</strong>
                  <p>{item.caption || item.category}</p>
                  <div className="clinical-media-card-actions">
                    <button
                      type="button"
                      className={`button ghost sm${item.isFavorite ? ' is-favorite' : ''}`}
                      onClick={() => {
                        toggleClinicalMediaFavorite(user, item.id);
                        setRefreshKey((k) => k + 1);
                      }}
                    >
                      <Star size={14} />
                    </button>
                    <button
                      type="button"
                      className="button ghost sm"
                      onClick={() => {
                        if (!window.confirm('Excluir esta imagem da biblioteca?')) return;
                        softDeleteClinicalMedia(user, item.id);
                        setRefreshKey((k) => k + 1);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <p className="clinical-guide-muted">Nenhuma imagem na biblioteca. Faça upload das fotos da clínica.</p>
            )}
          </div>
        </SectionCard>
      </Section>

      {toast ? <div className="toast success" role="status">{toast}</div> : null}
    </div>
  );
}
