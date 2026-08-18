/**
 * Resumo clínico/comercial para assinatura pública — somente snapshot congelado.
 * Phase 10.16 / C1 / 10.21BS. Não recalcula valores.
 */

import {
  looksLikeHtml,
  looksLikeEscapedHtml,
  textFromHtmlFragment,
} from './legacyProcedureHtmlParser.js';
import {
  collectStructuredProcedureRows,
  formatProfessionalCroLabel,
  resolveTreatmentDisplayName,
} from './procedureSnapshotRows.js';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function withMoney(row) {
  return {
    ...row,
    unitValueFormatted: formatMoney(row.unitValue),
    totalFormatted: formatMoney(row.totalValue),
  };
}

function sanitizePlainText(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (looksLikeHtml(text) || looksLikeEscapedHtml(text)) {
    return textFromHtmlFragment(text) || null;
  }
  return text;
}

function buildTreatmentBlock({
  title,
  planName,
  clinical,
  professional,
}) {
  const collected = collectStructuredProcedureRows(clinical);
  const procedureRows = collected.rows.map(withMoney);
  const professionalName = professional?.name
    || professional?.nomeCompleto
    || collected.professionalNameFromHtml
    || null;
  const professionalCro = formatProfessionalCroLabel(professional);

  return {
    name: resolveTreatmentDisplayName({
      title,
      planName: planName || clinical?.planName || clinical?.treatmentName,
      procedureName: procedureRows[0]?.name,
    }),
    procedureRows,
    procedures: procedureRows.map((row) => row.name),
    proceduresFallback: Boolean(collected.fallback && !procedureRows.length),
    proceduresSource: collected.source,
    teethRegions: asArray(clinical?.dentes).map((d) => (
      typeof d === 'string' ? d : d?.tooth || d?.region || String(d)
    )).filter(Boolean),
    notes: sanitizePlainText(clinical?.observacoes),
    professionalName,
    professionalCro: professionalCro || null,
  };
}

/**
 * Extrai resumo a partir do contrato V1 (generatedContracts + snapshots).
 * @param {object|null} contract
 */
export function buildPublicSigningSummaryFromV1Contract(contract) {
  if (!contract) {
    return {
      treatment: null,
      financial: null,
      privacy: defaultPrivacyBlock(),
      documentTitle: 'Documento para assinatura',
    };
  }

  const clinical = contract.clinicalSnapshotJson || {};
  const financial = contract.financialSnapshotJson || {};
  const professional = contract.professionalSnapshotJson || {};
  const parcelas = asArray(financial.parcelas);
  const financings = asArray(financial.financiamentos);

  const installmentCount =
    Number(financings[0]?.installments_count)
    || Number(parcelas[0]?.total_installments)
    || (parcelas.length > 0 ? parcelas.length : null);

  const installmentValueRaw =
    parcelas.find((p) => p.net_amount != null || p.original_amount != null);
  const installmentValue = installmentValueRaw
    ? (installmentValueRaw.net_amount ?? installmentValueRaw.original_amount)
    : null;

  const total = contract.totalValueSnapshot ?? financial.valorTotal;
  const entrada = financial.entrada;
  const totalNum = Number(total);
  const entradaNum = Number(entrada);
  const saldo = Number.isFinite(totalNum) && Number.isFinite(entradaNum)
    ? Math.max(totalNum - entradaNum, 0)
    : null;

  const firstDue = parcelas
    .map((p) => p.due_date)
    .filter(Boolean)
    .sort()[0] || null;

  return {
    treatment: buildTreatmentBlock({
      title: contract.title,
      planName: clinical.planName || clinical.treatmentName,
      clinical,
      professional,
    }),
    financial: {
      total: formatMoney(total),
      totalRaw: total,
      downPayment: formatMoney(entrada),
      balance: formatMoney(saldo),
      installmentCount,
      installmentValue: formatMoney(installmentValue),
      paymentMethod: financial.formaPagamento || null,
      firstDueDate: firstDue
        ? new Date(firstDue).toLocaleDateString('pt-BR')
        : null,
    },
    privacy: defaultPrivacyBlock(),
    documentTitle: contract.contractNumber || contract.title || 'Contrato',
  };
}

/**
 * Resumo a partir da sessão pública V2 (campos opcionais do open).
 */
export function buildPublicSigningSummaryFromV2Session(session = {}) {
  const treatment = session.treatmentSummary || session.treatment || null;
  const financial = session.financialSummary || session.financial || null;
  const privacy = session.privacySummary || defaultPrivacyBlock(session.requiredTerms);
  const items = asArray(treatment?.procedures || treatment?.items || treatment?.procedureRows);

  return {
    treatment: treatment
      ? buildTreatmentBlock({
          title: treatment.name || treatment.summary || session.documentTitle,
          planName: treatment.planName || treatment.name,
          clinical: {
            procedures: items,
            procedimentos: items,
            dentes: treatment.teeth || treatment.teethRegions || treatment.regions,
            observacoes: treatment.notes || treatment.observations,
            planName: treatment.planName,
          },
          professional: {
            name: treatment.professionalName || treatment.professional,
            cro: treatment.professionalCro || treatment.cro,
            conselhoUf: treatment.conselhoUf,
          },
        })
      : {
          name: resolveTreatmentDisplayName({ title: session.documentTitle }),
          procedureRows: [],
          procedures: [],
          proceduresFallback: true,
          proceduresSource: 'empty',
          teethRegions: [],
          notes: null,
          professionalName: null,
          professionalCro: null,
        },
    financial: financial
      ? {
          total: formatMoney(financial.total ?? financial.contractTotal ?? financial.valorTotal),
          downPayment: formatMoney(financial.downPayment ?? financial.entrada),
          balance: formatMoney(financial.balance ?? financial.saldo ?? financial.financedAmount),
          installmentCount: financial.installmentCount ?? financial.parcelas ?? null,
          installmentValue: formatMoney(financial.installmentValue ?? financial.valorParcela),
          paymentMethod: financial.paymentMethod || financial.formaPagamento || null,
          firstDueDate: financial.firstDueDate || financial.vencimentoInicial || null,
        }
      : null,
    privacy,
    documentTitle: session.documentTitle || 'Documento para assinatura',
  };
}

export function defaultPrivacyBlock(requiredTerms = []) {
  const terms = Array.isArray(requiredTerms) ? requiredTerms : [];
  const required = [];
  const optional = [];
  for (const t of terms) {
    const item = {
      id: t.id || t.code,
      code: t.code || t.id,
      label: t.label || t.code || 'Consentimento',
      required: Boolean(t.required),
    };
    if (item.required) required.push(item);
    else optional.push(item);
  }

  if (!required.length && !optional.length) {
    required.push({
      id: 'lgpd_notice',
      code: 'LGPD_NOTICE_ACKNOWLEDGED',
      label: 'Declaro que li e compreendi o aviso de privacidade (LGPD) aplicável a este documento.',
      required: true,
    });
    optional.push({
      id: 'image_use_optional',
      code: 'IMAGE_USE_OPTIONAL',
      label: 'Autorizo o uso de imagem para fins educativos ou de divulgação (opcional).',
      required: false,
    });
  }

  return {
    lgpdNotice:
      'Seus dados pessoais e de saúde serão tratados pela clínica apenas para execução do tratamento, '
      + 'cumprimento de obrigações legais e registro do contrato, nos termos da Lei Geral de Proteção de Dados (LGPD). '
      + 'Você pode solicitar informações sobre o tratamento dos seus dados à clínica.',
    requiredConsents: required,
    optionalConsents: optional,
  };
}

/** Garante que nenhum consentimento venha pré-marcado. */
export function resetConsentAcceptanceMap(privacy) {
  const map = {};
  const all = [
    ...(privacy?.requiredConsents || []),
    ...(privacy?.optionalConsents || []),
  ];
  for (const c of all) {
    map[c.id] = false;
  }
  return map;
}
