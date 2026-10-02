import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rolldownOptions: {
      output: {
        // Les dépendances (React, React Query, Zod…) changent rarement :
        // isolées dans leur propre fichier, elles restent en cache
        // navigateur d'un déploiement à l'autre et le bundle applicatif
        // repasse sous le seuil d'alerte de 500 kB.
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules/ }],
        },
      },
    },
  },
  server: {
    proxy: {
      // Le frontend appelle /api/*, redirigé vers le backend NestJS en
      // développement — évite toute configuration CORS locale.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
