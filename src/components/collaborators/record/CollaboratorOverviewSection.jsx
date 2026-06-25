import { Pencil } from 'lucide-react';
import Button from '../../Button.jsx';
import { formatCpf, formatPhone } from '../../../utils/validators.js';

function OverviewCard({ title, children, onEdit, canEdit }) {
  return (
    <article className="cr-overview-card">
      <header className="cr-overview-card__head">
        <h3>{title}</h3>
        {canEdit && onEdit ? (
          <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Editar seção</Button>
        ) : null}
      </header>
      <dl className="cr-overview-card__body">{children}</dl>
    </article>
  );
}

function Row({ label, value }) {
  return (
    <div className="cr-overview-card__row">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

export default function CollaboratorOverviewSection({
  draft,
  collaborator,
  accessStatus,
  accessProfile,
  lastInvite,
  workHoursSummary,
  formatDate,
  canEdit,
  onEditSection,
}) {
  const profile = draft.profile || {};
  const docs = draft.documents || {};
  const phones = draft.phones || [];
  const primaryPhone = phones.find((p) => p.principal) || phones[0];
  const phoneDisplay = primaryPhone?.numero
    ? formatPhone(`${primaryPhone.ddd || ''}${primaryPhone.numero}`)
    : '—';

  return (
    <div className="cr-overview">
      <OverviewCard title="Identificação" onEdit={() => onEditSection('pessoais')} canEdit={canEdit}>
        <Row label="Nome" value={profile.nomeCompleto || collaborator?.nomeCompleto} />
        <Row label="E-mail" value={profile.email || collaborator?.email} />
        <Row label="Telefone" value={phoneDisplay} />
        <Row label="CPF" value={formatCpf(docs.cpf || '')} />
        <Row label="Nascimento" value={formatDate(profile.dataNascimento)} />
      </OverviewCard>

      <OverviewCard title="Função na clínica" onEdit={() => onEditSection('profissional')} canEdit={canEdit}>
        <Row label="Categoria" value={profile.rhCategoria || collaborator?.rhCategoria} />
        <Row label="Cargo" value={profile.cargo || collaborator?.cargo} />
        <Row label="Setor" value={profile.setor} />
        <Row label="Especialidade" value={Array.isArray(profile.especialidades) ? profile.especialidades.join(', ') : collaborator?.especialidades?.join?.(', ')} />
        <Row label="Conselho" value={[profile.croNumero, profile.croUf].filter(Boolean).join(' / ') || '—'} />
      </OverviewCard>

      <OverviewCard title="Acesso" onEdit={() => onEditSection('acesso')} canEdit={canEdit}>
        <Row label="Status" value={accessStatus?.label} />
        <Row label="Perfil" value={accessProfile} />
        <Row label="Convite" value={lastInvite} />
        <Row label="Último login" value="—" />
      </OverviewCard>

      <OverviewCard title="RH" onEdit={() => onEditSection('profissional')} canEdit={canEdit}>
        <Row label="Vínculo" value={docs.tipoContratacao} />
        <Row label="Admissão" value={formatDate(docs.dataAdmissao)} />
        <Row label="Status" value={profile.status || collaborator?.status} />
        <Row label="Carga horária" value={workHoursSummary?.totalHours} />
        <Row label="Escala" value={workHoursSummary?.schedule} />
      </OverviewCard>
    </div>
  );
}
