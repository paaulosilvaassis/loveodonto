import { describe, expect, it } from 'vitest';
import { applyContractHashtags } from '../contracts/contractVariableResolver.js';

describe('applyContractHashtags — escape de dados do paciente (XSS)', () => {
  it('escapa HTML em campos de texto livre', () => {
    const out = applyContractHashtags('<p>#pacienteNomeCompleto</p>', {
      '#pacienteNomeCompleto': '<img src=x onerror=alert(1)>',
    });
    expect(out).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(out).not.toContain('<img');
  });

  it('mantém HTML confiável das tabelas geradas internamente', () => {
    const table = '<table><tr><td>Limpeza</td></tr></table>';
    expect(applyContractHashtags('#procedimentos', { '#procedimentos': table })).toBe(table);
  });

  it('não interpreta padrões especiais de replace ($&) no valor', () => {
    expect(applyContractHashtags('#paciente_nome', { '#paciente_nome': 'A $& B' })).toBe('A $&amp; B');
  });

  it('valores nulos viram vazio', () => {
    expect(applyContractHashtags('x#pacienteCPFy', { '#pacienteCPF': null })).toBe('xy');
  });
});
