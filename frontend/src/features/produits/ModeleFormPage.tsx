import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { lireValeurs, tailleGrille, type Modele } from './modeles';

const MAX_VARIANTES = 200;

interface LigneAttribut {
  nom: string;
  valeurs: string;
  /** Valeurs déjà déclinées en variantes : ne se retirent plus. */
  verrouillees: string[];
}

const nombreOuRien = (texte: string) => (texte.trim() === '' ? undefined : Number(texte));

const EXEMPLES: Record<string, string> = { couleur: 'Rouge, Bleu, Vert', taille: 'S, M, L, XL', pointure: '38, 39, 40, 41' };

/**
 * Création et suivi d'un modèle à variantes. À la création, la grille
 * (Couleur × Taille…) génère une variante par combinaison ; ensuite on
 * peut seulement ajouter des valeurs, qui créent les variantes manquantes.
 */
export function ModeleFormPage() {
  const { id } = useParams();
  const modele = useQuery({
    queryKey: ['modeles', id],
    queryFn: async () => (await api.get<Modele>(`/modeles/${id}`)).data,
    enabled: Boolean(id),
  });
  if (!id) return <FormulaireModele />;
  if (modele.isLoading) return <LoadingState variante="page" />;
  if (modele.isError || !modele.data) {
    return <ErrorState message={messageErreur(modele.error)} onRetry={() => modele.refetch()} />;
  }
  // Remonté à chaque nouveau modèle : l'état du formulaire part de ses valeurs.
  return <FormulaireModele key={modele.data.id} modele={modele.data} />;
}

function FormulaireModele({ modele }: { modele?: Modele }) {
  const id = modele?.id;
  const enEdition = Boolean(modele);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nom, setNom] = useState(modele?.nom ?? '');
  const [reference, setReference] = useState(modele?.reference ?? '');
  const [prixAchat, setPrixAchat] = useState(modele?.prixAchat?.toString() ?? '');
  const [prixVente, setPrixVente] = useState(modele?.prixVente?.toString() ?? '');
  const [attributs, setAttributs] = useState<LigneAttribut[]>(
    modele
      ? modele.attributs.map((a) => ({ nom: a.nom, valeurs: a.valeurs.join(', '), verrouillees: a.valeurs }))
      : [
          { nom: 'Couleur', valeurs: '', verrouillees: [] },
          { nom: 'Taille', valeurs: '', verrouillees: [] },
        ],
  );
  const [erreur, setErreur] = useState<string | null>(null);

  const grille = attributs.map((a) => ({ nom: a.nom.trim(), valeurs: lireValeurs(a.valeurs) }));
  const taille = tailleGrille(grille);
  const problemes = [
    !nom.trim() && 'Donnez un nom au modèle.',
    grille.some((a) => !a.nom) && 'Chaque attribut doit avoir un nom.',
    grille.some((a) => a.valeurs.length === 0) && 'Chaque attribut doit avoir au moins une valeur.',
    taille > MAX_VARIANTES && `${taille} variantes : ${MAX_VARIANTES} au maximum par modèle.`,
    ...attributs.flatMap((a) => {
      const gardees = new Set(lireValeurs(a.valeurs).map((v) => v.toLowerCase()));
      const retiree = a.verrouillees.find((v) => !gardees.has(v.toLowerCase()));
      return retiree ? [`« ${retiree} » a déjà des variantes : elle ne peut plus être retirée.`] : [];
    }),
  ].filter((p): p is string => Boolean(p));

  const enregistrer = useMutation({
    mutationFn: async () => {
      const corps = {
        nom: nom.trim(),
        reference: reference.trim() || undefined,
        prixAchat: nombreOuRien(prixAchat),
        prixVente: nombreOuRien(prixVente),
        attributs: grille,
      };
      return enEdition
        ? (await api.patch<Modele>(`/modeles/${id}`, corps)).data
        : (await api.post<Modele>('/modeles', corps)).data;
    },
    onSuccess: (resultat) => {
      queryClient.invalidateQueries({ queryKey: ['modeles'] });
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      setErreur(null);
      if (!enEdition) navigate(`/produits/modeles/${resultat.id}`, { replace: true });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’enregistrement a échoué.')),
  });

  const archiver = useMutation({
    mutationFn: async () => api.patch(`/modeles/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modeles'] });
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      navigate('/produits/modeles');
    },
    onError: (e) => setErreur(messageErreur(e, 'L’archivage a échoué.')),
  });

  const vierge = !nom.trim() && attributs.every((a) => !a.valeurs.trim());
  const majAttribut = (index: number, champ: 'nom' | 'valeurs', valeur: string) =>
    setAttributs((liste) => liste.map((a, i) => (i === index ? { ...a, [champ]: valeur } : a)));
  const variantes = modele?.variantes ?? [];
  const axesFiges = enEdition && variantes.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre={modele?.nom ?? 'Nouveau modèle'}
        description="Les prix saisis ici sont copiés dans chaque nouvelle variante, modifiable ensuite sur sa fiche."
        action={
          <>
            <Button variant="secondary" onClick={() => navigate('/produits/modeles')}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Modèles
            </Button>
            {modele && !modele.archive && (
              <Button variant="secondary" loading={archiver.isPending} onClick={() => archiver.mutate()}>
                <Archive className="size-4" aria-hidden="true" />
                Archiver
              </Button>
            )}
          </>
        }
      />

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <PanneauEntete titre="Modèle" />
          <div className="flex flex-col gap-4 p-5">
            <Input label="Nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="T-shirt col rond" />
            <Input
              label="Préfixe de référence (facultatif)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="TSHIRT"
              hint="Les variantes reçoivent TSHIRT-ROUGE-M, TSHIRT-BLEU-L…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Prix d’achat (GNF)" type="number" min={0} value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} />
              <Input label="Prix de vente (GNF)" type="number" min={0} value={prixVente} onChange={(e) => setPrixVente(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card>
          <PanneauEntete
            titre="Attributs"
            meta={taille > 0 ? `${formatNombre(taille)} ${pluriel('variante', taille)}` : 'Séparez les valeurs par des virgules'}
          />
          <div className="flex flex-col gap-4 p-5">
            {attributs.map((attribut, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-end gap-3">
                <Input
                  label="Attribut"
                  value={attribut.nom}
                  disabled={axesFiges}
                  onChange={(e) => majAttribut(index, 'nom', e.target.value)}
                />
                <Input
                  label="Valeurs"
                  value={attribut.valeurs}
                  placeholder={EXEMPLES[attribut.nom.trim().toLowerCase()] ?? 'Valeur 1, Valeur 2'}
                  onChange={(e) => majAttribut(index, 'valeurs', e.target.value)}
                />
                {!axesFiges && attributs.length > 1 ? (
                  <Button
                    variant="ghost"
                    taille="sm"
                    onClick={() => setAttributs((liste) => liste.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only">Retirer l’attribut</span>
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {!axesFiges && attributs.length < 3 && (
              <Button
                variant="secondary"
                taille="sm"
                className="self-start"
                onClick={() => setAttributs((liste) => [...liste, { nom: '', valeurs: '', verrouillees: [] }])}
              >
                <Plus className="size-4" aria-hidden="true" />
                Ajouter un attribut
              </Button>
            )}
            {axesFiges && (
              <p className="text-meta text-steel-500">
                Les attributs sont fixés : ajoutez des valeurs pour créer les variantes manquantes.
              </p>
            )}
            {/* Rien à signaler tant que la saisie n'a pas commencé. */}
            {problemes.length > 0 && !vierge && (
              <ul className="text-meta text-rupture">
                {problemes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <Button
              className="self-end"
              disabled={problemes.length > 0}
              loading={enregistrer.isPending}
              onClick={() => enregistrer.mutate()}
            >
              {enEdition
                ? 'Enregistrer'
                : taille > 0
                  ? `Créer ${formatNombre(taille)} ${pluriel('variante', taille)}`
                  : 'Créer les variantes'}
            </Button>
          </div>
        </Card>
      </div>

      {enEdition && (
        <Card>
          <PanneauEntete titre="Variantes" meta="Chaque variante a sa fiche produit, son stock et ses ventes." />
          <ul className="divide-y divide-rule">
            {variantes.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/produits/${v.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-entete-tableau sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-corps font-medium text-ink-900">{v.nom}</span>
                    <span className="block font-mono text-meta text-steel-500">{v.reference ?? '—'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-meta text-steel-500">
                    {v.archive && <Badge>Archivée</Badge>}
                    {v.prixVente !== null && <span>{gnf(v.prixVente)}</span>}
                    <span className="font-semibold text-ink-900">{formatNombre(v.stock)} en stock</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
