/**
 * PERF.A — route-level code splitting em ProtectedApp (static contract).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const protectedAppPath = path.join(ROOT, 'src/ProtectedApp.jsx');

describe('PERF.A ProtectedApp route-level lazy loading', () => {
  const src = fs.readFileSync(protectedAppPath, 'utf8');

  it('usa React.lazy para páginas/shells e zero imports estáticos de pages', () => {
    expect(src).toMatch(/import\s*\{\s*lazy,\s*Suspense\s*\}\s*from\s*['"]react['"]/);
    const lazyImports = [...src.matchAll(/lazy\(\(\)\s*=>\s*import\(/g)];
    expect(lazyImports.length).toBeGreaterThanOrEqual(90);

    const staticPageImports = [
      ...src.matchAll(/^import\s+.+\s+from\s+['"]\.\/pages\//gm),
      ...src.matchAll(/^import\s+.+\s+from\s+['"]\.\/crm\/ui\//gm),
      ...src.matchAll(/^import\s+.+\s+from\s+['"]\.\/convenios\/ui\//gm),
      ...src.matchAll(/^import\s+.+\s+from\s+['"]\.\/contracts\/ui\//gm),
    ];
    expect(staticPageImports).toHaveLength(0);
  });

  it('mantém Layout eager e Suspense único ao redor das Routes', () => {
    expect(src).toMatch(/import Layout from ['"]\.\/components\/Layout\.jsx['"]/);
    expect(src).toContain('<Layout>');
    expect(src).toContain('<Suspense fallback={<RouteChunkFallback />}');
    expect(src).toContain('<Routes>');
  });

  it('preserva rotas críticas e re-export updateClinicAddress', () => {
    for (const token of [
      'path="/gestao/dashboard"',
      'path="/gestao/agenda"',
      'path="/pacientes/busca"',
      'path="/crm"',
      'path="/gestao/contratos"',
      'path="/financeiro/contas-receber"',
      'path="/prontuario/:patientId/odontograma-v2"',
      'path="/financeiro/relatorios"',
      'path="/admin/dados-clinica"',
      'DashboardPage',
      'ContractsAssinadosPage',
      'OdontogramV2Page',
    ]) {
      expect(src).toContain(token);
    }
    expect(src).toMatch(
      /export\s*\{\s*updateClinicAddress\s*\}\s*from\s*['"]\.\/services\/clinicAddressUpdateFacade\.js['"]/,
    );
  });
});
