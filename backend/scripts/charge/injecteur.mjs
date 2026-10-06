// Injecteur de charge : N utilisateurs simultanés (un par entreprise, adresse IP
// distincte), parcours réaliste en boucle pendant D secondes.
//
//   node scripts/charge/injecteur.mjs <utilisateurs> <secondes> [pause_ms] [entreprise]
//
// Entreprises du jeu de données (jeu-de-donnees.sql) : c1..cN, ou « gros » pour
// faire jouer tous les utilisateurs sur la grosse entreprise. API ciblée :
// CHARGE_API (défaut http://localhost:3100). Base locale uniquement.
import { createHash } from 'node:crypto';

const [N, D, PAUSE = 0] = process.argv.slice(2, 5).map(Number);
const ENTREPRISE = process.argv[5];
const BASE = process.env.CHARGE_API ?? 'http://localhost:3100';
if (!N || !D) {
  console.error('Usage : node scripts/charge/injecteur.mjs <utilisateurs> <secondes> [pause_ms] [entreprise]');
  process.exit(1);
}

/** Même calcul que pg_temp.u4 dans jeu-de-donnees.sql. */
const u4 = (texte) => {
  const h = createHash('md5').update(texte).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const ip = (i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

const stats = new Map();
function noter(nom, ms, statut) {
  const s = stats.get(nom) ?? { durees: [], erreurs: 0, statuts: {} };
  s.durees.push(ms);
  if (statut >= 400 || statut === 0) s.erreurs++;
  s.statuts[statut] = (s.statuts[statut] ?? 0) + 1;
  stats.set(nom, s);
}

async function appel(nom, vu, chemin, options = {}) {
  const debut = performance.now();
  let statut = 0;
  try {
    const reponse = await fetch(BASE + chemin, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(vu.i + 1000), Authorization: `Bearer ${vu.jeton}` },
    });
    statut = reponse.status;
    await reponse.arrayBuffer();
  } catch {
    statut = 0;
  }
  noter(nom, performance.now() - debut, statut);
}

// Connexions (argon2, volontairement coûteux) : mesurées à part.
const vus = [];
const debutConnexions = performance.now();
await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const code = ENTREPRISE ?? `c${(i % 500) + 1}`;
    const debut = performance.now();
    const reponse = await fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(i + 1) },
      body: JSON.stringify({ email: `charge-${code}@stockflow.dev`, password: 'motdepasse-solide-123' }),
    });
    noter('POST /auth/login', performance.now() - debut, reponse.status);
    const corps = await reponse.json();
    if (corps.accessToken) vus.push({ i, code, jeton: corps.accessToken });
  }),
);
const dureeConnexions = (performance.now() - debutConnexions) / 1000;

// Parcours pondérés : ce qu'un gérant ou un vendeur fait réellement.
const parcours = [
  [3, 'tableau de bord (6 req.)', (vu) =>
    Promise.all(
      ['/dashboard/overview', '/alertes?statut=ACTIVE', '/stock', '/mouvements', '/commandes', '/fournisseurs'].map((c) =>
        appel('tableau de bord (6 req.)', vu, c),
      ),
    )],
  [2, 'GET /produits', (vu) => appel('GET /produits', vu, '/produits')],
  [2, 'GET /ventes', (vu) => appel('GET /ventes', vu, '/ventes')],
  [1, 'GET /creances', (vu) => appel('GET /creances', vu, '/creances')],
  [1, 'GET /clients', (vu) => appel('GET /clients', vu, '/clients')],
  [1, 'GET /mouvements (page)', (vu) => appel('GET /mouvements (page)', vu, '/mouvements?limite=50')],
  [1, 'GET /pertes/synthese', (vu) => appel('GET /pertes/synthese', vu, '/pertes/synthese')],
  [1, 'POST /ventes', (vu) =>
    appel('POST /ventes', vu, '/ventes', {
      method: 'POST',
      body: JSON.stringify({
        emplacementId: u4(`em-${vu.code}-1`),
        clientId: u4(`c-${vu.code}-1`),
        modePaiement: 'CREDIT',
        lignes: [
          { produitId: u4(`p-${vu.code}-1`), quantite: 1 },
          { produitId: u4(`p-${vu.code}-2`), quantite: 1 },
        ],
      }),
    })],
  [0.3, 'GET /rapports/stock (PDF)', (vu) => appel('GET /rapports/stock (PDF)', vu, '/rapports/stock')],
];
const total = parcours.reduce((s, [poids]) => s + poids, 0);
const tirer = () => {
  let r = Math.random() * total;
  for (const p of parcours) if ((r -= p[0]) <= 0) return p[2];
  return parcours[0][2];
};

const fin = performance.now() + D * 1000;
const debut = performance.now();
await Promise.all(
  vus.map(async (vu) => {
    // Départs étalés : de vrais utilisateurs n'agissent jamais tous à la même milliseconde.
    await new Promise((r) => setTimeout(r, Math.random() * Math.max(PAUSE, 1000)));
    while (performance.now() < fin) {
      await tirer()(vu);
      if (PAUSE) await new Promise((r) => setTimeout(r, PAUSE * (0.5 + Math.random())));
    }
  }),
);
const duree = (performance.now() - debut) / 1000;

const pct = (triees, p) => triees[Math.min(triees.length - 1, Math.floor((p / 100) * triees.length))] ?? 0;
let requetes = 0;
let erreurs = 0;
const lignes = [];
for (const [nom, s] of stats) {
  if (nom === 'POST /auth/login') continue;
  const d = [...s.durees].sort((a, b) => a - b);
  requetes += d.length;
  erreurs += s.erreurs;
  lignes.push(
    `| ${nom} | ${d.length} | ${pct(d, 50).toFixed(0)} | ${pct(d, 95).toFixed(0)} | ${pct(d, 99).toFixed(0)} | ${s.erreurs}${s.erreurs ? ` ${JSON.stringify(s.statuts)}` : ''} |`,
  );
}
const connexions = stats.get('POST /auth/login');
const login = [...(connexions?.durees ?? [])].sort((a, b) => a - b);
console.log(`### ${N} utilisateurs${ENTREPRISE ? ` (entreprise ${ENTREPRISE})` : ''}, ${D} s, pause ${PAUSE} ms`);
console.log(`Connexions : ${vus.length}/${N} en ${dureeConnexions.toFixed(1)} s (p95 ${pct(login, 95).toFixed(0)} ms, erreurs ${connexions?.erreurs ?? 0})`);
console.log(`Débit : ${(requetes / duree).toFixed(0)} req/s ; erreurs : ${requetes ? ((erreurs / requetes) * 100).toFixed(2) : 0} %\n`);
console.log('| Parcours | n | p50 (ms) | p95 (ms) | p99 (ms) | erreurs |\n|---|---|---|---|---|---|');
console.log(lignes.join('\n'));
