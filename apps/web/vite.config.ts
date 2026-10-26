import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  publicDir: 'public',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          editor: [
            '@codemirror/commands',
            '@codemirror/lang-json',
            '@codemirror/language',
            '@codemirror/lint',
            '@codemirror/state',
            '@codemirror/view',
          ],
          framework: ['vue', 'pinia'],
        },
      },
    },
  },
})
