/**
 * Calcul des montants d'une vente — MIROIR EXACT de
 * backend/src/modules/ventes/calcul-vente.ts (même ordre, mêmes arrondis,
 * entiers uniquement). Il sert à afficher les totaux pendant la saisie ;
 * le serveur recalcule toujours et fait foi.
 */

export interface LigneACalculer {
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
}

export interface TvaParTaux {
  taux: number;
  base: number;
  montant: number;
}

export interface TotauxVente {
  montantsLignes: number[];
  sousTotal: number;
  remise: number;
  baseTva: number;
  tvaParTaux: TvaParTaux[];
  montantTva: number;
  total: number;
}

/** arrondi(a × b / 100) pour des entiers positifs, sans passer par un flottant. */
function pourcentageArrondi(a: bigint, b: bigint): bigint {
  return (a * b + 50n) / 100n;
}

export function calculerTotaux(
  lignes: LigneACalculer[],
  tauxRemise = 0,
): TotauxVente {
  const montantsLignes = lignes.map((l) => l.quantite * l.prixUnitaire);
  const sousTotal = montantsLignes.reduce((a, b) => a + b, 0);
  const remise = Number(
    pourcentageArrondi(BigInt(sousTotal), BigInt(tauxRemise)),
  );
  const tvaParTaux = ventilerTva(lignes, remise);
  const baseTva = sousTotal - remise;
  const montantTva = tvaParTaux.reduce((a, t) => a + t.montant, 0);
  return {
    montantsLignes,
    sousTotal,
    remise,
    baseTva,
    tvaParTaux,
    montantTva,
    total: baseTva + montantTva,
  };
}

/**
 * TVA par taux pour une remise donnée EN MONTANT. Sert au calcul initial
 * et à l'affichage d'une vente passée depuis ses seules lignes figées et
 * sa remise enregistrée — jamais depuis l'état actuel des produits.
 */
export function ventilerTva(
  lignes: LigneACalculer[],
  remise: number,
): TvaParTaux[] {
  const montantsLignes = lignes.map((l) => l.quantite * l.prixUnitaire);
  const sousTotal = montantsLignes.reduce((a, b) => a + b, 0);

  // Sous-total par taux, du plus fort au plus faible (ordre stable du reçu).
  const parTaux = new Map<number, number>();
  lignes.forEach((l, i) =>
    parTaux.set(l.tauxTva, (parTaux.get(l.tauxTva) ?? 0) + montantsLignes[i]),
  );
  const groupes = [...parTaux.entries()].sort(([a], [b]) => b - a);

  // Ventilation de la remise : parts entières, puis les unités restantes
  // aux plus forts restes (à égalité, au taux le plus élevé).
  const parts = groupes.map(([, base]) => {
    if (sousTotal === 0) return { part: 0n, reste: 0n };
    const numerateur = BigInt(remise) * BigInt(base);
    return {
      part: numerateur / BigInt(sousTotal),
      reste: numerateur % BigInt(sousTotal),
    };
  });
  let aDistribuer = BigInt(remise) - parts.reduce((a, p) => a + p.part, 0n);
  const ordre = parts
    .map((_, i) => i)
    .sort((i, j) =>
      parts[j].reste > parts[i].reste
        ? 1
        : parts[j].reste < parts[i].reste
          ? -1
          : i - j,
    );
  for (const i of ordre) {
    if (aDistribuer <= 0n) break;
    parts[i].part += 1n;
    aDistribuer -= 1n;
  }

  return groupes.map(([taux, sousTotalTaux], i) => {
    const base = sousTotalTaux - Number(parts[i].part);
    return {
      taux,
      base,
      montant: Number(pourcentageArrondi(BigInt(base), BigInt(taux))),
    };
  });
}

/**
 * Taux de remise d'une vente passée, déduit de la remise enregistrée
 * (remise = arrondi(sousTotal × taux / 100), donc exact dès que le
 * sous-total dépasse 100 GNF). Sert uniquement à l'affichage du reçu.
 */
export function tauxRemiseAffiche(sousTotal: number, remise: number): number {
  return sousTotal > 0 ? Math.round((remise * 100) / sousTotal) : 0;
}
