import { FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import Button from '../../components/Button.jsx';
import { downloadCsv } from '../../utils/csv.js';
import { formatCurrencyBRL } from '../../utils/currency.js';

function buildExportRows(dashboard) {
  const rows = [];
  const rc = dashboard.resumoComercial || {};
  rows.push({ secao: 'Resumo Comercial', indicador: 'Leads recebidos', valor: rc.leads ?? '', variacao: '' });
  rows.push({ secao: 'Resumo Comercial', indicador: 'Avaliações agendadas', valor: rc.avaliacoes ?? '', variacao: '' });
  rows.push({ secao: 'Resumo Comercial', indicador: 'Comparecimentos', valor: rc.comparecimentos ?? '', variacao: '' });
  rows.push({ secao: 'Resumo Comercial', indicador: 'Fechamentos', valor: rc.fechamentos ?? '', variacao: '' });
  rows.push({ secao: 'Resumo Comercial', indicador: 'Conversão', valor: `${rc.conversao ?? 0}%`, variacao: '' });
  rows.push({ secao: 'Resumo Comercial', indicador: 'Receita gerada', valor: formatCurrencyBRL(rc.receita ?? 0), variacao: '' });
  (dashboard.alerts || []).forEach((a) => {
    rows.push({ secao: 'Alertas', indicador: a.message, valor: a.count, variacao: '' });
  });
  rows.push({ secao: 'Dinheiro no Funil', indicador: 'Oportunidades abertas', valor: formatCurrencyBRL(dashboard.financial.oportunidadesAbertas), variacao: '' });
  rows.push({ secao: 'Dinheiro no Funil', indicador: 'Orçamentos enviados', valor: formatCurrencyBRL(dashboard.financial.orcamentosEnviados), variacao: '' });
  rows.push({ secao: 'Dinheiro no Funil', indicador: 'Valor em negociação', valor: formatCurrencyBRL(dashboard.financial.valorNegociacao), variacao: '' });
  rows.push({ secao: 'Dinheiro no Funil', indicador: 'Valor fechado', valor: formatCurrencyBRL(dashboard.financial.valorFechado), variacao: '' });
  rows.push({ secao: 'Dinheiro no Funil', indicador: 'Valor perdido', valor: formatCurrencyBRL(dashboard.financial.valorPerdido), variacao: '' });
  dashboard.funnel.funnelSteps.forEach((s) => {
    rows.push({
      secao: 'Funil',
      indicador: s.label,
      valor: s.totalEtapa,
      variacao: `${s.conversaoEtapa}% etapa · ${s.conversaoAcumulada}% acum.`,
    });
  });
  dashboard.owners.forEach((o) => {
    rows.push({
      secao: 'Consultores',
      indicador: o.ownerName,
      valor: `${o.fechamentos} fechamentos`,
      variacao: `${o.conversao}% · ${formatCurrencyBRL(o.receita)}`,
    });
  });
  return rows;
}

export async function exportDashboardCsv(dashboard) {
  downloadCsv({
    filename: `crm-dashboard-${new Date().toISOString().slice(0, 10)}.csv`,
    rows: buildExportRows(dashboard),
  });
}

export async function exportDashboardExcel(dashboard) {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const rows = buildExportRows(dashboard);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Dashboard CRM');
  XLSX.writeFile(book, `crm-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportDashboardPdf(dashboard, clinicName = 'Love Odonto') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 16;
  const line = (text, size = 10, bold = false) => {
    if (y > 280) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(text, 14, y);
    y += size * 0.55;
  };

  line('Dashboard Comercial — Relatórios & Métricas', 14, true);
  line(clinicName, 9);
  line(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 8);
  y += 4;

  const rc = dashboard.resumoComercial || {};
  line('Resumo Comercial', 11, true);
  line(`Leads: ${rc.leads ?? 0} · Avaliações: ${rc.avaliacoes ?? 0} · Comparecimentos: ${rc.comparecimentos ?? 0}`, 9);
  line(`Fechamentos: ${rc.fechamentos ?? 0} · Conversão: ${rc.conversao ?? 0}% · Receita: ${formatCurrencyBRL(rc.receita ?? 0)}`, 9);
  y += 3;

  line('Dinheiro no Funil', 11, true);
  line(`Oportunidades: ${formatCurrencyBRL(dashboard.financial.oportunidadesAbertas)}`, 9);
  line(`Orçamentos: ${formatCurrencyBRL(dashboard.financial.orcamentosEnviados)}`, 9);
  line(`Negociação: ${formatCurrencyBRL(dashboard.financial.valorNegociacao)}`, 9);
  line(`Fechado: ${formatCurrencyBRL(dashboard.financial.valorFechado)} · Perdido: ${formatCurrencyBRL(dashboard.financial.valorPerdido)}`, 9);
  y += 3;

  line('Funil comercial', 11, true);
  dashboard.funnel.funnelSteps.forEach((s) => {
    line(`${s.label}: ${s.totalEtapa} (${s.conversaoAcumulada}% acum.)`, 9);
  });

  doc.save(`crm-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function CrmDashboardExportBar({ dashboard, clinicName, disabled }) {
  const handle = async (fn) => {
    if (!dashboard || disabled) return;
    await fn(dashboard, clinicName);
  };

  return (
    <div className="crm-dash-export-bar">
      <Button type="button" variant="ghost" size="sm" icon={FileDown} onClick={() => handle(exportDashboardCsv)}>
        Exportar CSV
      </Button>
      <Button type="button" variant="ghost" size="sm" icon={FileSpreadsheet} onClick={() => handle(exportDashboardExcel)}>
        Exportar Excel
      </Button>
      <Button type="button" variant="ghost" size="sm" icon={FileText} onClick={() => handle(exportDashboardPdf)}>
        Exportar PDF
      </Button>
    </div>
  );
}
