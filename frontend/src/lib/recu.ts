/**
 * Reçu en texte brut aligné : le même texte s'affiche à l'écran (police
 * monospace, comme un ticket de caisse) et part dans WhatsApp. Il est
 * construit uniquement depuis la vente enregistrée (lignes figées,
 * montants stockés) — jamais depuis l'état actuel des produits.
 */

const LARGEUR = 25;
const FILET = '─'.repeat(18);

/** 8423501 → « 8 423 501 » (espaces simples : alignement monospace garanti). */
export function montantTexte(n: number): string {
  const signe = n < 0 ? '−' : '';
  return signe + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function ligneMontant(libelle: string, montant: string): string {
  const espaces = Math.max(LARGEUR - libelle.length - montant.length, 1);
  return libelle + ' '.repeat(espaces) + montant;
}

function dateTexte(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} · ${heure}`;
}

export interface VentePourRecu {
  numero: string;
  statut: 'VALIDEE' | 'ANNULEE';
  createdAt: string;
  sousTotal: number;
  remise: number;
  tauxRemise: number;
  tvaParTaux: { taux: number; montant: number }[];
  total: number;
  paye: number;
  resteDu: number;
  echeanceAt: string | null;
  entreprise: { nom: string };
  lignes: { libelle: string; quantite: number; prixUnitaire: number; montantLigne: number }[];
}

export function texteRecu(vente: VentePourRecu): string {
  const lignes: string[] = [vente.entreprise.nom, '', `REÇU N° ${vente.numero}`, dateTexte(vente.createdAt)];
  if (vente.statut === 'ANNULEE') lignes.push('*** VENTE ANNULÉE ***');
  lignes.push('');

  for (const l of vente.lignes) {
    lignes.push(l.libelle);
    lignes.push(`  ${montantTexte(l.quantite)} × ${montantTexte(l.prixUnitaire)} = ${montantTexte(l.montantLigne)}`);
  }
  lignes.push(FILET);
  lignes.push(ligneMontant('Sous-total', montantTexte(vente.sousTotal)));
  if (vente.remise > 0) lignes.push(ligneMontant(`Remise ${vente.tauxRemise} %`, montantTexte(-vente.remise)));
  for (const t of vente.tvaParTaux) {
    if (t.montant > 0 || vente.tvaParTaux.length === 1) lignes.push(ligneMontant(`TVA ${t.taux} %`, montantTexte(t.montant)));
  }
  lignes.push(ligneMontant('TOTAL', montantTexte(vente.total)));

  if (vente.statut === 'VALIDEE' && vente.resteDu > 0) {
    lignes.push('');
    if (vente.paye > 0) lignes.push(ligneMontant('Payé', montantTexte(vente.paye)));
    lignes.push(ligneMontant('RESTE DÛ', montantTexte(vente.resteDu)));
  }

  lignes.push('', 'Merci de votre confiance.');
  if (vente.statut === 'VALIDEE' && vente.resteDu > 0 && vente.echeanceAt) {
    lignes.push(`Échéance du solde : ${new Date(vente.echeanceAt).toLocaleDateString('fr-FR')}.`);
  }
  return lignes.join('\n');
}
