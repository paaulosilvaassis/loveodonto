import React, { useEffect } from 'react';
import {
  isStagingTestModeEnabled,
  stagingBannerCopy,
  STAGING_REF,
} from '../domain/contracts/staging/staging-browser-test-mode.ts';
import { ensureStagingFictionalCommercialBootstrap } from '../domain/contracts/staging/ensureStagingFictionalClinicContractPrereqs.js';

/**
 * Banner impossível de confundir — somente com STAGING_TEST_MODE ativo.
 * Nunca exibe keys/tokens.
 */
export default function StagingTestModeBanner() {
  useEffect(() => {
    if (!isStagingTestModeEnabled()) return;
    try {
      ensureStagingFictionalCommercialBootstrap();
    } catch {
      /* seed nunca bloqueia UI */
    }
  }, []);

  if (!isStagingTestModeEnabled()) return null;

  const ref =
    String(
      import.meta.env?.VITE_SUPABASE_PROJECT_REF
      || import.meta.env?.VITE_SUPABASE_APP_URL
      || STAGING_REF,
    );
  let projectRef = STAGING_REF;
  try {
    if (ref.includes('://')) {
      projectRef = new URL(ref).hostname.split('.')[0] || STAGING_REF;
    } else if (/^[a-z0-9]+$/i.test(ref)) {
      projectRef = ref;
    }
  } catch {
    projectRef = STAGING_REF;
  }

  const copy = stagingBannerCopy(projectRef);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="staging-test-mode-banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 99999,
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 16px',
        background: 'linear-gradient(90deg, #7f1d1d 0%, #b45309 100%)',
        color: '#fff7ed',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.02em',
        textAlign: 'center',
        borderBottom: '3px solid #fbbf24',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      }}
    >
      <div>{copy.title}</div>
      <div style={{ fontWeight: 600, fontSize: 12, marginTop: 2, opacity: 0.95 }}>
        {copy.projectLine}
        {' · '}
        {copy.environmentLine}
      </div>
    </div>
  );
}
