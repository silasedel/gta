import { defineConfig } from 'vite';

// Relative base so the production build works at any URL path (e.g. GitHub Pages /port-solana/).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 4000 },
});
