import { MoreHorizontal, Pencil, Save, X } from 'lucide-react';
import { useState } from 'react';
import Button from '../../Button.jsx';
import { accessStatusBadgeClass } from '../../../utils/inviteStatus.js';

export default function CollaboratorCompactHeader({
  fotoUrl,
  initials,
  displayName,
  cargo,
  categoria,
  especialidade,
  rhStatusLabel,
  rhActive,
  accessStatus,
  accessProfile,
  ultimoAcesso,
  isEditing,
  canEdit,
  canSave,
  menuItems = [],
  onEdit,
  onSave,
  onCancel,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="cr-header">
      <div className="cr-header__left">
        {fotoUrl ? (
          <img src={fotoUrl} alt="" className="cr-header__avatar cr-header__avatar--photo" />
        ) : (
          <span className="cr-header__avatar" aria-hidden>{initials}</span>
        )}
        <div className="cr-header__identity">
          <h1 className="cr-header__name">{displayName}</h1>
          <p className="cr-header__role">
            {[cargo, categoria, especialidade && especialidade !== '—' ? especialidade : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="cr-header__center">
        <div className="cr-header__stat">
          <span className="cr-header__stat-label">RH</span>
          <span className={`team-rh-badge ${rhActive ? 'team-rh-badge--active' : 'team-rh-badge--inactive'}`}>{rhStatusLabel}</span>
        </div>
        <div className="cr-header__stat">
          <span className="cr-header__stat-label">Acesso</span>
          <span className={accessStatusBadgeClass(accessStatus?.key)}>{accessStatus?.label || '—'}</span>
        </div>
        <div className="cr-header__stat">
          <span className="cr-header__stat-label">Perfil</span>
          <span className="cr-header__stat-value">{accessProfile || '—'}</span>
        </div>
        <div className="cr-header__stat">
          <span className="cr-header__stat-label">Último acesso</span>
          <span className="cr-header__stat-value">{ultimoAcesso || '—'}</span>
        </div>
      </div>

      <div className="cr-header__actions">
        {isEditing ? (
          <>
            <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>Cancelar</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={onSave} disabled={!canSave}>Salvar</Button>
          </>
        ) : (
          <>
            {canEdit ? <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Editar</Button> : null}
            {menuItems.length > 0 ? (
              <div className={`cr-header__menu ${menuOpen ? 'is-open' : ''}`}>
                <button type="button" className="cr-header__menu-btn" aria-label="Mais ações" onClick={() => setMenuOpen((v) => !v)}>
                  <MoreHorizontal size={16} />
                </button>
                <div className="cr-header__menu-list">
                  {menuItems.map((item) => (
                    <button key={item.label} type="button" className={`cr-header__menu-item ${item.danger ? 'is-danger' : ''}`} onClick={() => { setMenuOpen(false); item.onClick?.(); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </header>
  );
}
