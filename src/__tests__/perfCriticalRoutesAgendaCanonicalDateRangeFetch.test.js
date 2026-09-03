/**
 * PERF (estrutural) — Agenda
 * Contrato: AgendaPage deve evitar reload redundante e reduzir scan
 * buscando agendamentos apenas no intervalo visível.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const agendaPagePath = path.join(ROOT, 'src/pages/AgendaPage.jsx');

describe('PERF critical routes — Agenda date-range fetch', () => {
  const src = fs.readFileSync(agendaPagePath, 'utf8');

  it('mergeSafeAgendaSnapshot não faz loadDb (não duplica leitura)', () => {
    expect(src).toMatch(/function\s+mergeSafeAgendaSnapshot\s*\(\s*raw\s*,\s*base\s*\)/);
    // Contrato: a função de merge deve ser “pura” (sem loadDb interno).
    expect(src).not.toContain('const base = loadDb();');
  });

  it('refresh busca agendamentos pelo intervalo visível (dateFrom/dateTo)', () => {
    expect(src).toContain('dateFrom: rangeStartIso');
    expect(src).toContain('dateTo: rangeEndIso');
  });

  it('não recarrega DB quando só muda selectedProfessionalId', () => {
    // O contrato esperado é que o effect de selectedProfessionalId não chame refreshDb.
    // (A seleção impacta apenas a filtragem em memória via filteredAppointments).
    expect(src).not.toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*refreshDb\(\)[\s\S]*\},\s*\[selectedProfessionalId\]\);/);
  });
});

