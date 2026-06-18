import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'lucide-react': path.resolve(__dirname, 'src/__tests__/mocks/lucide-react.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.js'],
  },
});
