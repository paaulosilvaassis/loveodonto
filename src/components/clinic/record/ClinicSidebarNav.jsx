import {
  Home, Building2, FileText, Receipt, Phone, MapPin, Clock, FolderOpen,
  Mail, Server, FileKey, Plug, Globe, BadgeCheck, Inbox,
} from 'lucide-react';

export const CLINIC_NAV = [
  { value: 'geral', label: 'Visão geral', icon: Home },
  { value: 'cadastro', label: 'Dados cadastrais', icon: Building2 },
  { value: 'documentacao', label: 'Documentação', icon: FileText },
  { value: 'tributacao', label: 'Tributação', icon: Receipt },
  { value: 'telefones', label: 'Telefones', icon: Phone },
  { value: 'enderecos', label: 'Endereços', icon: MapPin },
  { value: 'horarios', label: 'Horários', icon: Clock },
  { value: 'arquivos', label: 'Arquivos', icon: FolderOpen },
  { value: 'correspondencias', label: 'Correspondências', icon: Inbox },
  { value: 'email', label: 'Servidores de e-mail', icon: Server },
  { value: 'nfse', label: 'Dados NFSe', icon: FileKey },
  { value: 'integracoes', label: 'Integrações', icon: Plug },
  { value: 'web', label: 'Presença Web', icon: Globe },
  { value: 'licenca', label: 'Licença de Uso', icon: BadgeCheck },
];

export default function ClinicSidebarNav({ active, onChange }) {
  return (
    <nav className="clinic-sidebar" aria-label="Seções da clínica">
      <ul className="clinic-sidebar__list">
        {CLINIC_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.value;
          return (
            <li key={item.value}>
              <button
                type="button"
                className={`clinic-sidebar__item ${isActive ? 'is-active' : ''}`}
                onClick={() => onChange(item.value)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={15} aria-hidden className="clinic-sidebar__icon" />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
