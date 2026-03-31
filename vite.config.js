import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Ofuscação só em build de produção */
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    host: '127.0.0.1',
  },
  base: './',
  build: {
    sourcemap: false,
    // Minificação avançada com Terser (em produção)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // temporário: debug GPS sync
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        safari10: true,
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        // Nomes de chunk sem informação de estrutura do projeto
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
});
