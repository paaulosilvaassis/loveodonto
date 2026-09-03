/**
 * PERF (estrutural) — Central de Orçamentos
 * Contrato: BudgetsHubPage deve evitar múltiplas leituras completas do DB
 * no caminho crítico (mount/render).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budgetsHubPath = path.join(ROOT, 'src/pages/BudgetsHubPage.jsx');

describe('PERF critical routes — BudgetsHub canonical read', () => {
  const src = fs.readFileSync(budgetsHubPath, 'utf8');

  it('não usa listAllClinicalBudgetRows no BudgetsHubPage', () => {
    // Evita regressão do padrão: allRows(listAllClinicalBudgetRows({})) + rows(listAllClinicalBudgetRows(filters)).
    expect(src).not.toMatch(/listAllClinicalBudgetRows\s*\(/);
  });

  it('deriva rows/kpis/professionals a partir de uma leitura canônica única', () => {
    expect(src).toContain('listClinicalBudgetHubBaseData');
    expect(src).toContain('listBudgetHubRowsFromBaseData');
  });

  it('monta modais pesados apenas sob demanda (lazy)', () => {
    expect(src).toMatch(/const\s+StartPatientBudgetModal\s*=\s*lazy\(/);
    expect(src).toMatch(/const\s+OperationalContractWizard\s*=\s*lazy\(/);
  });
});

