import { describe, it, expect } from 'vitest';
import { findUnknownHashtags, extractHashtags } from '../contracts/hashtagRegistry.js';
import { filterBlocksForRender } from '../services/contractRenderService.js';

describe('hashtagRegistry', () => {
  it('extractHashtags encontra tags no texto', () => {
    const t = extractHashtags('Valor #totalContrato e #pacienteNomeCompleto.');
    expect(t).toContain('#totalContrato');
    expect(t).toContain('#pacienteNomeCompleto');
  });

  it('findUnknownHashtags lista apenas desconhecidas', () => {
    expect(findUnknownHashtags('#totalContrato #tagInventada')).toEqual(['#tagInventada']);
    expect(findUnknownHashtags('#clinicaRazaoSocial')).toEqual([]);
  });

  it('PHASE_10.21AB — cores CSS hex (#000/#fff) não são hashtags de contrato', () => {
    const html = '<style>body{color:#000;background:#fff} .x{color:#ffffff}</style><p>#totalContrato</p>';
    expect(extractHashtags(html)).toEqual(['#totalContrato']);
    expect(findUnknownHashtags(html)).toEqual([]);
  });
});

describe('filterBlocksForRender', () => {
  const blocks = [
    { id: '1', blockNumber: 1, title: 'A', content: 'x', isActive: true, conditionType: 'parties_no_financial', orderIndex: 0 },
    { id: '2', blockNumber: 2, title: 'B', content: 'y', isActive: true, conditionType: 'parties_with_financial', orderIndex: 1 },
  ];

  it('filtra bloco Das partes sem responsável financeiro', () => {
    const ctx = { __meta: { hasFinancialResponsible: false, includeOrthodontics: false } };
    const out = filterBlocksForRender(blocks, ctx);
    expect(out.map((b) => b.id)).toEqual(['1']);
  });

  it('filtra bloco com responsável financeiro', () => {
    const ctx = { __meta: { hasFinancialResponsible: true, includeOrthodontics: false } };
    const out = filterBlocksForRender(blocks, ctx);
    expect(out.map((b) => b.id)).toEqual(['2']);
  });
});
