import { useEffect, useRef, useState } from 'react';
import {
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Save,
  Shield,
  UserX,
  X,
} from 'lucide-react';
import Button from '../Button.jsx';
import AppAvatar from '../common/AppAvatar.jsx';
import { accessStatusBadgeClass } from '../../utils/inviteStatus.js';

export default function CollaboratorRecordHeader({
  collaborator,
  fotoUrl,
  initials,
  displayName,
  cargoLine,
  rhStatusLabel,
  rhActive,
  accessStatus,
  email,
  phone,
  isEditing,
  canEdit,
  canSave,
  saving = false,
  onEdit,
  onSave,
  onCancel,
  onOpenAccess,
  onDeactivate,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const photoSrc = fotoUrl || collaborator?.fotoUrl || collaborator?.profile?.fotoUrl;

  return (
    <header className="collaborator-record-header">
      <div className="collaborator-record-header__main">
        <div className="collaborator-record-header__identity">
          <AppAvatar
            user={collaborator}
            name={displayName}
            photoUrl={photoSrc}
            fallbackInitials={initials}
            className="collaborator-record-header__avatar"
            size="inherit"
          />
          <div className="collaborator-record-header__text">
            <h2 className="collaborator-record-header__name">{displayName}</h2>
            {cargoLine ? <p className="collaborator-record-header__role">{cargoLine}</p> : null}
            <div className="collaborator-record-header__badges">
              <span className={`team-rh-badge ${rhActive ? 'team-rh-badge--active' : 'team-rh-badge--inactive'}`}>
                {rhStatusLabel}
              </span>
              {accessStatus ? (
                <span className={accessStatusBadgeClass(accessStatus.key)}>
                  {accessStatus.label}
                </span>
              ) : null}
            </div>
            <div className="collaborator-record-header__contacts">
              {email ? (
                <span className="collaborator-record-header__contact">
                  <Mail size={14} aria-hidden />
                  {email}
                </span>
              ) : null}
              {phone ? (
                <span className="collaborator-record-header__contact">
                  <Phone size={14} aria-hidden />
                  {phone}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="collaborator-record-header__actions">
          {isEditing ? (
            <>
              <Button variant="ghost" icon={X} onClick={onCancel} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                icon={Save}
                onClick={onSave}
                disabled={!canSave || saving}
                loading={saving}
              >
                Salvar alterações
              </Button>
            </>
          ) : (
            <>
              {canEdit ? (
                <Button variant="secondary" icon={Pencil} onClick={onEdit}>
                  Editar
                </Button>
              ) : null}
              <div className="team-row-menu" ref={menuRef}>
                <button
                  type="button"
                  className="team-row-menu__trigger"
                  aria-label="Mais ações"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((prev) => !prev)}
                >
                  <MoreHorizontal size={18} aria-hidden />
                </button>
                {menuOpen ? (
                  <div className="team-row-menu__dropdown" role="menu">
                    {onOpenAccess ? (
                      <button
                        type="button"
                        className="team-row-menu__item"
                        role="menuitem"
                        onClick={() => { setMenuOpen(false); onOpenAccess(); }}
                      >
                        <Shield size={15} aria-hidden />
                        Acessos e permissões
                      </button>
                    ) : null}
                    {canEdit && onDeactivate ? (
                      <button
                        type="button"
                        className="team-row-menu__item team-row-menu__item--danger"
                        role="menuitem"
                        onClick={() => { setMenuOpen(false); onDeactivate(); }}
                      >
                        <UserX size={15} aria-hidden />
                        Desativar colaborador
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
