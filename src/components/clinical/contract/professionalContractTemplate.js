import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  buildProfessionalContractContext,
  escapeHtml,
  hasText,
  regionLabel,
  calcProcedureTotal,
} from './buildProfessionalContractContext.js';

function renderList(items) {
  if (!items?.length) return '';
  return `<ol class="legal-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function renderProceduresTable(procedures, globalValue) {
  if (!procedures?.length) {
    return '<p class="legal-paragraph">Não há procedimentos vinculados ao orçamento aprovado.</p>';
  }
  const rows = procedures.map((proc) => {
    const qty = Number(proc.quantity || 1);
    const unit = Number(proc.unitValue || 0);
    const total = calcProcedureTotal(proc);
    return `
      <tr>
        <td>${escapeHtml(proc.name || proc.title || 'Procedimento')}</td>
        <td>${escapeHtml(regionLabel(proc))}</td>
        <td class="center">${qty}</td>
        <td class="right">${formatCurrencyBRL(unit)}</td>
        <td class="right">${formatCurrencyBRL(total)}</td>
      </tr>`;
  }).join('');

  return `
    <table class="legal-table">
      <thead>
        <tr>
          <th>Procedimento</th>
          <th>Região</th>
          <th class="center">Quantidade</th>
          <th class="right">Valor unitário</th>
          <th class="right">Valor total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" class="right"><strong>Valor global contratado:</strong></td>
          <td class="right"><strong>${formatCurrencyBRL(globalValue)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}

function renderPaymentFields(financial) {
  const lines = [
    { label: 'Valor total do tratamento', value: financial.originalValueFormatted },
    { label: 'Desconto concedido', value: financial.discountFormatted },
    { label: 'Valor final contratado', value: financial.finalValueFormatted },
    { label: 'Forma de pagamento', value: financial.paymentTitle },
  ];

  for (const row of financial.detailRows || []) {
    lines.push({ label: row.label, value: row.value });
  }

  return `
    <dl class="payment-fields">
      ${lines.map((line) => `
        <div class="payment-field">
          <dt>${escapeHtml(line.label)}:</dt>
          <dd>${escapeHtml(line.value)}</dd>
        </div>`).join('')}
    </dl>`;
}

function renderInstallmentTable(schedule) {
  if (!schedule?.length) {
    return '<p class="legal-paragraph">Cronograma de parcelas conforme condição financeira aprovada.</p>';
  }

  const rows = schedule.map((row, index) => {
    let parcelLabel = row.label || String(index + 1);
    if (/^Parcela\s(\d+)$/i.test(parcelLabel)) {
      parcelLabel = parcelLabel.replace(/^Parcela\s/i, '').padStart(2, '0');
    }
    return `
      <tr>
        <td class="center">${escapeHtml(parcelLabel)}</td>
        <td class="center">${escapeHtml(row.dueDateFormatted || '—')}</td>
        <td class="right">${escapeHtml(row.amountFormatted)}</td>
      </tr>`;
  }).join('');

  return `
    <table class="legal-table">
      <thead>
        <tr>
          <th class="center">Parcela</th>
          <th class="center">Vencimento</th>
          <th class="right">Valor</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSignatures(ctx) {
  const { patient, professional, clinic, meta } = ctx;
  const guardianLine = patient.guardian !== '—'
    ? escapeHtml(patient.guardian)
    : '________________________________________';

  return `
    <p class="legal-paragraph closing-text">
      E, por estarem justos e contratados, assinam o presente instrumento em 2 (duas) vias de igual teor e forma.
    </p>
    <p class="legal-paragraph signature-place">
      ${escapeHtml(meta.city)}, ${escapeHtml(meta.issueDateExtenso)}.
    </p>
    <div class="signatures-block">
      <div class="signature-item">
        <div class="signature-line"></div>
        <p><strong>CONTRATANTE / Paciente</strong></p>
        <p>${escapeHtml(patient.name)}</p>
        <p>CPF: ${escapeHtml(patient.cpf)}</p>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <p><strong>Responsável legal</strong></p>
        <p>${guardianLine}</p>
        <p>(quando aplicável)</p>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <p><strong>Profissional responsável</strong></p>
        <p>${escapeHtml(professional.name)}</p>
        <p>${escapeHtml(professional.cro)}</p>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <p><strong>CONTRATADA / Clínica</strong></p>
        <p>${escapeHtml(clinic.legalName || clinic.name)}</p>
        <p>CNPJ: ${escapeHtml(clinic.cnpj)}</p>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <p><strong>Testemunha 1</strong></p>
        <p>Nome: ____________________________________</p>
        <p>CPF: ____________________________________</p>
      </div>
      <div class="signature-item">
        <div class="signature-line"></div>
        <p><strong>Testemunha 2</strong></p>
        <p>Nome: ____________________________________</p>
        <p>CPF: ____________________________________</p>
      </div>
    </div>
    <p class="validation-line">
      Documento gerado eletronicamente. Hash de validação: <strong>${escapeHtml(ctx.validationHash)}</strong>
    </p>`;
}

export function buildProfessionalContractHtml(context) {
  const ctx = context.meta ? context : buildProfessionalContractContext(context);
  const {
    meta, clinic, patient, professional, treatment, procedures, financial, legalTexts, treatmentWarranty,
  } = ctx;

  const logoBlock = clinic.logoUrl
    ? `<img class="header-logo" src="${escapeHtml(clinic.logoUrl)}" alt="" />`
    : '';

  const clinicIdentity = [
    hasText(clinic.legalName) && clinic.legalName !== clinic.name ? clinic.legalName : '',
    hasText(clinic.cnpj) ? `CNPJ: ${clinic.cnpj}` : '',
    clinic.address,
    hasText(clinic.phone) ? `Telefone: ${clinic.phone}` : '',
    hasText(clinic.email) ? `E-mail: ${clinic.email}` : '',
  ].filter(hasText);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contrato de Prestação de Serviços Odontológicos — ${escapeHtml(patient.name)}</title>
  <style>
    @page {
      size: A4;
      margin: 22mm 20mm 28mm 20mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .contract-document {
      max-width: 170mm;
      margin: 0 auto;
      padding: 8mm 0 20mm;
    }
    .contract-header {
      text-align: center;
      margin-bottom: 22pt;
      padding-bottom: 14pt;
      border-bottom: 1pt solid #000;
    }
    .header-logo {
      max-width: 70px;
      max-height: 70px;
      object-fit: contain;
      margin-bottom: 10pt;
    }
    .clinic-title {
      margin: 0 0 6pt;
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .clinic-meta {
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 10pt;
      line-height: 1.5;
    }
    .document-title {
      margin: 16pt 0 8pt;
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .document-meta {
      font-size: 10.5pt;
      margin: 0;
    }
    .document-meta span { display: inline-block; margin: 0 12pt; }
    .contract-section {
      margin-bottom: 18pt;
      break-inside: avoid-page;
    }
    .section-title {
      margin: 0 0 10pt;
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .subsection-title {
      margin: 12pt 0 6pt;
      font-size: 10.5pt;
      font-weight: 700;
    }
    .legal-paragraph {
      margin: 0 0 8pt;
      text-align: justify;
      text-indent: 12pt;
    }
    .legal-paragraph.no-indent { text-indent: 0; }
    .party-label {
      margin: 10pt 0 4pt;
      font-weight: 700;
      text-transform: uppercase;
      text-indent: 0;
    }
    .party-data {
      margin: 0 0 3pt 12pt;
      text-align: left;
      text-indent: 0;
    }
    .legal-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0 12pt;
      font-size: 10pt;
    }
    .legal-table th,
    .legal-table td {
      border: 0.75pt solid #000;
      padding: 5pt 6pt;
      vertical-align: top;
    }
    .legal-table th {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9pt;
      letter-spacing: 0.03em;
    }
    .legal-table tfoot td {
      font-weight: 700;
      background: #f7f7f7;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .payment-fields {
      margin: 8pt 0 12pt;
      padding: 0;
    }
    .payment-field {
      display: flex;
      gap: 8pt;
      margin-bottom: 4pt;
      font-size: 11pt;
    }
    .payment-field dt {
      min-width: 180pt;
      font-weight: 700;
      margin: 0;
    }
    .payment-field dd {
      margin: 0;
      flex: 1;
    }
    .legal-list {
      margin: 6pt 0 10pt 0;
      padding-left: 20pt;
      text-align: justify;
    }
    .legal-list li { margin-bottom: 4pt; }
    .image-auth {
      margin: 8pt 0;
      font-size: 11pt;
    }
    .image-auth label {
      display: inline-block;
      margin-right: 24pt;
    }
    .signatures-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28pt 20pt;
      margin-top: 24pt;
    }
    .signature-item {
      break-inside: avoid;
      font-size: 10pt;
      text-align: center;
    }
    .signature-line {
      height: 36pt;
      border-bottom: 0.75pt solid #000;
      margin-bottom: 6pt;
    }
    .signature-item p { margin: 0 0 2pt; }
    .closing-text { margin-top: 18pt; }
    .signature-place {
      text-align: center;
      text-indent: 0;
      margin: 14pt 0 0;
    }
    .validation-line {
      margin-top: 16pt;
      padding-top: 8pt;
      border-top: 0.5pt solid #666;
      font-size: 9pt;
      color: #333;
      text-align: center;
      text-indent: 0;
    }
    .print-footer {
      display: none;
    }
    @media print {
      html, body { background: #fff; }
      .contract-document { max-width: none; padding: 0; }
      .print-footer {
        display: block;
        position: fixed;
        bottom: 8mm;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 9pt;
        color: #444;
        border-top: 0.5pt solid #999;
        padding-top: 4pt;
      }
    }
  </style>
</head>
<body>
  <div class="contract-document">
    <header class="contract-header">
      ${logoBlock}
      <h1 class="clinic-title">${escapeHtml(clinic.name)}</h1>
      <ul class="clinic-meta">
        ${clinicIdentity.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
      <h2 class="document-title">Contrato de Prestação de Serviços Odontológicos</h2>
      <p class="document-meta">
        <span><strong>Nº:</strong> ${escapeHtml(meta.contractNumber)}</span>
        <span><strong>Data de emissão:</strong> ${escapeHtml(meta.issueDate)}</span>
      </p>
    </header>

    <section class="contract-section">
      <h3 class="section-title">1. Das Partes</h3>
      <p class="legal-paragraph no-indent">
        Pelo presente instrumento particular, de um lado:
      </p>
      <p class="party-label">A Contratada:</p>
      <p class="party-data"><strong>Razão social / Nome:</strong> ${escapeHtml(clinic.legalName || clinic.name)}</p>
      <p class="party-data"><strong>CNPJ:</strong> ${escapeHtml(clinic.cnpj)}</p>
      <p class="party-data"><strong>Endereço:</strong> ${escapeHtml(clinic.address)}</p>
      <p class="party-data"><strong>Representante legal:</strong> ${escapeHtml(clinic.legalRepresentative)}</p>
      <p class="party-data"><strong>Profissional responsável:</strong> ${escapeHtml(professional.name)}</p>
      <p class="party-data"><strong>Conselho profissional (CRO):</strong> ${escapeHtml(professional.cro)}</p>
      <p class="legal-paragraph no-indent party-label">E, de outro lado, o Contratante:</p>
      <p class="party-data"><strong>Nome completo:</strong> ${escapeHtml(patient.name)}</p>
      <p class="party-data"><strong>CPF:</strong> ${escapeHtml(patient.cpf)}</p>
      <p class="party-data"><strong>RG:</strong> ${escapeHtml(patient.rg)}</p>
      <p class="party-data"><strong>Data de nascimento:</strong> ${escapeHtml(patient.birthDate)}</p>
      <p class="party-data"><strong>Estado civil:</strong> ${escapeHtml(patient.maritalStatus)}</p>
      <p class="party-data"><strong>Endereço:</strong> ${escapeHtml(patient.address)}</p>
      <p class="party-data"><strong>Telefone:</strong> ${escapeHtml(patient.phone)}</p>
      <p class="party-data"><strong>E-mail:</strong> ${escapeHtml(patient.email)}</p>
      ${patient.guardian !== '—' ? `<p class="party-data"><strong>Responsável legal:</strong> ${escapeHtml(patient.guardian)}</p>` : ''}
      <p class="legal-paragraph">
        As partes acima qualificadas têm, entre si, justo e contratado o presente instrumento, que se regerá pelas cláusulas e condições seguintes.
      </p>
    </section>

    <section class="contract-section">
      <h3 class="section-title">2. Do Objeto</h3>
      <p class="legal-paragraph">${escapeHtml(legalTexts.object)}</p>
      <p class="legal-paragraph no-indent">
        <strong>Plano de tratamento:</strong> ${escapeHtml(treatment.planName)} (${escapeHtml(treatment.typeLabel)}).
      </p>
    </section>

    <section class="contract-section">
      <h3 class="section-title">3. Dos Procedimentos Contratados</h3>
      <p class="legal-paragraph">
        Integram o presente contrato os procedimentos odontológicos aprovados pelo CONTRATANTE, conforme discriminados na tabela abaixo:
      </p>
      ${renderProceduresTable(procedures, financial.finalValue)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">4. Da Duração do Tratamento</h3>
      <p class="legal-paragraph">${escapeHtml(legalTexts.duration)}</p>
      <p class="legal-paragraph no-indent">
        <strong>Data prevista de início:</strong> ${escapeHtml(treatment.startDate)}.
      </p>
      <p class="legal-paragraph no-indent">
        <strong>Data prevista de término:</strong> ${escapeHtml(treatment.endDate)}.
      </p>
    </section>

    <section class="contract-section">
      <h3 class="section-title">5. Do Pagamento</h3>
      <p class="legal-paragraph">
        O CONTRATANTE pagará à CONTRATADA pelos serviços odontológicos contratados, nas condições financeiras aprovadas e vinculadas ao orçamento nº ${escapeHtml(meta.budgetNumber)}, conforme abaixo:
      </p>
      ${renderPaymentFields(financial)}
      <h4 class="subsection-title">5.1. Do Cronograma de Parcelas</h4>
      <p class="legal-paragraph no-indent">
        O pagamento será efetuado conforme cronograma de vencimentos a seguir:
      </p>
      ${renderInstallmentTable(financial.schedule)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">6. Das Garantias</h3>
      <p class="legal-paragraph">${escapeHtml(legalTexts.warrantiesGeneral)}</p>
      ${treatmentWarranty ? `<p class="legal-paragraph">${escapeHtml(treatmentWarranty)}</p>` : ''}
      <p class="legal-paragraph">${escapeHtml(legalTexts.warrantiesMaintenance)}</p>
      <p class="legal-paragraph">${escapeHtml(legalTexts.warrantiesReturns)}</p>
    </section>

    <section class="contract-section">
      <h3 class="section-title">7. Das Obrigações do Paciente</h3>
      <p class="legal-paragraph">São obrigações do CONTRATANTE:</p>
      ${renderList(legalTexts.patientObligations)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">8. Das Obrigações da Clínica</h3>
      <p class="legal-paragraph">São obrigações da CONTRATADA:</p>
      ${renderList(legalTexts.clinicObligations)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">9. Da Inadimplência</h3>
      ${renderList(legalTexts.default)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">10. Da Rescisão</h3>
      ${renderList(legalTexts.rescission)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">11. Da LGPD — Proteção de Dados Pessoais</h3>
      ${renderList(legalTexts.lgpd)}
    </section>

    <section class="contract-section">
      <h3 class="section-title">12. Do Uso de Imagem</h3>
      <p class="legal-paragraph">${escapeHtml(legalTexts.imageUse)}</p>
      <p class="image-auth">
        <label>( &nbsp; ) AUTORIZA</label>
        <label>( &nbsp; ) NÃO AUTORIZA</label>
      </p>
    </section>

    <section class="contract-section">
      <h3 class="section-title">13. Do Foro</h3>
      <p class="legal-paragraph">${escapeHtml(legalTexts.forum)}</p>
      <p class="legal-paragraph no-indent">
        <strong>Comarca eleita:</strong> ${escapeHtml(clinic.city || meta.city)}.
      </p>
    </section>

    <section class="contract-section">
      <h3 class="section-title">Das Assinaturas</h3>
      ${renderSignatures(ctx)}
    </section>
  </div>

  <div class="print-footer">
    ${escapeHtml(clinic.name)} — Contrato nº ${escapeHtml(meta.contractNumber)} — Hash: ${escapeHtml(ctx.validationHash)}
  </div>
</body>
</html>`;
}
