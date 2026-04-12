import { defineConfig, loadEnv } from 'vite';

import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';



export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_PLATFORM_API_BASE_URL || 'http://127.0.0.1:3001';

  const platformApiProxy = {
    '/internal/platform': {
      target: backendTarget,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      /** Mesma porta que `npm run console:dev` / README (app principal na raiz usa 5176). */
      port: 5177,
      strictPort: true,
      /** Igual ao app na raiz: abre o login da Console no navegador ao subir o Vite. */
      open: '/login',
      proxy: platformApiProxy,
    },
    /** `vite preview` também encaminha /internal/platform → 3001 (mesmo contrato do dev). */
    preview: {
      port: 5177,
      strictPort: true,
      proxy: platformApiProxy,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});

