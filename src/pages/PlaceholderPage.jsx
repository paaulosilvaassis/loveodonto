import { useLocation } from 'react-router-dom';
import { Section } from '../components/Section.jsx';

export default function PlaceholderPage({ title, description }) {
  const location = useLocation();

  return (
    <div className="stack">
      <Section title={title || 'Em construção'}>
        <p className="muted">
          {description || 'Este módulo está em desenvolvimento. Em breve teremos novidades.'}
        </p>
        <div className="card">
          <strong>Rota</strong>
          <div className="muted">{location.pathname}</div>
        </div>
      </Section>
    </div>
  );
}
