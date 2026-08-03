import { formatCpf, formatCnpj } from '../../../utils/validators.js';
import { formatBrazilianPhoneDisplay } from '../../../utils/phoneUtils.js';

const ATESTADO_PRINT_CSS = `
  @page {
    size: A4;
    margin: 18mm 16mm 20mm 16mm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #1a1a1a;
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .atestado-document {
    max-width: 178mm;
    margin: 0 auto;
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .atestado-header {
    display: flex;
    align-items: flex-start;
    gap: 12pt;
    padding-bottom: 10pt;
    margin-bottom: 14pt;
    border-bottom: 0.75pt solid #333;
  }
  .atestado-header img {
    width: 52pt;
    height: 52pt;
    object-fit: contain;
    flex-shrink: 0;
  }
  .atestado-header-info {
    flex: 1;
    min-width: 0;
  }
  .atestado-clinic-name {
    margin: 0 0 3pt;
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }
  .atestado-header-line {
    margin: 0;
    font-size: 9.5pt;
    line-height: 1.35;
    color: #222;
  }
  .atestado-title-block {
    text-align: center;
    margin: 0 0 16pt;
  }
  .atestado-title {
    margin: 0;
    font-size: 14pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .atestado-body {
    flex: 1;
    text-align: justify;
  }
  .atestado-paragraph {
    margin: 0 0 10pt;
    text-indent: 0;
    font-size: 12pt;
  }
  .atestado-detail {
    margin: 0 0 6pt;
    font-size: 11.5pt;
    padding-left: 0;
  }
  .atestado-detail strong {
    font-weight: 700;
  }
  .atestado-signature-section {
    margin-top: 28pt;
    page-break-inside: avoid;
  }
  .atestado-city-date {
    margin: 0 0 24pt;
    font-size: 12pt;
    text-align: left;
  }
  .atestado-signature-block {
    width: 68%;
    margin: 0 auto;
    text-align: center;
    page-break-inside: avoid;
  }
  .atestado-signature-line {
    border-top: 0.75pt solid #000;
    margin: 0 0 6pt;
    height: 0;
  }
  .atestado-signature-name {
    margin: 0 0 2pt;
    font-size: 12pt;
    font-weight: 700;
  }
  .atestado-signature-meta {
    margin: 0;
    font-size: 11pt;
    line-height: 1.35;
  }
  .atestado-footer {
    margin-top: 24pt;
    padding-top: 8pt;
    border-top: 0.5pt solid #ccc;
    text-align: center;
    font-size: 8pt;
    color: #666;
    line-height: 1.4;
    page-break-inside: avoid;
  }
  .atestado-validation {
    margin-top: 3pt;
    font-size: 7pt;
    color: #888;
    letter-spacing: 0.02em;
  }
  @media print {
    body { margin: 0; }
    .atestado-document { max-width: none; }
  }
`;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hasText(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (/^(—|-+|n\/a|na|não informado|nao informado|about:blank)$/i.test(text)) {
    return false;
  }
  return true;
}

function formatDateBR(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(str.includes('T') ? str : `${str}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return str;
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateExtenso(value) {
  const formatted = formatDateBR(value || new Date().toISOString());
  if (!formatted) return '';
  const [day, month, year] = formatted.split('/');
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const monthName = months[Number(month) - 1] || month;
  return `${Number(day)} de ${monthName} de ${year}`;
}

function sanitizeLogoUrl(url) {
  if (!hasText(url)) return '';
  const value = String(url).trim();
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) return '';
  return value;
}

function formatAddress(addr) {
  if (!addr) return '';
  const cityUf = [addr.cidade, addr.uf].filter(hasText).join('/');
  return [
    addr.logradouro,
    addr.numero ? `nº ${addr.numero}` : '',
    addr.complemento,
    addr.bairro,
    cityUf,
  ]
    .filter(hasText)
    .join(', ');
}

function resolveProfessional(professional) {
  if (!professional) return { name: '', cro: '', specialty: '' };
  const profile = professional.profile || professional;
  const name =
    professional.nomeCompleto ||
    professional.name ||
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
  return { name: String(name).trim(), cro, specialty: String(specialty).trim() };
}

function resolvePatientCpf(patient) {
  const raw = patient?.cpf || patient?.document || '';
  if (!hasText(raw)) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === 11 ? formatCpf(digits) : String(raw).trim();
}

function resolveCityLabel(city, uf) {
  const c = String(city || '').trim();
  const s = String(uf || '').trim();
  if (c && s) return `${c}/${s}`;
  return c || s || '';
}

function formatDaysLabel(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return '';
  const label = n === 1 ? '1 dia' : `${Math.floor(n)} dias`;
  return label;
}

function buildHeaderLines(clinic) {
  const lines = [];
  if (hasText(clinic.cnpj)) {
    const digits = String(clinic.cnpj).replace(/\D/g, '');
    const cnpj = digits.length === 14 ? formatCnpj(digits) : clinic.cnpj;
    lines.push(`CNPJ: ${cnpj}`);
  }
  if (hasText(clinic.address)) {
    lines.push(`Endereço: ${clinic.address}`);
  }
  if (hasText(clinic.whatsapp)) {
    lines.push(`WhatsApp: ${clinic.whatsapp}`);
  } else if (hasText(clinic.phone)) {
    lines.push(`Telefone: ${clinic.phone}`);
  }
  if (hasText(clinic.email)) {
    lines.push(`E-mail: ${clinic.email}`);
  }
  if (hasText(clinic.technicalResponsible)) {
    const rt = clinic.technicalCro
      ? `${clinic.technicalResponsible} — ${clinic.technicalCro}`
      : clinic.technicalResponsible;
    lines.push(`Responsável técnico: ${rt}`);
  }
  return lines;
}

function buildMainParagraph(ctx) {
  const { patient, appointment, certificate } = ctx;
  const parts = [
    'Atesto, para os devidos fins, que o(a) paciente',
    hasText(patient.name) ? patient.name : 'o(a) paciente',
  ];

  let text = `${parts[0]} <strong>${escapeHtml(parts[1])}</strong>`;

  if (hasText(patient.cpf)) {
    text += `, CPF nº <strong>${escapeHtml(patient.cpf)}</strong>`;
  }

  text += ', esteve em atendimento odontológico nesta clínica';

  if (hasText(appointment.date)) {
    text += ` na data de <strong>${escapeHtml(appointment.date)}</strong>`;
  }

  if (hasText(appointment.time)) {
    text += `, no horário de <strong>${escapeHtml(appointment.time)}</strong>`;
  }

  if (hasText(certificate.daysLabel)) {
    text += `, necessitando de afastamento de suas atividades por <strong>${escapeHtml(certificate.daysLabel)}</strong>`;
  }

  text += ', conforme avaliação profissional.';

  return text;
}

export function buildAtestadoPrintContext({
  db,
  patient,
  professional,
  appointment,
  variables = {},
}) {
  const clinic = db?.clinicProfile || {};
  const docs = db?.clinicDocumentation || {};
  const phones = db?.clinicPhones || [];
  const addresses = db?.clinicAddresses || [];
  const mainAddress = addresses.find((a) => a.principal) || addresses[0] || {};
  const whatsPhone =
    phones.find((p) => p.whatsapp || p.is_whatsapp || String(p.tipo || '').toLowerCase() === 'whatsapp') ||
  phones.find((p) => p.principal) ||
    phones[0];
  const mainPhone =
    phones.find((p) => p.principal && !p.whatsapp && !p.is_whatsapp) ||
    phones.find((p) => !p.whatsapp && !p.is_whatsapp) ||
    phones[0];

  const prof = resolveProfessional(professional);
  const respTecnico = String(
    variables.RESPONSAVEL_TECNICO ||
    docs.responsavelTecnico ||
    docs.responsavel_tecnico ||
    clinic.responsavelTecnico ||
    '',
  ).trim();
  const respTecnicoCro = String(
    variables.CRO_RESPONSAVEL_TECNICO ||
    docs.croResponsavelTecnico ||
    docs.cro_responsavel ||
    '',
  ).trim();

  const appointmentDateRaw = appointment?.date || variables.DATA_ATENDIMENTO;
  const appointmentDate = formatDateBR(appointmentDateRaw);
  const appointmentTime = String(appointment?.startTime || variables.HORA_ATENDIMENTO || '').trim();

  const daysRaw = variables.DIAS_AFASTAMENTO != null && String(variables.DIAS_AFASTAMENTO).trim() !== ''
    ? variables.DIAS_AFASTAMENTO
    : '1';
  const daysLabel = hasText(variables.PERIODO_AFASTAMENTO)
    ? String(variables.PERIODO_AFASTAMENTO).trim()
    : formatDaysLabel(daysRaw);

  const cityFromVars = String(variables.CIDADE || '').trim();
  const cityLabel = cityFromVars || resolveCityLabel(mainAddress.cidade, mainAddress.uf);

  const issueIso = variables.DATA_EMISSAO || new Date().toISOString();
  const issueDateExtenso = formatDateExtenso(issueIso);

  return {
    clinic: {
      name: clinic.nomeClinica || clinic.nomeFantasia || variables.CLINICA_NOME || '',
      cnpj: docs.cnpj || variables.CLINICA_CNPJ || '',
      address: formatAddress(mainAddress) || variables.ENDERECO_DA_CLINICA || '',
      whatsapp: whatsPhone ? formatBrazilianPhoneDisplay(whatsPhone.ddd, whatsPhone.numero) : '',
      phone: mainPhone ? formatBrazilianPhoneDisplay(mainPhone.ddd, mainPhone.numero) : '',
      email: clinic.emailPrincipal || clinic.email || '',
      logoUrl: sanitizeLogoUrl(clinic.logoUrl),
      technicalResponsible: respTecnico,
      technicalCro: respTecnicoCro,
    },
    patient: {
      name:
        patient?.full_name ||
        patient?.nickname ||
        patient?.social_name ||
        variables.PACIENTE_NOME ||
        '',
      cpf: resolvePatientCpf(patient) || variables.PACIENTE_CPF || '',
    },
    professional: {
      name: prof.name || variables.PROFISSIONAL_NOME || '',
      cro: prof.cro || variables.PROFISSIONAL_CRO || '',
      specialty: prof.specialty || variables.PROFISSIONAL_ESPECIALIDADE || '',
    },
    appointment: {
      date: appointmentDate,
      time: appointmentTime,
    },
    certificate: {
      daysLabel,
      cid: String(variables.CID || '').trim(),
      observations: String(variables.OBSERVACOES || variables.OBSERVACOES_CLINICAS || '').trim(),
      city: cityLabel,
      issueDateExtenso,
      validationCode: String(variables.CODIGO_VALIDACAO || '').trim(),
    },
  };
}

export function buildAtestadoPreviewText(variables = {}) {
  const ctx = buildAtestadoPrintContext({
    db: {},
    patient: {
      full_name: variables.PACIENTE_NOME,
      cpf: variables.PACIENTE_CPF,
    },
    professional: {
      nomeCompleto: variables.PROFISSIONAL_NOME,
      cro: variables.PROFISSIONAL_CRO,
      especialidade: variables.PROFISSIONAL_ESPECIALIDADE,
    },
    appointment: {
      date: variables.DATA_ATENDIMENTO,
      startTime: variables.HORA_ATENDIMENTO,
    },
    variables,
  });

  const lines = ['ATESTADO ODONTOLÓGICO', ''];
  lines.push(
    buildMainParagraph(ctx)
      .replace(/<\/?strong>/g, '')
      .replace(/&nbsp;/g, ' '),
  );
  lines.push('');

  if (hasText(ctx.certificate.cid)) {
    lines.push(`CID: ${ctx.certificate.cid}`);
  }
  if (hasText(ctx.certificate.daysLabel)) {
    lines.push(`Período de afastamento: ${ctx.certificate.daysLabel}`);
  }
  if (hasText(ctx.appointment.date) || hasText(ctx.appointment.time)) {
    const dateTime = [ctx.appointment.date, ctx.appointment.time].filter(hasText).join(' às ');
    lines.push(`Data e hora do atendimento: ${dateTime}`);
  }
  if (hasText(ctx.certificate.observations)) {
    lines.push('');
    lines.push(`Observações clínicas: ${ctx.certificate.observations}`);
  }

  lines.push('');
  const cityDate = [ctx.certificate.city, ctx.certificate.issueDateExtenso].filter(hasText).join(', ');
  if (cityDate) lines.push(cityDate);
  lines.push('');
  lines.push('____________________________________');
  if (hasText(ctx.professional.name)) lines.push(ctx.professional.name);
  if (hasText(ctx.professional.cro)) lines.push(ctx.professional.cro);
  if (hasText(ctx.professional.specialty)) lines.push(ctx.professional.specialty);

  return lines.join('\n');
}

function renderHeader(clinic) {
  const logo = clinic.logoUrl
    ? `<img src="${escapeHtml(clinic.logoUrl)}" alt="" />`
    : '';
  const lines = buildHeaderLines(clinic)
    .map((line) => `<p class="atestado-header-line">${escapeHtml(line)}</p>`)
    .join('');

  return `
    <header class="atestado-header">
      ${logo}
      <div class="atestado-header-info">
        ${hasText(clinic.name) ? `<h1 class="atestado-clinic-name">${escapeHtml(clinic.name)}</h1>` : ''}
        ${lines}
      </div>
    </header>`;
}

function renderDetails(ctx) {
  const blocks = [];
  if (hasText(ctx.certificate.cid)) {
    blocks.push(`<p class="atestado-detail"><strong>CID:</strong> ${escapeHtml(ctx.certificate.cid)}</p>`);
  }
  if (hasText(ctx.certificate.daysLabel)) {
    blocks.push(
      `<p class="atestado-detail"><strong>Período de afastamento:</strong> ${escapeHtml(ctx.certificate.daysLabel)}</p>`,
    );
  }
  if (hasText(ctx.appointment.date) || hasText(ctx.appointment.time)) {
    const dateTime = [ctx.appointment.date, ctx.appointment.time].filter(hasText).join(' às ');
    blocks.push(
      `<p class="atestado-detail"><strong>Data e hora do atendimento:</strong> ${escapeHtml(dateTime)}</p>`,
    );
  }
  if (hasText(ctx.certificate.observations)) {
    blocks.push(
      `<p class="atestado-detail"><strong>Observações clínicas:</strong> ${escapeHtml(ctx.certificate.observations)}</p>`,
    );
  }
  return blocks.join('');
}

function renderSignature(ctx) {
  const cityDate = [ctx.certificate.city, ctx.certificate.issueDateExtenso]
    .filter(hasText)
    .join(', ');

  const profLines = [
    hasText(ctx.professional.name) ? ctx.professional.name : '',
    hasText(ctx.professional.cro) ? ctx.professional.cro : '',
    hasText(ctx.professional.specialty) ? ctx.professional.specialty : '',
  ].filter(hasText);

  return `
    <section class="atestado-signature-section">
      ${cityDate ? `<p class="atestado-city-date">${escapeHtml(cityDate)}.</p>` : ''}
      <div class="atestado-signature-block">
        <div class="atestado-signature-line" aria-hidden="true"></div>
        ${profLines
          .map((line, i) => {
            const cls = i === 0 ? 'atestado-signature-name' : 'atestado-signature-meta';
            return `<p class="${cls}">${escapeHtml(line)}</p>`;
          })
          .join('')}
      </div>
    </section>`;
}

function renderFooter(ctx) {
  const validation = hasText(ctx.certificate.validationCode)
    ? `<div class="atestado-validation">Código de validação: ${escapeHtml(ctx.certificate.validationCode)}</div>`
    : '';

  return `
    <footer class="atestado-footer">
      <p>Atestado emitido eletronicamente pelo sistema Love Odonto.</p>
      ${validation}
    </footer>`;
}

export function buildAtestadoPrintHtml(context) {
  const ctx = context.clinic ? context : buildAtestadoPrintContext(context);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Atestado Odontológico${hasText(ctx.patient.name) ? ` — ${escapeHtml(ctx.patient.name)}` : ''}</title>
  <style>${ATESTADO_PRINT_CSS}</style>
</head>
<body>
  <div class="atestado-document">
    ${renderHeader(ctx.clinic)}
    <div class="atestado-title-block">
      <h2 class="atestado-title">Atestado Odontológico</h2>
    </div>
    <div class="atestado-body">
      <p class="atestado-paragraph">${buildMainParagraph(ctx)}</p>
      ${renderDetails(ctx)}
    </div>
    ${renderSignature(ctx)}
    ${renderFooter(ctx)}
  </div>
</body>
</html>`;
}

export function openAtestadoPrintWindow(params) {
  const html = buildAtestadoPrintHtml(params);
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
  return true;
}
