import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Download, FileText, LayoutDashboard } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/currency.js';
import { getDreReport } from '../services/financeDreService.js';
import { getDreCashBasisReport, getDreLiquidityReport } from '../services/financeDreCashLiquidityService.js';
import { getProfessionalOptions } from '../services/collaboratorService.js';
import ReportsPage from './ReportsPage.jsx';

/** Navegação principal da Central de Análise (hub). */
const HUB_TABS = [
  { id: 'dre', label: 'DRE' },
  { id: 'caixa', label: 'Regime de Caixa' },
  { id: 'liquidez', label: 'Liquidez' },
  { id: 'relatorios', label: 'Relatório Financeiro' },
];

const firstDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const lastDay = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
};

const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

function sumSeries(series, months) {
  return months.reduce((acc, m) => acc + Number(series[m.key] || 0), 0);
}

function DreRow({ label, series, months, negative = false, strong = false, level = 0 }) {
  const total = sumSeries(series, months);
  return (
    <tr>
      <td style={{ paddingLeft: `${12 + level * 18}px` }}>
        {strong ? <strong>{label}</strong> : label}
      </td>
      {months.map((m) => (
        <td key={m.key} className={negative ? 'dre-num dre-num--neg' : 'dre-num'}>
          {formatCurrencyBRL(series[m.key] || 0)}
        </td>
      ))}
      <td className={negative ? 'dre-num dre-num--neg' : 'dre-num'}>
        {strong ? <strong>{formatCurrencyBRL(total)}</strong> : formatCurrencyBRL(total)}
      </td>
    </tr>
  );
}

function hubToView(hubin) {
  if (hubin === 'dre') return 'competencia';
  if (hubin === 'caixa') return 'caixa';
  if (hubin === 'liquidez') return 'liquidez';
  return 'competencia';
}

export default function FinanceDREPage() {
  const [hubTab, setHubTab] = useState('dre');
  const view = hubToView(hubTab);
  const [filters, setFilters] = useState({
    startDate: firstDay(),
    endDate: lastDay(),
    unitId: '',
    professionalId: '',
    specialty: '',
    revenueType: '',
    costCenterId: '',
    revenueCenterId: '',
  });
  const [expanded, setExpanded] = useState({
    commission: false,
    receita: false,
  });

  const report = useMemo(() => getDreReport(filters), [filters]);
  const cashReport = useMemo(() => getDreCashBasisReport(filters), [filters]);
  const liqReport = useMemo(() => getDreLiquidityReport(filters), [filters]);

  const { months, series, kpis, charts, details, insights } = report;
  const professionals = useMemo(() => getProfessionalOptions(), []);

  const hubLabel = HUB_TABS.find((t) => t.id === hubTab)?.label || '';

  const chartsLabeled = useMemo(() => {
    const map = Object.fromEntries(months.map((m) => [m.key, m.label]));
    const lab = (k) => map[k] || k;
    return {
      lucroPorMes: (charts.lucroPorMes || []).map((r) => ({ ...r, month: lab(r.month) })),
      receitaVsCusto: (charts.receitaVsCusto || []).map((r) => ({ ...r, month: lab(r.month) })),
      margemPorMes: (charts.margemPorMes || []).map((r) => ({ ...r, month: lab(r.month) })),
      receitaPorEspecialidade: charts.receitaPorEspecialidade || [],
    };
  }, [charts, months]);

  const competenciaBarCombo = useMemo(() => {
    const lucroMap = Object.fromEntries((charts.lucroPorMes || []).map((r) => [r.month, r.value]));
    return chartsLabeled.receitaVsCusto.map((r) => ({
      ...r,
      lucro: lucroMap[r.month] ?? 0,
    }));
  }, [charts.lucroPorMes, chartsLabeled.receitaVsCusto]);

  const cashMonths = cashReport.months || [];
  const cashChartsLabeled = useMemo(() => {
    const map = Object.fromEntries(cashMonths.map((m) => [m.key, m.label]));
    const lab = (k) => map[k] || k;
    return {
      entradasVsSaidas: (cashReport.charts?.entradasVsSaidas || []).map((r) => ({ ...r, month: lab(r.month) })),
      fluxoCaixa: (cashReport.charts?.fluxoCaixa || []).map((r) => ({ ...r, month: lab(r.month) })),
    };
  }, [cashReport, cashMonths]);

  const liqCharts = liqReport.charts || {};
  const coberturaCol = (liqCharts.coberturaBarras || []).map((r) => ({
    ...r,
    fill: r.ratio >= 1.15 ? '#10B981' : r.ratio >= 0.85 ? '#F59E0B' : '#EF4444',
  }));

  const crossInsights = useMemo(() => {
    const comp = Number(report.kpis?.receitaLiquidaTotal || 0);
    const cashIn = Number(cashReport.kpis?.entradasTotal || 0);
    if (comp <= 0) return [];
    if (cashIn < comp * 0.85) {
      return [
        'O caixa realizado (baixas em títulos) está abaixo da receita líquida por competência no período — defasagem de recebimento ou filtros diferentes podem explicar.',
      ];
    }
    return [];
  }, [report, cashReport]);

  const extraCompetenciaInsights = useMemo(() => {
    const out = [];
    const rl = Number(kpis.receitaLiquidaTotal || 0);
    const lab = months.reduce((s, m) => s + Number(series.labCost[m.key] || 0), 0);
    if (rl > 0 && lab / rl >= 0.12) {
      out.push(`Laboratório protético consome ${((lab / rl) * 100).toFixed(1)}% da receita líquida.`);
    }
    const margem = months.length >= 2 ? charts.margemPorMes || [] : [];
    if (margem.length >= 2) {
      const last = margem[margem.length - 1]?.value ?? 0;
      const prev = margem[margem.length - 2]?.value ?? 0;
      if (last < prev - 0.5) out.push('Sua margem operacional caiu no fecho recente da série.');
    }
    return out;
  }, [kpis, months, series.labCost, charts.margemPorMes]);

  const allInsights = useMemo(() => {
    if (view === 'competencia') return [...insights, ...extraCompetenciaInsights];
    if (view === 'caixa') return [...(cashReport.insights || []), ...crossInsights];
    return liqReport.insights || [];
  }, [view, insights, extraCompetenciaInsights, cashReport.insights, crossInsights, liqReport.insights]);

  if (!months.length) {
    return (
      <div className="finance-faturamento-page fat-dash">
        <header className="fat-hero">
          <div className="fat-hero__main">
            <div className="fat-hero__eyebrow">Financeiro {'>'} Central de Análise</div>
            <h1 className="fat-hero__title">Central de Análise</h1>
            {hubTab === 'relatorios' ? (
              <>
                <p className="fat-hero__subtitle muted">Relatório Financeiro</p>
                <p className="fat-hero__subtitle muted">Exportações em CSV e recortes operacionais.</p>
              </>
            ) : (
              <>
                <p className="fat-hero__subtitle muted">Demonstrativo de Resultado Econômico (DRE)</p>
                <p className="fat-hero__subtitle muted">Selecione um período válido (data início ≤ data fim).</p>
              </>
            )}
          </div>
        </header>
        <section className="fat-section">
          <div className="finance-analysis-hub" role="tablist" aria-label="Visões da Central de Análise">
            <div className="finance-analysis-hub-inner">
              {HUB_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={hubTab === t.id}
                  className={`dre-view-tab finance-analysis-hub-tab${hubTab === t.id ? ' dre-view-tab--active' : ''}`}
                  onClick={() => setHubTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>
        {hubTab === 'relatorios' ? (
          <div className="fat-section finance-analysis-embed-reports">
            <ReportsPage />
          </div>
        ) : null}
      </div>
    );
  }

  const cs = cashReport.series || {};
  const tableMinWidth = 268 + (months.length + 1) * 84;

  const exportExcel = async () => {
    const mod = await import('xlsx');
    const XLSX = mod.default ?? mod;
    const wb = XLSX.utils.book_new();
    const pushSheetFromSeries = (name, rowsDef) => {
      const rows = [];
      rowsDef.forEach(([label, rowSeries]) => {
        const line = { linha: label };
        months.forEach((m) => { line[m.label] = Number(rowSeries[m.key] || 0); });
        line.Total = sumSeries(rowSeries, months);
        rows.push(line);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
    };

    if (view === 'competencia') {
      pushSheetFromSeries('DRE_Competencia', [
        ['Receita bruta', series.receitaBruta],
        ['Descontos', series.descontos],
        ['Estornos', series.estornos],
        ['Receita líquida', series.receitaLiquida],
        ['Comissão dentistas', series.comDentista],
        ['Comissão comercial', series.comComercial],
        ['Laboratório protético', series.labCost],
        ['Materiais clínicos', series.matCost],
        ['Taxas financeiras', series.feeCost],
        ['Custos variáveis', series.custosVariaveis],
        ['Margem de contribuição', series.margemContribuicao],
        ['Aluguel', series.rentCost],
        ['Folha de pagamento', series.payrollCost],
        ['Marketing', series.marketingCost],
        ['Sistemas', series.systemsCost],
        ['Despesas administrativas', series.adminCost],
        ['Custos fixos', series.custosFixos],
        ['Resultado operacional', series.resultadoOperacional],
        ['Lucro líquido', series.lucroLiquido],
      ]);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(details.commissionByProfessional || []),
        'Comissoes_prof'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(details.commissionBySpecialty || []),
        'Comissoes_esp'
      );
    } else if (view === 'caixa') {
      pushSheetFromSeries('DRE_Caixa', [
        ['Recebimentos à vista', cs.recebimentosAvista],
        ['Recebimentos de parcelas', cs.recebimentosParcelas],
        ['Financiamentos recebidos (entrada)', cs.financiamentosRecebidos],
        ['Boletos pagos (referência)', cs.boletosPagos],
        ['Entradas realizadas (títulos)', cs.entradasTotal],
        ['Comissões pagas', cs.comissoesPagas],
        ['Laboratório pago', cs.laboratorioPago],
        ['Materiais pagos', cs.materiaisPago],
        ['Taxas pagas', cs.taxasPago],
        ['Despesas fixas pagas', cs.despesasFixasPagas],
        ['Pagamentos avulsos', cs.pagamentosAvulsos],
        ['Saídas realizadas', cs.saidasTotal],
        ['Saldo operacional', cs.saldoOperacional],
        ['Saldo acumulado', cs.saldoAcumulado],
      ]);
    } else {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(liqReport.details?.ativosPassivos || []),
        'Liquidez_resumo'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(liqReport.details?.vencimentos || []),
        'Liquidez_vencimentos'
      );
    }

    XLSX.writeFile(wb, `dre-gerencial-${view}-${filters.startDate}-${filters.endDate}.xlsx`);
  };

  const heroSubtitle =
    view === 'competencia'
      ? 'Resultado econômico por competência (produção e obrigações reconhecidas), sem confundir com caixa.'
      : view === 'caixa'
        ? 'Movimentação efetiva: baixas em contas a receber, pagamentos de despesas e comissões liquidadas.'
        : 'Capacidade de honrar compromissos de curto prazo com base em saldo, recebíveis e pagáveis próximos.';

  const heroMutedLead =
    hubTab === 'relatorios'
      ? 'Relatório Financeiro'
      : hubTab === 'dre'
        ? 'Demonstrativo de Resultado Econômico (DRE)'
        : hubTab === 'caixa'
          ? 'Regime de caixa — fluxo realizado no período'
          : 'Análise de liquidez e vencimentos';

  const heroBodyText =
    hubTab === 'relatorios'
      ? 'Exportações em CSV (pacientes, agenda, financeiro, parcelas e mais). Quando precisar voltar ao DRE, use a aba DRE.'
      : heroSubtitle;

  return (
    <div className="finance-faturamento-page fat-dash">
      <header className="fat-hero">
        <div className="fat-hero__main">
          <div className="fat-hero__eyebrow">Financeiro {'>'} Central de Análise</div>
          <h1 className="fat-hero__title">Central de Análise</h1>
          <p className="fat-hero__subtitle muted">{heroMutedLead}</p>
          <p className="fat-hero__subtitle">{heroBodyText}</p>
          {hubTab !== 'relatorios' ? (
            <p className="fat-hero__subtitle fat-hero__subtitle--compact muted">
              Hub financeiro: altere a visão nas abas abaixo. Os <strong>relatórios exportáveis em CSV</strong> ficam na aba Relatório Financeiro.
            </p>
          ) : null}
          {hubTab !== 'relatorios' ? (
            <div className="fat-hero__meta fat-hero__meta--dre">
              <span className="fat-hero__meta-pill">Visão ativa: {hubLabel}</span>
              {hubTab === 'liquidez' ? (
                <span className="fat-hero__meta-pill fat-hero__meta-pill--muted">
                  Referência de caixa: {liqReport.refDate}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {hubTab !== 'relatorios' ? (
          <div className="fat-hero__actions">
            <button type="button" className="button secondary fat-hero__btn" onClick={exportExcel}>
              <Download size={16} /> Exportar Excel
            </button>
            <button type="button" className="button secondary fat-hero__btn" disabled title="PDF em roadmap">
              <FileText size={16} /> Exportar PDF (futuro)
            </button>
          </div>
        ) : null}
      </header>

      <section className="fat-section">
        <div className="finance-analysis-hub" role="tablist" aria-label="Visões da Central de Análise">
          <div className="finance-analysis-hub-inner">
            {HUB_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={hubTab === t.id}
                className={`dre-view-tab finance-analysis-hub-tab${hubTab === t.id ? ' dre-view-tab--active' : ''}`}
                onClick={() => setHubTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {hubTab === 'relatorios' ? (
        <div className="fat-section finance-analysis-embed-reports">
          <ReportsPage />
        </div>
      ) : null}

      {hubTab !== 'relatorios' ? (
      <>
      <section className="fat-section">
        <div className="dre-filters-toolbar card">
          <div className="dre-filters-toolbar__row">
            <div className="dre-filters-toolbar__text">
              <strong className="dre-filters-toolbar__title">Filtros e relatórios</strong>
              <p className="muted dre-filters-toolbar__hint">
                Ajuste o recorte abaixo. Para exports operacionais em CSV, abra a aba Relatório Financeiro.
              </p>
            </div>
            <button type="button" className="button secondary dre-btn-reports-strong" onClick={() => setHubTab('relatorios')}>
              <LayoutDashboard size={18} /> Relatório Financeiro
            </button>
          </div>
        </div>
        <div className="fat-filters-card">
          <div className="fat-filters-card__grid">
            <label className="fat-filter-field"><span>Período de</span><input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} /></label>
            <label className="fat-filter-field"><span>até</span><input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} /></label>
            <label className="fat-filter-field"><span>Unidade</span><input value={filters.unitId} onChange={(e) => setFilters((p) => ({ ...p, unitId: e.target.value }))} placeholder="id da unidade" /></label>
            <label className="fat-filter-field">
              <span>Profissional</span>
              <select value={filters.professionalId} onChange={(e) => setFilters((p) => ({ ...p, professionalId: e.target.value }))}>
                <option value="">Todos</option>
                {professionals.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </label>
            <label className="fat-filter-field"><span>Especialidade</span><input value={filters.specialty} onChange={(e) => setFilters((p) => ({ ...p, specialty: e.target.value }))} placeholder="ex.: Implantodontia" /></label>
            <label className="fat-filter-field">
              <span>Tipo de receita</span>
              <select value={filters.revenueType} onChange={(e) => setFilters((p) => ({ ...p, revenueType: e.target.value }))}>
                <option value="">Todas</option>
                <option value="avista">À vista</option>
                <option value="financiamento">Financiamento</option>
              </select>
            </label>
            <label className="fat-filter-field"><span>Centro de custo (id)</span><input value={filters.costCenterId} onChange={(e) => setFilters((p) => ({ ...p, costCenterId: e.target.value }))} placeholder="opcional" /></label>
            <label className="fat-filter-field">
              <span>Centro de receita</span>
              <input
                value={filters.revenueCenterId}
                title="Campo previsto quando houver cadastro de centro de receita nos títulos."
                placeholder="em breve"
                readOnly
                disabled
              />
            </label>
          </div>
        </div>
      </section>

      {view === 'competencia' ? (
        <section className="fat-section">
          <div className="fat-kpi-grid">
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Receita líquida</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(kpis.receitaLiquidaTotal)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Custos variáveis</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(sumSeries(series.custosVariaveis, months))}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Despesas fixas</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(sumSeries(series.custosFixos, months))}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Lucro operacional</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(sumSeries(series.resultadoOperacional, months))}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Margem %</span><strong className="fat-kpi-card__value">{fmtPct(kpis.margemPercent)}</strong></div>
          </div>
        </section>
      ) : null}

      {view === 'caixa' ? (
        <section className="fat-section">
          <div className="fat-kpi-grid">
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Entradas realizadas</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(cashReport.kpis.entradasTotal)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Saídas realizadas</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(cashReport.kpis.saidasTotal)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Saldo do período</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(cashReport.kpis.saldoPeriodo)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Saldo acumulado (série)</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(cashReport.kpis.saldoFinalAcumulado)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Variação de caixa (mês)</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(cashReport.kpis.variacaoCaixa)}</strong></div>
          </div>
        </section>
      ) : null}

      {view === 'liquidez' ? (
        <section className="fat-section">
          <div className="fat-kpi-grid">
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Disponível (ref.)</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(liqReport.kpis.disponivel)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">A receber 30 dias</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(liqReport.kpis.receberCurto)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">A pagar 30 dias</span><strong className="fat-kpi-card__value">{formatCurrencyBRL(liqReport.kpis.pagarCurto)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Liquidez imediata</span><strong className="fat-kpi-card__value">{liqReport.kpis.liquidezImediata.toFixed(2)}</strong></div>
            <div className="fat-kpi-card"><span className="fat-kpi-card__label">Cobertura 30 dias</span><strong className="fat-kpi-card__value">{liqReport.kpis.cobertura30.toFixed(2)}</strong></div>
            <div className="fat-kpi-card dre-kpi-band-wrap">
              <span className="fat-kpi-card__label">Faixa 7 dias</span>
              <span className={`dre-liquidity-band dre-liquidity-band--${liqReport.bands.imediata.key}`}>{liqReport.bands.imediata.label}</span>
              <span className="fat-kpi-card__label" style={{ marginTop: 8 }}>Faixa 30 dias</span>
              <span className={`dre-liquidity-band dre-liquidity-band--${liqReport.bands.trinta.key}`}>{liqReport.bands.trinta.label}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="fat-section">
        <div className="card">
          {view === 'competencia' ? <h3>DRE por competência (mês + acumulado)</h3> : null}
          {view === 'caixa' ? <h3>Fluxo de caixa realizado (mês + acumulado)</h3> : null}
          {view === 'liquidez' ? <h3>Quadro de liquidez e vencimentos</h3> : null}

          {view !== 'liquidez' ? (
            <div className="finance-dre-table-wrap">
              <table className="dre-table" style={{ minWidth: `${tableMinWidth}px` }}>
                <thead>
                  <tr>
                    <th scope="col">Linha</th>
                    {months.map((m) => <th key={m.key}>{m.label}</th>)}
                    <th>Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {view === 'competencia' ? (
                    <>
                      <DreRow label="Receita bruta" series={series.receitaBruta} months={months} strong />
                      <DreRow label="(-) Descontos" series={series.descontos} months={months} negative level={1} />
                      <DreRow label="(-) Estornos" series={series.estornos} months={months} negative level={1} />
                      <DreRow label="(=) Receita líquida" series={series.receitaLiquida} months={months} strong />
                      <DreRow label="Comissão dentistas" series={series.comDentista} months={months} negative level={1} />
                      <DreRow label="Comissão comercial" series={series.comComercial} months={months} negative level={1} />
                      <DreRow label="Laboratório protético" series={series.labCost} months={months} negative level={1} />
                      <DreRow label="Materiais clínicos" series={series.matCost} months={months} negative level={1} />
                      <DreRow label="Taxas financeiras" series={series.feeCost} months={months} negative level={1} />
                      <DreRow label="Custos variáveis" series={series.custosVariaveis} months={months} strong negative />
                      <DreRow label="Margem de contribuição" series={series.margemContribuicao} months={months} strong />
                      <DreRow label="Aluguel" series={series.rentCost} months={months} negative level={1} />
                      <DreRow label="Folha de pagamento" series={series.payrollCost} months={months} negative level={1} />
                      <DreRow label="Marketing" series={series.marketingCost} months={months} negative level={1} />
                      <DreRow label="Sistemas" series={series.systemsCost} months={months} negative level={1} />
                      <DreRow label="Despesas administrativas" series={series.adminCost} months={months} negative level={1} />
                      <DreRow label="Custos fixos" series={series.custosFixos} months={months} strong negative />
                      <DreRow label="Resultado operacional" series={series.resultadoOperacional} months={months} strong />
                      <DreRow label="Resultado final (lucro líquido)" series={series.lucroLiquido} months={months} strong />
                    </>
                  ) : (
                    <>
                      <DreRow label="ENTRADAS — Recebimentos à vista" series={cs.recebimentosAvista} months={months} strong />
                      <DreRow label="Recebimentos de parcelas" series={cs.recebimentosParcelas} months={months} level={1} />
                      <DreRow label="Financiamentos recebidos (entrada)" series={cs.financiamentosRecebidos} months={months} level={1} />
                      <DreRow label="Boletos pagos (referência, ver nota)" series={cs.boletosPagos} months={months} level={1} />
                      <DreRow label="Outros recebimentos" series={cs.outrosRecebimentos} months={months} level={1} />
                      <DreRow label="(=) Entradas realizadas (títulos)" series={cs.entradasTotal} months={months} strong />
                      <DreRow label="SAÍDAS — Comissões pagas" series={cs.comissoesPagas} months={months} negative strong />
                      <DreRow label="Laboratório pago" series={cs.laboratorioPago} months={months} negative level={1} />
                      <DreRow label="Materiais pagos" series={cs.materiaisPago} months={months} negative level={1} />
                      <DreRow label="Taxas pagas" series={cs.taxasPago} months={months} negative level={1} />
                      <DreRow label="Despesas fixas pagas" series={cs.despesasFixasPagas} months={months} negative level={1} />
                      <DreRow label="Pagamentos avulsos" series={cs.pagamentosAvulsos} months={months} negative level={1} />
                      <DreRow label="(=) Saídas realizadas" series={cs.saidasTotal} months={months} strong negative />
                      <DreRow label="Saldo operacional de caixa" series={cs.saldoOperacional} months={months} strong />
                      <DreRow label="Saldo acumulado (no período)" series={cs.saldoAcumulado} months={months} strong />
                    </>
                  )}
                </tbody>
              </table>
              {view === 'caixa' ? (
                <p className="muted" style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', margin: 0 }}>
                  Boletos: valores liquidados aparecem também como baixa em títulos — a linha de boletos é referência de cobranças marcadas como pagas, não somada às entradas totais para evitar duplicidade.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="finance-dre-table-wrap dre-liquidity-tables">
              <table className="dre-table dre-table--liquidity">
                <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
                <tbody>
                  {(liqReport.details?.ativosPassivos || []).map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className="dre-num">{formatCurrencyBRL(row.valor)}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={2}><strong>Saldo projetado 30 dias</strong></td></tr>
                  <tr>
                    <td>Projeção (disp. + receber 30d − pagar 30d)</td>
                    <td className="dre-num"><strong>{formatCurrencyBRL(liqReport.kpis.saldoProjetado30)}</strong></td>
                  </tr>
                  <tr><td>Liquidez corrente simplificada</td><td className="dre-num">{(liqReport.kpis.liquidezCorrenteSimpl).toFixed(2)}</td></tr>
                  <tr><td>Cobertura 7 dias</td><td className="dre-num">{(liqReport.kpis.cobertura7).toFixed(2)}</td></tr>
                </tbody>
              </table>
              <h4 className="muted" style={{ margin: '1rem 1rem 0.5rem' }}>Vencimentos próximos (30 dias)</h4>
              <div className="finance-dre-table-wrap" style={{ marginTop: 0, boxShadow: 'none', border: 'none' }}>
                <table className="dre-table" style={{ minWidth: '100%' }}>
                  <thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th className="dre-num">Valor</th></tr></thead>
                  <tbody>
                    {(liqReport.details?.vencimentos || []).length === 0 ? (
                      <tr><td colSpan={4} className="muted">Nenhum vencimento no recorte.</td></tr>
                    ) : (
                      (liqReport.details?.vencimentos || []).map((r, i) => (
                        <tr key={`${r.tipo}-${r.vencimento}-${i}`}>
                          <td>{r.tipo}</td>
                          <td>{r.descricao}</td>
                          <td>{r.vencimento}</td>
                          <td className="dre-num">{formatCurrencyBRL(r.valor)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="fat-section">
        <div className="fat-charts-grid">
          {view === 'competencia' ? (
            <>
              <article className="fat-chart-panel">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Receita × custos × lucro</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={competenciaBarCombo}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatCurrencyBRL(v)} />
                      <Legend />
                      <Bar dataKey="receita" name="Receita líq." fill="#10B981" />
                      <Bar dataKey="custo" name="Custos" fill="#EC4899" />
                      <Bar dataKey="lucro" name="Lucro" fill="#6A00FF" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="fat-chart-panel">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Lucro por mês</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartsLabeled.lucroPorMes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatCurrencyBRL(v)} />
                      <Line dataKey="value" stroke="#6A00FF" name="Lucro" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="fat-chart-panel fat-chart-panel--wide">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Evolução da margem</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartsLabeled.margemPorMes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis unit="%" />
                      <Tooltip formatter={(v) => fmtPct(v)} />
                      <Line dataKey="value" stroke="#2563EB" name="Margem" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="fat-chart-panel fat-chart-panel--wide">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Receita por especialidade</h3></header>
                <div className="fat-chart-panel__canvas fat-chart-panel__canvas--tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartsLabeled.receitaPorEspecialidade} layout="vertical" margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatCurrencyBRL(v)} />
                      <Bar dataKey="value" name="Receita" fill="#6A00FF" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </>
          ) : null}

          {view === 'caixa' ? (
            <>
              <article className="fat-chart-panel fat-chart-panel--wide">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Entradas × saídas realizadas</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashChartsLabeled.entradasVsSaidas}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatCurrencyBRL(v)} />
                      <Legend />
                      <Bar dataKey="entradas" name="Entradas" fill="#10B981" />
                      <Bar dataKey="saidas" name="Saídas" fill="#F43F5E" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="fat-chart-panel fat-chart-panel--wide">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Fluxo de caixa no período</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cashChartsLabeled.fluxoCaixa}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatCurrencyBRL(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="saldo" stroke="#6A00FF" name="Saldo mensal" />
                      <Line type="monotone" dataKey="acumulado" stroke="#0EA5E9" name="Acumulado" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </>
          ) : null}

          {view === 'liquidez' ? (
            <>
              <article className="fat-chart-panel">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Cobertura de obrigações</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={coberturaCol} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(v, n) => (n === 'ratio' ? Number(v).toFixed(2) : formatCurrencyBRL(v))} />
                      <ReferenceLine y={1} stroke="#94A3B8" strokeDasharray="4 4" />
                      <Bar dataKey="ratio" name="Cobertura" radius={[6, 6, 0, 0]}>
                        {coberturaCol.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="fat-chart-panel fat-chart-panel--wide">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Projeção de caixa (30 dias)</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={liqCharts.projecao || []} layout="vertical" margin={{ left: 48, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="etapa" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatCurrencyBRL(v)} />
                      <Bar dataKey="saldo" fill="#6366F1" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="fat-chart-panel">
                <header className="fat-chart-panel__head"><h3 className="fat-chart-panel__title">Faixas de liquidez (cap)</h3></header>
                <div className="fat-chart-panel__canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={liqCharts.liquidezGauge || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 2]} />
                      <Tooltip formatter={(v) => Number(v).toFixed(2)} />
                      <ReferenceLine y={1} stroke="#94A3B8" />
                      <Bar dataKey="value" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </>
          ) : null}
        </div>
      </section>

      <section className="fat-section">
        <div className="card">
          <h3>Insights gerenciais</h3>
          <ul className="list">
            {allInsights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      </section>

      {view === 'competencia' ? (
        <section className="fat-section">
          <div className="card">
            <h3>Detalhamento</h3>
            <div className="finance-financing-actions-inline">
              <button type="button" className="button secondary" onClick={() => setExpanded((p) => ({ ...p, commission: !p.commission }))}>
                {expanded.commission ? 'Ocultar' : 'Expandir'} comissão
              </button>
              <button type="button" className="button secondary" onClick={() => setExpanded((p) => ({ ...p, receita: !p.receita }))}>
                {expanded.receita ? 'Ocultar' : 'Expandir'} receita
              </button>
            </div>
            {expanded.commission ? (
              <>
                <div className="finance-receivables-table-wrap">
                  <h4 className="muted" style={{ margin: '12px 0 8px' }}>Por profissional</h4>
                  <table className="finance-receivables-table">
                    <thead><tr><th>Profissional</th><th>Comissão</th></tr></thead>
                    <tbody>
                      {details.commissionByProfessional.map((r) => (
                        <tr key={r.professional}>
                          <td>{r.professional}</td>
                          <td>{formatCurrencyBRL(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="finance-receivables-table-wrap" style={{ marginTop: 16 }}>
                  <h4 className="muted" style={{ margin: '12px 0 8px' }}>Por especialidade</h4>
                  <table className="finance-receivables-table">
                    <thead><tr><th>Especialidade</th><th>Comissão</th></tr></thead>
                    <tbody>
                      {(details.commissionBySpecialty || []).map((r) => (
                        <tr key={r.especialidade}>
                          <td>{r.especialidade}</td>
                          <td>{formatCurrencyBRL(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            {expanded.receita ? (
              <div className="finance-receivables-table-wrap" style={{ marginTop: 16 }}>
                <table className="finance-receivables-table">
                  <thead><tr><th>Paciente</th><th>Tratamento</th><th>Receita</th></tr></thead>
                  <tbody>
                    {details.receitaByTreatment.slice(0, 30).map((r, i) => (
                      <tr key={`${r.patient}-${r.treatment}-${i}`}>
                        <td>{r.patient}</td>
                        <td>{r.treatment}</td>
                        <td>{formatCurrencyBRL(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      </>
      ) : null}
    </div>
  );
}