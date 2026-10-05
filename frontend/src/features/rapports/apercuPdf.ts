/**
 * Rendu de la première page d'un PDF dans un canvas, à l'échelle, avec
 * pdf.js chargé à la demande (seul l'écran Rapports en a besoin). C'est
 * le document réel produit par le serveur, pas une imitation HTML.
 */
export async function rendrePremierePage(pdf: Blob, canvas: HTMLCanvasElement, largeur: number): Promise<void> {
  const [{ getDocument, GlobalWorkerOptions }, { default: worker }] = await Promise.all([
    // Build « legacy » : polyfills inclus, pour les navigateurs Android
    // anciens (la build moderne exige des API toutes récentes).
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker;
  const pdfDocument = await getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
  try {
    const page = await pdfDocument.getPage(1);
    const echelle = largeur / page.getViewport({ scale: 1 }).width;
    const densite = window.devicePixelRatio || 1;
    const vue = page.getViewport({ scale: echelle * densite });
    // Rendu hors écran puis copie : deux rendus successifs (réglages
    // modifiés rapidement) ne se disputent jamais le canvas affiché.
    const tampon = document.createElement('canvas');
    tampon.width = Math.floor(vue.width);
    tampon.height = Math.floor(vue.height);
    await page.render({ canvas: tampon, viewport: vue }).promise;
    canvas.width = tampon.width;
    canvas.height = tampon.height;
    canvas.style.width = `${Math.floor(vue.width / densite)}px`;
    canvas.style.height = `${Math.floor(vue.height / densite)}px`;
    canvas.getContext('2d')?.drawImage(tampon, 0, 0);
  } finally {
    await pdfDocument.destroy();
  }
}

/** Téléchargement d'un fichier reçu du serveur. */
export function telecharger(fichier: Blob, nom: string): void {
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nom de fichier de l'en-tête Content-Disposition, sinon le nom proposé. */
export function nomDeFichier(disposition: string | undefined, defaut: string): string {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? defaut;
}
