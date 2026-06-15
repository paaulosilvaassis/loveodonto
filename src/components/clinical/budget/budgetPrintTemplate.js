import { formatCurrencyBRL } from '../../../utils/currency.js';
import { formatCpf, formatCnpj } from '../../../utils/validators.js';
import {
  calcProcedureTotal,
} from './budgetUtils.js';
import {
  buildPaymentDetailRows,
  buildPaymentCardTitle,
  resolvePaymentStatusLabel,
  resolvePdfPaymentSections,
} from './budgetPaymentPdfUtils.js';
import { BUDGET_STATUS_BADGES } from '../clinicalAppointmentConfig.js';

const BRAND_PURPLE = '#6A00FF';
const BRAND_PURPLE_SOFT = '#F3EEFF';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasText(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (/^(—|-+|n\/a|na|não informado|nao informado|documento não informado)$/i.test(text)) {
    return false;
  }
  return true;
}

function formatDateBR(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(str.includes('T') ? str : `${str}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('pt-BR');
}

function sanitizeLogoUrl(url) {
  if (!hasText(url)) return '';
  const value = String(url).trim();
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) return '';
  return value;
}

function formatPhoneEntry(phone) {
  if (!phone) return '';
  if (typeof phone === 'string') return phone.trim();
  const ddd = phone.ddd || '';
  const num = phone.numero || phone.number || '';
  if (!ddd && !num) return '';
  const digits = `${ddd}${num}`.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return `(${ddd}) ${num}`.trim();
}

function formatAddress(addr) {
  if (!addr) return '';
  const cityUf = [addr.cidade, addr.uf].filter(hasText).join('/');
  return [
    addr.logradouro,
    addr.numero,
    addr.complemento,
    addr.bairro,
    cityUf,
    addr.cep ? `CEP ${addr.cep}` : '',
  ]
    .filter(hasText)
    .join(', ');
}

function regionLabel(proc) {
  return proc.tooth || proc.region || proc.regiao || '';
}

function formatBudgetDisplayNumber(budget) {
  const base = budget?.createdAt || budget?.updatedAt || new Date().toISOString();
  const date = new Date(String(base).includes('T') ? base : `${base}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return `ORC-${new Date().getFullYear()}`;
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `ORC-${dd}${mm}${yyyy}`;
}

function resolveBudgetStatusLabel(status) {
  const badge = BUDGET_STATUS_BADGES.find((item) => item.value === status);
  return badge?.label || '';
}

function resolveProfessional(professional) {
  if (!professional) {
    return { name: '', cro: '', specialty: '' };
  }
  const profile = professional.profile || professional;
  const name =
    professional.nomeCompleto ||
    professional.name ||
    professional.apelido ||
    profile.nomeCompleto ||
    '';
  const croRaw =
    profile.conselhoNumero ||
    profile.conselho_numero ||
    professional.conselhoNumero ||
    professional.cro ||
    professional.croNumber ||
    professional.registroCRO ||
    '';
  const croUf = profile.conselhoUf || profile.uf || professional.uf || '';
  let cro = '';
  if (hasText(croRaw)) {
    const num = String(croRaw).replace(/^CRO[-\s]*/i, '').trim();
    cro = croUf ? `CRO-${croUf} ${num}` : `CRO ${num}`;
  }
  const specialties = profile.especialidades || professional.especialidades || [];
  const specialty =
    (Array.isArray(specialties) ? specialties.filter(hasText).join(', ') : '') ||
    profile.especialidade ||
    professional.especialidade ||
    professional.specialty ||
    '';
  return { name, cro, specialty };
}

function resolvePatientDocument(patient) {
  const raw = patient?.cpf || patient?.document || patient?.profile?.cpf || '';
  if (!hasText(raw)) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === 11 ? formatCpf(digits) : String(raw).trim();
}

function renderChipGrid(items) {
  const rows = items.filter((item) => hasText(item.value));
  if (!rows.length) return '';
  return `
    <div class="chip-grid">
      ${rows
        .map(
          (item) => `
        <div class="chip-item">
          <span class="chip-label">${escapeHtml(item.label)}</span>
          <span class="chip-value">${escapeHtml(item.value)}</span>
        </div>`,
        )
        .join('')}
    </div>`;
}

function renderPaymentCard(opt, originalValue, { emphasized = false } = {}) {
  const title = buildPaymentCardTitle(opt);
  const rows = buildPaymentDetailRows(opt, originalValue);
  const status = resolvePaymentStatusLabel(opt);
  const cardClass = emphasized ? 'payment-card is-emphasized' : 'payment-card';

  return `
    <div class="${cardClass}">
      <div class="payment-card-head">${escapeHtml(title)}</div>
      <div class="payment-card-body">
        ${rows
          .map(
            (row) => `
          <div class="payment-row${row.highlight ? ' is-highlight' : ''}">
            <span>${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(row.value)}</strong>
          </div>`,
          )
          .join('')}
        ${status ? `<div class="payment-status">${escapeHtml(status.toUpperCase())}</div>` : ''}
      </div>
    </div>`;
}

function renderPaymentSections(paymentSections, originalValue) {
  if (paymentSections.mode === 'fallback') {
    return `
      <section class="payment-section">
        <div class="payment-section-head">${escapeHtml(paymentSections.sectionTitle)}</div>
        <div class="payment-card">
          <div class="payment-card-body">
            <div class="payment-row">
              <span>Condição</span>
              <strong>A combinar com a clínica</strong>
            </div>
          </div>
        </div>
      </section>`;
  }

  const primaryHtml = paymentSections.primary
    .map((opt) => renderPaymentCard(opt, originalValue, { emphasized: paymentSections.mode === 'chosen' }))
    .join('');

  const secondaryHtml = paymentSections.secondary.length
    ? `
      <div class="payment-section-sub">
        <div class="payment-section-subhead">${escapeHtml(paymentSections.secondaryTitle)}</div>
        <div class="payment-cards-stack">
          ${paymentSections.secondary.map((opt) => renderPaymentCard(opt, originalValue)).join('')}
        </div>
      </div>`
    : '';

  return `
    <section class="payment-section${paymentSections.mode === 'chosen' ? ' is-chosen' : ''}">
      <div class="payment-section-head">${escapeHtml(paymentSections.sectionTitle)}</div>
      <div class="payment-cards-stack">${primaryHtml}</div>
      ${secondaryHtml}
    </section>`;
}

export function buildBudgetPrintContext({
  db,
  patient,
  professional,
  appointment,
  budget,
  financials,
}) {
  const clinic = db.clinicProfile || {};
  const docs = db.clinicDocumentation || {};
  const phones = db.clinicPhones || [];
  const addresses = db.clinicAddresses || [];
  const correspondence = db.clinicCorrespondence || {};
  const web = db.clinicWebPresence || {};

  const mainPhone =
    phones.find((p) => p.principal) || phones.find((p) => !p.whatsapp && !p.is_whatsapp) || phones[0];
  const whatsPhone =
    phones.find((p) => p.whatsapp || p.is_whatsapp || String(p.tipo || '').toLowerCase() === 'whatsapp') ||
    phones.find((p) => p !== mainPhone);
  const mainAddress = addresses.find((a) => a.principal) || addresses[0];

  const patientId = patient?.id || appointment?.patientId;
  const patientPhones = (db.patientPhones || []).filter((p) => p.patient_id === patientId);
  const primaryPatientPhone = patientPhones.find((p) => p.is_primary) || patientPhones[0];

  const prof = resolveProfessional(professional);
  const originalValue = financials?.originalValue ?? 0;
  const finalValue = financials?.finalValue ?? 0;
  const discountValue = Math.max(0, originalValue - finalValue);
  const interest = Number(budget?.interest || 0);
  const totalTreatment = finalValue + interest;
  const paymentSections = resolvePdfPaymentSections(budget);

  const clinicalNotes = [budget?.commercialNotes].filter(hasText).join('\n\n');
  const appointmentDate = appointment?.date || appointment?.startDate || appointment?.scheduledAt;

  return {
    meta: {
      number: formatBudgetDisplayNumber(budget),
      issueDate: formatDateBR(budget?.createdAt || new Date().toISOString()),
      validityDate: formatDateBR(budget?.validityDate),
      status: resolveBudgetStatusLabel(budget?.status),
    },
    clinic: {
      logoUrl: sanitizeLogoUrl(clinic.logoUrl),
      name:
        clinic.nomeClinica ||
        clinic.nomeFantasia ||
        clinic.razaoSocial ||
        'Clínica Odontológica',
      cnpj: docs.cnpj ? formatCnpj(String(docs.cnpj).replace(/\D/g, '')) : '',
      address: formatAddress(mainAddress),
      phone: formatPhoneEntry(mainPhone),
      whatsapp: formatPhoneEntry(whatsPhone),
      email:
        clinic.emailPrincipal ||
        correspondence.emailPrincipal ||
        correspondence.email ||
        web.email ||
        '',
    },
    professional: prof,
    patient: {
      name: patient?.full_name || patient?.nickname || patient?.social_name || patient?.name || '',
      cpf: resolvePatientDocument(patient),
      phone:
        formatPhoneEntry(primaryPatientPhone) ||
        patient?.phone ||
        patient?.telefone ||
        patient?.legacy_phone ||
        '',
      birthDate: formatDateBR(patient?.birth_date || patient?.birthDate),
    },
    treatment: {
      planName: budget?.planName || '',
      startDate: formatDateBR(appointmentDate || budget?.startDate),
      clinicalNotes,
    },
    procedures: budget?.procedures || [],
    financial: {
      subtotal: originalValue,
      discount: discountValue,
      interest,
      total: totalTreatment,
    },
    paymentSections,
    originalValue,
  };
}

export function buildBudgetPrintHtml(context) {
  const {
    meta,
    clinic,
    professional,
    patient,
    treatment,
    procedures,
    financial,
    paymentSections,
    originalValue,
  } = context;

  const logoBlock = clinic.logoUrl
    ? `<img class="logo" src="${escapeHtml(clinic.logoUrl)}" alt="" />`
    : `<div class="logo logo-fallback">${escapeHtml(clinic.name.charAt(0))}</div>`;

  const clinicLines = [
    clinic.address,
    hasText(clinic.phone) ? `Tel.: ${clinic.phone}` : '',
    hasText(clinic.whatsapp) ? `WhatsApp: ${clinic.whatsapp}` : '',
    hasText(clinic.cnpj) ? `CNPJ: ${clinic.cnpj}` : '',
    clinic.email,
  ].filter(hasText);

  const metaLines = [
    hasText(meta.number) ? { label: 'Nº', value: meta.number } : null,
    hasText(meta.issueDate) ? { label: 'Emissão', value: meta.issueDate } : null,
    hasText(meta.validityDate) ? { label: 'Validade', value: meta.validityDate } : null,
    hasText(meta.status) ? { label: 'Status', value: meta.status } : null,
  ].filter(Boolean);

  const procedureRows = procedures.map((proc) => {
    const qty = Number(proc.quantity || 1);
    const unit = Number(proc.unitValue || 0);
    const total = calcProcedureTotal(proc);
    const region = regionLabel(proc);
    return `
      <tr>
        <td>${escapeHtml(proc.name || proc.title || 'Procedimento')}</td>
        <td>${region ? escapeHtml(region) : '—'}</td>
        <td class="num">${qty}</td>
        <td class="money">${formatCurrencyBRL(unit)}</td>
        <td class="money strong">${formatCurrencyBRL(total)}</td>
      </tr>`;
  });

  const treatmentNotes = hasText(treatment.clinicalNotes)
    ? `<p class="treatment-notes">${escapeHtml(treatment.clinicalNotes).replace(/\n/g, '<br />')}</p>`
    : '';

  const legalItems = [
    hasText(meta.validityDate)
      ? `Validade deste orçamento: <strong>${escapeHtml(meta.validityDate)}</strong>.`
      : '',
    'Alterações clínicas podem alterar o planejamento e os valores previstos.',
    'A execução do tratamento está sujeita à avaliação clínica e assinatura contratual.',
    'Este documento é uma proposta comercial e não substitui o contrato de prestação de serviços.',
  ].filter(hasText);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Proposta Odontológica — ${escapeHtml(patient.name || 'Paciente')}</title>
  <style>
    :root {
      --brand: ${BRAND_PURPLE};
      --brand-soft: ${BRAND_PURPLE_SOFT};
      --ink: #111827;
      --muted: #6b7280;
      --line: #e5e7eb;
      --soft: #f9fafb;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #eceff4;
      color: var(--ink);
      font-family: Inter, "Segoe UI", system-ui, sans-serif;
      font-size: 11.5px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      max-width: 210mm;
      margin: 12px auto;
      padding: 11mm 12mm 12mm;
      background: #fff;
      box-shadow: 0 10px 40px rgba(17, 24, 39, 0.08);
    }
    .top {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 16px;
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 2px solid var(--brand);
    }
    .brand {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
      flex-shrink: 0;
    }
    .logo-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 800;
      color: var(--brand);
      background: var(--brand-soft);
      border-color: #ddd6fe;
    }
    .clinic-name {
      margin: 0 0 6px;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--ink);
    }
    .clinic-lines {
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--muted);
      font-size: 10.5px;
      line-height: 1.55;
    }
    .doc-side { text-align: right; }
    .doc-title {
      margin: 0 0 8px;
      font-size: 20px;
      font-weight: 800;
      color: var(--brand);
      letter-spacing: -0.03em;
      line-height: 1.1;
    }
    .meta-list {
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 10.5px;
      color: var(--muted);
    }
    .meta-list li {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-bottom: 2px;
    }
    .meta-list strong { color: var(--ink); font-weight: 700; }
    .cards-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      break-inside: avoid;
    }
    .card-head {
      padding: 7px 12px;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand);
      background: linear-gradient(90deg, rgba(106,0,255,0.08), rgba(106,0,255,0.02));
      border-bottom: 1px solid var(--line);
    }
    .card-body { padding: 10px 12px; }
    .chip-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
    }
    .chip-label {
      display: block;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 2px;
    }
    .chip-value {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      word-break: break-word;
    }
    .highlight-card {
      margin-bottom: 10px;
      border: 1px solid #ddd6fe;
      border-radius: 12px;
      background: linear-gradient(180deg, #faf8ff 0%, #fff 100%);
      overflow: hidden;
      break-inside: avoid;
    }
    .highlight-card .card-body { padding: 12px 14px; }
    .plan-name {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 800;
      color: var(--brand);
      letter-spacing: -0.02em;
    }
    .treatment-notes {
      margin: 8px 0 0;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--soft);
      border: 1px solid var(--line);
      font-size: 11px;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    thead th {
      padding: 7px 8px;
      text-align: left;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #4b5563;
      background: var(--soft);
      border-bottom: 1px solid var(--line);
    }
    tbody td {
      padding: 7px 8px;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
    }
    tbody tr:last-child td { border-bottom: none; }
    .num { width: 42px; text-align: center; }
    .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 700; }
    .bottom-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 10px 0;
    }
    .finance-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      break-inside: avoid;
    }
    .fin-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 4px 0;
      font-size: 11.5px;
      color: #374151;
    }
    .fin-row span:last-child { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .fin-total {
      margin-top: 8px;
      padding-top: 10px;
      border-top: 2px solid var(--brand);
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .fin-total-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--brand);
    }
    .fin-total-value {
      font-size: 24px;
      font-weight: 800;
      color: var(--brand);
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .payment-card {
      border: 1px solid #ddd6fe;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      break-inside: avoid;
    }
    .payment-card-head {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #fff;
      background: var(--brand);
    }
    .payment-card-body { padding: 10px 12px; }
    .payment-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 5px 0;
      border-bottom: 1px dashed #f3f4f6;
      font-size: 11px;
    }
    .payment-row:last-child { border-bottom: none; }
    .payment-row span { color: var(--muted); font-weight: 600; }
    .payment-row strong {
      text-align: right;
      color: var(--ink);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .payment-row.is-highlight strong { color: var(--brand); font-size: 12px; }
    .payment-section { margin-top: 10px; break-inside: avoid; }
    .payment-section-head {
      margin-bottom: 8px;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand);
    }
    .payment-section.is-chosen .payment-section-head { font-size: 10px; }
    .payment-cards-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .payment-card.is-emphasized {
      border-width: 2px;
      border-color: var(--brand);
      box-shadow: 0 0 0 1px rgba(106,0,255,0.12);
    }
    .payment-status {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dashed #e5e7eb;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--brand);
    }
    .payment-section-sub { margin-top: 10px; }
    .payment-section-subhead {
      margin-bottom: 6px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
    }
    .legal {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--soft);
      border: 1px solid var(--line);
      font-size: 10px;
      color: #6b7280;
      line-height: 1.55;
      break-inside: avoid;
    }
    .legal ul { margin: 0; padding-left: 16px; }
    .legal li { margin-bottom: 3px; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-top: 10px;
      break-inside: avoid;
    }
    .sign {
      padding-top: 28px;
      border-top: 1px solid #9ca3af;
      font-size: 10.5px;
      color: #6b7280;
    }
    .sign strong {
      display: block;
      margin-bottom: 2px;
      color: var(--ink);
      font-size: 11px;
    }
    @media print {
      html, body { background: #fff; }
      .sheet {
        width: auto;
        max-width: none;
        min-height: auto;
        margin: 0;
        padding: 8mm 10mm;
        box-shadow: none;
      }
    }
    @media (max-width: 720px) {
      .sheet { width: auto; max-width: 100%; margin: 0; }
      .top, .cards-row, .bottom-grid, .chip-grid, .signatures { grid-template-columns: 1fr; }
      .doc-side { text-align: left; }
      .meta-list li { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="top">
      <div class="brand">
        ${logoBlock}
        <div>
          <h1 class="clinic-name">${escapeHtml(clinic.name)}</h1>
          ${
            clinicLines.length
              ? `<ul class="clinic-lines">${clinicLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
              : ''
          }
        </div>
      </div>
      <div class="doc-side">
        <h2 class="doc-title">Orçamento<br />Odontológico</h2>
        ${
          metaLines.length
            ? `<ul class="meta-list">${metaLines
              .map((item) => `<li><span>${escapeHtml(item.label)}:</span><strong>${escapeHtml(item.value)}</strong></li>`)
              .join('')}</ul>`
            : ''
        }
      </div>
    </header>

    <div class="cards-row">
      ${
        hasText(patient.name)
          ? `<section class="card">
        <div class="card-head">Paciente</div>
        <div class="card-body">
          ${renderChipGrid([
            { label: 'Nome', value: patient.name },
            { label: 'CPF', value: patient.cpf },
            { label: 'Telefone', value: patient.phone },
            { label: 'Nascimento', value: patient.birthDate },
          ])}
        </div>
      </section>`
          : ''
      }
      ${
        hasText(professional.name)
          ? `<section class="card">
        <div class="card-head">Responsável técnico</div>
        <div class="card-body">
          ${renderChipGrid([
            { label: 'Dentista', value: professional.name },
            { label: 'CRO', value: professional.cro },
            { label: 'Especialidade', value: professional.specialty },
          ])}
        </div>
      </section>`
          : ''
      }
    </div>

    <section class="highlight-card">
      <div class="card-head">Resumo do tratamento</div>
      <div class="card-body">
        ${hasText(treatment.planName) ? `<p class="plan-name">${escapeHtml(treatment.planName)}</p>` : ''}
        ${renderChipGrid([
          { label: 'Início previsto', value: treatment.startDate },
        ])}
        ${treatmentNotes ? `<div><span class="chip-label">Observações clínicas</span>${treatmentNotes}</div>` : ''}
      </div>
    </section>

    <section class="card" style="margin-bottom:10px;">
      <div class="card-head">Procedimentos</div>
      <div class="card-body" style="padding:0;">
        <table>
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Região</th>
              <th class="num">Qtd</th>
              <th class="money">Valor unitário</th>
              <th class="money">Valor total</th>
            </tr>
          </thead>
          <tbody>
            ${
              procedureRows.length
                ? procedureRows.join('')
                : '<tr><td colspan="5" style="text-align:center;padding:14px;color:#9ca3af;">Nenhum procedimento registrado</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <div class="bottom-grid">
      <section class="finance-card">
        <div class="card-head">Resumo financeiro</div>
        <div class="card-body">
          <div class="fin-row"><span>Valor do tratamento</span><span>${formatCurrencyBRL(financial.subtotal)}</span></div>
          ${
            financial.discount > 0
              ? `<div class="fin-row"><span>Desconto</span><span>- ${formatCurrencyBRL(financial.discount)}</span></div>`
              : ''
          }
          ${
            financial.interest > 0
              ? `<div class="fin-row"><span>Acréscimos</span><span>${formatCurrencyBRL(financial.interest)}</span></div>`
              : ''
          }
          <div class="fin-total">
            <span class="fin-total-label">Total final</span>
            <span class="fin-total-value">${formatCurrencyBRL(financial.total)}</span>
          </div>
        </div>
      </section>
    </div>

    ${renderPaymentSections(paymentSections, originalValue)}

    <div class="legal">
      <strong style="display:block;margin-bottom:4px;color:#374151;font-size:10px;">Observações importantes</strong>
      <ul>${legalItems.map((item) => `<li>${item}</li>`).join('')}</ul>
    </div>

    <div class="signatures">
      <div class="sign">
        <strong>${escapeHtml(patient.name || 'Paciente')}</strong>
        Assinatura do paciente<br />
        Data: ____/____/________
      </div>
      ${
        hasText(professional.name)
          ? `<div class="sign">
        <strong>${escapeHtml(professional.name)}</strong>
        Assinatura do responsável técnico<br />
        Data: ____/____/________
      </div>`
          : `<div class="sign">
        <strong>Responsável técnico</strong>
        Assinatura<br />
        Data: ____/____/________
      </div>`
      }
    </div>
  </div>
</body>
</html>`;
}
