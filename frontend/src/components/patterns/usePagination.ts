import { useRef, useState } from 'react';

/** Lignes par page de toutes les listes de l'application. */
export const LIGNES_PAR_PAGE = 10;

export interface EtatPagination {
  /** Rang (à partir de 1) du premier et du dernier élément affichés. */
  debut: number;
  fin: number;
  /** Éléments connus ; partiel quand le serveur en a encore (historiques). */
  total: number;
  totalPartiel: boolean;
  aPrecedent: boolean;
  aSuivant: boolean;
  chargement: boolean;
  precedent: () => void;
  suivant: () => void;
}

interface Options {
  /** Historique paginé par curseur : le serveur a encore des éléments. */
  aPlus?: boolean;
  /** Charge le bloc suivant (fetchNextPage) quand on dépasse ce qui est chargé. */
  chargerPlus?: () => Promise<unknown>;
  /** Toute valeur qui change (filtre, recherche…) ramène à la première page. */
  reinitialiser?: unknown;
  taille?: number;
}

/**
 * Pagination à l'écran, 10 lignes par page. Les listes complètes sont
 * découpées ; les historiques chargés par blocs (50, voir lib/pagination.ts)
 * le sont aussi, et « Suivant » va chercher le bloc d'après au besoin.
 */
export function usePagination<T>(
  elements: readonly T[],
  { aPlus = false, chargerPlus, reinitialiser, taille = LIGNES_PAR_PAGE }: Options = {},
) {
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(false);
  const ancre = useRef<HTMLDivElement>(null);

  // Filtre changé : retour à la page 1, pendant le rendu (pas d'effet en cascade).
  const cle = JSON.stringify(reinitialiser ?? null);
  const [cleVue, setCleVue] = useState(cle);
  if (cle !== cleVue) {
    setCleVue(cle);
    setPage(1);
  }

  // Une suppression peut raccourcir la liste : jamais au-delà de la dernière page.
  const pagesChargees = Math.max(1, Math.ceil(elements.length / taille));
  const courante = Math.min(page, pagesChargees);
  const premier = (courante - 1) * taille;
  const visibles = elements.slice(premier, premier + taille);

  function aller(cible: number) {
    setPage(cible);
    // Haut de la liste remonté à l'écran s'il en est sorti.
    requestAnimationFrame(() => {
      const zone = ancre.current;
      if (zone && zone.getBoundingClientRect().top < 0) zone.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  async function suivant() {
    if (courante < pagesChargees) return aller(courante + 1);
    if (!aPlus || !chargerPlus || chargement) return;
    setChargement(true);
    try {
      await chargerPlus();
      aller(courante + 1);
    } finally {
      setChargement(false);
    }
  }

  const pagination: EtatPagination = {
    debut: visibles.length > 0 ? premier + 1 : 0,
    fin: premier + visibles.length,
    total: elements.length,
    totalPartiel: aPlus,
    aPrecedent: courante > 1,
    aSuivant: courante < pagesChargees || aPlus,
    chargement,
    precedent: () => aller(Math.max(1, courante - 1)),
    suivant: () => void suivant(),
  };
  return { visibles, ancre, pagination };
}
