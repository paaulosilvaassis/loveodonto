/**
 * PHASE_10.21AB — Clinical draft finalize must not treat CSS hex as hashtags.
 */
import { describe, it, expect } from 'vitest';
import { findUnknownHashtags, extractHashtags } from '../contracts/hashtagRegistry.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('PHASE_10.21AB clinical finalize hex hashtag false positive', () => {
  it('CSS hex colors are not extracted as contract hashtags', () => {
    const html = '<style>body{color:#000;background:#fff} .x{color:#ffffff}</style><p>#totalContrato</p>';
    expect(extractHashtags(html)).toEqual(['#totalContrato']);
    expect(findUnknownHashtags(html)).toEqual([]);
  });

  it('professional clinical styles with #000/#fff would not block unknown-hashtag gate', () => {
    const stylesPath = path.join(ROOT, 'src/components/clinical/contract/professionalContractStyles.js');
    const src = readFileSync(stylesPath, 'utf8');
    expect(src).toMatch(/#000|#fff/);
    expect(findUnknownHashtags(src)).toEqual([]);
  });

  it('GenerateContractModal clinical finalize skips hashtag validation on draft update', () => {
    const modal = readFileSync(
      path.join(ROOT, 'src/components/contracts/GenerateContractModal.jsx'),
      'utf8',
    );
    expect(modal).toContain('skipHashtagValidation: flow === \'clinical\'');
  });

  it('updateDraftGeneratedContract accepts skipHashtagValidation option', () => {
    const svc = readFileSync(path.join(ROOT, 'src/services/contractService.js'), 'utf8');
    expect(svc).toContain('skipHashtagValidation = false');
  });
});
