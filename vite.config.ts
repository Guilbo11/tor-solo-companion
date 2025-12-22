import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Needed for GitHub Pages (repo name must match the base path)
  base: '/tor-solo-companion/',
  server: { port: 5173 },
});
