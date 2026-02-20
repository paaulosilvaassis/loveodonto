import { Link } from 'react-router-dom';

/**
 * Card de acesso rápido com ícone, título e subtítulo
 * @param {Object} props
 * @param {string} props.to - Rota de destino
 * @param {React.ReactNode} props.icon - Ícone (lucide-react)
 * @param {string} props.title - Título do card
 * @param {string} props.subtitle - Subtítulo/descrição curta
 * @param {string} props.className - Classes CSS adicionais
 */
export default function QuickAccessCard({ to, icon: Icon, title, subtitle, className = '' }) {
  return (
    <Link to={to} className={`quick-access-card ${className}`.trim()} aria-label={`Acessar ${title}`}>
      <div className="quick-access-card-icon">
        {Icon && <Icon size={32} />}
      </div>
      <div className="quick-access-card-content">
        <h3 className="quick-access-card-title">{title}</h3>
        <p className="quick-access-card-subtitle">{subtitle}</p>
      </div>
    </Link>
  );
}
