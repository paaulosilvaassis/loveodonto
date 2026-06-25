import { RefreshCw, UserPlus, Users, UserCheck, UserX, Mail, Shield } from 'lucide-react';
import Button from '../Button.jsx';
import { COLLABORATOR_CATEGORIES, getAllCargosFlat } from '../../constants/collaboratorRhCatalog.js';
import { accessStatusBadgeClass } from '../../utils/inviteStatus.js';
import CollaboratorRowActionsMenu from './CollaboratorRowActionsMenu.jsx';
import AppAvatar from '../common/AppAvatar.jsx';

const ACCESS_FILTER_OPTIONS = [
  { value: '', label: 'Todos os acessos' },
  { value: 'none', label: 'Sem acesso' },
  { value: 'sent', label: 'Convite enviado' },
  { value: 'pending', label: 'Pendente' },
  { value: 'accepted', label: 'Convite aceito' },
  { value: 'active', label: 'Acesso ativo' },
  { value: 'revoked', label: 'Bloqueado' },
];

export default function CollaboratorTeamDirectory({
  kpis,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filteredCollaborators,
  selectedId,
  canCreateNewCollaborator,
  canEditRh,
  canManageAccess,
  tenantId,
  onRefresh,
  onNewCollaborator,
  onSelectCollaborator,
  onViewCollaborator,
  onEditCollaborator,
  onEditPermissions,
  onToggleRhStatus,
  onAccessChanged,
  onError,
  resolveTenantAccess,
  getCollaboratorInitials,
  getCollaboratorNameDisplay,
  getCollaboratorSpecialty,
  getCollaboratorContact,
  getStatusLabel,
  isCollaboratorActive,
  resolveAccessStatus,
}) {
  return (
    <div className="team-page">
      <header className="team-page__header">
        <div className="team-page__header-text">
          <h1 className="team-page__title">Equipe da clínica</h1>
          <p className="team-page__subtitle">
            Gerencie colaboradores, funções, acessos e permissões da unidade.
          </p>
        </div>
        <div className="team-page__header-actions">
          <Button variant="secondary" icon={RefreshCw} onClick={onRefresh}>
            Atualizar
          </Button>
          <Button
            variant="primary"
            icon={UserPlus}
            disabled={!canCreateNewCollaborator}
            title={canCreateNewCollaborator ? undefined : 'Apenas administrador ou gerente podem cadastrar colaboradores.'}
            onClick={onNewCollaborator}
          >
            Novo colaborador
          </Button>
        </div>
      </header>

      <div className="team-page__kpis">
        <article className="team-kpi">
          <span className="team-kpi__icon team-kpi__icon--success" aria-hidden>
            <UserCheck size={20} />
          </span>
          <div>
            <p className="team-kpi__value">{kpis.ativos}</p>
            <p className="team-kpi__label">Colaboradores ativos</p>
          </div>
        </article>
        <article className="team-kpi">
          <span className="team-kpi__icon" aria-hidden>
            <UserX size={20} />
          </span>
          <div>
            <p className="team-kpi__value">{kpis.inativos}</p>
            <p className="team-kpi__label">Inativos</p>
          </div>
        </article>
        <article className="team-kpi">
          <span className="team-kpi__icon team-kpi__icon--primary" aria-hidden>
            <Shield size={20} />
          </span>
          <div>
            <p className="team-kpi__value">{kpis.comAcesso}</p>
            <p className="team-kpi__label">Com acesso ao sistema</p>
          </div>
        </article>
        <article className="team-kpi">
          <span className="team-kpi__icon team-kpi__icon--warning" aria-hidden>
            <Mail size={20} />
          </span>
          <div>
            <p className="team-kpi__value">{kpis.convitesPendentes}</p>
            <p className="team-kpi__label">Convites pendentes</p>
          </div>
        </article>
      </div>

      <section className="team-panel">
        <div className="team-panel__filters">
          <div className="team-filter-field team-filter-field--grow">
            <label className="team-filter-label" htmlFor="team-search">Buscar</label>
            <input
              id="team-search"
              type="search"
              className="team-filter-input"
              placeholder="Buscar por nome, e-mail ou cargo"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="team-filter-field">
            <label className="team-filter-label" htmlFor="team-filter-categoria">Categoria</label>
            <select
              id="team-filter-categoria"
              className="team-filter-input"
              value={filter.categoria}
              onChange={(event) => onFilterChange({ ...filter, categoria: event.target.value })}
            >
              <option value="">Todas</option>
              {COLLABORATOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="team-filter-field">
            <label className="team-filter-label" htmlFor="team-filter-cargo">Cargo</label>
            <select
              id="team-filter-cargo"
              className="team-filter-input"
              value={filter.cargo}
              onChange={(event) => onFilterChange({ ...filter, cargo: event.target.value })}
            >
              <option value="">Todos</option>
              {getAllCargosFlat().map((cargo) => (
                <option key={cargo} value={cargo}>{cargo}</option>
              ))}
            </select>
          </div>
          <div className="team-filter-field">
            <label className="team-filter-label" htmlFor="team-filter-status">Status</label>
            <select
              id="team-filter-status"
              className="team-filter-input"
              value={filter.status}
              onChange={(event) => onFilterChange({ ...filter, status: event.target.value })}
            >
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </select>
          </div>
          <div className="team-filter-field">
            <label className="team-filter-label" htmlFor="team-filter-acesso">Acesso</label>
            <select
              id="team-filter-acesso"
              className="team-filter-input"
              value={filter.acesso}
              onChange={(event) => onFilterChange({ ...filter, acesso: event.target.value })}
            >
              {ACCESS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredCollaborators.length === 0 ? (
          <div className="team-panel__empty">
            <Users size={28} className="team-panel__empty-icon" aria-hidden />
            <p>Sem colaboradores para os filtros atuais.</p>
          </div>
        ) : (
          <div className="team-table-wrap">
            <table className="team-table">
              <thead>
                <tr>
                  <th scope="col">Colaborador</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Especialidade</th>
                  <th scope="col">Status RH</th>
                  <th scope="col">Acesso</th>
                  <th scope="col">Contato</th>
                  <th scope="col" className="team-table__actions-col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredCollaborators.map((item) => {
                  const { primary: namePrimary } = getCollaboratorNameDisplay(item);
                  const tenantAccess = resolveTenantAccess(item);
                  const accessStatus = resolveAccessStatus(tenantAccess);
                  const rhActive = isCollaboratorActive(item);
                  return (
                    <tr
                      key={item.id}
                      className={selectedId === item.id ? 'is-selected' : ''}
                      onClick={() => onSelectCollaborator(item.id)}
                    >
                      <td>
                        <div className="team-table__person">
                          <AppAvatar
                            user={item}
                            name={namePrimary}
                            fallbackInitials={getCollaboratorInitials(item)}
                            className="team-table__avatar"
                            size="inherit"
                          />
                          <div className="team-table__person-text">
                            <span className="team-table__name" title={namePrimary}>{namePrimary}</span>
                            <span className="team-table__cargo" title={item.cargo || '—'}>{item.cargo || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="team-table__cell-text" title={item.rhCategoria || '—'}>
                          {item.rhCategoria || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="team-table__cell-text" title={getCollaboratorSpecialty(item)}>
                          {getCollaboratorSpecialty(item)}
                        </span>
                      </td>
                      <td>
                        <span className={`team-rh-badge ${rhActive ? 'team-rh-badge--active' : 'team-rh-badge--inactive'}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>
                        <span className={accessStatusBadgeClass(accessStatus.key)}>
                          {accessStatus.label}
                        </span>
                      </td>
                      <td>
                        <span className="team-table__cell-text" title={getCollaboratorContact(item)}>
                          {getCollaboratorContact(item)}
                        </span>
                      </td>
                      <td className="team-table__actions-col">
                        <CollaboratorRowActionsMenu
                          collaborator={item}
                          tenantUser={tenantAccess}
                          tenantId={tenantId}
                          isActiveRh={rhActive}
                          canManageAccess={canManageAccess}
                          canEditRh={canEditRh}
                          disabled={false}
                          onView={() => onViewCollaborator(item.id)}
                          onEdit={() => onEditCollaborator(item.id)}
                          onEditPermissions={() => onEditPermissions(item.id)}
                          onToggleRhStatus={() => onToggleRhStatus(item)}
                          onChanged={onAccessChanged}
                          onError={onError}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
