import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuração compatível com hospedagem estática (Vercel).
// `base: './'` mantém os caminhos relativos, funcionando tanto na raiz quanto em subpastas.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Pacotes com hash vão para /static (cache imutável); /assets fica para os assets do jogo em public/.
    assetsDir: 'static',
    chunkSizeWarningLimit: 5000,
    sourcemap: false,
  },
});
