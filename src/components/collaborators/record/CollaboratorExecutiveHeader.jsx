import { ChevronDown, Mail, MoreHorizontal, Pencil, Phone, Save, X } from 'lucide-react';
import { useState } from 'react';
import Button from '../../Button.jsx';
import { accessStatusBadgeClass } from '../../../utils/inviteStatus.js';

export default function CollaboratorExecutiveHeader({
  fotoUrl,
  initials,
  displayName,
  cargo,
  categoria,
  especialidade,
  conselho,
  rhStatusLabel,
  rhActive,
  tipoVinculo,
  tempoEmpresa,
  accessStatus,
  accessProfile,
  ultimoAcesso,
  ultimaAlteracao,
  criadoEm,
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
    <section className="cr-executive">
      <div className="cr-executive__grid">
        <div className="cr-executive__profile">
          {fotoUrl ? (
            <img src={fotoUrl} alt="" className="cr-executive__avatar cr-executive__avatar--photo" />
          ) : (
            <span className="cr-executive__avatar" aria-hidden>{initials}</span>
          )}
          <div className="cr-executive__identity">
            <h1 className="cr-executive__name">{displayName}</h1>
            <p className="cr-executive__headline">{[cargo, categoria].filter(Boolean).join(' · ') || 'Colaborador'}</p>
            <dl className="cr-executive__meta">
              {especialidade ? <div><dt>Especialidade</dt><dd>{especialidade}</dd></div> : null}
              {conselho ? <div><dt>Conselho</dt><dd>{conselho}</dd></div> : null}
              <div><dt>Situação RH</dt><dd><span className={`team-rh-badge ${rhActive ? 'team-rh-badge--active' : 'team-rh-badge--inactive'}`}>{rhStatusLabel}</span></dd></div>
              {tempoEmpresa ? <div><dt>Tempo na clínica</dt><dd>{tempoEmpresa}</dd></div> : null}
              {tipoVinculo ? <div><dt>Vínculo</dt><dd>{tipoVinculo}</dd></div> : null}
            </dl>
            <div className="cr-executive__contacts">
              {email ? <span><Mail size={14} aria-hidden /> {email}</span> : null}
              {phone ? <span><Phone size={14} aria-hidden /> {phone}</span> : null}
            </div>
          </div>
        </div>

        <div className="cr-executive__aside">
          <dl className="cr-executive__stats">
            <div><dt>Status do acesso</dt><dd><span className={accessStatusBadgeClass(accessStatus?.key)}>{accessStatus?.label || '—'}</span></dd></div>
            <div><dt>Perfil</dt><dd>{accessProfile || '—'}</dd></div>
            <div><dt>Último acesso</dt><dd>{ultimoAcesso || '—'}</dd></div>
            <div><dt>Última alteração</dt><dd>{ultimaAlteracao || '—'}</dd></div>
            <div><dt>Criado em</dt><dd>{criadoEm || '—'}</dd></div>
          </dl>

          <div className="cr-executive__actions">
            {isEditing ? (
              <>
                <Button variant="ghost" icon={X} onClick={onCancel}>Cancelar</Button>
                <Button variant="primary" icon={Save} onClick={onSave} disabled={!canSave}>Salvar</Button>
              </>
            ) : (
              <>
                {canEdit ? <Button variant="secondary" icon={Pencil} onClick={onEdit}>Editar</Button> : null}
                {menuItems.length > 0 ? (
                  <div className={`cr-executive__menu ${menuOpen ? 'is-open' : ''}`}>
                    <button type="button" className="cr-executive__menu-trigger" aria-label="Mais ações" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
                      <MoreHorizontal size={18} />
                    </button>
                    <div className="cr-executive__menu-list">
                      {menuItems.map((item) => (
                        <button key={item.label} type="button" className={`cr-executive__menu-item ${item.danger ? 'is-danger' : ''}`} onClick={() => { setMenuOpen(false); item.onClick?.(); }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
