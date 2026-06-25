import { MoreHorizontal, Pencil, Save, X } from 'lucide-react';
import { useState } from 'react';
import Button from '../../Button.jsx';

export default function ClinicCompactHeader({
  logoUrl,
  displayName,
  razaoSocial,
  documento,
  statusLabel,
  email,
  phone,
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
    <header className="clinic-header">
      <div className="clinic-header__left">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="clinic-header__logo" />
        ) : (
          <span className="clinic-header__logo clinic-header__logo--placeholder" aria-hidden>
            {(displayName || 'CL').slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="clinic-header__identity">
          <h1 className="clinic-header__name">{displayName || 'Clínica'}</h1>
          <p className="clinic-header__sub">{[razaoSocial, documento].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <div className="clinic-header__center">
        <div className="clinic-header__stat">
          <span className="clinic-header__stat-label">Status</span>
          <span className="clinic-header__badge">{statusLabel || 'Ativa'}</span>
        </div>
        <div className="clinic-header__stat">
          <span className="clinic-header__stat-label">E-mail</span>
          <span className="clinic-header__stat-value clinic-header__stat-value--email" title={email || undefined}>
            {email || '—'}
          </span>
        </div>
        <div className="clinic-header__stat">
          <span className="clinic-header__stat-label">Telefone</span>
          <span className="clinic-header__stat-value" title={phone || undefined}>{phone || '—'}</span>
        </div>
      </div>

      <div className="clinic-header__actions">
        {isEditing ? (
          <>
            <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>Cancelar</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={onSave} disabled={!canSave}>Salvar</Button>
          </>
        ) : (
          <>
            {canEdit ? <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Editar</Button> : null}
            {menuItems.length > 0 ? (
              <div className={`clinic-header__menu ${menuOpen ? 'is-open' : ''}`}>
                <button type="button" className="clinic-header__menu-btn" aria-label="Mais ações" onClick={() => setMenuOpen((v) => !v)}>
                  <MoreHorizontal size={16} />
                </button>
                <div className="clinic-header__menu-list">
                  {menuItems.map((item) => (
                    <button key={item.label} type="button" className="clinic-header__menu-item" onClick={() => { setMenuOpen(false); item.onClick?.(); }}>
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
