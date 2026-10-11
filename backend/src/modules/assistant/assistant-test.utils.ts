import {
  ErreurFournisseurIA,
  type DefinitionOutil,
  type FournisseurIA,
  type MessageTexte,
  type ResultatOutil,
  type SessionIA,
  type TourIA,
} from './fournisseur-ia.js';

/** Tour scripté : appels d'outils à demander, ou réponse finale. */
export type EtapeSimulee =
  | { outils: { nom: string; arguments: unknown }[] }
  | { reponse: string }
  | { fin: 'refus' | 'tronque' }
  | { panne: true };

/**
 * Fournisseur simulé des tests (CI sans clé ni réseau) : joue un script de
 * tours et enregistre ce que l'assistant lui a transmis — outils proposés,
 * historique et résultats d'outils — pour vérifier ce qui sortirait du serveur.
 */
export class FournisseurSimule implements FournisseurIA {
  disponible = true;
  script: EtapeSimulee[] = [];
  /** Une étape répétée à l'infini après la fin du script (test du nombre de tours). */
  enBoucle: EtapeSimulee | null = null;
  outilsProposes: DefinitionOutil[] = [];
  historique: MessageTexte[] = [];
  resultats: ResultatOutil[][] = [];
  tours = 0;

  reinitialiser() {
    Object.assign(this, { disponible: true, script: [], enBoucle: null, outilsProposes: [], historique: [], resultats: [], tours: 0 });
  }

  demarrer(parametres: { outils: DefinitionOutil[]; historique: MessageTexte[] }): SessionIA {
    this.outilsProposes = parametres.outils;
    this.historique = parametres.historique;
    return {
      tour: async (resultats?: ResultatOutil[]): Promise<TourIA> => {
        if (resultats) this.resultats.push(resultats);
        const etape = this.script.shift() ?? this.enBoucle;
        this.tours++;
        const jetons = { entree: 100, sortie: 10 };
        if (!etape) throw new Error('Script du fournisseur simulé épuisé.');
        if ('panne' in etape) throw new ErreurFournisseurIA('reseau');
        if ('reponse' in etape) return { fin: 'reponse', texte: etape.reponse, appels: [], jetons };
        if ('fin' in etape) return { fin: etape.fin, texte: '', appels: [], jetons };
        return {
          fin: 'outils',
          texte: '',
          appels: etape.outils.map((o, i) => ({ id: `appel_${this.tours}_${i}`, nom: o.nom, arguments: o.arguments })),
          jetons,
        };
      },
    };
  }

  /** Résultats d'outils reçus, décodés (JSON) ou texte d'erreur. */
  resultatsDecodes() {
    return this.resultats.flat().map((r) => (r.erreur ? { erreur: r.contenu } : JSON.parse(r.contenu)));
  }
}
