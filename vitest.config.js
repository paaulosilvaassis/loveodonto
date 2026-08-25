import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      'lucide-react': path.resolve(__dirname, 'src/__tests__/mocks/lucide-react.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.js'],
    env: {
      VITE_RH_SUPABASE_READ: 'false',
      VITE_RH_SUPABASE_READ_PRIMARY: 'false',
      VITE_RH_SUPABASE_WRITE: 'false',
      VITE_RH_SHADOW_READ: 'false',
      VITE_RH_COMPARE_IDB_SUPABASE: 'false',
      VITE_RH_IDB_WRITE_DISABLED: 'false',
      VITE_CLINIC_PROFILE_READ: 'false',
      VITE_CLINIC_PROFILE_READ_PRIMARY: 'false',
      VITE_CLINIC_PROFILE_WRITE: 'false',
      VITE_CLINIC_PROFILE_SHADOW_READ: 'false',
      VITE_CLINIC_PROFILE_COMPARE_IDB_REMOTE: 'false',
      VITE_AGENDA_READ: 'false',
      VITE_AGENDA_READ_PRIMARY: 'false',
      VITE_AGENDA_WRITE: 'false',
      VITE_AGENDA_SHADOW: 'false',
      VITE_AGENDA_COMPARE: 'false',
      VITE_ACCESS_SAAS_ENABLED: '',
      VITE_SUPABASE_PLATFORM_URL: '',
      VITE_SUPABASE_PLATFORM_ANON_KEY: '',
      VITE_SUPABASE_APP_URL: '',
      VITE_SUPABASE_APP_ANON_KEY: '',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
