import { SectionCard } from '../../components/SectionCard.jsx';

/**
 * Layout base para módulos do CRM Clínico.
 * Título, descrição e conteúdo (placeholder ou futuro).
 */
export function CrmModulePage({ title, description, children }) {
  return (
    <div className="stack">
      <SectionCard title={title} description={description}>
        {children}
      </SectionCard>
    </div>
  );
}
