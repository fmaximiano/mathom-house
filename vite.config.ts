import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          estatica: path.resolve(__dirname, 'estatica.html'),
          passeioInterativo: path.resolve(__dirname, 'passeio-interativo.html'),
          passeioLeve: path.resolve(__dirname, 'passeio-leve.html'),
          passeioGuiado: path.resolve(__dirname, 'passeio-guiado.html'),
          modeloInterativo: path.resolve(__dirname, 'modelo-interativo.html'),
          vistaRelevo: path.resolve(__dirname, 'vista-relevo.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
