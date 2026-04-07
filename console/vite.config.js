import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react';

import tailwindcss from '@tailwindcss/vite';



export default defineConfig({

  plugins: [react(), tailwindcss()],

  server: {

    /** Evita conflito com o app principal (`npm run dev` na raiz), que também usa 5176. */

    port: 5177,

    strictPort: true,

  },

  build: {

    outDir: 'dist',

    emptyOutDir: true,

  },

});

