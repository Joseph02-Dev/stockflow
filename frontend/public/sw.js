// Service worker minimal, sans dépendance externe (pas de Workbox) : le
// périmètre reste volontairement limité (voir décision produit) à faire
// fonctionner le chargement de l'application et la lecture des données
// déjà consultées quand le réseau est indisponible. L'écriture hors-ligne
// (mouvements de stock) est gérée séparément, côté application, via une
// file d'attente locale — ce service worker n'y touche pas.

// Deux caches : l'application elle-même (pages, scripts, styles, polices),
// commune à tous les comptes et gardée à la déconnexion, et les données
// (réponses de l'API, photos), propres au compte : effacées à la
// déconnexion (src/lib/session.ts, même nom).
const CACHE_APPLI = 'stockflow-appli-v1';
const CACHE_DONNEES = 'stockflow-v1';
// Toutes les pages de l'application sont le même index.html (routage côté
// client) : la dernière page chargée en ligne sert de coquille pour ouvrir
// hors ligne n'importe quelle adresse, même jamais visitée.
const COQUILLE = '/__coquille-application';
// index.html de la dernière mise en cache complète : repère un déploiement.
const VERSION = '/__version-application';

/**
 * Met en cache index.html et tout ce qu'il charge (scripts, styles,
 * icônes) : l'application s'ouvre hors ligne dès son installation, sans
 * attendre une seconde visite. Après un déploiement (index.html changé),
 * les fichiers de l'ancienne version sont retirés.
 */
async function mettreAppliEnCache() {
  const reponse = await fetch('/', { cache: 'no-cache' });
  if (!reponse.ok) return;
  const html = await reponse.clone().text();
  const fichiers = [...new Set([...html.matchAll(/(?:src|href)="(\/(?!\/)[^"?#]+)"/g)].map(([, f]) => f))];
  const cache = await caches.open(CACHE_APPLI);
  const precedente = await cache.match(VERSION);
  const nouvelleVersion = !precedente || (await precedente.text()) !== html;
  await Promise.allSettled(
    fichiers.map(async (fichier) => {
      if (!(await cache.match(fichier, { ignoreVary: true }))) await cache.add(fichier);
    }),
  );
  await cache.put(COQUILLE, reponse);
  if (!nouvelleVersion) return;
  await cache.put(VERSION, new Response(html));
  const gardes = new Set(fichiers.map((f) => new URL(f, self.location.origin).href));
  for (const requete of await cache.keys()) {
    if (new URL(requete.url).pathname.startsWith('/assets/') && !gardes.has(requete.url)) await cache.delete(requete);
  }
}

self.addEventListener('install', (event) => {
  // Passe immédiatement à l'état actif : pas d'attente sur les anciens
  // onglets ouverts, une seule version de l'app étant déployée à la fois.
  // Un échec de mise en cache (réseau coupé) n'empêche pas l'installation.
  event.waitUntil(mettreAppliEnCache().catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(cles.filter((c) => c !== CACHE_APPLI && c !== CACHE_DONNEES).map((c) => caches.delete(c))),
      ),
  );
  self.clients.claim();
});

// Ouverture de l'application en ligne : la coquille est remise à jour
// (nouveau déploiement), sans ralentir l'affichage.
self.addEventListener('message', (event) => {
  if (event.data === 'mettre-appli-en-cache') event.waitUntil(mettreAppliEnCache().catch(() => undefined));
});

/** Fichiers de l'application (même origine hors API, polices et styles), à l'inverse des données. */
function estFichierAppli(request) {
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return !url.pathname.startsWith('/api/');
  return request.destination === 'font' || request.destination === 'style';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Seules les requêtes GET sont mises en cache — jamais les mutations
  // (POST/PATCH/DELETE), qui doivent toujours atteindre le serveur ou
  // échouer explicitement, jamais être servies depuis un cache.
  if (request.method !== 'GET') return;

  const navigation = request.mode === 'navigate';
  // Synchronisation de la base locale (GET /sync) : déjà recopiée dans
  // IndexedDB par l'application ; un curseur différent à chaque appel
  // remplirait le cache pour rien.
  if (!navigation && new URL(request.url).pathname.endsWith('/sync')) return;
  const nomCache = navigation || estFichierAppli(request) ? CACHE_APPLI : CACHE_DONNEES;

  // Fichiers de build (nom avec empreinte, jamais modifiés) : le cache
  // d'abord, l'ouverture est immédiate même sur un réseau lent.
  if (nomCache === CACHE_APPLI && new URL(request.url).pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(
        (enCache) =>
          enCache ??
          fetch(request).then((reponse) => {
            if (reponse.ok) {
              const copie = reponse.clone();
              caches.open(CACHE_APPLI).then((cache) => cache.put(request, copie));
            }
            return reponse;
          }),
      ),
    );
    return;
  }

  // Réseau d'abord, avec repli sur le cache si indisponible — les
  // données doivent toujours être à jour quand le réseau existe, le
  // cache n'est qu'un filet de secours pour le mode hors-ligne.
  //
  // Pas de restriction "même origine" : en production, l'API et le
  // frontend sont sur des origines différentes. Exclure le cross-origin
  // exclurait précisément les réponses API qu'on veut mettre en cache.
  event.respondWith(
    fetch(request)
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          const coquille = navigation ? reponse.clone() : null;
          caches.open(nomCache).then((cache) => {
            cache.put(request, copie);
            if (coquille) cache.put(COQUILLE, coquille);
          });
        }
        return reponse;
      })
      .catch(() =>
        caches
          // Fichiers de l'application : la requête d'un script module (en-tête
          // Origin) doit retrouver celle de la mise en cache, malgré « Vary ».
          .match(request, { ignoreVary: nomCache === CACHE_APPLI })
          .then((reponse) => reponse ?? (navigation ? caches.match(COQUILLE) : undefined))
          .then((reponse) => reponse ?? Response.error()),
      ),
  );
});

// Notifications push (alertes de stock) : affichées par le système, avec
// son et vibration du téléphone, même application fermée ou appareil en
// veille. Contenu envoyé par l'API (backend, PushService).
self.addEventListener('push', (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch {
    // Contenu illisible : notification générique plutôt que rien.
  }
  event.waitUntil(
    self.registration.showNotification(donnees.titre || 'NimbaFlow', {
      body: donnees.corps || 'Nouvelle alerte de stock.',
      icon: '/favicon-192.png',
      badge: '/icones/badge-96.png',
      tag: donnees.etiquette,
      // Même étiquette (même produit, même alerte) : remplace et sonne à nouveau.
      renotify: Boolean(donnees.etiquette),
      vibrate: [200, 100, 200],
      lang: 'fr',
      data: { url: donnees.url || '/' },
    }),
  );
});

// Toucher la notification : l'application déjà ouverte passe au premier
// plan et affiche la page concernée (sans rechargement, src/layouts/
// AppLayout.tsx), sinon elle s'ouvre directement sur cette page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chemin = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((fenetres) => {
      const fenetre = fenetres[0];
      if (!fenetre) return self.clients.openWindow(chemin);
      fenetre.postMessage({ type: 'naviguer', chemin });
      return fenetre.focus();
    }),
  );
});
