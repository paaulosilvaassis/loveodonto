import { Mail, MoreHorizontal, Pencil, Phone, Save, X } from 'lucide-react';
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

  const facts = [
    especialidade ? { label: 'Especialidade', value: especialidade } : null,
    conselho ? { label: 'Conselho', value: conselho } : null,
    { label: 'Situação RH', value: <span className={`team-rh-badge ${rhActive ? 'team-rh-badge--active' : 'team-rh-badge--inactive'}`}>{rhStatusLabel}</span> },
    tempoEmpresa && tempoEmpresa !== '—' ? { label: 'Tempo na clínica', value: tempoEmpresa } : null,
    tipoVinculo && tipoVinculo !== '—' ? { label: 'Vínculo', value: tipoVinculo } : null,
    { label: 'Status do acesso', value: <span className={accessStatusBadgeClass(accessStatus?.key)}>{accessStatus?.label || '—'}</span> },
    { label: 'Perfil', value: accessProfile || '—' },
    { label: 'Último acesso', value: ultimoAcesso || '—' },
    { label: 'Última alteração', value: ultimaAlteracao || '—' },
    { label: 'Criado em', value: criadoEm || '—' },
  ].filter(Boolean);

  return (
    <section className="cr-executive">
      <div className="cr-executive__top">
        <div className="cr-executive__identity">
          {fotoUrl ? (
            <img src={fotoUrl} alt="" className="cr-executive__avatar cr-executive__avatar--photo" />
          ) : (
            <span className="cr-executive__avatar" aria-hidden>{initials}</span>
          )}
          <div className="cr-executive__identity-text">
            <h1 className="cr-executive__name">{displayName}</h1>
            <p className="cr-executive__headline">{[cargo, categoria].filter(Boolean).join(' · ') || 'Colaborador'}</p>
            {(email || phone) ? (
              <div className="cr-executive__contacts">
                {email ? <span><Mail size={12} aria-hidden /> {email}</span> : null}
                {phone ? <span><Phone size={12} aria-hidden /> {phone}</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="cr-executive__actions">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>Cancelar</Button>
              <Button variant="primary" size="sm" icon={Save} onClick={onSave} disabled={!canSave}>Salvar</Button>
            </>
          ) : (
            <>
              {canEdit ? <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Editar</Button> : null}
              {menuItems.length > 0 ? (
                <div className={`cr-executive__menu ${menuOpen ? 'is-open' : ''}`}>
                  <button type="button" className="cr-executive__menu-trigger" aria-label="Mais ações" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
                    <MoreHorizontal size={16} />
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

      <dl className="cr-executive__facts">
        {facts.map((item) => (
          <div key={item.label} className="cr-executive__fact">
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
