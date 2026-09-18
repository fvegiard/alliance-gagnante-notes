import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), '@contracts': path.resolve(__dirname, 'contracts') } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'api/**/*.test.ts'] },
});
