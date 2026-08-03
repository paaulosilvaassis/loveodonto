import {
  buildProfessionalContractContext,
  escapeHtml,
  hasText,
} from './buildProfessionalContractContext.js';
import { PROFESSIONAL_CONTRACT_CSS } from './professionalContractStyles.js';
import { buildForumClauseText } from './professionalContractClauses.js';
import { getConditionalClausesForTreatments } from '../../../contracts/contractConditionalClauses.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

const ORDINALS = [
  'PRIMEIRA', 'SEGUNDA', 'TERCEIRA', 'QUARTA', 'QUINTA', 'SEXTA',
  'SÉTIMA', 'OITAVA', 'NONA', 'DÉCIMA', 'DÉCIMA PRIMEIRA', 'DÉCIMA SEGUNDA',
  'DÉCIMA TERCEIRA', 'DÉCIMA QUARTA', 'DÉCIMA QUINTA',
];

function clauseHeading(number, title) {
  const ordinal = ORDINALS[number - 1] || `${number}ª`;
  return `<h3 class="clause-heading">CLÁUSULA ${ordinal} — ${escapeHtml(title)}</h3>`;
}

function renderAlphaList(items) {
  if (!items?.length) return '';
  return `<ol class="clause-list alpha">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function renderParagraphs(items) {
  if (!items?.length) return '';
  if (typeof items === 'string') return `<p class="clause-p">${escapeHtml(items)}</p>`;
  return items.map((item) => `<p class="clause-p">${escapeHtml(item)}</p>`).join('');
}

function buildPartyQualification(clinic, patient) {
  const clinicName = clinic.legalName || clinic.name;
  const rtName = clinic.technicalResponsible;
  const rtCro = clinic.technicalResponsibleCro;

  let contracted = `Pelo presente instrumento particular de prestação de serviços odontológicos, de um lado ${clinicName}`;
  if (hasText(clinic.cnpj)) {
    contracted += `, inscrita no CNPJ sob nº ${clinic.cnpj}`;
  }
  if (hasText(clinic.address)) {
    contracted += `, estabelecida à ${clinic.address}`;
  }
  if (hasText(rtName)) {
    contracted += `, neste ato representada por seu responsável técnico ${rtName}`;
    if (hasText(rtCro)) contracted += `, ${rtCro}`;
  }
  contracted += ', doravante denominada CONTRATADA.';

  let contractor = `E de outro lado ${patient.name || 'o CONTRATANTE'}`;
  if (hasText(patient.cpf)) {
    contractor += `, inscrito no CPF nº ${patient.cpf}`;
  }
  if (hasText(patient.rg)) {
    contractor += `, portador do RG nº ${patient.rg}`;
  }
  if (hasText(patient.address)) {
    contractor += `, residente e domiciliado à ${patient.address}`;
  }
  contractor += ', doravante denominado CONTRATANTE.';

  return `${contracted}\n\n${contractor}\n\nAs partes acima qualificadas têm entre si justo e contratado o presente instrumento, que se regerá pelas cláusulas e condições seguintes:`;
}

function renderProceduresList(procedures) {
  if (!procedures?.length) {
    return '<p class="clause-p">Não há procedimentos vinculados ao orçamento aprovado.</p>';
  }
  return procedures.map((proc, index) => {
    const roman = ROMAN[index] || String(index + 1);
    const name = proc.name || proc.title || 'Procedimento';
    const qty = Number(proc.quantity || 1);
    const suffix = qty > 1 ? ` (${qty} unidade${qty > 1 ? 's' : ''})` : '';
    return `<p class="clause-p proc-item"><strong>${roman}</strong> — ${escapeHtml(name)}${escapeHtml(suffix)}</p>`;
  }).join('');
}

function renderFinancialConditions(financial) {
  const lines = financial.summaryLines || [];
  if (!lines.length) return '';

  const prose = [];
  const words = financial.finalValueWords;
  const valuePhrase = words
    ? `${financial.finalValueFormatted} (${words})`
    : financial.finalValueFormatted;

  prose.push(
    `O CONTRATANTE obriga-se ao pagamento do valor final de ${valuePhrase}, nas condições financeiras aprovadas no orçamento vinculado a este contrato, conforme discriminação a seguir:`,
  );

  const items = lines.map((line) => `
    <p class="financial-line"><strong>${escapeHtml(line.label)}:</strong> ${escapeHtml(line.value)}</p>
  `).join('');

  return `
    ${prose.map((text) => `<p class="clause-p">${escapeHtml(text)}</p>`).join('')}
    <div class="financial-lines">${items}</div>`;
}

function renderFinancialSchedule(schedule) {
  if (!schedule?.length) return '';

  const rows = schedule.map((row) => `
    <tr>
      <td>${escapeHtml(row.parcelLabel || row.label)}</td>
      <td class="center">${escapeHtml(row.dueDateFormatted)}</td>
      <td class="right">${escapeHtml(row.amountFormatted)}</td>
      <td>${escapeHtml(row.paymentMethod || '')}</td>
      <td class="center">${escapeHtml(row.statusLabel || 'A vencer')}</td>
    </tr>
  `).join('');

  return `
    <table class="legal-table">
      <thead>
        <tr>
          <th>Parcela</th>
          <th>Vencimento</th>
          <th>Valor</th>
          <th>Forma de pagamento</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRunningHeader(clinic, meta) {
  return `
    <div class="print-running-header">
      ${escapeHtml(clinic.name)} — Contrato nº ${escapeHtml(meta.contractNumber)}
    </div>`;
}

function renderDocumentHeader(clinic) {
  const logoBlock = clinic.logoUrl
    ? `<img src="${escapeHtml(clinic.logoUrl)}" alt="Logo da clínica" />`
    : '';

  const rtLine = hasText(clinic.technicalResponsible)
    ? `Responsável Técnico: ${clinic.technicalResponsible}${hasText(clinic.technicalResponsibleCro) ? ` — ${clinic.technicalResponsibleCro}` : ''}`
    : '';

  const lines = [
    hasText(clinic.cnpj) ? `CNPJ: ${clinic.cnpj}` : '',
    clinic.address,
    hasText(clinic.phone) ? `Telefone: ${clinic.phone}` : '',
    rtLine,
  ].filter(hasText);

  return `
    <header class="doc-header">
      ${logoBlock}
      <p class="clinic-name">${escapeHtml(clinic.name)}</p>
      ${lines.map((line) => `<p class="header-line">${escapeHtml(line)}</p>`).join('')}
    </header>`;
}

function formatSignatureCity(city) {
  if (!hasText(city)) return '';
  return String(city).trim();
}

function renderSignatureBlock({ title, lines }) {
  const body = (lines || []).filter(hasText).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  return `
    <div class="signature-block">
      <div class="signature-line" aria-hidden="true"></div>
      <p class="signature-title">${escapeHtml(title)}</p>
      ${body}
    </div>`;
}

function renderWitnessBlock(title) {
  return `
    <div class="signature-block">
      <div class="signature-line" aria-hidden="true"></div>
      <p class="signature-title">${escapeHtml(title)}</p>
      <p>Nome: ________________________________</p>
      <p>CPF: _________________________________</p>
    </div>`;
}

function applyClausePlaceholders(html, replacements = {}) {
  let out = String(html || '');
  for (const [tag, value] of Object.entries(replacements)) {
    const safe = escapeHtml(String(value ?? ''));
    out = out.split(tag).join(safe);
  }
  return out;
}

function renderConditionalClausesSection(treatmentTypes, replacements, startClauseNum) {
  const clauses = getConditionalClausesForTreatments(treatmentTypes || []);
  if (!clauses.length) return { html: '', nextClauseNum: startClauseNum };

  let clauseNum = startClauseNum;
  const blocks = clauses.map((item) => {
    const heading = clauseHeading(clauseNum++, item.title);
    const body = applyClausePlaceholders(item.html, replacements);
    return `${heading}${body}`;
  });

  return { html: blocks.join('\n'), nextClauseNum: clauseNum };
}

function renderSignatures(ctx) {
  const { patient, professional, clinic, meta } = ctx;
  const cityDate = [
    formatSignatureCity(meta.city),
    meta.issueDateExtenso,
  ].filter(hasText).join(', ');

  return `
    <section class="signature-section">
      <p class="clause-p signature-closing">
        E, por estarem justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor e forma.
      </p>
      ${cityDate ? `<p class="signature-place">${escapeHtml(cityDate)}.</p>` : ''}

      <div class="signature-grid-3">
        ${renderSignatureBlock({
          title: 'Contratante / Paciente',
          lines: [
            patient.name,
            hasText(patient.cpf) ? `CPF: ${patient.cpf}` : '',
          ],
        })}
        ${renderSignatureBlock({
          title: 'Responsável Técnico',
          lines: [
            clinic.technicalResponsible,
            clinic.technicalResponsibleCro,
          ],
        })}
        ${renderSignatureBlock({
          title: 'Representante Legal da Contratada',
          lines: [
            clinic.legalName || clinic.name,
            hasText(clinic.cnpj) ? `CNPJ: ${clinic.cnpj}` : '',
          ],
        })}
      </div>

      <div class="signature-grid-2">
        ${renderWitnessBlock('Testemunha 1')}
        ${renderWitnessBlock('Testemunha 2')}
      </div>
    </section>`;
}

export function buildProfessionalContractHtml(context) {
  const ctx = context.meta ? context : buildProfessionalContractContext(context);
  const {
    meta, clinic, patient, professional, treatment, procedures,
    financial, legalTexts, treatmentWarranties,
  } = ctx;

  const forumCity = clinic.clinicForumCity || meta.clinicForumCity;
  if (!forumCity) {
    throw new Error('Cadastre a cidade e UF da clínica para gerar corretamente a cláusula de foro.');
  }
  const forumText = buildForumClauseText(forumCity);

  const objectText = `${legalTexts.object} Plano de tratamento: ${treatment.planName}.`;

  const qualification = buildPartyQualification(clinic, patient)
    .split('\n\n')
    .map((p) => `<p class="clause-p">${escapeHtml(p)}</p>`)
    .join('');

  let clauseNum = 1;
  const treatmentTypes = treatment.treatmentTypes
    || (treatment.treatmentType ? [treatment.treatmentType] : []);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contrato de Prestação de Serviços Odontológicos — ${escapeHtml(patient.name)}</title>
  <style>${PROFESSIONAL_CONTRACT_CSS}</style>
</head>
<body>
  ${renderRunningHeader(clinic, meta)}
  <div class="contract-document">
    ${renderDocumentHeader(clinic)}

    <div class="doc-title-block">
      <h1 class="doc-title">Contrato de Prestação de Serviços Odontológicos</h1>
      <p class="doc-meta-line">Contrato nº ${escapeHtml(meta.contractNumber)}</p>
      ${hasText(meta.city) ? `<p class="doc-meta-line">${escapeHtml(meta.city)}</p>` : ''}
      <p class="doc-meta-line">${escapeHtml(meta.issueDateExtenso)}</p>
    </div>

    ${qualification}

    ${clauseHeading(clauseNum++, 'DO OBJETO')}
    <p class="clause-p">${escapeHtml(objectText)}</p>

    ${clauseHeading(clauseNum++, 'DOS PROCEDIMENTOS CONTRATADOS')}
    <p class="clause-p">Integram o presente contrato os procedimentos odontológicos aprovados pelo CONTRATANTE${hasText(meta.budgetNumber) ? `, conforme orçamento nº ${meta.budgetNumber}` : ''}, a seguir discriminados:</p>
    ${renderProceduresList(procedures)}

    ${clauseHeading(clauseNum++, 'DA DURAÇÃO DO TRATAMENTO')}
    <p class="clause-p">${escapeHtml(legalTexts.duration)}</p>

    ${clauseHeading(clauseNum++, 'DAS CONDIÇÕES FINANCEIRAS')}
    ${renderFinancialConditions(financial)}

    ${clauseHeading(clauseNum++, 'DO CRONOGRAMA FINANCEIRO')}
    <p class="clause-p">O pagamento será realizado conforme o cronograma abaixo, integrando o presente contrato para todos os fins de direito:</p>
    ${renderFinancialSchedule(financial.schedule)}

    ${clauseHeading(clauseNum++, 'DA INADIMPLÊNCIA')}
    <p class="clause-p">${escapeHtml(legalTexts.default)}</p>

    ${clauseHeading(clauseNum++, 'DA RESCISÃO')}
    ${renderParagraphs(legalTexts.rescission)}

    ${clauseHeading(clauseNum++, 'DAS GARANTIAS')}
    <p class="clause-p">${escapeHtml(legalTexts.warrantiesGeneral)}</p>
    ${renderParagraphs(legalTexts.warranties)}
    ${(treatmentWarranties || []).map((text) => `<p class="clause-p">${escapeHtml(text)}</p>`).join('')}

    ${clauseHeading(clauseNum++, 'DAS OBRIGAÇÕES DO CONTRATANTE')}
    ${renderAlphaList(legalTexts.patientObligations)}

    ${clauseHeading(clauseNum++, 'DAS OBRIGAÇÕES DA CONTRATADA')}
    ${renderAlphaList(legalTexts.clinicObligations)}

    ${clauseHeading(clauseNum++, 'DO ABANDONO DE TRATAMENTO')}
    <p class="clause-p">${escapeHtml(legalTexts.abandonment)}</p>

    ${clauseHeading(clauseNum++, 'DA PROTEÇÃO DE DADOS PESSOAIS — LGPD')}
    <p class="clause-p">${escapeHtml(legalTexts.lgpd)}</p>

    ${clauseHeading(clauseNum++, 'DO USO DE IMAGEM')}
    <p class="clause-p">${escapeHtml(legalTexts.imageUse)}</p>
    <div class="image-auth">
      <span>( &nbsp;) Não autorizado</span>
      <span>( &nbsp;) Autorizado apenas para prontuário</span>
      <span>( &nbsp;) Autorizado para fins científicos</span>
      <span>( &nbsp;) Autorizado para marketing/redes sociais</span>
    </div>

    ${(() => {
      const conditional = renderConditionalClausesSection(
        treatmentTypes,
        { '#manutencaoMeses': treatment.maintenanceMonths || meta.maintenanceMonths || '—' },
        clauseNum,
      );
      clauseNum = conditional.nextClauseNum;
      return conditional.html;
    })()}

    ${clauseHeading(clauseNum++, 'DO FORO')}
    <p class="clause-p">${escapeHtml(forumText)}</p>

    ${renderSignatures(ctx)}
  </div>
</body>
</html>`;
}
