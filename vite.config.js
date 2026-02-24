import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: false,
    open: true,
    fs: {
      allow: [
        'C:/Users/paaul/.cursor/projects/c-Users-paaul-Desktop-appgestaoodonto-main-appgestaoodonto/assets',
        'C:/Users/paaul/Downloads',
        'C:/Users/paaul/Desktop/appgestaoodonto-main/appgestaoodonto',
      ],
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => next());
    },
  },
});
