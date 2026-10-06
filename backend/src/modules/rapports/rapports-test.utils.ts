/**
 * Lecture des PDF produits, pour les tests uniquement (seuls les *.spec.ts
 * l'importent) : texte de chaque page, extrait par pdfjs (JavaScript pur).
 * Les espaces fines et insécables sont ramenées à une espace simple.
 */
export async function lirePdf(pdf: Buffer): Promise<{ pages: string[] }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createRequire } = await import('node:module');
  const { dirname } = await import('node:path');
  const polices = `${dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/standard_fonts/`;
  const chargement = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, standardFontDataUrl: polices });
  const document = await chargement.promise;
  const pages: string[] = [];
  for (let n = 1; n <= document.numPages; n++) {
    const page = await document.getPage(n);
    const contenu = await page.getTextContent();
    pages.push(
      contenu.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/[   ]/g, ' ')
        .replace(/\s+/g, ' '),
    );
  }
  await chargement.destroy();
  return { pages };
}

/** « 1 284 760 000 » tel qu'extrait du PDF (espaces normalisées). */
export const enTexte = (valeur: number) => String(valeur).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
