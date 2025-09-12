import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for Chrome extension
  build: {
    rollupOptions: {
      output: {
        // Ensure consistent naming for Chrome extension
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  define: {
    // Fix for Chrome extension environment
    global: 'globalThis'
  }
})
