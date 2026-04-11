import { defineConfig, loadEnv } from 'vite';

import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';



export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_PLATFORM_API_BASE_URL || 'http://127.0.0.1:3001';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      /** Evita conflito com o app principal (`npm run dev` na raiz), que também usa 5176. */
      port: 5178,
      strictPort: true,
      proxy: {
        '/internal/platform': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});

