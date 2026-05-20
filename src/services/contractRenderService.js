/**
 * Monta contexto e substitui hashtags (#tag) em HTML de contratos.
 */
import { loadDb } from '../db/index.js';
import { getPatient } from './patientService.js';
import { getCrmBudgetById } from './crmBudgetService.js';
import { integerToWordsPt, currencyToWordsPt } from '../utils/numberToWordsPt.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const parts = [
    addr.street || addr.logradouro,
    addr.number || addr.numero,
    addr.complement || addr.complemento,
    addr.neighborhood || addr.bairro,
    addr.city || addr.cidade,
    addr.state || addr.uf,
    addr.zip || addr.cep,
  ].filter(Boolean);
  return parts.join(', ');
}

function crmItemsTable(itemsJson) {
  const rows = Array.isArray(itemsJson) ? itemsJson : [];
  if (!rows.length) return '<p><em>Nenhum item de orçamento.</em></p>';
  let html = '<table class="contract-table"><thead><tr><th>Descrição</th><th>Valor (R$)</th></tr></thead><tbody>';
  for (const it of rows) {
    html += `<tr><td>${escapeHtml(it.description || it.label || '')}</td><td>${Number(it.value || 0).toFixed(2)}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function clinicalProceduresTable(procedures) {
  const rows = Array.isArray(procedures) ? procedures : [];
  if (!rows.length) return '<p><em>Nenhum procedimento no orçamento.</em></p>';
  let html = '<table class="contract-table"><thead><tr><th>Procedimento</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead><tbody>';
  for (const p of rows) {
    const q = Number(p.quantity || 1);
    const u = Number(p.unitValue || 0);
    const t = q * u;
    html += `<tr><td>${escapeHtml(p.name || p.description || '')}</td><td>${q}</td><td>${u.toFixed(2)}</td><td>${t.toFixed(2)}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function receivablesTableForPatient(patientId, quoteId) {
  const db = loadDb();
  const list = (db.accountsReceivable || []).filter((r) => r.patient_id === patientId);
  const linked = quoteId
    ? list.filter((r) => String(r.origin_id || '') === String(quoteId))
    : list;
  const use = linked.length ? linked : list;
  if (!use.length) return '<p><em>Nenhuma parcela/título localizado para este vínculo. Cadastre contas a receber ou vincule ao orçamento.</em></p>';
  let html = '<table class="contract-table"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor (R$)</th><th>Status</th></tr></thead><tbody>';
  for (const r of use.slice(0, 60)) {
    html += `<tr><td>${escapeHtml(r.due_date || '')}</td><td>${escapeHtml(r.description || '')}</td><td>${Number(r.net_amount || 0).toFixed(2)}</td><td>${escapeHtml(r.status || '')}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function detectOrthodontics(textBlob) {
  const t = String(textBlob || '').toLowerCase();
  return t.includes('ortodont') || t.includes('aparelho') || t.includes('manutenção ortod');
}

/**
 * @param {object} params
 * @param {'crm_budget'|'clinical_budget'} params.quoteSource
 * @param {string} params.quoteId
 * @param {string} params.patientId
 * @param {object} params.currentUser
 * @param {string} [params.observacoes]
 */
export function buildContractContext(params) {
  const { quoteSource, quoteId, patientId, currentUser, observacoes = '' } = params;
  const db = loadDb();
  const clinic = db.clinicProfile || {};
  const doc = db.clinicDocumentation || {};
  const addresses = db.clinicAddresses || [];
  const mainClinicAddr = addresses[0] || {};
  const patientBundle = getPatient(patientId);
  const profile = patientBundle?.profile || {};
  const pdocs = patientBundle?.documents || {};
  const paddr = (patientBundle?.addresses || [])[0] || {};

  let crmBudget = null;
  let clinicalBudget = null;
  let procHtml = '';
  let totalNum = 0;
  let obs = observacoes;

  if (quoteSource === 'crm_budget') {
    crmBudget = getCrmBudgetById(quoteId);
    if (crmBudget) {
      procHtml = crmItemsTable(crmBudget.itemsJson);
      totalNum = Number(crmBudget.totalValue || 0);
      obs = obs || '';
    }
  } else {
    const ca = (db.clinicalAppointments || []).find((c) => c.appointmentId === quoteId);
    clinicalBudget = ca?.budget || null;
    if (clinicalBudget) {
      procHtml = clinicalProceduresTable(clinicalBudget.procedures);
      totalNum = Number(clinicalBudget.totalValue || 0);
      if (!totalNum && Array.isArray(clinicalBudget.procedures)) {
        totalNum = clinicalBudget.procedures.reduce(
          (sum, proc) => sum + Number(proc.quantity || 1) * Number(proc.unitValue || 0),
          0,
        );
      }
      obs = obs || String(clinicalBudget.notes || clinicalBudget.observations || '');
    }
  }

  const textBlob = `${procHtml} ${obs}`;
  const includeOrtho = detectOrthodontics(textBlob);

  const razao = (clinic.razaoSocial || clinic.nomeFantasia || clinic.nomeClinica || '').trim();
  const cnpj = (doc.cnpj || '').trim();
  const clinEnd = formatAddress(mainClinicAddr) || [clinic.nomeClinica].filter(Boolean).join(' ');
  const cityState = [mainClinicAddr.city || mainClinicAddr.cidade, mainClinicAddr.state || mainClinicAddr.uf].filter(Boolean).join(' / ');

  const hasFin = Boolean(profile.has_financial_responsible);
  const depName = String(profile.dependent_full_name || '').trim();
  const pacNome = String(profile.full_name || '').trim();
  const pacCpf = String(profile.cpf || '').replace(/\D/g, '');
  const pacRg = String(pdocs.rg || '').trim();
  const pacEnd = formatAddress(paddr);

  const totalMan = 0;
  const totalGeral = totalNum + totalMan;

  const map = {
    '#clausula': '',
    '#clinicaRazaoSocial': razao,
    '#clinicaCNPJCPF': cnpj,
    '#emissorCNPJCPF': cnpj,
    '#emissorNomeRazaoSocial': razao,
    '#clinicaEndereco': clinEnd,
    '#clinicaCidadeEstado': cityState || '—',
    '#procedimentos': procHtml,
    '#parcelas': receivablesTableForPatient(patientId, quoteId),
    '#manutencaoMeses': includeOrtho ? '6' : '—',
    '#totalContrato': totalNum.toFixed(2),
    '#totalManutencoes': totalMan.toFixed(2),
    '#totalGeralContrato': totalGeral.toFixed(2),
    '#totalContratoExtenso': currencyToWordsPt(totalNum),
    '#totalManutencoesExtenso': currencyToWordsPt(totalMan),
    '#totalGeralContratoExtenso': currencyToWordsPt(totalGeral),
    '#pacienteNomeCompleto': hasFin ? pacNome : pacNome,
    '#dependenteNomeCompleto': hasFin ? (depName || '________________') : '—',
    '#pessoaCPF': pacCpf,
    '#pessoaRG': pacRg,
    '#pacienteRG': pacRg,
    '#pacienteCPF': pacCpf,
    '#pacienteEndereco': pacEnd,
    '#dentistaNomeCompleto': String(currentUser?.name || '').trim(),
    '#dentistaConselhoNumero': String(doc.conselhoRegionalNumero || '').trim(),
    '#orcamentoObservacoes': escapeHtml(obs).replace(/\n/g, '<br/>'),
    __meta: { includeOrthodontics: includeOrtho, hasFinancialResponsible: hasFin },
  };

  return map;
}

export function applyHashtags(html, contextMap) {
  let out = String(html || '');
  const map = { ...contextMap };
  delete map.__meta;
  for (const [k, v] of Object.entries(map)) {
    if (!k.startsWith('#')) continue;
    const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, v == null ? '' : String(v));
  }
  return out;
}

/** Filtra blocos por conditionType e paciente/orçamento */
export function filterBlocksForRender(blocks, contextMap) {
  const meta = contextMap.__meta || {};
  const hasFin = Boolean(meta.hasFinancialResponsible);
  const ortho = Boolean(meta.includeOrthodontics);
  const list = [...(blocks || [])].filter((b) => b.isActive !== false);
  return list.filter((b) => {
    const c = b.conditionType || 'always';
    if (c === 'always') return true;
    if (c === 'parties_no_financial') return !hasFin;
    if (c === 'parties_with_financial') return hasFin;
    if (c === 'optional_orthodontics') return ortho;
    return true;
  }).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
}
