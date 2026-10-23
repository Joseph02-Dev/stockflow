import { useState, type CSSProperties, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  Clock,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShoppingCart,
  Timer,
  TriangleAlert,
  Truck,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Selecteur } from '@/components/ui/Selecteur';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { Vignette } from '@/components/patterns/Vignette';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { formatNombre, pluriel } from '@/lib/format';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { BoutonWhatsApp } from '@/components/patterns/BoutonWhatsApp';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';
import { ponctualite, teinteFournisseur, useActiviteFournisseurs } from './activite';
import { STATUTS_COMMANDE } from '@/features/commandes/statutsCommande';
import './fournisseurs.css';

interface Fournisseur {
  id: string;
  nom: string;
  emailContact: string | null;
  telephone: string | null;
  photoUrl: string | null;
  delaiLivraisonJours: number | null;
}

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
}

interface Reception {
  id: string;
  quantite: number;
  createdAt: string;
  produit: { nom: string };
  emplacement: { nom: string };
}

type CleOnglet = 'produits' | 'commandes' | 'receptions' | 'retours' | 'informations';

interface LigneStock {
  produitId: string;
  quantite: number;
  produit: { seuilAlerte: number };
}

const formatJours = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const AVOIRS = {
  ATTENDU: { libelle: 'Avoir attendu', variant: 'faible' },
  RECU: { libelle: 'Avoir reçu', variant: 'ok' },
  REFUSE: { libelle: 'Refusé', variant: 'rupture' },
} as const;

function Jauge({ libelle, part, couleur, detail }: { libelle: string; part: number | null; couleur: string; detail: string }) {
  return (
    <div style={{ '--c': couleur } as CSSProperties}>
      <p className="flex items-baseline justify-between gap-3 text-corps text-ink-900">
        {libelle}
        <span className="font-display text-[1.125rem] font-semibold" style={{ color: part === null ? 'var(--color-steel-400)' : couleur }}>
          {part === null ? '—' : `${Math.round(part * 100)} %`}
        </span>
      </p>
      <span className="fournisseurs-piste mt-2 mb-1.5 block" aria-hidden="true">
        {part !== null && <i style={{ width: `${part * 100}%` }} />}
      </span>
      <p className="text-meta text-steel-400">{detail}</p>
    </div>
  );
}

function couleurPart(part: number | null): string {
  if (part === null) return 'var(--color-steel-400)';
  if (part >= 0.8) return 'var(--color-ok)';
  if (part >= 0.5) return 'var(--color-faible)';
  return 'var(--color-rupture)';
}

function Indicateur({
  Icone,
  teinte,
  titre,
  valeur,
  unite,
  detail,
}: {
  Icone: LucideIcon;
  teinte: string;
  titre: string;
  valeur: string;
  unite?: string;
  detail: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-rule bg-surface p-3.5 shadow-card">
      <p className="flex items-center gap-1.5 text-meta font-semibold text-steel-500">
        <Icone className={cn('size-3.5', teinte)} aria-hidden="true" />
        {titre}
      </p>
      <p className="mt-2 font-display text-[1.375rem] leading-none font-semibold text-ink-900">
        {valeur} {unite && <span className="font-sans text-meta font-semibold text-steel-400">{unite}</span>}
      </p>
      <p className="mt-1.5 text-meta text-steel-400">{detail}</p>
    </div>
  );
}

const schemaEdition = z.object({
  nom: z.string().min(1, 'Le nom du fournisseur est requis.'),
  emailContact: z.string().email('Adresse email invalide.').optional().or(z.literal('')),
  telephone: z.string().optional(),
  delaiLivraisonJours: z.union([z.number().int().min(0), z.nan()]).optional(),
});

type FormulaireEdition = z.infer<typeof schemaEdition>;

export function FournisseurDetail({ fournisseurId }: { fournisseurId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actif, setActif] = useState<CleOnglet>('produits');
  const activite = useActiviteFournisseurs()(fournisseurId);
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const fournisseur = useQuery({
    queryKey: ['fournisseur', fournisseurId],
    queryFn: async () => (await api.get<Fournisseur>(`/fournisseurs/${fournisseurId}`)).data,
  });

  const produitsAssocies = useQuery({
    queryKey: ['fournisseur', fournisseurId, 'produits'],
    queryFn: async () => (await api.get<Produit[]>(`/fournisseurs/${fournisseurId}/produits`)).data,
  });

  const receptions = useQuery({
    queryKey: ['fournisseur', fournisseurId, 'receptions'],
    queryFn: async () => (await api.get<Reception[]>(`/fournisseurs/${fournisseurId}/receptions`)).data,
  });
  // État de stock des produits fournis : même cache que les écrans Stock et Produits.
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock')).data,
  });

  const catalogue = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<Produit[]>('/produits')).data,
    enabled: modaleOuverte,
  });

  const { register, handleSubmit, reset, formState } = useForm<FormulaireEdition>({
    resolver: zodResolver(schemaEdition),
  });

  function ouvrirEdition() {
    if (!fournisseur.data) return;
    setErreur(null);
    setPhotoUrl(fournisseur.data.photoUrl ?? undefined);
    reset({
      nom: fournisseur.data.nom,
      emailContact: fournisseur.data.emailContact ?? '',
      telephone: fournisseur.data.telephone ?? '',
      delaiLivraisonJours: fournisseur.data.delaiLivraisonJours ?? undefined,
    });
    setEditionOuverte(true);
  }

  const modifier = useMutation({
    mutationFn: async (v: FormulaireEdition) =>
      api.patch(`/fournisseurs/${fournisseurId}`, {
        nom: v.nom,
        ...(v.emailContact ? { emailContact: v.emailContact } : {}),
        ...(v.telephone ? { telephone: v.telephone } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(v.delaiLivraisonJours !== undefined && !Number.isNaN(v.delaiLivraisonJours)
          ? { delaiLivraisonJours: v.delaiLivraisonJours }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fournisseur', fournisseurId] });
      queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      setEditionOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'La modification a échoué.')),
  });

  const associer = useMutation({
    mutationFn: async (produitId: string) => api.post(`/fournisseurs/${fournisseurId}/produits`, { produitId }),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['fournisseur', fournisseurId, 'produits'] });
      setModaleOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’association a échoué.')),
  });

  const dissocier = useMutation({
    mutationFn: async (produitId: string) => api.delete(`/fournisseurs/${fournisseurId}/produits/${produitId}`),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['fournisseur', fournisseurId, 'produits'] });
    },
    onError: (err) => setErreur(messageErreur(err, 'La dissociation a échoué.')),
  });

  if (fournisseur.isLoading) return <LoadingState variante="page" />;
  if (fournisseur.isError) {
    return (
      <ErrorState
        message={messageErreur(fournisseur.error, 'Fournisseur introuvable.')}
        onRetry={() => fournisseur.refetch()}
      />
    );
  }
  if (!fournisseur.data) return null;

  const annonce = fournisseur.data.delaiLivraisonJours;
  const ecart = annonce !== null && activite.delaiReel !== null ? Math.round((activite.delaiReel - annonce) * 10) / 10 : null;
  // Quantité totale et seuil de chaque produit, tous emplacements confondus.
  const niveaux = new Map<string, { quantite: number; seuil: number }>();
  for (const ligne of stock.data ?? []) {
    const n = niveaux.get(ligne.produitId) ?? { quantite: 0, seuil: ligne.produit.seuilAlerte };
    n.quantite += ligne.quantite;
    niveaux.set(ligne.produitId, n);
  }
  const dejaAssocies = new Set((produitsAssocies.data ?? []).map((p) => p.id));
  const urgence = (id: string) => {
    const n = niveaux.get(id);
    const statut = statutStock(n?.quantite ?? 0, n?.seuil ?? 0);
    return statut === 'rupture' ? 0 : statut === 'faible' ? 1 : 2;
  };
  const produitsTries = [...(produitsAssocies.data ?? [])].sort((a, b) => urgence(a.id) - urgence(b.id) || a.nom.localeCompare(b.nom, 'fr'));
  // Commande préremplie : fournisseur, et de quoi revenir au seuil pour un produit.
  const commander = (produitId?: string) => {
    const n = produitId ? niveaux.get(produitId) : undefined;
    navigate('/commandes/nouvelle', {
      state: {
        fournisseurId,
        ...(produitId ? { lignes: [{ produitId, quantiteCommandee: Math.max((n?.seuil ?? 0) - (n?.quantite ?? 0), 1) }] } : {}),
      },
    });
  };
  const p = ponctualite(activite, annonce);
  const partHeure = p ? p.aLHeure / p.total : null;
  const clos = activite.avoirsRecus + activite.avoirsRefuses;
  const partAvoirs = clos > 0 ? activite.avoirsRecus / clos : null;
  const produitsDisponibles = (catalogue.data ?? []).filter((p) => !dejaAssocies.has(p.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-rule bg-surface p-5 shadow-card">
        <Vignette
          nom={fournisseur.data.nom}
          photoUrl={fournisseur.data.photoUrl}
          taille={64}
          teinte={teinteFournisseur(fournisseurId)}
          className="rounded-full! text-[1.25rem]!"
        />
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="truncate font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
            {fournisseur.data.nom}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-corps text-steel-500">
            {fournisseur.data.telephone && (
              <a
                href={`tel:${fournisseur.data.telephone.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-1.5 hover:text-action"
              >
                <Phone className="size-3.5 text-steel-400" aria-hidden="true" />
                {fournisseur.data.telephone}
              </a>
            )}
            {fournisseur.data.emailContact && (
              <a href={`mailto:${fournisseur.data.emailContact}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-action">
                <Mail className="size-3.5 shrink-0 text-steel-400" aria-hidden="true" />
                <span className="truncate">{fournisseur.data.emailContact}</span>
              </a>
            )}
            {!fournisseur.data.telephone && !fournisseur.data.emailContact && <span>Aucun contact renseigné</span>}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {fournisseur.data.telephone && (
            <a href={`tel:${fournisseur.data.telephone.replace(/\s/g, '')}`} className={boutonClasses('secondary', 'max-sm:flex-1')}>
              <Phone className="size-4" aria-hidden="true" />
              Appeler
            </a>
          )}
          <BoutonWhatsApp
            telephone={fournisseur.data.telephone}
            texte={`Bonjour ${fournisseur.data.nom},`}
            libelle="WhatsApp"
            className="h-10! max-sm:flex-1"
          />
          <Button variant="secondary" onClick={ouvrirEdition} className="max-sm:flex-1">
            <Pencil className="size-4" aria-hidden="true" />
            Modifier
          </Button>
          <Button onClick={() => commander()} className="max-sm:w-full">
            <ShoppingCart className="size-4" aria-hidden="true" />
            Commander
          </Button>
        </div>
      </div>

      <section aria-label="Indicateurs du fournisseur" className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <Indicateur
          Icone={Clock}
          teinte="text-action"
          titre="Délai annoncé"
          valeur={annonce === null ? '—' : String(annonce)}
          unite={annonce === null ? undefined : pluriel('jour', annonce)}
          detail={annonce === null ? 'Non renseigné' : 'Selon le fournisseur'}
        />
        <Indicateur
          Icone={Timer}
          teinte={ecart !== null && ecart > 0 ? 'text-faible' : 'text-ok'}
          titre="Délai réel"
          valeur={activite.delaiReel === null ? '—' : formatJours(activite.delaiReel)}
          unite={activite.delaiReel === null ? undefined : pluriel('jour', activite.delaiReel)}
          detail={
            activite.delaiReel === null ? (
              'Aucune commande reçue'
            ) : ecart === null ? (
              'Envoi → réception, en moyenne'
            ) : ecart > 0 ? (
              <>
                <span className="font-semibold text-rupture">+{formatJours(ecart)} j</span> sur l’annonce
              </>
            ) : ecart < 0 ? (
              <>
                <span className="font-semibold text-ok">−{formatJours(-ecart)} j</span> sur l’annonce
              </>
            ) : (
              <span className="font-semibold text-ok">Conforme à l’annonce</span>
            )
          }
        />
        <Indicateur
          Icone={Truck}
          teinte="text-action"
          titre="Commandes en route"
          valeur={String(activite.enRoute)}
          detail={activite.enRoute > 0 ? 'À réceptionner' : 'Rien en attente'}
        />
        <Indicateur
          Icone={TriangleAlert}
          teinte="text-rupture"
          titre="Produits en alerte"
          valeur={String(activite.produitsEnAlerte.size)}
          detail={activite.produitsEnAlerte.size > 0 ? 'À recommander' : 'Tout est au-dessus du seuil'}
        />
      </section>

      <Card>
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-5 py-3.5">
          <h3 className="text-[0.9375rem] font-semibold text-ink-900">Fiabilité</h3>
          <p className="text-meta text-steel-400">Sur les commandes reçues et les retours clos</p>
        </div>
        <div className="grid grid-cols-1 gap-5 px-5 py-4 sm:grid-cols-2">
          <Jauge
            libelle="Livraisons à l’heure"
            part={partHeure}
            couleur={couleurPart(partHeure)}
            detail={
              p
                ? `${p.aLHeure} sur ${p.total} dans le délai annoncé`
                : annonce === null
                  ? 'Délai annoncé non renseigné'
                  : 'Aucune commande reçue'
            }
          />
          <Jauge
            libelle="Avoirs obtenus"
            part={partAvoirs}
            couleur={couleurPart(partAvoirs)}
            detail={[
              clos > 0 ? `${clos} ${pluriel('retour clos', clos, 'retours clos')}` : 'Aucun retour clos',
              activite.avoirsEnAttente.nombre > 0 ? `${formatNombre(activite.avoirsEnAttente.valeur)} GNF encore attendus` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        </div>
      </Card>

      <Onglets
        onglets={[
          {
            cle: 'produits',
            libelle: produitsAssocies.data ? `Produits fournis (${produitsAssocies.data.length})` : 'Produits fournis',
          },
          { cle: 'commandes', libelle: `Commandes (${activite.commandes.length})` },
          { cle: 'receptions', libelle: receptions.data ? `Réceptions (${receptions.data.length})` : 'Réceptions' },
          { cle: 'retours', libelle: `Retours (${activite.retours.length})` },
          { cle: 'informations', libelle: 'Informations' },
        ]}
        actif={actif}
        onChange={setActif}
        libelle="Sections du fournisseur"
      />

      {erreur && !editionOuverte && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      <div role="tabpanel">
        {actif === 'informations' && (
          <Card>
            <dl className="divide-y divide-rule">
              {[
                {
                  Icone: Mail,
                  libelle: 'Email de contact',
                  valeur: fournisseur.data.emailContact && (
                    <a href={`mailto:${fournisseur.data.emailContact}`} className="text-action hover:underline">
                      {fournisseur.data.emailContact}
                    </a>
                  ),
                },
                {
                  Icone: Phone,
                  libelle: 'Téléphone',
                  valeur: fournisseur.data.telephone && (
                    <a
                      href={`tel:${fournisseur.data.telephone.replace(/\s/g, '')}`}
                      className="text-action hover:underline"
                    >
                      {fournisseur.data.telephone}
                    </a>
                  ),
                },
                {
                  Icone: Clock,
                  libelle: 'Délai de livraison annoncé',
                  valeur:
                    fournisseur.data.delaiLivraisonJours !== null &&
                    `${fournisseur.data.delaiLivraisonJours} ${pluriel('jour', fournisseur.data.delaiLivraisonJours)}`,
                },
              ].map(({ Icone, libelle, valeur }) => (
                <div key={libelle} className="flex items-center justify-between gap-4 px-5 py-3 text-corps">
                  <dt className="flex items-center gap-2 text-steel-500">
                    <Icone className="size-4 text-steel-400" aria-hidden="true" />
                    {libelle}
                  </dt>
                  <dd className="min-w-0 truncate text-right text-ink-900">
                    {valeur || <span className="text-steel-400">Non renseigné</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {actif === 'produits' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 basis-64 text-corps text-steel-500">
                Ces produits sont regroupés chez ce fournisseur dans « Ce qui manque ».
              </p>
              <Button variant="secondary" onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Associer un produit
              </Button>
            </div>

            <Card>
              {produitsAssocies.isLoading ? (
                <LoadingState />
              ) : produitsAssocies.data && produitsAssocies.data.length > 0 ? (
                <ul className="divide-y divide-rule">
                  {produitsTries.map((produit) => (
                    <li key={produit.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <Vignette nom={produit.nom} taille={32} />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/produits/${produit.id}`}
                          className="block truncate text-corps font-medium text-ink-900 hover:underline"
                        >
                          {produit.nom}
                        </Link>
                        {produit.reference && (
                          <p className="truncate font-mono text-meta text-steel-500">{produit.reference}</p>
                        )}
                      </div>
                      {stock.data &&
                        (() => {
                          const n = niveaux.get(produit.id);
                          const statut = statutStock(n?.quantite ?? 0, n?.seuil ?? 0);
                          return (
                            <>
                              <span className="hidden shrink-0 text-right text-corps tabular-nums sm:block">
                                <span className="font-semibold text-ink-900">{formatNombre(n?.quantite ?? 0)}</span>
                                <span className="text-meta text-steel-400"> / seuil {formatNombre(n?.seuil ?? 0)}</span>
                              </span>
                              <Badge variant={varianteStatut[statut]}>{libelleStatut[statut]}</Badge>
                              {statut !== 'ok' && (
                                <Button variant="secondary" taille="sm" onClick={() => commander(produit.id)}>
                                  <ShoppingCart className="size-4" aria-hidden="true" />
                                  <span className="sr-only sm:not-sr-only">Commander</span>
                                </Button>
                              )}
                            </>
                          );
                        })()}
                      <Button
                        variant="ghost"
                        taille="sm"
                        onClick={() => dissocier.mutate(produit.id)}
                        disabled={dissocier.isPending}
                      >
                        <X className="size-4" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Dissocier</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  titre="Aucun produit associé"
                  description="Associez les produits que ce fournisseur vous livre."
                  action={<Button onClick={() => setModaleOuverte(true)}>Associer un produit</Button>}
                />
              )}
            </Card>
          </div>
        )}

        {actif === 'commandes' && (
          <Card>
            {activite.commandes.length > 0 ? (
              <ul className="divide-y divide-rule">
                {activite.commandes.map((c) => {
                  const statut = STATUTS_COMMANDE[c.statut];
                  return (
                    <li key={c.id}>
                      <Link to={`/commandes/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-entete-tableau sm:px-5">
                        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-action-wash text-action" aria-hidden="true">
                          <Truck className="size-[15px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-corps font-semibold text-ink-900">
                            {c._count.lignes} {pluriel('référence', c._count.lignes)}
                            {c.valeurEstimee !== undefined && c.valeurEstimee > 0 && (
                              <span className="font-normal text-steel-500">
                                {' · '}
                                {c.valeurIncomplete ? 'au moins ' : ''}
                                {formatNombre(c.valeurEstimee)} GNF
                              </span>
                            )}
                          </p>
                          <p className="truncate text-meta text-steel-400">
                            {c.recueAt
                              ? `Reçue le ${dateCourte(c.recueAt)}`
                              : c.envoyeeAt
                                ? `Envoyée le ${dateCourte(c.envoyeeAt)}`
                                : `Créée le ${dateCourte(c.createdAt)}`}
                          </p>
                        </div>
                        <Badge variant={statut.variant}>{statut.libelle}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                titre="Aucune commande"
                description="Les bons de commande passés à ce fournisseur apparaîtront ici."
                action={<Button onClick={() => commander()}>Commander</Button>}
              />
            )}
          </Card>
        )}

        {actif === 'retours' && (
          <Card>
            {activite.retours.length > 0 ? (
              <ul className="divide-y divide-rule">
                {activite.retours.map((r) => {
                  const avoir = AVOIRS[r.statutAvoir];
                  return (
                    <li key={r.id}>
                      <Link to="/retours-fournisseur" className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-entete-tableau sm:px-5">
                        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-faible-wash text-faible" aria-hidden="true">
                          <Undo2 className="size-[15px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-corps font-semibold text-ink-900">« {r.motif} »</p>
                          <p className="truncate text-meta text-steel-400">
                            {r.mouvements.map((m) => `${formatNombre(m.quantite)} × ${m.produit.nom}`).join(', ')} · {dateCourte(r.createdAt)}
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-corps font-semibold text-ink-900 tabular-nums sm:block">
                          {formatNombre(r.valeurTotale)} GNF
                        </span>
                        <Badge variant={avoir.variant}>{avoir.libelle}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState titre="Aucun retour" description="La marchandise renvoyée à ce fournisseur apparaîtra ici, avec le suivi de l’avoir." />
            )}
          </Card>
        )}

        {actif === 'receptions' && (
          <Card>
            {receptions.isLoading ? (
              <LoadingState />
            ) : receptions.isError ? (
              <ErrorState message={messageErreur(receptions.error)} onRetry={() => receptions.refetch()} />
            ) : receptions.data && receptions.data.length > 0 ? (
              <ul className="divide-y divide-rule">
                {receptions.data.map((reception) => (
                  <li key={reception.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-ok-wash text-ok" aria-hidden="true">
                      <ArrowDownToLine className="size-[15px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-semibold text-ink-900">{reception.produit.nom}</p>
                      <p className="truncate text-meta text-steel-400">
                        {reception.emplacement.nom} ·{' '}
                        {new Date(reception.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-corps font-semibold text-ok">+{reception.quantite}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                titre="Aucune réception"
                description="Les entrées de stock enregistrées avec ce fournisseur apparaîtront ici."
              />
            )}
          </Card>
        )}
      </div>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Associer un produit"
        description="Seuls les produits pas encore associés sont proposés."
      >
        {catalogue.isLoading ? (
          <LoadingState />
        ) : produitsDisponibles.length > 0 ? (
          // Choisir un produit l'associe aussitôt, comme le clic sur la liste d'avant.
          <Selecteur
            label="Produit"
            placeholder="Rechercher un produit à associer…"
            options={produitsDisponibles.map((p) => ({ valeur: p.id, libelle: p.nom, sousTitre: p.reference ?? undefined }))}
            value=""
            onChange={(id) => associer.mutate(id)}
            disabled={associer.isPending}
            vide={{ titre: 'Aucun produit trouvé', nomPluriel: 'produits disponibles' }}
          />
        ) : (
          <p className="py-4 text-center text-corps text-steel-500">
            Tous vos produits sont déjà associés à ce fournisseur.
          </p>
        )}
      </Modal>

      <Modal
        ouvert={editionOuverte}
        onFermer={() => setEditionOuverte(false)}
        titre="Modifier le fournisseur"
        modifie={formState.isDirty || photoUrl !== (fournisseur.data?.photoUrl ?? undefined)}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditionOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-edition-fournisseur" loading={modifier.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form
          id="formulaire-edition-fournisseur"
          onSubmit={handleSubmit((v) => modifier.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <ImageUploadField label="Photo" valeur={photoUrl} dossier="fournisseurs" onChange={setPhotoUrl} forme="rond" />

          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
          <Input
            label="Email de contact (facultatif)"
            type="email"
            error={formState.errors.emailContact?.message}
            {...register('emailContact')}
          />
          <Input
            label="Téléphone (facultatif)"
            error={formState.errors.telephone?.message}
            {...register('telephone')}
          />
          <Input
            label="Délai de livraison moyen, en jours (facultatif)"
            type="number"
            min={0}
            error={formState.errors.delaiLivraisonJours?.message}
            {...register('delaiLivraisonJours', { valueAsNumber: true })}
          />

        </form>
      </Modal>
    </div>
  );
}
