import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

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
 *
 * Seuls les scripts en ligne de index.html (apparence posée avant le
 * premier rendu) sont autorisés, chacun par l'empreinte SHA-256 de son
 * contenu exact, calculée ici au build : jamais 'unsafe-inline', et toute
 * modification du script met l'autorisation à jour d'elle-même.
 */
export function politiqueSecuriteContenu(apiUrl: string | undefined, sentryDsn: string | undefined): Plugin {
  return {
    name: 'politique-securite-contenu',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: directivesCsp(html, apiUrl, sentryDsn) },
          injectTo: 'head-prepend',
        },
      ],
    },
  }
}

/** Empreintes SHA-256 des scripts en ligne de la page (sans attribut src). */
export function empreintesScriptsEnLigne(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, contenu]) => `'sha256-${createHash('sha256').update(contenu).digest('base64')}'`,
  )
}

/** Politique complète pour la page donnée : origines de l'API et de Sentry tirées de la configuration. */
export function directivesCsp(html: string, apiUrl: string | undefined, sentryDsn: string | undefined): string {
  const origineApi = apiUrl && /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : null
  // Envoi des erreurs : seul le domaine de réception du DSN est autorisé.
  const origineSentry = sentryDsn && /^https:\/\//.test(sentryDsn) ? new URL(sentryDsn).origin : null
  return [
    "default-src 'self'",
    ["script-src 'self'", ...empreintesScriptsEnLigne(html)].join(' '),
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    `connect-src 'self'${origineApi ? ` ${origineApi}` : ''}${origineSentry ? ` ${origineSentry}` : ''}`,
    // Aucune page encadrée : un cadre injecté ne charge rien.
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
