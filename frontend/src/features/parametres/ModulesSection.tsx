import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useModules } from '@/lib/useModules';
import { Alert } from '@/components/ui/Alert';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { LoadingState } from '@/components/patterns/States';
import { Selecteur } from '@/components/ui/Selecteur';
import { STRATEGIES } from '@/lib/strategieSortie';

type CleModule =
  | 'lots'
  | 'arborescence'
  | 'variantes'
  | 'conditionnements'
  | 'numerosSerie'
  | 'strategiesSortie'
  | 'reapprovisionnement'
  | 'rangement'
  | 'valorisation'
  | 'rotation'
  | 'webhooks';

/** Modules métier : l'administrateur n'affiche que ce dont son activité a besoin. */
const MODULES: { cle: CleModule; champ: string; libelle: string; aide: string }[] = [
  {
    cle: 'lots',
    champ: 'moduleLots',
    libelle: 'Lots et péremptions',
    aide: 'Numéros de lot, dates de péremption et sorties « premier périmé, premier sorti ». Pharmacie, alimentaire, cosmétique…',
  },
  {
    cle: 'arborescence',
    champ: 'moduleArborescence',
    libelle: 'Arborescence des emplacements',
    aide: 'Ranger les emplacements les uns dans les autres : Dépôt › Zone › Allée › Étagère.',
  },
  {
    cle: 'variantes',
    champ: 'moduleVariantes',
    libelle: 'Variantes de produits',
    aide: 'Un modèle décliné en tailles, couleurs… : chaque combinaison a son propre stock. Habillement, chaussures, peinture…',
  },
  {
    cle: 'conditionnements',
    champ: 'moduleConditionnements',
    libelle: 'Conditionnements',
    aide: 'Acheter en palettes, stocker en cartons, vendre à l’unité : les saisies en cartons sont converties automatiquement.',
  },
  {
    cle: 'numerosSerie',
    champ: 'moduleNumerosSerie',
    libelle: 'Numéros de série',
    aide: 'Chaque unité reçue avec son numéro, suivie jusqu’à sa vente. Téléphonie, informatique, électroménager, matériel médical…',
  },
  {
    cle: 'strategiesSortie',
    champ: 'moduleStrategiesSortie',
    libelle: 'Stratégies de sortie',
    aide: 'Choisir l’ordre de sortie des lots : FEFO (péremption), FIFO (ancienneté) ou LIFO, pour l’entreprise ou par emplacement.',
  },
  {
    cle: 'reapprovisionnement',
    champ: 'moduleReapprovisionnement',
    libelle: 'Réapprovisionnement automatique',
    aide: 'Stock minimum et maximum par produit : chaque matin, les brouillons de commande fournisseur sont préparés pour vous.',
  },
  {
    cle: 'rangement',
    champ: 'moduleRangement',
    libelle: 'Règles de rangement',
    aide: 'À la réception, chaque produit (ou catégorie) est dirigé vers son emplacement de rangement.',
  },
  {
    cle: 'valorisation',
    champ: 'moduleValorisation',
    libelle: 'Valorisation du stock',
    aide: 'Valeur réelle du stock au coût d’achat, en FIFO ou en coût moyen pondéré. À l’activation, le stock présent est valorisé au prix d’achat actuel.',
  },
  {
    cle: 'rotation',
    champ: 'moduleRotation',
    libelle: 'Rotation et stock dormant',
    aide: 'Ce qui se vend, ce qui dort et combien d’argent est immobilisé, par produit et par catégorie.',
  },
  {
    cle: 'webhooks',
    champ: 'moduleWebhooks',
    libelle: 'Webhooks',
    aide: 'Prévenir un autre logiciel (comptabilité, site marchand…) à chaque mouvement, alerte ou lot proche de péremption.',
  },
];

export function ModulesSection() {
  const queryClient = useQueryClient();
  const modules = useModules();
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  const basculer = useMutation({
    mutationFn: async ({ champ, valeur }: { champ: string; valeur: boolean | string }) =>
      api.patch('/entreprise', { [champ]: valeur }),
    onSuccess: (_, { valeur }) => {
      setResultat({
        ok: true,
        texte: typeof valeur === 'string' ? 'Réglage enregistré.' : valeur ? 'Module activé.' : 'Module désactivé.',
      });
      queryClient.invalidateQueries({ queryKey: ['entreprise'] });
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
    },
    onError: (e) => setResultat({ ok: false, texte: messageErreur(e, 'La modification a échoué.') }),
  });

  if (!modules.charge) return <LoadingState />;

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {resultat && <Alert variant={resultat.ok ? 'success' : 'error'}>{resultat.texte}</Alert>}
      <Card>
        <PanneauEntete titre="Modules métier" meta="Un module désactivé disparaît de l’application : l’interface reste simple." />
        <ul className="divide-y divide-rule">
          {MODULES.map(({ cle, champ, libelle, aide }) => {
            const actif = modules[cle];
            return (
              <li key={cle} className="flex items-center justify-between gap-6 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-corps font-medium text-ink-900">{libelle}</p>
                  <p className="text-meta text-steel-500">{aide}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={actif}
                  aria-label={libelle}
                  disabled={basculer.isPending}
                  onClick={() => basculer.mutate({ champ, valeur: !actif })}
                  className={cn(
                    'inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-1 pr-3 text-meta font-medium transition-colors disabled:opacity-60',
                    actif ? 'border-action bg-action-wash text-action' : 'border-rule-strong bg-paper text-steel-500',
                  )}
                >
                  <span className={cn('size-5 rounded-full transition-colors', actif ? 'bg-action' : 'bg-steel-400')} aria-hidden="true" />
                  {actif ? 'Activé' : 'Désactivé'}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {modules.valorisation && (
        <Card>
          <PanneauEntete titre="Méthode de valorisation" meta="Le coût des sorties ; la valeur des entrées est toujours leur coût d’achat." />
          <div className="p-5">
            <Selecteur
              label="Coût des sorties"
              value={modules.methodeValorisation}
              onChange={(valeur) => basculer.mutate({ champ: 'methodeValorisation', valeur })}
              options={[
                { valeur: 'PMP', libelle: 'Coût moyen pondéré (PMP)', sousTitre: 'Simple et stable : chaque sortie au coût moyen du stock' },
                { valeur: 'FIFO', libelle: 'FIFO — premier entré, premier sorti', sousTitre: 'Chaque sortie au coût des achats les plus anciens' },
              ]}
            />
          </div>
        </Card>
      )}

      {modules.strategiesSortie && (
        <Card>
          <PanneauEntete titre="Stratégie de sortie par défaut" meta="Chaque emplacement peut en choisir une autre." />
          <div className="p-5">
            <Selecteur
              label="Ordre de sortie des lots"
              value={modules.strategieSortie}
              onChange={(valeur) => basculer.mutate({ champ: 'strategieSortie', valeur })}
              options={STRATEGIES.map((s) => ({ valeur: s.valeur, libelle: s.libelle, sousTitre: s.aide }))}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
