import { describe, expect, it } from 'vitest';
import { isDataUrl, isHttpUrl } from '../services/clinicLogoUploadService.js';

describe('clinicLogoUploadService', () => {
  it('isDataUrl detecta base64 de imagem', () => {
    expect(isDataUrl('data:image/png;base64,abc')).toBe(true);
    expect(isDataUrl('https://cdn.example/logo.png')).toBe(false);
  });

  it('isHttpUrl detecta URLs remotas', () => {
    expect(isHttpUrl('https://cdn.example/logo.png')).toBe(true);
    expect(isHttpUrl('data:image/png;base64,x')).toBe(false);
  });
});
