import esbuild from 'esbuild';

const log = (payload) => {
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      timestamp: Date.now(),
      sessionId: 'debug-session',
    }),
  }).catch(() => {});
};

// #region agent log
log({
  location: 'scripts/esbuild-preflight.js:12',
  message: 'preflight start',
  data: {
    platform: process.platform,
    nodeVersion: process.version,
    cwd: process.cwd(),
  },
  runId: 'pre-fix',
  hypothesisId: 'H1',
});
// #endregion

// #region agent log
log({
  location: 'scripts/esbuild-preflight.js:26',
  message: 'esbuild version',
  data: {
    esbuildVersion: esbuild.version,
    moduleKeys: Object.keys(esbuild),
  },
  runId: 'pre-fix',
  hypothesisId: 'H2',
});
// #endregion

try {
  // #region agent log
  log({
    location: 'scripts/esbuild-preflight.js:38',
    message: 'esbuild transform start',
    data: { sample: 'const x = 1;' },
    runId: 'pre-fix',
    hypothesisId: 'H1',
  });
  // #endregion

  esbuild.transformSync('const x = 1;', { loader: 'js' });

  // #region agent log
  log({
    location: 'scripts/esbuild-preflight.js:48',
    message: 'esbuild transform ok',
    data: { ok: true },
    runId: 'pre-fix',
    hypothesisId: 'H1',
  });
  // #endregion
} catch (error) {
  // #region agent log
  log({
    location: 'scripts/esbuild-preflight.js:58',
    message: 'esbuild transform error',
    data: {
      name: String(error?.name || ''),
      message: String(error?.message || error),
      code: String(error?.code || ''),
    },
    runId: 'pre-fix',
    hypothesisId: 'H1',
  });
  // #endregion
}
