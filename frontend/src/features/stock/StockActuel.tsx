import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/patterns/Page';
import { Compteur } from '@/components/patterns/Compteur';
import { EmptyState } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut, type StatutStock } from '@/components/patterns/statutStock';
import { formatNombre, pluriel } from '@/lib/format';
import type { LieuAffiche, LigneStock } from './types';

/**
 * Onglet « Stock actuel ». Tous emplacements confondus, une ligne par
 * produit : total, barre de répartition par emplacement et, au clic, le
 * niveau de chaque emplacement face au seuil. Sur un seul emplacement, la
 * ligne montre directement ce niveau. Les indicateurs « Sous le seuil » et
 * « En rupture » comptent les lignes produit × emplacement et filtrent la
 * liste. Styles dans stock.css.
 */

interface Produit {
  id: string;
  produit: LigneStock['produit'];
  lignes: LigneStock[];
  total: number;
  statut: StatutStock;
}

/** Rupture si plus rien nulle part ; sous le seuil dès qu'un emplacement l'est, comme les lignes elles-mêmes. */
function statutProduit(lignes: LigneStock[], total: number): StatutStock {
  if (total <= 0) return 'rupture';
  return lignes.some((l) => statutStock(l.quantite, l.produit.seuilAlerte) !== 'ok') ? 'faible' : 'ok';
}

const COULEUR_TOTAL: Record<StatutStock, string> = { rupture: 'text-rupture', faible: 'text-faible', ok: 'text-ink-900' };

function NomLieu({ lieu, nom }: { lieu: LieuAffiche; nom: string }) {
  return (
    <span className="stock-nom-lieu" style={{ '--teinte': lieu.teinte } as CSSProperties}>
      <i aria-hidden="true" />
      {nom}
    </span>
  );
}

const sansAccents = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function StockActuel({
  lignes,
  lieux,
  emplacementId,
  mouvementsDuJour,
  onVoirMouvements,
  onNouveauMouvement,
}: {
  /** Lignes de l'emplacement choisi (toutes si aucun). */
  lignes: LigneStock[];
  lieux: LieuAffiche[];
  emplacementId: string;
  /** null tant que le décompte charge ; `plus` si la page reçue était pleine. */
  mouvementsDuJour: { nombre: number; plus: boolean } | null;
  onVoirMouvements: () => void;
  onNouveauMouvement: () => void;
}) {
  const [terme, setTerme] = useState('');
  const [statutFiltre, setStatutFiltre] = useState<Exclude<StatutStock, 'ok'> | null>(null);
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set());
  const tous = emplacementId === '';
  // Emplacement archivé depuis : encore en stock, mais hors de la liste des emplacements.
  const lieu = (id: string) => lieux.find((l) => l.id === id) ?? { id, nom: '', teinte: 'var(--color-steel-400)' };

  const produits = useMemo(() => {
    const parProduit = new Map<string, LigneStock[]>();
    for (const ligne of lignes) parProduit.set(ligne.produitId, [...(parProduit.get(ligne.produitId) ?? []), ligne]);
    return [...parProduit].map(([id, ls]): Produit => {
      const total = ls.reduce((s, l) => s + l.quantite, 0);
      return { id, produit: ls[0].produit, lignes: ls, total, statut: statutProduit(ls, total) };
    });
  }, [lignes]);

  const resume = useMemo(() => {
    const statuts = lignes.map((l) => statutStock(l.quantite, l.produit.seuilAlerte));
    return {
      unites: lignes.reduce((s, l) => s + l.quantite, 0),
      faible: statuts.filter((s) => s === 'faible').length,
      rupture: statuts.filter((s) => s === 'rupture').length,
    };
  }, [lignes]);

  const cible = sansAccents(terme.trim());
  const visibles = produits.filter(
    (p) =>
      (!cible || sansAccents(`${p.produit.nom} ${p.produit.reference ?? ''}`).includes(cible)) &&
      (!statutFiltre || p.lignes.some((l) => statutStock(l.quantite, l.produit.seuilAlerte) === statutFiltre)),
  );

  const basculer = (id: string, ouvert: boolean) =>
    setOuverts((actuels) => {
      if (actuels.has(id) === ouvert) return actuels;
      const suivants = new Set(actuels);
      if (ouvert) suivants.add(id);
      else suivants.delete(id);
      return suivants;
    });

  if (lignes.length === 0) {
    return (
      <Card>
        <EmptyState
          titre="Aucun stock"
          description={
            tous
              ? 'Enregistrez une entrée de stock pour voir apparaître vos quantités.'
              : 'Rien n’est encore rangé dans cet emplacement.'
          }
          action={<Button onClick={onNouveauMouvement}>Enregistrer un mouvement</Button>}
        />
      </Card>
    );
  }

  const indicateur = (statut: 'faible' | 'rupture', titre: string, teinte: string, detail: string) => (
    <button
      type="button"
      aria-pressed={statutFiltre === statut}
      onClick={() => setStatutFiltre((s) => (s === statut ? null : statut))}
      className="stock-indicateur"
      style={{ '--teinte': teinte } as CSSProperties}
    >
      <span className="flex items-center gap-2 text-meta font-semibold text-steel-500">
        <i className="size-2 rounded-full" style={{ background: teinte }} aria-hidden="true" />
        {titre}
      </span>
      <span className="font-display text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-ink-900">
        <Compteur valeur={resume[statut]} format={formatNombre} />
      </span>
      <span className="text-meta text-steel-400">{detail}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="stock-indicateur">
          <span className="flex items-center gap-2 text-meta font-semibold text-steel-500">
            <i className="size-2 rounded-full bg-ink-900" aria-hidden="true" />
            Unités en stock
          </span>
          <span className="font-display text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-ink-900">
            <Compteur valeur={resume.unites} format={formatNombre} />
          </span>
          <span className="text-meta text-steel-400">
            {lignes.length} {pluriel('ligne', lignes.length)} produit × emplacement
          </span>
        </div>
        {indicateur('faible', 'Sous le seuil', 'var(--color-faible)', 'à réapprovisionner bientôt')}
        {indicateur('rupture', 'En rupture', 'var(--color-rupture)', 'plus aucune unité')}
        <button
          type="button"
          onClick={onVoirMouvements}
          className="stock-indicateur"
          style={{ '--teinte': 'var(--color-action)' } as CSSProperties}
        >
          <span className="flex items-center gap-2 text-meta font-semibold text-steel-500">
            <i className="size-2 rounded-full bg-action" aria-hidden="true" />
            Mouvements aujourd’hui
          </span>
          <span className="font-display text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-ink-900">
            {mouvementsDuJour ? `${mouvementsDuJour.nombre}${mouvementsDuJour.plus ? '+' : ''}` : '…'}
          </span>
          <span className="text-meta text-steel-400">Voir le journal →</span>
        </button>
      </div>

      <label className="relative block">
        <Search className="absolute top-1/2 left-3 size-[17px] -translate-y-1/2 text-steel-400" aria-hidden="true" />
        <input
          type="search"
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          placeholder="Rechercher un produit ou une référence"
          aria-label="Rechercher un produit"
          autoComplete="off"
          className="h-[42px] w-full rounded-md border border-rule-strong bg-surface pr-3 pl-10 text-corps text-ink-900 transition-[border-color,box-shadow] outline-none placeholder:text-steel-400 focus:border-action focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-action)_15%,transparent)]"
        />
      </label>

      <div className="-mb-2 flex items-center justify-between gap-3 px-0.5 text-meta text-steel-400">
        <span>
          {visibles.length} {pluriel('produit', visibles.length)}
          {statutFiltre && ` · filtre « ${statutFiltre === 'faible' ? 'Sous le seuil' : 'En rupture'} »`}
          {tous && visibles.length > 0 && ' · cliquez un produit pour le détail par emplacement'}
        </span>
        {statutFiltre && (
          <button type="button" onClick={() => setStatutFiltre(null)} className="font-semibold text-action hover:underline">
            Retirer le filtre
          </button>
        )}
      </div>

      <Card>
        {visibles.length === 0 ? (
          <EmptyState titre="Aucun produit ne correspond" description="Modifiez la recherche ou retirez le filtre." />
        ) : (
          <div className="divide-y divide-rule">
            <div className="stock-ligne stock-entete" aria-hidden="true">
              <span>Produit</span>
              <span>{tous ? 'Répartition' : 'Emplacement'}</span>
              <span>Quantité</span>
              <span>État</span>
              <span />
            </div>
            {visibles.map((p, rang) => {
              const tete = (
                <>
                  <span className="flex min-w-0 items-center gap-3">
                    <Vignette nom={p.produit.nom} photoUrl={p.produit.photoUrl} taille={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-corps font-semibold text-ink-900">{p.produit.nom}</span>
                      {p.produit.reference && (
                        <span className="block font-mono text-meta text-steel-500">{p.produit.reference}</span>
                      )}
                    </span>
                  </span>
                  {tous ? (
                    <span className="min-w-0">
                      <span className="stock-barre" aria-hidden="true">
                        {p.lignes
                          .filter((l) => l.quantite > 0)
                          .map((l) => (
                            <i
                              key={l.emplacementId}
                              style={{ width: `${(l.quantite / p.total) * 100}%`, '--teinte': lieu(l.emplacementId).teinte } as CSSProperties}
                            />
                          ))}
                      </span>
                      <span className="stock-legende">
                        {p.lignes.map((l) => {
                          const alerte = statutStock(l.quantite, l.produit.seuilAlerte) !== 'ok';
                          return (
                            <span key={l.emplacementId} style={{ '--teinte': lieu(l.emplacementId).teinte } as CSSProperties}>
                              <i aria-hidden="true" />
                              {l.emplacement.nom}
                              <b className={alerte ? 'text-faible' : 'text-ink-900'}>
                                {formatNombre(l.quantite)}
                              </b>
                            </span>
                          );
                        })}
                      </span>
                    </span>
                  ) : (
                    <NomLieu lieu={lieu(emplacementId)} nom={p.lignes[0].emplacement.nom} />
                  )}
                  {tous ? (
                    <p className="flex items-baseline gap-1 whitespace-nowrap">
                      <span className={`font-semibold ${COULEUR_TOTAL[p.statut]}`}>
                        {formatNombre(p.total)}
                      </span>
                      {p.produit.uniteMesure && <span className="text-meta text-steel-400">{p.produit.uniteMesure}</span>}
                    </p>
                  ) : (
                    <NiveauStock quantite={p.total} seuil={p.produit.seuilAlerte} unite={p.produit.uniteMesure} />
                  )}
                  <span>
                    <Badge variant={varianteStatut[p.statut]}>{libelleStatut[p.statut]}</Badge>
                  </span>
                </>
              );
              const delai = { animationDelay: `${Math.min(rang, 12) * 35}ms` };
              if (!tous) {
                return (
                  <div key={p.id} className="stock-ligne stock-apparition" style={delai}>
                    {tete}
                    <span />
                  </div>
                );
              }
              return (
                <details
                  key={p.id}
                  className="stock-produit"
                  open={ouverts.has(p.id)}
                  onToggle={(e) => basculer(p.id, e.currentTarget.open)}
                >
                  <summary className="stock-ligne stock-apparition" style={delai}>
                    {tete}
                    <ChevronDown className="stock-chevron size-4" aria-hidden="true" />
                  </summary>
                  <div className="stock-detail">
                    {p.lignes.map((l) => {
                      const statut = statutStock(l.quantite, l.produit.seuilAlerte);
                      return (
                        <div key={l.emplacementId} className="stock-sous">
                          <NomLieu lieu={lieu(l.emplacementId)} nom={l.emplacement.nom} />
                          <NiveauStock quantite={l.quantite} seuil={l.produit.seuilAlerte} unite={l.produit.uniteMesure} />
                          <span>
                            <Badge variant={varianteStatut[statut]}>{libelleStatut[statut]}</Badge>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
