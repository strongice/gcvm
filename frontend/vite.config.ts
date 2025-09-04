import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // MPA: three entry HTML pages
      input: {
        index: 'index.html',
        group: 'group.html',
        project: 'project.html',
      },
    },
  },
});
