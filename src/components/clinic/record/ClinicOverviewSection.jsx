import { Pencil } from 'lucide-react';
import Button from '../../Button.jsx';
import { formatCnpj, formatPhone } from '../../../utils/validators.js';

function OverviewCard({ title, children, onEdit, canEdit }) {
  return (
    <article className="clinic-overview-card">
      <header className="clinic-overview-card__head">
        <h3>{title}</h3>
        {canEdit && onEdit ? (
          <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Editar seção</Button>
        ) : null}
      </header>
      <dl className="clinic-overview-card__body">{children}</dl>
    </article>
  );
}

function Row({ label, value }) {
  return (
    <div className="clinic-overview-card__row">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ClinicOverviewSection({
  draft,
  clinic,
  formatDate,
  canEdit,
  onEditSection,
}) {
  const profile = draft.profile || {};
  const docs = draft.documentation || {};
  const tax = draft.tax || {};
  const primaryAddress = (clinic.addresses || []).find((a) => a.principal) || clinic.addresses?.[0];
  const primaryPhone = (clinic.phones || []).find((p) => p.principal) || clinic.phones?.[0];
  const phoneDisplay = primaryPhone?.numero
    ? formatPhone(`${primaryPhone.ddd || ''}${primaryPhone.numero}`)
    : '—';

  const hours = draft.businessHours?.length ? draft.businessHours : [];
  const openDays = hours.filter((h) => !h.fechado);
  const scheduleSummary = openDays.length
    ? openDays.map((h) => dayLabels[h.diaSemana]).join(', ')
    : '—';

  const integrationCount = [
    draft.integrations?.whatsappApiUrl,
    draft.integrations?.smsProvider,
    draft.integrations?.webhookUrl,
  ].filter(Boolean).length;

  return (
    <div className="clinic-overview">
      <OverviewCard title="Identificação" onEdit={() => onEditSection('cadastro')} canEdit={canEdit}>
        <Row label="Nome de exibição" value={profile.nomeClinica || profile.nomeMarca} />
        <Row label="Razão social" value={profile.razaoSocial} />
        <Row label="CNPJ/CPF" value={formatCnpj(docs.cnpj || '')} />
        <Row label="E-mail" value={profile.emailPrincipal} />
      </OverviewCard>

      <OverviewCard title="Dados fiscais" onEdit={() => onEditSection('tributacao')} canEdit={canEdit}>
        <Row label="Regime" value={tax.regime} />
        <Row label="UF" value={tax.uf} />
        <Row label="ISS" value={tax.iss != null ? `${tax.iss}%` : null} />
        <Row label="Tipo cálculo" value={tax.tipoCalculo} />
      </OverviewCard>

      <OverviewCard title="Contatos" onEdit={() => onEditSection('telefones')} canEdit={canEdit}>
        <Row label="Telefone principal" value={phoneDisplay} />
        <Row label="Total cadastrado" value={String(clinic.phones?.length || 0)} />
      </OverviewCard>

      <OverviewCard title="Endereço principal" onEdit={() => onEditSection('enderecos')} canEdit={canEdit}>
        <Row label="CEP" value={primaryAddress?.cep} />
        <Row label="Logradouro" value={primaryAddress ? `${primaryAddress.logradouro}, ${primaryAddress.numero}` : null} />
        <Row label="Cidade" value={primaryAddress ? `${primaryAddress.cidade}-${primaryAddress.uf}` : null} />
      </OverviewCard>

      <OverviewCard title="Horário de funcionamento" onEdit={() => onEditSection('horarios')} canEdit={canEdit}>
        <Row label="Dias abertos" value={scheduleSummary} />
        <Row label="Registros" value={String(openDays.length)} />
      </OverviewCard>

      <OverviewCard title="Integrações" onEdit={() => onEditSection('integracoes')} canEdit={canEdit}>
        <Row label="Configuradas" value={`${integrationCount} de 3`} />
        <Row label="Webhook" value={draft.integrations?.webhookUrl ? 'Sim' : 'Não'} />
      </OverviewCard>

      <OverviewCard title="Presença online" onEdit={() => onEditSection('web')} canEdit={canEdit}>
        <Row label="Site" value={draft.webPresence?.website} />
        <Row label="Instagram" value={draft.webPresence?.instagram} />
        <Row label="Google Maps" value={draft.webPresence?.googleMapsUrl ? 'Configurado' : '—'} />
      </OverviewCard>

      <OverviewCard title="Licença" onEdit={() => onEditSection('licenca')} canEdit={canEdit}>
        <Row label="Plano" value={draft.license?.plan} />
        <Row label="Expira em" value={formatDate(draft.license?.expiresAt)} />
        <Row label="Usuários" value={draft.license?.seats} />
      </OverviewCard>
    </div>
  );
}
