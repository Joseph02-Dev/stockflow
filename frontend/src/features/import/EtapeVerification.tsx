import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, OctagonX } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import type { OptionsImport, RapportImport } from './types';

type Options = Omit<OptionsImport, 'emplacementId'>;

/** Associer chaque catégorie (ou marque) inconnue à une existante, plutôt que la créer. */
function Associations({
  titre,
  inconnues,
  existantes,
  choix,
  onChoix,
}: {
  titre: string;
  inconnues: { nom: string; lignes: number }[];
  existantes: { id: string; nom: string }[];
  choix: Record<string, string>;
  onChoix: (choix: Record<string, string>) => void;
}) {
  // Les inconnues déjà associées disparaissent du rapport : on les garde affichées.
  const noms = [...new Set([...inconnues.map((i) => i.nom), ...Object.keys(choix)])];
  if (noms.length === 0) return null;
  return (
    <Card>
      <PanneauEntete titre={titre} meta="Créées automatiquement, ou associées à une existante pour éviter les doublons" />
      <ul className="divide-y divide-rule">
        {noms.map((nom) => {
          const lignes = inconnues.find((i) => i.nom === nom)?.lignes;
          return (
            <li key={nom} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-corps text-ink-900">
                « {nom} »{lignes !== undefined && <span className="text-steel-500"> · {lignes} {pluriel('ligne', lignes)}</span>}
              </span>
              <Selecteur
                aria-label={`Que faire de « ${nom} »`}
                className="sm:w-72"
                options={[
                  { valeur: '', libelle: `Créer « ${nom} »` },
                  ...existantes.map((e) => ({ valeur: e.id, libelle: `Associer à « ${e.nom} »` })),
                ]}
                value={choix[nom] ?? ''}
                onChange={(valeur) => {
                  const suivant = { ...choix };
                  if (valeur) suivant[nom] = valeur;
                  else delete suivant[nom];
                  onChoix(suivant);
                }}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Étape 3 — compteurs, puis chaque ligne problématique avec ce que ça implique. */
export function EtapeVerification({
  rapport,
  options,
  onOptions,
  enCours,
  execution,
  onRetour,
  onImporter,
}: {
  rapport: RapportImport;
  options: Options;
  onOptions: (options: Options, reverifier?: boolean) => void;
  enCours: boolean;
  execution: boolean;
  onRetour: () => void;
  onImporter: () => void;
}) {
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ id: string; nom: string }[]>('/categories')).data,
  });
  const marques = useQuery({
    queryKey: ['marques'],
    queryFn: async () => (await api.get<{ id: string; nom: string }[]>('/marques')).data,
  });

  const { compteurs } = rapport;
  const aImporter = compteurs.aCreer + compteurs.aMettreAJour;
  const bloquePar = rapport.erreursGlobales.length > 0 || (compteurs.bloquees > 0 && !options.ignorerBloquees) || aImporter === 0;

  function conserver(numero: number, lignes: number[]) {
    const autres = new Set(lignes);
    onOptions({ ...options, conserver: [...options.conserver.filter((n) => !autres.has(n)), numero] });
  }

  return (
    <div className={cn('flex flex-col gap-5 transition-opacity', enCours && 'opacity-60')} aria-busy={enCours}>
      <section aria-label="Bilan de la vérification" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule shadow-card lg:grid-cols-4">
        {[
          { libelle: 'Prêtes à créer', valeur: compteurs.aCreer, filet: 'border-ok', aide: 'nouveaux produits' },
          { libelle: 'Mises à jour', valeur: compteurs.aMettreAJour, filet: 'border-action', aide: 'produits déjà au catalogue' },
          { libelle: 'À corriger', valeur: compteurs.aCorriger, filet: 'border-faible-vif', aide: 'importées, à vérifier' },
          { libelle: 'Bloquées', valeur: compteurs.bloquees, filet: 'border-rupture-vif', aide: 'ne seront pas importées' },
        ].map((t) => (
          <div key={t.libelle} className={cn('flex flex-col gap-1 border-l-[3px] bg-surface px-4 py-4 sm:px-5', t.filet)}>
            <span className="text-meta font-medium text-steel-500">{t.libelle}</span>
            <span className="text-chiffre text-ink-900">{formatNombre(t.valeur)}</span>
            <span className="text-meta text-steel-500">{t.aide}</span>
          </div>
        ))}
      </section>

      {rapport.erreursGlobales.map((e) => (
        <Alert key={e} variant="error">
          {e}
        </Alert>
      ))}

      <Associations
        titre="Catégories inconnues"
        inconnues={rapport.categoriesInconnues}
        existantes={categories.data ?? []}
        choix={options.categories}
        onChoix={(c) => onOptions({ ...options, categories: c })}
      />
      <Associations
        titre="Marques inconnues"
        inconnues={rapport.marquesInconnues}
        existantes={marques.data ?? []}
        choix={options.marques}
        onChoix={(m) => onOptions({ ...options, marques: m })}
      />

      <Card>
        <PanneauEntete
          titre={rapport.problemes.length === 0 ? 'Aucune ligne à corriger' : `${rapport.problemes.length} ${pluriel('ligne', rapport.problemes.length)} à regarder`}
          meta="Numéro de ligne dans votre fichier"
        />
        {rapport.problemes.length === 0 ? (
          <p className="px-5 py-4 text-corps text-steel-500">Toutes les lignes sont prêtes.</p>
        ) : (
          <ul className="max-h-[560px] divide-y divide-rule overflow-y-auto">
            {rapport.problemes.map((ligne) => {
              const bloquee = ligne.action === 'BLOQUEE';
              return (
                <li key={ligne.numero} className="flex gap-4 px-5 py-3">
                  <span className={cn('w-12 shrink-0 pt-0.5 text-right font-mono text-corps tabular-nums', bloquee ? 'text-rupture' : 'text-steel-500')}>
                    {ligne.numero}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="truncate text-corps font-medium text-ink-900">
                      {ligne.nom ?? <span className="text-steel-400">Sans nom</span>}
                      {ligne.produitExistant && <span className="font-normal text-steel-500"> · met à jour « {ligne.produitExistant.nom} »</span>}
                    </p>
                    {ligne.problemes.map((p, i) => (
                      <div key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                        <p className={cn('flex min-w-0 flex-1 items-start gap-1.5 text-corps', p.gravite === 'BLOQUANT' ? 'text-rupture' : 'text-faible')}>
                          {p.gravite === 'BLOQUANT' ? (
                            <OctagonX className="mt-0.5 size-4 shrink-0" aria-label="Bloquant" />
                          ) : (
                            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-label="À vérifier" />
                          )}
                          <span>{p.message}</span>
                        </p>
                        {p.doublon && p.doublon.conservee !== ligne.numero && (
                          <Button variant="secondary" taille="sm" disabled={enCours} onClick={() => conserver(ligne.numero, p.doublon!.lignes)}>
                            Garder cette ligne
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {compteurs.bloquees > 0 && (
        <label className="flex items-center gap-2 text-corps text-ink-900">
          <input
            type="checkbox"
            className="size-4 accent-action"
            checked={options.ignorerBloquees}
            onChange={(e) => onOptions({ ...options, ignorerBloquees: e.target.checked }, false)}
          />
          Ignorer les {compteurs.bloquees} {pluriel('ligne', compteurs.bloquees)} {compteurs.bloquees > 1 ? 'bloquées' : 'bloquée'} et continuer
        </label>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={onRetour}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Revoir les colonnes
        </Button>
        <Button disabled={bloquePar || enCours} loading={execution} onClick={onImporter}>
          Importer {formatNombre(aImporter)} {pluriel('produit', aImporter)}
        </Button>
      </div>
    </div>
  );
}
