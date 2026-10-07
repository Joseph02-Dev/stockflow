import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, WifiOff } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { ajouterMouvementEnAttente } from '@/lib/mouvementsHorsLigne';
import { useEnLigne } from '@/lib/useEnLigne';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { Vignette } from '@/components/patterns/Vignette';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { useModules } from '@/lib/useModules';
import { cn } from '@/lib/cn';
import { RACCOURCIS_PEREMPTION, dansMois, datePeremption as formaterPeremption } from '@/features/peremptions/presentation';
import type { LotProduit } from '@/features/peremptions/types';

interface Option {
  id: string;
  nom: string;
}

interface OptionProduit extends Option {
  suiviParLot?: boolean;
  reference?: string | null;
  photoUrl?: string | null;
}

/**
 * Lot après lequel sortira un nouveau lot (FEFO) : le dernier lot daté
 * qui périme au plus tard le même jour — un lot reçu maintenant passe
 * après ceux de même date, reçus avant lui.
 */
function lotPrecedent(lots: LotProduit[], numero: string, date: string): LotProduit | null {
  const precedents = lots.filter(
    (l) => l.numero !== numero && l.datePeremption !== null && l.datePeremption.slice(0, 10) <= date,
  );
  return precedents.at(-1) ?? null;
}

const schema = z.object({
  produitId: z.string().min(1, 'Sélectionnez un produit.'),
  emplacementId: z.string().min(1, 'Sélectionnez un emplacement.'),
  emplacementDestinationId: z.string().optional(),
  quantite: z
    .number({ message: 'La quantité doit être un nombre.' })
    .int('La quantité doit être un nombre entier.')
    .min(1, 'La quantité doit être supérieure à 0.'),
  fournisseurId: z.string().optional(),
  numeroLot: z.string().optional(),
  datePeremption: z.string().optional(),
  lotId: z.string().optional(),
});

type Formulaire = z.infer<typeof schema>;
type TypeMouvement = 'ENTREE' | 'SORTIE' | 'TRANSFERT';

/**
 * Le parent monte ce composant uniquement lorsque la modale doit être
 * ouverte, et le démonte à la fermeture : l'état (type, erreur, champs)
 * repart donc neuf à chaque ouverture, sans effet de réinitialisation.
 */
export function MouvementModal({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [type, setType] = useState<TypeMouvement>('ENTREE');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistreLocalement, setEnregistreLocalement] = useState(false);
  const enLigne = useEnLigne();
  const modules = useModules();

  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<OptionProduit[]>('/produits')).data,
    enabled: ouvert,
  });

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Option[]>('/emplacements')).data,
    enabled: ouvert,
  });

  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Option[]>('/fournisseurs')).data,
    // Le fournisseur ne concerne que les entrées.
    enabled: ouvert && type === 'ENTREE',
  });

  const { register, handleSubmit, control, formState, setValue, setError } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: {
      produitId: '',
      emplacementId: '',
      emplacementDestinationId: '',
      quantite: 1,
      fournisseurId: '',
      numeroLot: '',
      datePeremption: '',
      lotId: '',
    },
  });

  const produitChoisi = useWatch({ control, name: 'produitId' });
  const numeroLotSaisi = useWatch({ control, name: 'numeroLot' }) ?? '';
  const dateSaisie = useWatch({ control, name: 'datePeremption' }) ?? '';
  const suiviParLot = !!produits.data?.find((p) => p.id === produitChoisi)?.suiviParLot;

  const emplacementSourceChoisi = useWatch({ control, name: 'emplacementId' });
  const emplacementDestinationChoisi = useWatch({ control, name: 'emplacementDestinationId' });
  // Lots en stock du produit à l'emplacement (source), en ordre FEFO.
  const lots = useQuery({
    queryKey: ['lots', produitChoisi, emplacementSourceChoisi],
    queryFn: async () =>
      (await api.get<LotProduit[]>(`/produits/${produitChoisi}/lots?emplacement_id=${emplacementSourceChoisi}`)).data,
    enabled: ouvert && suiviParLot && !!emplacementSourceChoisi && enLigne,
  });
  const lotExistant = lots.data?.find((l) => l.numero === numeroLotSaisi.trim());
  const precedent = dateSaisie ? lotPrecedent(lots.data ?? [], numeroLotSaisi.trim(), dateSaisie) : null;

  const memeEmplacement =
    type === 'TRANSFERT' &&
    !!emplacementSourceChoisi &&
    emplacementSourceChoisi === emplacementDestinationChoisi;

  const enregistrer = useMutation({
    // Par défaut, React Query met la mutation en pause quand le navigateur
    // se déclare hors ligne : la mise en file locale ci-dessous ne
    // s'exécutait alors jamais, et le mouvement était perdu au
    // rechargement. Le hors-ligne est géré ici, la mutation doit toujours
    // s'exécuter.
    networkMode: 'always',
    mutationFn: async (valeurs: Formulaire): Promise<{ horsLigne: boolean }> => {
      const route =
        type === 'ENTREE' ? '/mouvements/entree' : type === 'SORTIE' ? '/mouvements/sortie' : '/mouvements/transfert';
      const typeFile = type === 'ENTREE' ? 'entree' : type === 'SORTIE' ? 'sortie' : 'transfert';
      const corps =
        type === 'ENTREE'
          ? {
              produitId: valeurs.produitId,
              emplacementId: valeurs.emplacementId,
              quantite: valeurs.quantite,
              ...(valeurs.fournisseurId ? { fournisseurId: valeurs.fournisseurId } : {}),
              ...(suiviParLot ? { numeroLot: valeurs.numeroLot?.trim(), datePeremption: valeurs.datePeremption } : {}),
            }
          : type === 'SORTIE'
            ? { produitId: valeurs.produitId, emplacementId: valeurs.emplacementId, quantite: valeurs.quantite }
            : {
                produitId: valeurs.produitId,
                emplacementSourceId: valeurs.emplacementId,
                emplacementDestinationId: valeurs.emplacementDestinationId,
                quantite: valeurs.quantite,
                ...(suiviParLot && valeurs.lotId ? { lotId: valeurs.lotId } : {}),
              };
      const nomProduit = produits.data?.find((p) => p.id === valeurs.produitId)?.nom ?? 'Produit';

      // Hors-ligne détecté avant même d'essayer : inutile d'attendre un
      // délai d'expiration réseau pour arriver à la même conclusion.
      if (!enLigne) {
        ajouterMouvementEnAttente(typeFile, corps, nomProduit);
        return { horsLigne: true };
      }

      try {
        await api.post(route, corps);
        return { horsLigne: false };
      } catch (erreur) {
        // Distingue une vraie coupure réseau (la requête n'a jamais
        // atteint le serveur, donc pas de `response`) d'une erreur
        // métier légitime (ex. 409 stock insuffisant, réponse bien
        // reçue) — seule la première doit être mise en file d'attente,
        // la seconde doit rester une erreur visible immédiatement.
        const estEchecReseau =
          erreur instanceof Object && 'isAxiosError' in erreur && !(erreur as { response?: unknown }).response;
        if (estEchecReseau) {
          ajouterMouvementEnAttente(typeFile, corps, nomProduit);
          return { horsLigne: true };
        }
        throw erreur;
      }
    },
    onSuccess: (resultat) => {
      // Un mouvement change le stock, l'historique, les alertes et les
      // indicateurs du dashboard : tout doit être rafraîchi. Un transfert
      // n'affecte jamais les alertes (stock total inchangé), mais on
      // invalide quand même par simplicité — la requête réseau, si elle
      // a lieu, retombera immédiatement sur des données identiques.
      // Si le mouvement a été mis en file (hors-ligne), ces données
      // n'ont pas changé : l'invalidation est sans effet visible, ce qui
      // est correct.
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['mouvements'] });
      queryClient.invalidateQueries({ queryKey: ['alertes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['peremptions'] });
      if (resultat.horsLigne) {
        // Lu directement depuis le résultat de la mutation, jamais depuis
        // un état de composant capturé dans la fermeture de ce callback
        // — un état mis à jour à l'intérieur de mutationFn n'est pas
        // garanti d'être visible ici au bon moment (fermeture obsolète).
        setEnregistreLocalement(true);
        setTimeout(onFermer, 1600);
      } else {
        onFermer();
      }
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const optionsProduits = (produits.data ?? []).map((p) => ({
    valeur: p.id,
    libelle: p.nom,
    sousTitre: p.reference ?? undefined,
    icone: <Vignette nom={p.nom} photoUrl={p.photoUrl} taille={28} />,
  }));
  const optionsEmplacements = (emplacements.data ?? []).map((e) => ({ valeur: e.id, libelle: e.nom }));
  const optionsFournisseurs = [
    { valeur: '', libelle: 'Aucun fournisseur' },
    ...(fournisseurs.data ?? []).map((f) => ({ valeur: f.id, libelle: f.nom })),
  ];

  const aucunProduit = produits.data?.length === 0;
  const aucunEmplacement = emplacements.data?.length === 0;
  const pasAssezEmplacements = type === 'TRANSFERT' && (emplacements.data?.length ?? 0) < 2;

  return (
    <Modal
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Nouveau mouvement"
      modifie={formState.isDirty && !enregistreLocalement}
      pied={
        <>
          <Button type="button" variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="formulaire-mouvement"
            loading={enregistrer.isPending}
            disabled={aucunProduit || aucunEmplacement || pasAssezEmplacements || memeEmplacement}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        id="formulaire-mouvement"
        onSubmit={handleSubmit((valeurs) => {
          // Produit suivi par lot : numéro et date exigés à la réception.
          if (type === 'ENTREE' && suiviParLot) {
            let incomplet = false;
            if (!valeurs.numeroLot?.trim()) {
              setError('numeroLot', { message: 'Indiquez le numéro du lot.' });
              incomplet = true;
            }
            if (!valeurs.datePeremption) {
              setError('datePeremption', { message: 'Indiquez la date de péremption.' });
              incomplet = true;
            }
            if (incomplet) return;
          }
          enregistrer.mutate(valeurs);
        })}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex gap-2" role="group" aria-label="Type de mouvement">
          {(
            [
              { valeur: 'ENTREE', libelle: 'Entrée', Icone: ArrowDownToLine },
              { valeur: 'SORTIE', libelle: 'Sortie', Icone: ArrowUpFromLine },
              { valeur: 'TRANSFERT', libelle: 'Transfert', Icone: ArrowRightLeft },
            ] as const
          )
            // Module « transferts » désactivé par un opérateur : l'option disparaît.
            .filter(({ valeur }) => valeur !== 'TRANSFERT' || modules.transferts)
            .map(({ valeur, libelle, Icone }) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={type === valeur}
              onClick={() => setType(valeur)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-corps font-medium transition-colors',
                type === valeur
                  ? 'border-action bg-action-wash text-action'
                  : 'border-rule text-steel-500 hover:bg-survol',
              )}
            >
              <Icone className="size-4" aria-hidden="true" />
              {libelle}
            </button>
          ))}
        </div>

        {!enLigne && !enregistreLocalement && (
          <Alert variant="warning">
            <span className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" aria-hidden="true" />
              Vous êtes hors-ligne — ce mouvement sera enregistré localement et synchronisé au retour du réseau.
            </span>
          </Alert>
        )}
        {enregistreLocalement && (
          <Alert variant="success">Enregistré localement. Synchronisation automatique dès que possible.</Alert>
        )}
        {erreur && <Alert variant="error">{erreur}</Alert>}

        {/* Un mouvement est impossible sans catalogue ni emplacement :
            mieux vaut le dire clairement que laisser un select vide. */}
        {aucunProduit || aucunEmplacement ? (
          <Alert variant="warning">
            {aucunProduit
              ? 'Créez d’abord un produit dans la section Produits.'
              : 'Créez d’abord un emplacement dans Paramètres.'}
          </Alert>
        ) : pasAssezEmplacements ? (
          <Alert variant="warning">Un transfert nécessite au moins deux emplacements.</Alert>
        ) : null}

        <SelecteurChamp
          name="produitId"
          control={control}
          label="Produit"
          placeholder="Sélectionner un produit…"
          options={optionsProduits}
          vide={{ titre: 'Aucune référence trouvée', nomPluriel: 'références' }}
          creation={{
            libelle: 'Créer un produit',
            libelleDepuisRecherche: () => 'Créer ce produit',
            onCreer: (terme) => {
              onFermer();
              navigate(`/produits/nouveau${terme ? `?nom=${encodeURIComponent(terme)}` : ''}`);
            },
          }}
        />
        <SelecteurChamp
          name="emplacementId"
          control={control}
          label={type === 'TRANSFERT' ? 'Emplacement source' : 'Emplacement'}
          placeholder="Sélectionner un emplacement…"
          options={optionsEmplacements}
        />

        {type === 'TRANSFERT' && (
          <>
            <SelecteurChamp
              name="emplacementDestinationId"
              control={control}
              label="Emplacement destination"
              placeholder="Sélectionner un emplacement…"
              options={optionsEmplacements}
            />
            {memeEmplacement && (
              <Alert variant="error">La destination doit être différente de la source.</Alert>
            )}
          </>
        )}

        <Input
          label="Quantité"
          type="number"
          min={1}
          error={formState.errors.quantite?.message}
          {...register('quantite', { valueAsNumber: true })}
        />

        {type === 'ENTREE' && suiviParLot && (
          <div className="flex flex-col gap-3 rounded-md border border-rule bg-entete-groupe p-3">
            <Input
              label="Numéro de lot"
              placeholder="LOT-2601-C"
              className="font-mono"
              autoCapitalize="characters"
              error={formState.errors.numeroLot?.message}
              {...register('numeroLot')}
            />
            <div className="flex flex-col gap-2">
              <Input
                label="Date de péremption"
                type="date"
                error={formState.errors.datePeremption?.message}
                {...register('datePeremption')}
              />
              <div className="flex gap-2" role="group" aria-label="Raccourcis de date de péremption">
                {RACCOURCIS_PEREMPTION.map(({ libelle, mois }) => (
                  <button
                    key={libelle}
                    type="button"
                    onClick={() => setValue('datePeremption', dansMois(mois), { shouldValidate: true, shouldDirty: true })}
                    className="h-9 flex-1 rounded-md border border-rule-strong bg-surface text-corps font-medium text-ink-900 hover:bg-survol"
                  >
                    {libelle}
                  </button>
                ))}
              </div>
            </div>
            {lotExistant ? (
              <p className="text-meta text-steel-500">
                Le lot <span className="font-mono text-ink-900">{lotExistant.numero}</span> est déjà ici : la quantité
                s’y ajoutera (même date de péremption exigée).
              </p>
            ) : dateSaisie && lots.data ? (
              <p className="text-meta text-steel-500">
                {precedent ? (
                  <>
                    Ce lot sortira après <span className="font-mono text-ink-900">{precedent.numero}</span>, qui périme le{' '}
                    {formaterPeremption(precedent.datePeremption!)}
                  </>
                ) : (
                  'Ce lot sortira en premier : aucun lot en stock ici ne périme avant lui.'
                )}
              </p>
            ) : null}
          </div>
        )}

        {type === 'TRANSFERT' && suiviParLot && (
          <SelecteurChamp
            name="lotId"
            control={control}
            label="Lot à transférer"
            options={[
              { valeur: '', libelle: 'Ordre des péremptions (automatique)' },
              ...(lots.data ?? []).map((l) => ({
                valeur: l.id,
                libelle: `${l.numero} — ${l.quantite} · ${l.datePeremption ? `périme le ${formaterPeremption(l.datePeremption)}` : 'sans date'}`,
              })),
            ]}
          />
        )}

        {type === 'SORTIE' && suiviParLot && lots.data && lots.data.length > 0 && (
          <p className="text-meta text-steel-500">
            Sortie dans l’ordre des péremptions : le lot <span className="font-mono text-ink-900">{lots.data[0].numero}</span>{' '}
            part en premier.
          </p>
        )}

        {type === 'ENTREE' && (
          <SelecteurChamp name="fournisseurId" control={control} label="Fournisseur (facultatif)" options={optionsFournisseurs} />
        )}
      </form>
    </Modal>
  );
}
