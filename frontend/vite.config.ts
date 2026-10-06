import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'node:path'

/**
 * Content-Security-Policy injectée dans index.html au build (pas en
 * développement : le serveur Vite a besoin de scripts en ligne pour le
 * rechargement à chaud). L'origine de l'API vient de VITE_API_URL, la
 * variable déjà fournie à Vercel : aucune URL n'est codée en dur.
 *
 * Effet : un script injecté (XSS) ne peut ni s'exécuter depuis un autre
 * domaine, ni envoyer les tokens de session ailleurs qu'à notre API.
 * Les directives interdites dans une balise meta (frame-ancestors) sont
 * envoyées en en-tête par Vercel (vercel.json).
 */
function politiqueSecuriteContenu(apiUrl: string | undefined, sentryDsn: string | undefined): Plugin {
  const origineApi = apiUrl && /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : null
  // Envoi des erreurs : seul le domaine de réception du DSN est autorisé.
  const origineSentry = sentryDsn && /^https:\/\//.test(sentryDsn) ? new URL(sentryDsn).origin : null
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    `connect-src 'self'${origineApi ? ` ${origineApi}` : ''}${origineSentry ? ` ${origineSentry}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'politique-securite-contenu',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: directives }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Variable Vercel nommée VSENTRY_DSN (sans le préfixe VITE_, que Vite
  // exige pour exposer une variable) : injectée ici explicitement, seule.
  const sentryDsn = env.VSENTRY_DSN?.trim() ?? ''
  return {
    define: { __SENTRY_DSN__: JSON.stringify(sentryDsn) },
    plugins: [react(), tailwindcss(), politiqueSecuriteContenu(env.VITE_API_URL, sentryDsn)],
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
              // Surveillance des erreurs (Sentry) : fichier à part, le vendor reste sous 500 kB.
              { name: 'surveillance', test: /node_modules[\\/]@sentry(-internal)?[\\/]/, priority: 2 },
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
  }
})
