import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  PackageX,
  Receipt,
  Warehouse,
} from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { pluriel } from '@/lib/format';
import { dateCourte, gnf } from '@/lib/montant';
import { useDebounce } from '@/lib/useDebounce';
import { useSession } from '@/lib/useSession';
import { lienWhatsApp } from '@/lib/whatsapp';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Selecteur } from '@/components/ui/Selecteur';
import { PageHeader } from '@/components/patterns/Page';
import { CHAMPS_IDENTITE, useEntreprise } from '@/features/parametres/donnees';
import { nomDeFichier, rendrePremierePage, telecharger } from './apercuPdf';
import type { ApercuRapport, ParametresRapport, Periode, TypeRapport } from './types';
import './rapports.css';
import { FlecheLien } from '@/components/ui/LienAction';
import { lienActionClasses } from '@/components/ui/lienActionClasses';

interface DefinitionRapport {
  type: TypeRapport;
  titre: string;
  usage: string;
  /** À qui le document est destiné. */
  pour: string;
  teinte: string;
  Icone: typeof Warehouse;
  periode: boolean;
  options: ('detail' | 'graphiques' | 'signature')[];
}

/**
 * Rapports disponibles. Les modules Ventes (relevé client) et Pertes font
 * partie du socle de l'application : tous sont proposés. Un rapport dont
 * le module serait absent ne figurerait tout simplement pas ici.
 */
const RAPPORTS: DefinitionRapport[] = [
  {
    type: 'stock',
    titre: 'État du stock',
    usage: 'Valeur et quantités par catégorie et par dépôt. Pour un crédit ou un associé.',
    pour: 'Banquier · associé',
    teinte: 'var(--color-action)',
    Icone: Warehouse,
    periode: false,
    options: ['detail', 'graphiques', 'signature'],
  },
  {
    type: 'mouvements',
    titre: 'Journal des mouvements',
    usage: 'Chaque entrée et sortie avec le solde après opération : le calcul se refait à la main.',
    pour: 'Contrôleur',
    teinte: '#2f6fb3',
    Icone: ArrowLeftRight,
    periode: true,
    options: ['signature'],
  },
  {
    type: 'client',
    titre: 'Relevé de compte client',
    usage: 'Ventes, règlements et solde dû, comme un relevé bancaire.',
    pour: 'Client',
    teinte: 'var(--color-accent)',
    Icone: Receipt,
    periode: true,
    options: [],
  },
  {
    type: 'pertes',
    titre: 'Rapport de pertes',
    usage: 'Ce que vous avez perdu, pourquoi et où, pour décider où agir.',
    pour: 'Responsables de dépôt',
    teinte: 'var(--color-rupture)',
    Icone: PackageX,
    periode: true,
    options: ['detail', 'graphiques', 'signature'],
  },
];

const PERIODES: readonly { cle: Periode; libelle: string }[] = [
  { cle: '7', libelle: '7 jours' },
  { cle: '30', libelle: '30 jours' },
  { cle: '90', libelle: '90 jours' },
  { cle: 'perso', libelle: 'Personnalisée' },
];

const TYPES_MOUVEMENT = [
  ['ENTREE', 'Entrées'],
  ['SORTIE', 'Sorties'],
  ['TRANSFERT', 'Transferts'],
  ['AJUSTEMENT', 'Ajustements'],
  ['PERIME', 'Périmés'],
  ['CASSE', 'Casses'],
  ['RETOUR_CLIENT', 'Retours client'],
  ['RETOUR_FOURNISSEUR', 'Retours fournisseur'],
] as const;

/** AAAA-MM-JJ du jour local, décalé de `jours`. */
function jourIso(jours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Paramètres de requête du rapport ; null tant qu'il manque un choix obligatoire. */
function requete(p: ParametresRapport): { url: string; params: Record<string, string> } | null {
  const def = RAPPORTS.find((r) => r.type === p.type)!;
  const params: Record<string, string> = {};
  if (def.periode) {
    if (p.periode === 'perso') {
      if (!p.debut || !p.fin || p.debut > p.fin) return null;
      Object.assign(params, { debut: p.debut, fin: p.fin });
    } else {
      Object.assign(params, { debut: jourIso(1 - Number(p.periode)), fin: jourIso() });
    }
  }
  for (const option of def.options) params[option] = String(p[option]);
  if ((p.type === 'stock' || p.type === 'mouvements') && p.emplacementId) params.emplacementId = p.emplacementId;
  if (p.type === 'stock' && p.categorieId) params.categorieId = p.categorieId;
  if (p.type === 'mouvements' && p.typeMouvement) params.type = p.typeMouvement;
  if (p.type === 'client') {
    if (!p.clientId) return null;
    return { url: `/rapports/client/${p.clientId}`, params };
  }
  return { url: `/rapports/${p.type}`, params };
}

async function recuperer(url: string, params: Record<string, string>, format: 'pdf' | 'csv') {
  const reponse = await api.get<Blob>(url, { params: { ...params, format }, responseType: 'blob' });
  return {
    fichier: reponse.data,
    pages: Number(reponse.headers['x-nombre-pages'] ?? 0),
    nom: nomDeFichier(reponse.headers['content-disposition'] as string | undefined, `rapport.${format}`),
  };
}

/** Interrupteur accessible (role="switch"). */
function Interrupteur({ actif, onChange, libelle, aide }: { actif: boolean; onChange: (v: boolean) => void; libelle: string; aide?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="text-corps text-ink-900">{libelle}</span>
        {aide && <span className="text-meta text-steel-500">{aide}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-label={libelle}
        onClick={() => onChange(!actif)}
        className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors', actif ? 'bg-action' : 'bg-rule-strong')}
      >
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow-card transition-all', actif ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function RapportsPage() {
  const session = useSession();
  const [p, setP] = useState<ParametresRapport>({
    type: 'stock',
    periode: '30',
    debut: jourIso(-29),
    fin: jourIso(),
    emplacementId: '',
    categorieId: '',
    clientId: '',
    typeMouvement: '',
    detail: true,
    graphiques: true,
    signature: false,
  });
  const maj = (partiel: Partial<ParametresRapport>) => setP((courant) => ({ ...courant, ...partiel }));
  const def = RAPPORTS.find((r) => r.type === p.type)!;
  const [action, setAction] = useState<'pdf' | 'csv' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<{ id: string; nom: string; archive: boolean }[]>('/emplacements')).data,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ id: string; nom: string }[]>('/categories')).data,
    enabled: p.type === 'stock',
  });
  const clients = useQuery({
    queryKey: ['clients', 'rapports'],
    queryFn: async () => (await api.get<{ id: string; nom: string; nomCommerce: string | null; telephone: string | null }[]>('/clients')).data,
    enabled: p.type === 'client',
  });
  const entreprise = useEntreprise();
  const creances = useQuery({
    queryKey: ['creances'],
    queryFn: async () =>
      (await api.get<{ debiteurs: { client: { id: string }; solde: number; echeanceAt: string | null }[] }>('/creances')).data,
    enabled: p.type === 'client',
  });

  // Aperçu : régénéré après une courte pause dans les réglages.
  const demande = useDebounce(requete(p), 450);
  const apercu = useQuery({
    queryKey: ['rapport-apercu', demande],
    queryFn: async (): Promise<ApercuRapport> => {
      const r = await recuperer(demande!.url, demande!.params, 'pdf');
      return { pdf: r.fichier, pages: r.pages, nomFichier: r.nom };
    },
    enabled: demande !== null,
    staleTime: 60_000,
    placeholderData: (precedent) => precedent,
  });

  const conteneur = useRef<HTMLDivElement>(null);
  // Ref de rappel : le rendu repart aussi quand le canvas est (re)monté.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [rendu, setRendu] = useState<'attente' | 'pret' | 'erreur'>('attente');
  useEffect(() => {
    const pdf = apercu.data?.pdf;
    if (!pdf || !canvas || !conteneur.current) return;
    let annule = false;
    // Largeur utile du panneau, padding déduit : jamais plus large que l'écran.
    const style = getComputedStyle(conteneur.current);
    const largeur = conteneur.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    rendrePremierePage(pdf, canvas, largeur)
      .then(() => !annule && setRendu('pret'))
      .catch(() => !annule && setRendu('erreur'));
    return () => {
      annule = true;
    };
  }, [apercu.data, canvas]);

  async function exporter(format: 'pdf' | 'csv') {
    const r = requete(p);
    if (!r) return;
    setErreur(null);
    setAction(format);
    try {
      const fichier = await recuperer(r.url, r.params, format);
      telecharger(fichier.fichier, fichier.nom);
    } catch (e) {
      setErreur(messageErreur(e, 'La génération du rapport a échoué.'));
    } finally {
      setAction(null);
    }
  }

  function apercuComplet() {
    if (!apercu.data) return;
    window.open(URL.createObjectURL(apercu.data.pdf), '_blank', 'noopener');
  }

  const client = clients.data?.find((c) => c.id === p.clientId);
  const dette = creances.data?.debiteurs.find((d) => d.client.id === p.clientId);
  const pret = requete(p) !== null;
  const actifs = (emplacements.data ?? []).filter((e) => !e.archive);

  // En-tête des documents : mêmes mentions que dans Paramètres › Entreprise.
  const manquantes = entreprise.data ? CHAMPS_IDENTITE.filter(({ champ }) => !entreprise.data[champ]) : [];
  const estAdmin = session?.utilisateur.role === 'ADMIN';

  // Ce que couvrira le document, en une ligne.
  const formatJour = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const bornes = p.periode === 'perso' ? [p.debut, p.fin] : [jourIso(1 - Number(p.periode)), jourIso()];
  const couverture: string[] = [
    def.periode ? `Du ${formatJour(bornes[0])} au ${formatJour(bornes[1])}` : 'Stock à l’instant de l’édition',
  ];
  if (p.type === 'client') couverture.push(client ? client.nom : 'Aucun client choisi');
  if (p.type === 'stock' || p.type === 'mouvements') {
    couverture.push(actifs.find((e) => e.id === p.emplacementId)?.nom ?? 'Tous les emplacements');
  }
  if (p.type === 'stock') couverture.push(categories.data?.find((c) => c.id === p.categorieId)?.nom ?? 'Toutes les catégories');
  if (p.type === 'mouvements') {
    couverture.push(TYPES_MOUVEMENT.find(([v]) => v === p.typeMouvement)?.[1] ?? 'Tous les types de mouvement');
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Rapports" description="Des documents d’entreprise, générés par le serveur : identiques quel que soit le poste qui les imprime." />

      {manquantes.length > 0 && (
        <div className="rapports-identite" role="note">
          <AlertTriangle className="size-4 shrink-0 text-faible" aria-hidden="true" />
          <span>
            <b className="font-semibold text-ink-900">
              En-tête incomplet : {CHAMPS_IDENTITE.length - manquantes.length} {pluriel('mention', CHAMPS_IDENTITE.length - manquantes.length)} sur {CHAMPS_IDENTITE.length}.
            </b>{' '}
            Manquent sur vos documents :
          </span>
          <span className="flex flex-wrap gap-1">
            {manquantes.map(({ champ, libelle }) => (
              <span key={champ} className="rapports-manque">
                {libelle}
              </span>
            ))}
          </span>
          {estAdmin ? (
            <Link to="/parametres" className={lienActionClasses('sm:ml-auto')}>
              Compléter dans Paramètres
              <FlecheLien />
            </Link>
          ) : (
            <span className="text-[13px] text-steel-500 sm:ml-auto">Un administrateur peut les compléter.</span>
          )}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rapports-carte p-4 sm:p-5" aria-labelledby="etape-1">
            <div className="rapports-etape">
              <span aria-hidden="true">1</span>
              <h2 id="etape-1">Quel document ?</h2>
            </div>
            <div role="radiogroup" aria-labelledby="etape-1" className="grid gap-2.5 sm:grid-cols-2">
              {RAPPORTS.map((r) => (
                <button
                  key={r.type}
                  type="button"
                  role="radio"
                  aria-checked={p.type === r.type}
                  onClick={() => maj({ type: r.type })}
                  className="rapports-choix"
                  style={{ '--teinte': r.teinte } as CSSProperties}
                >
                  <span className="rapports-coche" aria-hidden="true">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="flex items-center gap-2.5 pr-6">
                    <span className="rapports-pastille" aria-hidden="true">
                      <r.Icone className="size-[18px]" />
                    </span>
                    <span className="text-[14.5px] font-semibold text-ink-900">{r.titre}</span>
                  </span>
                  <span className="text-[12.5px] leading-[1.5] text-steel-500">{r.usage}</span>
                  <span className="inline-flex h-[22px] items-center self-start rounded-full border border-rule bg-paper px-2 text-[11.5px] font-semibold text-steel-500">
                    Pour : {r.pour}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rapports-carte p-4 sm:p-5" aria-labelledby="etape-2">
            <div className="rapports-etape">
              <span aria-hidden="true">2</span>
              <h2 id="etape-2">Ce qu’il couvre</h2>
            </div>
            <div className="flex flex-col gap-4">
              {def.periode && (
                <div className="flex flex-col gap-2">
                  <span className="text-corps font-semibold text-ink-900" id="libelle-periode">
                    Période
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="libelle-periode">
                    {PERIODES.map((periode) => (
                      <button
                        key={periode.cle}
                        type="button"
                        aria-pressed={p.periode === periode.cle}
                        onClick={() => maj({ periode: periode.cle })}
                        className="rapports-puce"
                      >
                        {periode.libelle}
                      </button>
                    ))}
                  </div>
                  {p.periode === 'perso' && (
                    <div className="grid grid-cols-2 gap-3">
                      {(['debut', 'fin'] as const).map((borne) => (
                        <label key={borne} className="flex flex-col gap-1.5">
                          <span className="text-meta text-steel-500">{borne === 'debut' ? 'Du' : 'Au'}</span>
                          <input
                            type="date"
                            value={p[borne]}
                            max={jourIso()}
                            onChange={(e) => maj({ [borne]: e.target.value })}
                            className="h-10 champ rounded-lg border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900"
                          />
                        </label>
                      ))}
                      {p.debut > p.fin && <p className="col-span-2 text-meta text-rupture">La date de début doit précéder la date de fin.</p>}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {p.type === 'client' && (
                  <Selecteur
                    label="Client"
                    placeholder="Choisir le client"
                    value={p.clientId}
                    onChange={(clientId) => maj({ clientId })}
                    options={(clients.data ?? []).map((c) => ({ valeur: c.id, libelle: c.nom, sousTitre: c.nomCommerce ?? undefined }))}
                    vide={{ titre: 'Aucun client trouvé', nomPluriel: 'clients' }}
                    className="sm:col-span-2"
                  />
                )}
                {(p.type === 'stock' || p.type === 'mouvements') && actifs.length > 1 && (
                  <Selecteur
                    label="Emplacement"
                    value={p.emplacementId}
                    onChange={(emplacementId) => maj({ emplacementId })}
                    options={[{ valeur: '', libelle: 'Tous les emplacements' }, ...actifs.map((e) => ({ valeur: e.id, libelle: e.nom }))]}
                  />
                )}
                {p.type === 'stock' && (categories.data?.length ?? 0) > 0 && (
                  <Selecteur
                    label="Catégorie"
                    value={p.categorieId}
                    onChange={(categorieId) => maj({ categorieId })}
                    options={[{ valeur: '', libelle: 'Toutes les catégories' }, ...(categories.data ?? []).map((c) => ({ valeur: c.id, libelle: c.nom }))]}
                  />
                )}
                {p.type === 'mouvements' && (
                  <Selecteur
                    label="Type de mouvement"
                    value={p.typeMouvement}
                    onChange={(typeMouvement) => maj({ typeMouvement })}
                    options={[{ valeur: '', libelle: 'Tous les types' }, ...TYPES_MOUVEMENT.map(([valeur, libelle]) => ({ valeur, libelle }))]}
                  />
                )}
              </div>

              <p className="flex flex-wrap gap-x-2 gap-y-1 rounded-xl bg-paper px-3.5 py-2.5 text-corps text-steel-500" aria-live="polite">
                <span className="sr-only">Le document couvrira :</span>
                {couverture.map((morceau, i) => (
                  <span key={morceau} className="font-semibold text-ink-900">
                    {i > 0 && <span className="mr-2 font-normal text-steel-400" aria-hidden="true">·</span>}
                    {morceau}
                  </span>
                ))}
              </p>

              {def.options.length > 0 && (
                <div className="flex flex-col divide-y divide-rule border-t border-rule">
                  {def.options.includes('detail') && (
                    <Interrupteur
                      libelle="Détail ligne par ligne"
                      aide={
                        p.detail && apercu.data
                          ? `Le document compte ${apercu.data.pages} ${pluriel('page', apercu.data.pages)}`
                          : 'Désactivé : synthèse seule, une page en général'
                      }
                      actif={p.detail}
                      onChange={(detail) => maj({ detail })}
                    />
                  )}
                  {def.options.includes('graphiques') && (
                    <Interrupteur libelle="Graphiques de répartition" actif={p.graphiques} onChange={(graphiques) => maj({ graphiques })} />
                  )}
                  {def.options.includes('signature') && (
                    <Interrupteur libelle="Zone de signature" aide="Établi par / vérifié par, en fin de document" actif={p.signature} onChange={(signature) => maj({ signature })} />
                  )}
                </div>
              )}
              {p.type === 'client' && (
                <p className="text-meta text-steel-500">Le relevé comporte toujours deux zones de signature : le client pour accord, et votre entreprise.</p>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section className="rapports-carte overflow-hidden" aria-labelledby="titre-apercu">
            <div ref={conteneur} className="rapports-bureau">
              <div className="mb-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="titre-apercu" className="truncate text-[14px] font-semibold text-white">
                    {def.titre}
                  </h2>
                  <p className="text-[12.5px] text-white/60">Aperçu de la première page</p>
                </div>
                {apercu.data && pret && (
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-white/10 px-2.5 font-mono text-[11.5px] font-semibold text-white/85">
                    {apercu.data.pages} {pluriel('page', apercu.data.pages)} · A4
                  </span>
                )}
              </div>
              {!pret ? (
                <div className="grid aspect-[210/297] place-items-center rounded-[4px] bg-white px-6 text-center text-corps text-[#5d616b]">
                  {p.type === 'client' ? 'Choisissez un client pour voir son relevé.' : 'Complétez la période pour voir l’aperçu.'}
                </div>
              ) : apercu.isError ? (
                <Alert variant="error">{messageErreur(apercu.error, 'L’aperçu n’a pas pu être généré.')}</Alert>
              ) : (
                <div className={cn('rapports-pile transition-opacity', (apercu.isFetching || rendu === 'attente') && 'opacity-60')}>
                  <canvas
                    ref={setCanvas}
                    className="relative z-10 mx-auto block aspect-[210/297] w-full rounded-[4px] bg-white shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)]"
                    aria-label="Aperçu de la première page du rapport"
                    role="img"
                  />
                  {rendu === 'attente' && (
                    <div className="absolute inset-0 z-20 grid aspect-[210/297] place-items-center text-meta text-steel-500">Génération…</div>
                  )}
                  {rendu === 'erreur' && <p className="mt-2 text-meta text-white/70">Aperçu indisponible sur cet appareil ; le PDF reste téléchargeable.</p>}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 p-4">
              {erreur && <Alert variant="error">{erreur}</Alert>}
              <Button disabled={!pret} loading={action === 'pdf'} onClick={() => exporter('pdf')} className="w-full">
                <Download className="size-4" aria-hidden="true" />
                Télécharger le PDF
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={!pret || !apercu.data} onClick={apercuComplet}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Aperçu complet
                </Button>
                <Button variant="secondary" disabled={!pret} loading={action === 'csv'} onClick={() => exporter('csv')}>
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  Export CSV
                </Button>
              </div>
              <p className="text-center text-[12px] text-steel-400">Le CSV s’ouvre dans Excel ou Google Sheets.</p>
            </div>

            {p.type === 'client' && client && (
              <div className="flex flex-col gap-3 border-t border-rule p-4">
                <p className="text-corps text-steel-500">
                  <FileText className="mr-1.5 inline size-4 text-steel-400" aria-hidden="true" />
                  WhatsApp ne transporte que du texte : téléchargez le PDF, puis joignez-le vous-même à la conversation.
                </p>
                {client.telephone && dette ? (
                  <a
                    href={lienWhatsApp(
                      client.telephone,
                      [
                        session?.entreprise.nom ?? '',
                        '',
                        `Bonjour ${client.nom},`,
                        '',
                        `Sauf erreur de notre part, votre solde s’élève à ${gnf(dette.solde)}.`,
                        ...(dette.echeanceAt ? [`Échéance : ${dateCourte(dette.echeanceAt)}.`] : []),
                        'Votre relevé de compte vous est adressé en pièce jointe (PDF).',
                        '',
                        'Bonne journée.',
                      ].join('\n'),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-whatsapp px-4 text-corps font-semibold text-white hover:bg-whatsapp-dark"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    Envoyer un rappel du solde
                    <span className="sr-only"> (ouvre WhatsApp dans un nouvel onglet)</span>
                  </a>
                ) : (
                  <p className="text-meta text-steel-500">
                    {client.telephone ? 'Ce client ne doit rien : pas de rappel à envoyer.' : 'Aucun numéro de téléphone pour ce client.'}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
