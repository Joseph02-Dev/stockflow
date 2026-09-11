// Service worker minimal, sans dépendance externe (pas de Workbox) : le
// périmètre reste volontairement limité (voir décision produit) à faire
// fonctionner le chargement de l'application et la lecture des données
// déjà consultées quand le réseau est indisponible. L'écriture hors-ligne
// (mouvements de stock) est gérée séparément, côté application, via une
// file d'attente locale — ce service worker n'y touche pas.

const CACHE = 'stockflow-v1';

self.addEventListener('install', () => {
  // Passe immédiatement à l'état actif : pas d'attente sur les anciens
  // onglets ouverts, une seule version de l'app étant déployée à la fois.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Seules les requêtes GET sont mises en cache — jamais les mutations
  // (POST/PATCH/DELETE), qui doivent toujours atteindre le serveur ou
  // échouer explicitement, jamais être servies depuis un cache.
  if (request.method !== 'GET') return;

  // Réseau d'abord, avec repli sur le cache si indisponible — les
  // données doivent toujours être à jour quand le réseau existe, le
  // cache n'est qu'un filet de secours pour le mode hors-ligne.
  //
  // Pas de restriction "même origine" : en production, l'API (Railway)
  // et le frontend (Netlify) sont sur des origines différentes. Exclure
  // le cross-origin exclurait précisément les réponses API qu'on veut
  // mettre en cache. Les réponses Cloudinary (photos) en profitent aussi,
  // sans effet indésirable.
  event.respondWith(
    fetch(request)
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(request).then((reponse) => reponse ?? Response.error())),
  );
});
