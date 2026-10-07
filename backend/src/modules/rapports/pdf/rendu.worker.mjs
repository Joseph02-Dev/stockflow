// Fil de rendu des PDF (worker_threads). pdfmake calcule la mise en page de
// façon synchrone et occupe le processeur : exécuté ici, il ne bloque plus
// les autres requêtes de l'API (mesure : docs/mesures-performance.md).
//
// JavaScript autonome (n'importe que pdfmake) : il tourne à l'identique
// depuis les sources (tests) et depuis dist/ (copié par nest-cli.json).
// Les constantes du gabarit (couleurs, marge, polices) arrivent par
// workerData : une seule source de vérité, gabarit.ts.
import { parentPort, workerData } from 'node:worker_threads';
import pdfmake from 'pdfmake';

const { polices, dossierPolices, couleurs, marge } = workerData;

pdfmake.setFonts(polices);
// pdfmake ne télécharge rien (le logo arrive déjà embarqué) et ne lit sur
// le disque que les fichiers de police.
pdfmake.setUrlAccessPolicy(() => false);
const POLICES_STANDARD = new Set(['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']);
pdfmake.setLocalAccessPolicy((chemin) => POLICES_STANDARD.has(chemin) || chemin.startsWith(dossierPolices));

// Mises en forme nommées : une fonction ne traverse pas d'un fil à l'autre,
// le gabarit les désigne par leur nom et transmet ses paramètres sur la table
// (table.fonds, table.indexTotaux).
pdfmake.addTableLayouts({
  'gabarit-tableau': {
    fillColor: (i, node) => node.table.fonds?.[i] ?? null,
    hLineWidth: (i, node) => (i === node.table.indexTotaux ? 2 : i === 0 || i === node.table.body.length ? 0 : 0.5),
    hLineColor: (i, node) => (i === node.table.indexTotaux ? couleurs.noir : couleurs.filet),
    vLineWidth: () => 0,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 2.5,
    paddingBottom: () => 2.5,
  },
  'gabarit-synthese': {
    fillColor: () => couleurs.fondSynthese,
    hLineColor: () => couleurs.filet,
    vLineColor: () => couleurs.filet,
    hLineWidth: () => 0.75,
    vLineWidth: () => 0.75,
  },
  'gabarit-cadre': {
    hLineWidth: () => 1.5,
    vLineWidth: () => 1.5,
    hLineColor: () => couleurs.encre,
    vLineColor: () => couleurs.encre,
  },
});

/** Pied de page : intitulé à gauche, pagination à droite. */
const piedDePage = (intitule) => (page, pages) => ({
  columns: [
    { text: intitule, style: 'pied' },
    { text: `Document généré par StockFlow · page ${page} sur ${pages}`, style: 'pied', alignment: 'right', width: 'auto' },
  ],
  margin: [marge, 14, marge, 0],
});

parentPort.on('message', async ({ id, definition }) => {
  try {
    const { piedDePage: intitule, ...document } = definition;
    if (intitule) document.footer = piedDePage(intitule);
    const pdf = await pdfmake.createPdf(document).getBuffer();
    // Copie dans un tampon propre, transféré sans recopie au fil principal.
    const octets = new Uint8Array(pdf);
    parentPort.postMessage({ id, octets }, [octets.buffer]);
  } catch (erreur) {
    parentPort.postMessage({ id, erreur: erreur instanceof Error ? erreur.message : String(erreur) });
  }
});
