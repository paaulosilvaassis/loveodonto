import {
  Home, User, FileText, Briefcase, MapPin, Phone, Clock, Wallet, Shield, Settings,
} from 'lucide-react';

export const RECORD_NAV = [
  { value: 'geral', label: 'Visão geral', icon: Home },
  { value: 'pessoais', label: 'Dados pessoais', icon: User },
  { value: 'documentos', label: 'Documentos', icon: FileText },
  { value: 'profissional', label: 'Profissional', icon: Briefcase },
  { value: 'endereco', label: 'Endereço', icon: MapPin },
  { value: 'contatos', label: 'Contatos', icon: Phone },
  { value: 'horarios', label: 'Horários', icon: Clock },
  { value: 'financeiro', label: 'Financeiro', icon: Wallet },
  { value: 'acesso', label: 'Acesso ao sistema', icon: Shield },
  { value: 'permissoes', label: 'Permissões', icon: Settings },
];

export default function CollaboratorSidebarNav({ active, onChange }) {
  return (
    <nav className="cr-sidebar" aria-label="Seções da ficha">
      <ul className="cr-sidebar__list">
        {RECORD_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.value;
          return (
            <li key={item.value}>
              <button
                type="button"
                className={`cr-sidebar__item ${isActive ? 'is-active' : ''}`}
                onClick={() => onChange(item.value)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={15} aria-hidden className="cr-sidebar__icon" />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
