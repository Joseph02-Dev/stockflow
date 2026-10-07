import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';
import { COULEURS, MARGE } from './gabarit.js';

const require = createRequire(import.meta.url);
const DOSSIER_POLICES = join(dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

/**
 * Définition transmissible au fil de rendu : uniquement des données. Les
 * mises en forme de tableau sont désignées par leur nom (rendu.worker.mjs) ;
 * le pied de page, qui dépend du numéro de page, y est construit à partir
 * de son intitulé.
 */
export type DefinitionRapport = Omit<TDocumentDefinitions, 'footer'> & { piedDePage?: string };

/** Au-delà, le rendu est abandonné et le fil relancé (document anormalement lourd). */
const DELAI_RENDU_MS = 60_000;

interface Attente {
  resoudre: (pdf: Buffer) => void;
  rejeter: (erreur: Error) => void;
  minuteur: NodeJS.Timeout;
}

/**
 * Un fil de rendu dédié, démarré à la première demande : les PDF passent
 * l'un après l'autre et ne bloquent plus les autres requêtes de l'API. Un
 * fil en échec (erreur, délai dépassé) est arrêté puis relancé à la demande
 * suivante ; les rendus en attente échouent proprement.
 */
export class RenduPdf {
  private fil?: Worker;
  private prochainId = 0;
  private readonly attentes = new Map<number, Attente>();

  rendre(definition: DefinitionRapport): Promise<Buffer> {
    const fil = this.demarrer();
    const id = ++this.prochainId;
    return new Promise<Buffer>((resoudre, rejeter) => {
      const minuteur = setTimeout(() => this.abandonner(new Error(`rendu PDF interrompu après ${DELAI_RENDU_MS / 1000} s`)), DELAI_RENDU_MS);
      this.attentes.set(id, { resoudre, rejeter, minuteur });
      try {
        fil.postMessage({ id, definition });
      } catch (erreur) {
        // Définition non transmissible (une fonction, par exemple) : échec
        // de cette demande seule, sans toucher au fil ni aux autres rendus.
        clearTimeout(minuteur);
        this.attentes.delete(id);
        rejeter(new Error(`rendu PDF impossible : ${(erreur as Error).message}`));
      }
    });
  }

  async arreter(): Promise<void> {
    const fil = this.fil;
    this.fil = undefined;
    this.rejeterAttentes(new Error('rendu PDF interrompu : arrêt du service'));
    if (fil) await fil.terminate();
  }

  private demarrer(): Worker {
    if (this.fil) return this.fil;
    const fil = new Worker(new URL('./rendu.worker.mjs', import.meta.url), {
      workerData: {
        dossierPolices: DOSSIER_POLICES,
        couleurs: COULEURS,
        marge: MARGE,
        // Roboto (livrée avec pdfmake) couvre le français : é, è, ê, à, ç, œ, «, ».
        // Courier est une police standard PDF, sans fichier : références produit.
        polices: {
          Roboto: {
            normal: join(DOSSIER_POLICES, 'Roboto-Regular.ttf'),
            bold: join(DOSSIER_POLICES, 'Roboto-Medium.ttf'),
            italics: join(DOSSIER_POLICES, 'Roboto-Italic.ttf'),
            bolditalics: join(DOSSIER_POLICES, 'Roboto-MediumItalic.ttf'),
          },
          Courier: { normal: 'Courier', bold: 'Courier-Bold', italics: 'Courier-Oblique', bolditalics: 'Courier-BoldOblique' },
        },
      },
    });
    fil.on('message', ({ id, octets, erreur }: { id: number; octets?: Uint8Array; erreur?: string }) => {
      const attente = this.attentes.get(id);
      if (!attente) return;
      this.attentes.delete(id);
      clearTimeout(attente.minuteur);
      if (octets) attente.resoudre(Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength));
      else attente.rejeter(new Error(`rendu PDF impossible : ${erreur}`));
    });
    fil.on('error', (erreur) => this.abandonner(erreur));
    fil.on('exit', () => {
      if (this.fil === fil) this.abandonner(new Error('fil de rendu PDF arrêté'));
    });
    // Le fil ne retient pas le processus : arrêt propre de l'API garanti.
    fil.unref();
    this.fil = fil;
    return fil;
  }

  /** Échec du fil : tout ce qui attend échoue, le fil est relancé à la prochaine demande. */
  private abandonner(erreur: Error): void {
    const fil = this.fil;
    this.fil = undefined;
    this.rejeterAttentes(erreur);
    void fil?.terminate();
  }

  private rejeterAttentes(erreur: Error): void {
    for (const attente of this.attentes.values()) {
      clearTimeout(attente.minuteur);
      attente.rejeter(erreur);
    }
    this.attentes.clear();
  }
}
