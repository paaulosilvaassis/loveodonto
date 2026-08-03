import { describe, expect, it } from 'vitest';
import { isDataUrl, isHttpUrl, assertLogoUrlSafeForApi } from '../services/clinicLogoUploadService.js';
import { validateClinicLogoFile, CLINIC_LOGO_ALLOWED_TYPES } from '../utils/clinicLogoImage.js';

describe('clinicLogoUploadService', () => {
  it('isDataUrl detecta base64 de imagem', () => {
    expect(isDataUrl('data:image/png;base64,abc')).toBe(true);
    expect(isDataUrl('https://cdn.example/logo.png')).toBe(false);
  });

  it('isHttpUrl detecta URLs remotas', () => {
    expect(isHttpUrl('https://cdn.example/logo.png')).toBe(true);
    expect(isHttpUrl('data:image/png;base64,x')).toBe(false);
  });

  it('assertLogoUrlSafeForApi rejeita base64', () => {
    expect(() => assertLogoUrlSafeForApi('data:image/png;base64,abc')).toThrow(/base64/i);
  });

  it('assertLogoUrlSafeForApi aceita URL http', () => {
    expect(assertLogoUrlSafeForApi('https://x.supabase.co/storage/v1/object/public/clinic-logos/t/logo.webp')).toContain('https://');
  });
});

describe('clinicLogoImage', () => {
  it('validateClinicLogoFile aceita jpg/png/webp', () => {
    for (const type of CLINIC_LOGO_ALLOWED_TYPES) {
      expect(validateClinicLogoFile({ type, size: 1000 }).ok).toBe(true);
    }
    expect(validateClinicLogoFile({ type: 'image/svg+xml', size: 100 }).ok).toBe(false);
  });
});
