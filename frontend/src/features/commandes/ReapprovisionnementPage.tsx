import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { dateHeure } from '@/lib/montant';
import { useModules } from '@/lib/useModules';
import { useSession } from '@/lib/useSession';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Regle {
  id: string;
  produitId: string;
  emplacementId: string;
  fournisseurId: string | null;
  stockMin: number;
  stockMax: number;
  multiple: number;
  actif: boolean;
  produit: { nom: string; uniteMesure: string | null };
  emplacement: { nom: string };
  fournisseur: { nom: string } | null;
  enStock: number;
  enCommande: number;
  previsionnel: number;
  aCommander: number;
}

interface Resultat {
  commandes: { id: string; fournisseur: string; emplacement: string; lignes: number }[];
  ignorees: { produit: string; emplacement: string; motif: string }[];
}

interface Option {
  id: string;
  nom: string;
  chemin?: string;
}

interface Saisie {
  produitId: string;
  emplacementId: string;
  fournisseurId: string;
  stockMin: string;
  stockMax: string;
  multiple: string;
}

const SAISIE_VIDE: Saisie = { produitId: '', emplacementId: '', fournisseurId: '', stockMin: '', stockMax: '', multiple: '1' };

/**
 * Réapprovisionnement automatique (module « reapprovisionnement ») : règles
 * min/max et calcul. Chaque matin le calcul prépare des brouillons de
 * commande — jamais envoyés sans relecture.
 */
export function ReapprovisionnementPage() {
  const queryClient = useQueryClient();
  const modules = useModules();
  const estAdmin = useSession()?.utilisateur.role === 'ADMIN';
  const [edition, setEdition] = useState<{ regle: Regle | null; saisie: Saisie } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const regles = useQuery({
    queryKey: ['reapprovisionnement'],
    queryFn: async () => (await api.get<Regle[]>('/reapprovisionnement/regles')).data,
  });
  const options = useQuery({
    queryKey: ['reapprovisionnement', 'options'],
    enabled: edition !== null,
    queryFn: async () => {
      const [produits, emplacements, fournisseurs] = await Promise.all([
        api.get<Option[]>('/produits'),
        api.get<Option[]>('/emplacements'),
        api.get<Option[]>('/fournisseurs'),
      ]);
      return { produits: produits.data, emplacements: emplacements.data, fournisseurs: fournisseurs.data };
    },
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ['reapprovisionnement'] });
    queryClient.invalidateQueries({ queryKey: ['commandes'] });
    queryClient.invalidateQueries({ queryKey: ['entreprise'] });
  };

  const enregistrer = useMutation({
    mutationFn: async ({ regle, saisie }: { regle: Regle | null; saisie: Saisie }) => {
      const bornes = {
        stockMin: Number(saisie.stockMin),
        stockMax: Number(saisie.stockMax),
        multiple: Number(saisie.multiple) || 1,
      };
      if (regle) {
        return api.patch(`/reapprovisionnement/regles/${regle.id}`, { ...bornes, fournisseurId: saisie.fournisseurId || null });
      }
      return api.post('/reapprovisionnement/regles', {
        produitId: saisie.produitId,
        emplacementId: saisie.emplacementId,
        ...(saisie.fournisseurId ? { fournisseurId: saisie.fournisseurId } : {}),
        ...bornes,
      });
    },
    onSuccess: () => {
      setEdition(null);
      setErreur(null);
      rafraichir();
    },
    onError: (e) => setErreur(messageErreur(e, 'L’enregistrement a échoué.')),
  });

  const supprimer = useMutation({
    mutationFn: async (id: string) => api.delete(`/reapprovisionnement/regles/${id}`),
    onSuccess: rafraichir,
    onError: (e) => setErreur(messageErreur(e, 'La suppression a échoué.')),
  });

  const lancer = useMutation({
    mutationFn: async () => (await api.post<Resultat>('/reapprovisionnement/lancer')).data,
    onSuccess: (data) => {
      setResultat(data);
      rafraichir();
    },
    onError: (e) => setErreur(messageErreur(e, 'Le calcul a échoué.')),
  });

  const ouvrir = (regle: Regle | null) => {
    setErreur(null);
    setEdition({
      regle,
      saisie: regle
        ? {
            produitId: regle.produitId,
            emplacementId: regle.emplacementId,
            fournisseurId: regle.fournisseurId ?? '',
            stockMin: String(regle.stockMin),
            stockMax: String(regle.stockMax),
            multiple: String(regle.multiple),
          }
        : SAISIE_VIDE,
    });
  };
  const maj = (champ: keyof Saisie, valeur: string) =>
    setEdition((e) => (e ? { ...e, saisie: { ...e.saisie, [champ]: valeur } } : e));

  const saisie = edition?.saisie;
  const min = Number(saisie?.stockMin);
  const max = Number(saisie?.stockMax);
  const valide =
    !!saisie &&
    !!saisie.produitId &&
    !!saisie.emplacementId &&
    saisie.stockMin !== '' &&
    saisie.stockMax !== '' &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= 0 &&
    max >= 1 &&
    max >= min;
  const aCommander = (regles.data ?? []).filter((r) => r.actif && r.aCommander > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Réapprovisionnement"
        description={
          modules.dernierReapproAt
            ? `Dernier calcul : ${dateHeure(modules.dernierReapproAt)}. Le prochain a lieu chaque matin à 5 h.`
            : 'Le calcul a lieu chaque matin à 5 h : les brouillons de commande vous attendent dans Commandes.'
        }
        action={
          <>
            {estAdmin && (
              <Button variant="secondary" onClick={() => ouvrir(null)}>
                <Plus className="size-4" aria-hidden="true" />
                Nouvelle règle
              </Button>
            )}
            <Button loading={lancer.isPending} onClick={() => lancer.mutate()}>
              <Play className="size-4" aria-hidden="true" />
              Calculer maintenant
            </Button>
          </>
        }
      />

      {erreur && !edition && <Alert variant="error">{erreur}</Alert>}
      {resultat && (
        <Alert variant={resultat.commandes.length > 0 ? 'success' : 'info'}>
          {resultat.commandes.length > 0
            ? `${resultat.commandes.length} ${pluriel('brouillon', resultat.commandes.length)} de commande ${resultat.commandes.length > 1 ? 'préparés' : 'préparé'} : `
            : 'Rien à commander : tous les stocks prévisionnels sont au-dessus de leur minimum.'}
          {resultat.commandes.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <Link to={`/commandes/${c.id}`} className="font-medium underline">
                {c.fournisseur} ({c.lignes} {pluriel('référence', c.lignes)})
              </Link>
            </span>
          ))}
          {resultat.ignorees.map((r) => (
            <span key={`${r.produit}-${r.emplacement}`} className="mt-1 block">
              {r.produit} ({r.emplacement}) : {r.motif}
            </span>
          ))}
        </Alert>
      )}

      <Card>
        <PanneauEntete
          titre="Règles min / max"
          meta={
            aCommander > 0
              ? `${aCommander} ${pluriel('produit', aCommander)} sous le minimum`
              : 'Stock prévisionnel = en stock + commandes fournisseur en cours'
          }
        />
        {regles.isLoading ? (
          <LoadingState />
        ) : regles.isError ? (
          <ErrorState message={messageErreur(regles.error)} onRetry={() => regles.refetch()} />
        ) : regles.data!.length === 0 ? (
          <EmptyState
            titre="Aucune règle"
            description="Fixez un stock minimum et maximum : sous le minimum, une commande est préparée pour revenir au maximum."
            action={estAdmin ? <Button onClick={() => ouvrir(null)}>Créer une règle</Button> : undefined}
          />
        ) : (
          <ul className="divide-y divide-rule">
            {regles.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block truncate text-corps font-medium text-ink-900">{r.produit.nom}</span>
                  <span className="block truncate text-meta text-steel-500">
                    {r.emplacement.nom} · min {formatNombre(r.stockMin)} · max {formatNombre(r.stockMax)}
                    {r.multiple > 1 && ` · par ${formatNombre(r.multiple)}`}
                    {r.fournisseur && ` · ${r.fournisseur.nom}`}
                  </span>
                </span>
                <span className="text-meta text-steel-500">
                  <span className="font-semibold text-ink-900">{formatNombre(r.previsionnel)}</span> prévus
                  {r.enCommande > 0 && ` (dont ${formatNombre(r.enCommande)} en commande)`}
                </span>
                {!r.actif ? (
                  <Badge>Suspendue</Badge>
                ) : r.aCommander > 0 ? (
                  <Badge variant="faible">À commander : {formatNombre(r.aCommander)}</Badge>
                ) : (
                  <Badge variant="ok">Couvert</Badge>
                )}
                {estAdmin && (
                  <span className="flex gap-1">
                    <Button variant="ghost" taille="sm" onClick={() => ouvrir(r)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      <span className="sr-only">Modifier</span>
                    </Button>
                    <Button variant="ghost" taille="sm" loading={supprimer.isPending} onClick={() => supprimer.mutate(r.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span className="sr-only">Supprimer</span>
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {edition && saisie && (
        <Modal
          ouvert
          onFermer={() => setEdition(null)}
          titre={edition.regle ? `Règle — ${edition.regle.produit.nom}` : 'Nouvelle règle'}
          pied={
            <>
              <Button variant="secondary" onClick={() => setEdition(null)}>
                Annuler
              </Button>
              <Button disabled={!valide} loading={enregistrer.isPending} onClick={() => enregistrer.mutate(edition)}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {erreur && <Alert variant="error">{erreur}</Alert>}
            {!edition.regle && (
              <>
                <Selecteur
                  label="Produit"
                  value={saisie.produitId}
                  onChange={(v) => maj('produitId', v)}
                  placeholder="Choisir un produit…"
                  options={(options.data?.produits ?? []).map((p) => ({ valeur: p.id, libelle: p.nom }))}
                />
                <Selecteur
                  label="Emplacement"
                  value={saisie.emplacementId}
                  onChange={(v) => maj('emplacementId', v)}
                  placeholder="Choisir un emplacement…"
                  options={(options.data?.emplacements ?? []).map((e) => ({ valeur: e.id, libelle: e.chemin ?? e.nom }))}
                />
              </>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Input label="Minimum" type="number" min={0} value={saisie.stockMin} onChange={(e) => maj('stockMin', e.target.value)} />
              <Input label="Maximum" type="number" min={1} value={saisie.stockMax} onChange={(e) => maj('stockMax', e.target.value)} />
              <Input label="Par multiple de" type="number" min={1} value={saisie.multiple} onChange={(e) => maj('multiple', e.target.value)} />
            </div>
            <p className={cn('text-meta', valide || saisie.stockMax === '' ? 'text-steel-500' : 'text-rupture')}>
              {saisie.stockMax !== '' && max < min
                ? 'Le maximum doit être supérieur ou égal au minimum.'
                : 'Sous le minimum, une commande remonte le stock au maximum, arrondie au multiple (carton de 12…).'}
            </p>
            <Selecteur
              label="Fournisseur"
              value={saisie.fournisseurId}
              onChange={(v) => maj('fournisseurId', v)}
              options={[
                { valeur: '', libelle: 'Fournisseur habituel du produit' },
                ...(options.data?.fournisseurs ?? []).map((f) => ({ valeur: f.id, libelle: f.nom })),
              ]}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
