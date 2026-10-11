import type { MethodeValorisation, NatureEmplacement } from '../../generated/prisma/enums.js';
import type { TransactionPrisma } from './moteur-stock.js';

/**
 * Valorisation du stock par couches (stock.valuation.layer d'Odoo),
 * module « valorisation ». Chaque mouvement qui change le stock total
 * laisse une couche : entrée au coût d'achat, sortie au coût FIFO (couches
 * d'entrée les plus anciennes) ou au coût moyen pondéré (PMP). Un
 * transfert ne change pas la valeur de l'entreprise : aucune couche.
 * Les couches d'entrée gardent leur reste non consommé, consommé dans
 * l'ordre FIFO quelle que soit la méthode : changer de méthode ne fausse
 * donc jamais les quantités.
 */

// ——— Règles pures (testées unitairement) ———

/** Effet d'un mouvement sur le stock total de l'entreprise : +q, −q, ou 0 (transfert). */
export function variationStock(origine: NatureEmplacement, destination: NatureEmplacement, quantite: number): number {
  const q = Math.abs(quantite);
  if (origine === 'INTERNE' && destination === 'INTERNE') return 0;
  if (destination === 'INTERNE') return q;
  if (origine === 'INTERNE') return -q;
  return 0;
}

export interface CoucheOuverte {
  id: string;
  quantiteRestante: number;
  coutUnitaire: number;
}

/**
 * Consomme une sortie dans les couches d'entrée, de la plus ancienne à la
 * plus récente. `manquant` > 0 si les couches ne suffisent pas (stock
 * antérieur au module, sans couche) : l'appelant le valorise autrement.
 */
export function consommerCouches(couches: CoucheOuverte[], quantite: number) {
  const prises: { id: string; quantite: number }[] = [];
  let reste = quantite;
  let valeur = 0;
  for (const couche of couches) {
    if (reste === 0) break;
    const prise = Math.min(couche.quantiteRestante, reste);
    if (prise <= 0) continue;
    prises.push({ id: couche.id, quantite: prise });
    valeur += prise * couche.coutUnitaire;
    reste -= prise;
  }
  return { prises, valeurFifo: valeur, manquant: reste };
}

/** Coût moyen pondéré : valeur totale / quantité totale, ou null sans stock valorisé. */
export function coutMoyen(valeur: bigint | number, quantite: number): number | null {
  if (quantite <= 0) return null;
  return Math.round(Number(valeur) / quantite);
}

// ——— Écritures (dans la transaction du mouvement) ———

async function verrouillerValorisation(tx: TransactionPrisma, produitId: string) {
  // Sérialise la valorisation d'un même produit : deux sorties simultanées
  // ne consomment jamais la même couche, une entrée ne fausse pas le PMP.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`valo:${produitId}`}))`;
}

async function coutMoyenCourant(tx: TransactionPrisma, produitId: string) {
  const { _sum } = await tx.coucheValorisation.aggregate({
    where: { produitId },
    _sum: { valeur: true, quantite: true },
  });
  return coutMoyen(_sum.valeur ?? 0n, _sum.quantite ?? 0);
}

async function couchesOuvertes(tx: TransactionPrisma, produitId: string) {
  return tx.$queryRaw<CoucheOuverte[]>`
    SELECT id, quantite_restante AS "quantiteRestante", cout_unitaire AS "coutUnitaire"
    FROM couche_valorisation
    WHERE produit_id = ${produitId} AND quantite_restante > 0
    ORDER BY created_at ASC, id ASC
    FOR UPDATE`;
}

/**
 * Couche d'entrée. Coût : celui saisi (réception), sinon — pour une
 * entrée qui n'est pas un achat (retour, ajustement, annulation) — le coût
 * moyen courant, sinon le prix d'achat du produit, sinon 0.
 */
async function entrer(
  tx: TransactionPrisma,
  p: { entrepriseId: string; produitId: string; mouvementId: string | null; quantite: number; cout: number; libelle?: string },
) {
  await tx.coucheValorisation.create({
    data: {
      entrepriseId: p.entrepriseId,
      produitId: p.produitId,
      mouvementId: p.mouvementId,
      quantite: p.quantite,
      coutUnitaire: p.cout,
      valeur: BigInt(p.quantite) * BigInt(p.cout),
      quantiteRestante: p.quantite,
      libelle: p.libelle,
    },
  });
}

/** Couche de sortie, valorisée selon la méthode. */
async function sortir(
  tx: TransactionPrisma,
  p: {
    entrepriseId: string;
    produitId: string;
    mouvementId: string | null;
    quantite: number;
    methode: MethodeValorisation;
    prixAchat: number | null;
    libelle?: string;
  },
) {
  const moyen = await coutMoyenCourant(tx, p.produitId);
  const { prises, valeurFifo, manquant } = consommerCouches(await couchesOuvertes(tx, p.produitId), p.quantite);
  for (const prise of prises) {
    await tx.coucheValorisation.update({
      where: { id: prise.id },
      data: { quantiteRestante: { decrement: prise.quantite } },
    });
  }
  const repli = moyen ?? p.prixAchat ?? 0;
  const valeur = p.methode === 'FIFO' ? valeurFifo + manquant * repli : Math.round(p.quantite * repli);
  await tx.coucheValorisation.create({
    data: {
      entrepriseId: p.entrepriseId,
      produitId: p.produitId,
      mouvementId: p.mouvementId,
      quantite: -p.quantite,
      coutUnitaire: Math.round(valeur / p.quantite),
      valeur: -BigInt(valeur),
      quantiteRestante: 0,
      libelle: p.libelle,
    },
  });
}

/**
 * Valorise un mouvement qui vient d'être enregistré (appelé par le moteur
 * de stock). Sans le module : rien. `coutSaisi` : coût unitaire d'achat
 * indiqué à la réception.
 */
export async function valoriserMouvement(
  tx: TransactionPrisma,
  mouvement: {
    id: string;
    entrepriseId: string;
    produitId: string;
    origine: NatureEmplacement;
    destination: NatureEmplacement;
    quantite: number;
  },
  coutSaisi?: number,
) {
  const entreprise = await tx.entreprise.findUniqueOrThrow({
    where: { id: mouvement.entrepriseId },
    select: { moduleValorisation: true, methodeValorisation: true },
  });
  if (!entreprise.moduleValorisation) return;
  const variation = variationStock(mouvement.origine, mouvement.destination, mouvement.quantite);
  if (variation === 0) return;

  await verrouillerValorisation(tx, mouvement.produitId);
  const { prixAchat } = await tx.produit.findUniqueOrThrow({
    where: { id: mouvement.produitId },
    select: { prixAchat: true },
  });
  const base = { entrepriseId: mouvement.entrepriseId, produitId: mouvement.produitId, mouvementId: mouvement.id };
  if (variation > 0) {
    const cout =
      coutSaisi ??
      (mouvement.origine === 'FOURNISSEUR' ? null : await coutMoyenCourant(tx, mouvement.produitId)) ??
      prixAchat ??
      0;
    await entrer(tx, { ...base, quantite: variation, cout });
  } else {
    await sortir(tx, { ...base, quantite: -variation, methode: entreprise.methodeValorisation, prixAchat });
  }
}

/**
 * Aligne les couches sur le stock réel de chaque produit : à l'activation
 * du module (ouverture au prix d'achat actuel), ou à sa réactivation
 * (mouvements passés sans valorisation). Un écart positif ouvre une
 * couche au prix d'achat, un écart négatif consomme les plus anciennes.
 */
export async function resynchroniserValorisation(tx: TransactionPrisma, entrepriseId: string) {
  const entreprise = await tx.entreprise.findUniqueOrThrow({
    where: { id: entrepriseId },
    select: { methodeValorisation: true },
  });
  const [stocks, couches] = await Promise.all([
    tx.stock.groupBy({ by: ['produitId'], where: { produit: { entrepriseId } }, _sum: { quantite: true } }),
    tx.coucheValorisation.groupBy({ by: ['produitId'], where: { entrepriseId }, _sum: { quantite: true } }),
  ]);
  const valorise = new Map(couches.map((c) => [c.produitId, c._sum.quantite ?? 0]));
  const produitIds = new Set([...stocks.map((s) => s.produitId), ...valorise.keys()]);
  const reel = new Map(stocks.map((s) => [s.produitId, s._sum.quantite ?? 0]));
  const prix = new Map(
    (await tx.produit.findMany({ where: { id: { in: [...produitIds] } }, select: { id: true, prixAchat: true } })).map((p) => [
      p.id,
      p.prixAchat,
    ]),
  );
  let couchesCreees = 0;
  for (const produitId of produitIds) {
    const ecart = (reel.get(produitId) ?? 0) - (valorise.get(produitId) ?? 0);
    if (ecart === 0) continue;
    await verrouillerValorisation(tx, produitId);
    const base = { entrepriseId, produitId, mouvementId: null };
    if (ecart > 0) {
      await entrer(tx, {
        ...base,
        quantite: ecart,
        cout: prix.get(produitId) ?? 0,
        libelle: valorise.has(produitId) ? 'Resynchronisation' : 'Ouverture',
      });
    } else {
      await sortir(tx, {
        ...base,
        quantite: -ecart,
        methode: entreprise.methodeValorisation,
        prixAchat: prix.get(produitId) ?? null,
        libelle: 'Resynchronisation',
      });
    }
    couchesCreees++;
  }
  return { couchesCreees };
}
