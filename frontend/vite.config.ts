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
        // La lecture des fichiers d'import (CSV, Excel) ne sert qu'à
        // l'écran d'import, chargé à la demande : elle a son propre fichier.
        codeSplitting: {
          groups: [
            {
              name: 'lecture-fichiers',
              test: /node_modules[\\/](papaparse|read-excel-file|fflate|saxen|unzipper-esm|worker-f)[\\/]/,
              priority: 2,
            },
            // pdf.js (aperçu des rapports) : chargé seulement par l'écran Rapports.
            { name: 'apercu-pdf', test: /node_modules[\\/]pdfjs-dist[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules/, priority: 1 },
          ],
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
