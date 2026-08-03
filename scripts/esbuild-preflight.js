import esbuild from 'esbuild';

try {
  esbuild.transformSync('const x = 1;', { loader: 'js' });
} catch (error) {
  /* ignore */
}
