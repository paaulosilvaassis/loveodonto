import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    fs: {
      allow: [
        'C:/Users/paaul/.cursor/projects/c-Users-paaul-Desktop-appgestaoodonto-main-appgestaoodonto/assets',
        'C:/Users/paaul/Downloads',
        'C:/Users/paaul/Desktop/appgestaoodonto-main/appgestaoodonto',
      ],
    },
    configureServer(server) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vite.config.js:9',message:'dev server config',data:{port:server?.config?.server?.port || null,strict:server?.config?.server?.strictPort || false},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H11'})}).catch(()=>{});
      // #endregion
      server.middlewares.use((req, res, next) => {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'vite.config.js:14',message:'dev server request',data:{url:req?.url || '',method:req?.method || '',host:req?.headers?.host || ''},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H10'})}).catch(()=>{});
        // #endregion
        next();
      });
    },
  },
});
