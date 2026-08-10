/**
 * Resumo clínico/comercial para assinatura pública — somente snapshot congelado.
 * Phase 10.16 / C1. Não recalcula valores.
 */

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
  const procedimentos = asArray(clinical.procedimentos);
  const dentes = asArray(clinical.dentes);
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
    treatment: {
      name: contract.title || contract.contractNumber || 'Tratamento odontológico',
      procedures: procedimentos.length
        ? procedimentos.map((p) => (typeof p === 'string' ? p : p?.name || p?.procedureName || String(p)))
        : [],
      teethRegions: dentes.length
        ? dentes.map((d) => (typeof d === 'string' ? d : d?.tooth || d?.region || String(d)))
        : [],
      quantity: procedimentos.length || null,
      notes: clinical.observacoes || null,
      professionalName: professional.name || null,
    },
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

  return {
    treatment: treatment
      ? {
          name: treatment.name || treatment.summary || session.documentTitle || 'Tratamento odontológico',
          procedures: asArray(treatment.procedures || treatment.items).map((p) => (
            typeof p === 'string' ? p : p?.procedureName || p?.name || String(p)
          )),
          teethRegions: asArray(treatment.teeth || treatment.teethRegions || treatment.regions),
          quantity: treatment.quantity ?? (asArray(treatment.procedures || treatment.items).length || null),
          notes: treatment.notes || treatment.observations || null,
          professionalName: treatment.professionalName || treatment.professional || null,
        }
      : {
          name: session.documentTitle || 'Documento para assinatura',
          procedures: [],
          teethRegions: [],
          quantity: null,
          notes: null,
          professionalName: null,
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
