import { SectionCard } from '../../components/SectionCard.jsx';

/**
 * Layout base para páginas do CRM Clínico.
 * @param {React.ReactNode} [actions] - Botões/ações do header (ex.: "Novo orçamento")
 */
export function CrmLayout({ title, description, actions, children }) {
  return (
    <div className="stack">
      <SectionCard title={title} description={description} actions={actions}>
        {children}
      </SectionCard>
    </div>
  );
}
