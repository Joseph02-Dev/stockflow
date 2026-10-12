import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Mail,
  Menu,
  Package,
  PackageX,
  Smartphone,
  Tags,
  Truck,
  Users,
  Warehouse,
  WifiOff,
  X,
} from 'lucide-react';
import { Logo } from '@/components/patterns/Logo';
import { FondEntrepot3D } from '@/components/patterns/FondEntrepot3D';
import { cn } from '@/lib/cn';
import { ADRESSE_AIDE } from '@/lib/contact';
import { DUREE_ESSAI_JOURS, OFFRES, faq, type Offre } from './contenu';
import { useApparitionAuDefilement } from './useApparition';
import './accueil.css';

const TITRE_PAGE = 'StockFlow — gestion de stock et de ventes pour commerçants et grossistes';

const LIENS = [
  { href: '#fonctionnalites', libelle: 'Fonctionnalités' },
  { href: '#mobile', libelle: 'Sur mobile' },
  { href: '#tarifs', libelle: 'Tarifs' },
  { href: '#faq', libelle: 'Questions' },
];

const MAILTO_AIDE = `mailto:${ADRESSE_AIDE}`;
const MAILTO_OFFRES = `mailto:${ADRESSE_AIDE}?subject=${encodeURIComponent('Offres StockFlow')}`;

/** Atouts vérifiés dans l'application, affichés sous le titre. */
const ATOUTS = ['Prix de détail, demi-gros et gros', 'Plusieurs emplacements', 'Mouvements saisis même hors ligne'];

const BENEFICES = [
  {
    Icone: Warehouse,
    teinte: 'bg-action-wash text-action',
    titre: 'Les quantités, emplacement par emplacement',
    texte: 'Boutique, dépôt ou magasin : chaque produit affiche son stock réel, là où il se trouve.',
  },
  {
    Icone: Bell,
    teinte: 'bg-faible-wash text-faible',
    titre: 'Les produits à recommander, signalés',
    texte: 'Une alerte apparaît dès qu’un produit passe sous le seuil que vous avez fixé.',
  },
  {
    Icone: ClipboardList,
    teinte: 'bg-ok-wash text-ok',
    titre: 'Chaque mouvement tracé',
    texte: 'Entrées, sorties, transferts, ventes et inventaires : qui, quand, combien.',
  },
  {
    Icone: WifiOff,
    teinte: 'bg-accent-wash text-accent',
    titre: 'Une coupure de réseau n’arrête pas la saisie',
    texte: 'Les mouvements de stock saisis hors connexion partent dès le retour du réseau.',
  },
];

interface Vitrine {
  id: string;
  etiquette: string;
  titre: string;
  texte: string;
  points: string[];
  image: { src: string; alt: string; largeur: number; hauteur: number; telephone?: boolean };
}

const VITRINES: Vitrine[] = [
  {
    id: 'ventes',
    etiquette: 'Ventes au comptoir',
    titre: 'Encaissez vite, au bon prix.',
    texte: 'Le tarif suit la catégorie du client, le stock baisse à la validation et la dette reste sous vos yeux.',
    points: [
      'Prix de détail, de demi-gros et de gros',
      'Espèces, Orange Money, MTN MoMo ou crédit',
      'Ventes à crédit et suivi des créances clients',
      'Reçu envoyé au client par WhatsApp',
    ],
    image: {
      src: '/accueil/vente.webp',
      alt: 'Écran « Nouvelle vente » de StockFlow : trois articles au panier, total de 295 000 GNF et choix du mode de paiement.',
      largeur: 1360,
      hauteur: 860,
    },
  },
  {
    id: 'stock',
    etiquette: 'Stock et alertes',
    titre: 'Sachez ce qu’il reste, avant la rupture.',
    texte: 'Chaque produit montre sa quantité et son seuil d’alerte, sur ordinateur comme sur téléphone.',
    points: [
      'Entrées, sorties et transferts entre emplacements',
      'Inventaires avec ajustement des écarts',
      'Seuil d’alerte par produit',
      'Lots et dates de péremption (module)',
    ],
    image: {
      src: '/accueil/mobile.webp',
      alt: 'Liste des produits de StockFlow sur téléphone, avec la quantité en stock et le seuil de chaque produit.',
      largeur: 390,
      hauteur: 844,
      telephone: true,
    },
  },
  {
    id: 'pilotage',
    etiquette: 'Statistiques et rapports',
    titre: 'Pilotez avec des chiffres, pas au jugé.',
    texte: 'Chiffre d’affaires, nombre de ventes et panier moyen, comparés à la période précédente.',
    points: [
      'Périodes de 7 jours, 30 jours ou 12 mois',
      'Plus fortes hausses et baisses par produit',
      'Rapports en PDF',
      'Valorisation et rotation du stock (modules)',
    ],
    image: {
      src: '/accueil/statistiques.webp',
      alt: 'Écran « Statistiques » de StockFlow : chiffre d’affaires, ventes et panier moyen sur 30 jours, avec la courbe du chiffre d’affaires.',
      largeur: 1360,
      hauteur: 860,
    },
  },
];

const AUSSI = [
  { Icone: Package, titre: 'Catalogue', texte: 'Catégories, marques, unités, codes-barres et photos ; import CSV ou Excel.' },
  { Icone: Truck, titre: 'Fournisseurs', texte: 'Commandes fournisseurs et réception directement en stock.' },
  { Icone: ClipboardCheck, titre: 'Inventaires', texte: 'Comptage par emplacement et ajustement des écarts.' },
  { Icone: PackageX, titre: 'Pertes et retours', texte: 'Casses déclarées, retours clients et retours fournisseurs.' },
  { Icone: Users, titre: 'Équipe', texte: 'Invitations, rôles administrateur et gestionnaire.' },
  { Icone: FileText, titre: 'Rapports', texte: 'Rapports PDF prêts à partager ou à imprimer.' },
];

/** Modules activables dans Paramètres › Modules, selon le métier. */
const MODULES = [
  'Lots et péremptions',
  'Variantes',
  'Conditionnements',
  'Numéros de série',
  'Réapprovisionnement automatique',
  'Valorisation FIFO ou coût moyen',
  'Rotation et stock dormant',
  'Assistant IA (lecture seule)',
  'Webhooks et API',
];

const ETAPES = [
  {
    titre: 'Créez votre espace',
    texte: 'Votre compte et votre entreprise, puis votre premier emplacement : boutique ou dépôt.',
  },
  {
    titre: 'Ajoutez vos produits',
    texte: 'Un par un, ou en important votre catalogue depuis un fichier CSV ou Excel.',
  },
  {
    titre: 'Vendez et suivez',
    texte: 'Entrées, ventes et sorties mettent le stock à jour ; les alertes signalent ce qui manque.',
  },
];

const MOBILE = [
  { Icone: Smartphone, texte: 'Interface pensée pour l’écran du téléphone' },
  { Icone: WifiOff, texte: 'Mouvements de stock mis en attente hors ligne, puis envoyés' },
  { Icone: Boxes, texte: 'Stock et seuils consultables partout' },
  { Icone: Tags, texte: 'Vente au comptoir depuis le téléphone' },
];

const PIED = [
  {
    titre: 'Produit',
    liens: [
      { href: '#fonctionnalites', libelle: 'Fonctionnalités' },
      { href: '#mobile', libelle: 'Sur mobile' },
      { href: '#tarifs', libelle: 'Tarifs' },
    ],
  },
  {
    titre: 'Compte',
    liens: [
      { to: '/connexion', libelle: 'Connexion' },
      { to: '/inscription', libelle: 'Inscription' },
    ],
  },
  {
    titre: 'Aide',
    liens: [
      { href: '#faq', libelle: 'Questions fréquentes' },
      { href: MAILTO_AIDE, libelle: 'Nous contacter' },
    ],
  },
];

function prixAffiche(offre: Offre) {
  if (offre.cle === 'essai') return { montant: 'Gratuit', detail: `pendant ${DUREE_ESSAI_JOURS} jours` };
  if (!offre.prix) return { montant: 'Bientôt disponible', detail: 'Tarif en cours de définition' };
  return {
    montant: `${new Intl.NumberFormat('fr-FR').format(offre.prix.montant)} ${offre.prix.devise}`,
    detail: `par ${offre.prix.periode}`,
  };
}

/** Décalage d'apparition d'un élément d'une liste (variable CSS --delai). */
const delai = (ms: number) => ({ '--delai': `${ms}ms` }) as CSSProperties;

// ——— Éléments de mise en page ———

const conteneur = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
const focusClair = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action';
const focusSombre = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const boutonPrincipal = cn(
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-action px-5 text-[0.9375rem] font-semibold text-sur-couleur transition-colors hover:bg-action-dark',
  focusClair,
);
const boutonSecondaire = cn(
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-rule-strong bg-surface px-5 text-[0.9375rem] font-semibold text-ink-900 transition-colors hover:bg-survol',
  focusClair,
);
const boutonBlanc = cn(
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-[0.9375rem] font-semibold whitespace-nowrap text-voile transition-colors hover:bg-craie',
  focusSombre,
);
const boutonContour = cn(
  'inline-flex h-12 items-center justify-center rounded-lg px-6 text-[0.9375rem] font-semibold whitespace-nowrap text-white ring-1 ring-white/25 transition-colors hover:bg-white/10',
  focusSombre,
);
const lienNav = cn(
  'rounded-md px-3 py-2 text-corps font-medium text-steel-700 transition-colors hover:bg-survol hover:text-ink-900',
  focusClair,
);
const lienPied = cn('w-fit text-corps text-steel-700 transition-colors hover:text-ink-900', focusClair);

function Etiquette({ children, sombre = false }: { children: ReactNode; sombre?: boolean }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-meta font-semibold',
        sombre ? 'bg-white/10 text-white/85 ring-1 ring-white/15' : 'bg-action-wash text-action',
      )}
    >
      <span className={cn('size-1.5 rounded-full', sombre ? 'bg-[#7fd6c0]' : 'bg-action')} aria-hidden="true" />
      {children}
    </p>
  );
}

function TitreSection({
  id,
  etiquette,
  titre,
  texte,
  centre = false,
}: {
  id: string;
  etiquette: string;
  titre: string;
  texte?: string;
  centre?: boolean;
}) {
  return (
    <div className={cn('flex max-w-2xl flex-col gap-4', centre ? 'mx-auto items-center text-center' : 'items-start')} data-apparition="">
      <Etiquette>{etiquette}</Etiquette>
      <h2 id={id} className="text-[1.875rem] leading-[1.15] font-semibold tracking-[-0.02em] text-ink-900 md:text-[2.5rem]">
        {titre}
      </h2>
      {texte && <p className="text-[1.0625rem] leading-relaxed text-steel-700">{texte}</p>}
    </div>
  );
}

function CadreNavigateur({
  src,
  alt,
  largeur,
  hauteur,
  prioritaire = false,
}: {
  src: string;
  alt: string;
  largeur: number;
  hauteur: number;
  prioritaire?: boolean;
}) {
  return (
    <div className="cadre-navigateur">
      <div className="flex h-7 items-center gap-1.5 border-b border-rule bg-paper px-3" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-rupture-vif/70" />
        <span className="size-2.5 rounded-full bg-faible-vif/70" />
        <span className="size-2.5 rounded-full bg-reseau/70" />
      </div>
      <img
        src={src}
        alt={alt}
        width={largeur}
        height={hauteur}
        decoding="async"
        loading={prioritaire ? 'eager' : 'lazy'}
        fetchPriority={prioritaire ? 'high' : 'auto'}
        className="block h-auto w-full"
      />
    </div>
  );
}

function CadreTelephone({ src, alt, className, prioritaire = false }: { src: string; alt: string; className?: string; prioritaire?: boolean }) {
  return (
    <div className={cn('cadre-telephone', className)}>
      <img
        src={src}
        alt={alt}
        width={390}
        height={844}
        decoding="async"
        loading={prioritaire ? 'eager' : 'lazy'}
        className="block h-auto w-full"
      />
    </div>
  );
}

/** Étiquette flottante du hero : purement décorative, masquée aux lecteurs d'écran. */
function Pastille({ Icone, texte, teinte, className }: { Icone: typeof Bell; texte: string; teinte: string; className: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute hidden items-center gap-2 rounded-full bg-surface px-3 py-2 text-meta font-semibold text-ink-900 shadow-pop ring-1 ring-rule lg:flex',
        className,
      )}
    >
      <span className={cn('flex size-6 items-center justify-center rounded-full', teinte)}>
        <Icone className="size-3.5" />
      </span>
      {texte}
    </div>
  );
}

/**
 * Page d'accueil publique (visiteur non connecté, à la racine du site).
 * Un utilisateur connecté voit son tableau de bord à la même adresse :
 * voir RouteProtegee dans App.tsx.
 */
export function AccueilPage() {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  useApparitionAuDefilement(racine);

  useEffect(() => {
    const precedent = document.title;
    document.title = TITRE_PAGE;
    return () => {
      document.title = precedent;
    };
  }, []);

  useEffect(() => {
    if (!menuOuvert) return;
    const fermerSurEchap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOuvert(false);
    };
    window.addEventListener('keydown', fermerSurEchap);
    return () => window.removeEventListener('keydown', fermerSurEchap);
  }, [menuOuvert]);

  const fermerMenu = () => setMenuOuvert(false);

  return (
    <div ref={racine} className="min-h-full bg-paper text-ink-900">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Aller au contenu
      </a>

      {/* ——— Navigation ——— */}
      <header className="sticky top-0 z-40 border-b border-rule/70 bg-surface/85 backdrop-blur-xl backdrop-saturate-150">
        <div className={cn(conteneur, 'flex h-16 items-center justify-between gap-3')}>
          <Link to="/" className={cn('flex items-center gap-2.5 rounded-md', focusClair)} aria-label="StockFlow, accueil">
            <Logo taille={30} />
            <span className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink-900">StockFlow</span>
          </Link>

          <nav aria-label="Navigation principale" className="hidden items-center gap-0.5 lg:flex">
            {LIENS.map((lien) => (
              <a key={lien.href} href={lien.href} className={lienNav}>
                {lien.libelle}
              </a>
            ))}
            <a href={MAILTO_AIDE} className={lienNav}>
              Aide
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/connexion" className={cn('hidden sm:inline-flex', lienNav)}>
              Connexion
            </Link>
            <Link
              to="/inscription"
              className={cn(
                'hidden h-10 items-center gap-1.5 rounded-lg bg-action px-4 text-corps font-semibold text-sur-couleur transition-colors hover:bg-action-dark sm:inline-flex',
                focusClair,
              )}
            >
              Essai gratuit
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setMenuOuvert((ouvert) => !ouvert)}
              aria-expanded={menuOuvert}
              aria-controls="menu-mobile"
              aria-label={menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
              className={cn(
                'flex size-10 items-center justify-center rounded-lg text-ink-900 transition-colors hover:bg-survol lg:hidden',
                focusClair,
              )}
            >
              {menuOuvert ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Toujours présent pour l'animation ; inert le retire du clavier et des lecteurs d'écran une fois replié. */}
        <div id="menu-mobile" className="menu-repli lg:hidden" data-ouvert={menuOuvert} inert={!menuOuvert}>
          <div>
            <nav aria-label="Navigation mobile" className={cn(conteneur, 'border-t border-rule pt-3 pb-5')}>
              <ul className="flex flex-col">
                {LIENS.map((lien) => (
                  <li key={lien.href}>
                    <a href={lien.href} onClick={fermerMenu} className={cn(lienNav, 'block py-3 text-[1rem]')}>
                      {lien.libelle}
                    </a>
                  </li>
                ))}
                <li>
                  <a href={MAILTO_AIDE} className={cn(lienNav, 'block py-3 text-[1rem]')}>
                    Aide et contact
                  </a>
                </li>
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link to="/connexion" className={cn(boutonSecondaire, 'h-11')}>
                  Connexion
                </Link>
                <Link to="/inscription" className={cn(boutonPrincipal, 'h-11')}>
                  Essai gratuit
                </Link>
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main id="contenu">
        {/* ——— Hero ——— */}
        <section aria-labelledby="titre-accueil" className="bandeau-action text-white">
          <div className="accueil-grille pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <FondEntrepot3D
            ton="sombre"
            className="-z-10"
            masque="linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.55) 38%, #000 68%)"
          />
          <div className="accueil-halo pointer-events-none absolute -bottom-40 -left-32 -z-10 size-[520px]" aria-hidden="true" />
          <div
            className={cn(
              conteneur,
              'grid items-center gap-14 pt-14 pb-20 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-24 lg:pb-28',
            )}
          >
            <div className="apparition flex flex-col items-start gap-6">
              <Etiquette sombre>Pour commerçants, grossistes et vendeurs</Etiquette>
              <h1
                id="titre-accueil"
                className="text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.035em] text-white sm:text-[3.25rem] lg:text-[3.75rem]"
              >
                Votre stock, <span className="accueil-surligne">toujours sous contrôle.</span>
              </h1>
              <p className="max-w-xl text-[1.125rem] leading-relaxed text-white/75">
                Produits, entrées, sorties et ventes dans un espace unique, sur ordinateur ou sur téléphone. Le stock se met à
                jour à chaque opération.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                <Link to="/inscription" className={boutonBlanc}>
                  Commencer l’essai gratuit
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <a href="#fonctionnalites" className={boutonContour}>
                  Voir les fonctionnalités
                </a>
              </div>
              <p className="text-meta text-white/65">
                Essai gratuit de {DUREE_ESSAI_JOURS} jours · Déjà inscrit ?{' '}
                <Link to="/connexion" className={cn('rounded-sm font-semibold text-white underline-offset-4 hover:underline', focusSombre)}>
                  Se connecter
                </Link>
              </p>
              <ul className="mt-2 flex w-full flex-col gap-2.5 border-t border-white/10 pt-6 sm:flex-row sm:flex-wrap sm:gap-x-6">
                {ATOUTS.map((atout) => (
                  <li key={atout} className="flex items-center gap-2 text-corps text-white/80">
                    <Check className="size-4 shrink-0 text-[#7fd6c0]" aria-hidden="true" />
                    {atout}
                  </li>
                ))}
              </ul>
            </div>

            <figure className="relative min-w-0 lg:pr-6">
              <div className="apparition" style={{ animationDelay: '120ms' }}>
                <CadreNavigateur
                  src="/accueil/tableau-de-bord.webp"
                  alt="Tableau de bord de StockFlow : deux références sous le seuil, valeur du stock, mouvements de la semaine et produits à réapprovisionner."
                  largeur={1360}
                  hauteur={860}
                  prioritaire
                />
              </div>
              <CadreTelephone
                src="/accueil/mobile-vente.webp"
                alt="Écran de vente de StockFlow sur téléphone, avec le panier et le total."
                className="apparition absolute -right-1 -bottom-12 hidden w-[150px] sm:block lg:-right-2 lg:w-[176px]"
                prioritaire
              />
              <Pastille Icone={Bell} texte="Alerte de seuil" teinte="bg-faible-wash text-faible" className="-top-4 left-8" />
              <Pastille Icone={WifiOff} texte="Saisie hors ligne" teinte="bg-ok-wash text-ok" className="bottom-10 -left-6" />
              <figcaption className="mt-4 text-meta text-white/60 sm:mt-6 sm:pr-44">
                Captures de l’application, avec des données de démonstration.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ——— Bénéfices ——— */}
        <section aria-labelledby="titre-benefices" className="py-20 md:py-28">
          <div className={conteneur}>
            <TitreSection
              id="titre-benefices"
              etiquette="Au quotidien"
              titre="Moins de temps à compter, plus de temps pour vos clients."
              texte="Ce que StockFlow vous évite de chercher dans un cahier ou un tableur."
            />
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFICES.map(({ Icone, teinte, titre, texte }, index) => (
                <li
                  key={titre}
                  data-apparition=""
                  style={delai(index * 70)}
                  className="carte-vivante flex flex-col gap-4 rounded-2xl border border-rule bg-surface p-6"
                >
                  <span className={cn('flex size-11 items-center justify-center rounded-xl', teinte)}>
                    <Icone className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink-900">{titre}</h3>
                  <p className="text-corps leading-relaxed text-steel-700">{texte}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ——— Fonctionnalités en démonstration ——— */}
        <section
          id="fonctionnalites"
          aria-labelledby="titre-fonctionnalites"
          className="scroll-mt-16 border-y border-rule bg-surface py-20 md:py-28"
        >
          <div className={conteneur}>
            <TitreSection
              id="titre-fonctionnalites"
              etiquette="Fonctionnalités"
              titre="Tout votre commerce, au même endroit."
              texte="De la vente au comptoir jusqu’aux statistiques : un seul outil, pensé pour le commerce de détail et de gros."
              centre
            />

            <div className="mt-16 flex flex-col gap-24 md:mt-20 md:gap-32">
              {VITRINES.map((vitrine, index) => (
                <article
                  key={vitrine.id}
                  aria-labelledby={`vitrine-${vitrine.id}`}
                  className="groupe-apercu grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
                >
                  <div className={cn('flex flex-col gap-5', index % 2 === 1 && 'lg:order-2')} data-apparition="">
                    <p className="text-meta font-semibold tracking-[0.06em] text-action uppercase">{vitrine.etiquette}</p>
                    <h3
                      id={`vitrine-${vitrine.id}`}
                      className="text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900 md:text-[2rem]"
                    >
                      {vitrine.titre}
                    </h3>
                    <p className="text-[1.0625rem] leading-relaxed text-steel-700">{vitrine.texte}</p>
                    <ul className="mt-1 grid gap-3 sm:grid-cols-2">
                      {vitrine.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-corps text-ink-900">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-wash">
                            <Check className="size-3 text-ok" aria-hidden="true" />
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div
                    data-apparition=""
                    style={delai(100)}
                    className={cn('rounded-3xl bg-gradient-to-br from-action-wash to-paper p-5 sm:p-8', index % 2 === 1 && 'lg:order-1')}
                  >
                    <div className="apercu-vivant">
                      {vitrine.image.telephone ? (
                        <CadreTelephone src={vitrine.image.src} alt={vitrine.image.alt} className="mx-auto w-[220px] sm:w-[250px]" />
                      ) : (
                        <CadreNavigateur
                          src={vitrine.image.src}
                          alt={vitrine.image.alt}
                          largeur={vitrine.image.largeur}
                          hauteur={vitrine.image.hauteur}
                        />
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ——— Sur mobile ——— */}
        <section id="mobile" aria-labelledby="titre-mobile" className="bandeau-action scroll-mt-16 text-white">
          <div className="accueil-grille pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <FondEntrepot3D ton="sombre" className="-z-10" />
          <div className={cn(conteneur, 'grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.1fr_1fr]')}>
            <div className="flex flex-col items-start gap-5" data-apparition="">
              <Etiquette sombre>Sur téléphone</Etiquette>
              <h2
                id="titre-mobile"
                className="text-[1.875rem] leading-[1.15] font-semibold tracking-[-0.02em] text-white md:text-[2.5rem]"
              >
                La boutique dans la poche, même quand le réseau faiblit.
              </h2>
              <p className="text-[1.0625rem] leading-relaxed text-white/75">
                Le même compte sur ordinateur et sur téléphone, depuis le navigateur, sans installation. L’interface mobile met
                les ventes, le stock et les commandes à portée de pouce.
              </p>
              <ul className="mt-2 grid w-full gap-4 sm:grid-cols-2">
                {MOBILE.map(({ Icone, texte }) => (
                  <li key={texte} className="flex items-start gap-3 text-corps text-white/85">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                      <Icone className="size-4 text-[#7fd6c0]" aria-hidden="true" />
                    </span>
                    {texte}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-end justify-center gap-5" data-apparition="" style={delai(120)}>
              <CadreTelephone
                src="/accueil/mobile.webp"
                alt="Liste des produits de StockFlow sur téléphone."
                className="w-[44%] max-w-[230px] translate-y-6"
              />
              <CadreTelephone
                src="/accueil/mobile-vente.webp"
                alt="Nouvelle vente dans StockFlow sur téléphone, avec le total à encaisser."
                className="w-[44%] max-w-[230px]"
              />
            </div>
          </div>
        </section>

        {/* ——— Et aussi ——— */}
        <section aria-labelledby="titre-aussi" className="py-20 md:py-28">
          <div className={conteneur}>
            <TitreSection id="titre-aussi" etiquette="Et aussi" titre="Les outils du quotidien, déjà dans l’application." />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AUSSI.map(({ Icone, titre, texte }, index) => (
                <li
                  key={titre}
                  data-apparition=""
                  style={delai((index % 3) * 60)}
                  className="carte-vivante flex gap-4 rounded-2xl border border-rule bg-surface p-5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-paper text-action ring-1 ring-rule">
                    <Icone className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[1rem] font-semibold text-ink-900">{titre}</h3>
                    <p className="mt-1 text-corps leading-relaxed text-steel-700">{texte}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 rounded-2xl border border-dashed border-rule-strong bg-surface p-6 md:p-8" data-apparition="">
              <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-6">
                <h3 className="text-[1.0625rem] font-semibold text-ink-900">Modules à activer selon votre métier</h3>
                <p className="text-meta text-steel-500">L’administrateur les active dans Paramètres › Modules.</p>
              </div>
              <ul className="mt-5 flex flex-wrap gap-2">
                {MODULES.map((module) => (
                  <li key={module} className="rounded-full bg-paper px-3.5 py-1.5 text-corps text-ink-900 ring-1 ring-rule">
                    {module}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ——— Comment ça marche ——— */}
        <section aria-labelledby="titre-etapes" className="border-y border-rule bg-surface py-20 md:py-28">
          <div className={conteneur}>
            <TitreSection id="titre-etapes" etiquette="Comment ça marche" titre="Prêt à vendre en trois étapes." centre />
            <div className="relative mt-14">
              <span
                className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-action/0 via-action/40 to-action/0 md:block"
                aria-hidden="true"
              />
              <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
                {ETAPES.map((etape, index) => (
                  <li
                    key={etape.titre}
                    className="flex flex-col items-center gap-4 text-center"
                    data-apparition=""
                    style={delai(index * 90)}
                  >
                    <span
                      className="flex size-12 items-center justify-center rounded-2xl bg-action text-[1.125rem] font-semibold text-sur-couleur shadow-pop ring-4 ring-surface"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <h3 className="text-[1.125rem] font-semibold text-ink-900">
                      <span className="sr-only">Étape {index + 1} : </span>
                      {etape.titre}
                    </h3>
                    <p className="max-w-xs text-corps leading-relaxed text-steel-700">{etape.texte}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ——— Tarifs ——— */}
        <section id="tarifs" aria-labelledby="titre-tarifs" className="scroll-mt-16 py-20 md:py-28">
          <div className={conteneur}>
            <TitreSection
              id="titre-tarifs"
              etiquette="Tarifs"
              titre="Commencez gratuitement."
              texte="Essayez StockFlow avec vos propres produits. Les offres Standard et Premium seront détaillées prochainement."
              centre
            />
            <ul className="mt-14 grid items-stretch gap-6 md:grid-cols-3">
              {OFFRES.map((offre, index) => {
                const prix = prixAffiche(offre);
                const essai = offre.cle === 'essai';
                return (
                  <li
                    key={offre.cle}
                    data-apparition=""
                    style={delai(index * 80)}
                    className={cn(
                      'carte-vivante relative flex flex-col rounded-2xl p-7',
                      essai ? 'offre-phare shadow-pop' : 'border border-rule bg-surface',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute -top-3 left-7 rounded-full px-3 py-1 text-meta font-semibold',
                        essai ? 'bg-action text-sur-couleur' : 'bg-paper text-steel-500 ring-1 ring-rule',
                      )}
                    >
                      {essai ? 'Pour commencer' : 'Bientôt'}
                    </span>
                    <h3 className="text-[1.25rem] font-semibold text-ink-900">{offre.nom}</h3>
                    <p className="mt-1.5 text-corps text-steel-700 md:min-h-[2.75rem]">{offre.positionnement}</p>
                    <div className="mt-6 border-t border-rule pt-6">
                      <p
                        className={cn(
                          'leading-none font-semibold tracking-[-0.02em]',
                          essai ? 'text-[2.5rem] text-ink-900' : 'text-[1.625rem] text-steel-700',
                        )}
                      >
                        {prix.montant}
                      </p>
                      <p className="mt-2 text-meta text-steel-500">{prix.detail}</p>
                    </div>
                    {offre.inclus.length > 0 ? (
                      <ul className="mt-6 flex flex-col gap-3">
                        {offre.inclus.map((element) => (
                          <li key={element} className="flex items-start gap-2.5 text-corps text-ink-900">
                            <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                            {element}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-6 text-corps text-steel-500">Contenu détaillé de l’offre bientôt disponible.</p>
                    )}
                    <div className="mt-auto pt-8">
                      {essai ? (
                        <Link to="/inscription" className={cn(boutonPrincipal, 'w-full')}>
                          Commencer l’essai
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      ) : (
                        <a href={MAILTO_OFFRES} className={cn(boutonSecondaire, 'w-full')}>
                          <Mail className="size-4" aria-hidden="true" />
                          Nous écrire
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ——— FAQ ——— */}
        <section id="faq" aria-labelledby="titre-faq" className="scroll-mt-16 border-t border-rule bg-surface py-20 md:py-28">
          <div className={cn(conteneur, 'grid gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:gap-16')}>
            <div className="flex flex-col gap-6">
              <TitreSection id="titre-faq" etiquette="Questions fréquentes" titre="Vos questions, nos réponses." />
              <div className="rounded-2xl bg-paper p-6 ring-1 ring-rule" data-apparition="">
                <p className="text-[1rem] font-semibold text-ink-900">Une autre question ?</p>
                <p className="mt-1 text-corps text-steel-700">Écrivez-nous, nous vous répondrons par email.</p>
                <a
                  href={MAILTO_AIDE}
                  className={cn('mt-4 inline-flex items-center gap-2 rounded-sm text-corps font-semibold text-action hover:underline', focusClair)}
                >
                  <Mail className="size-4" aria-hidden="true" />
                  {ADRESSE_AIDE}
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-3" data-apparition="">
              {faq(ADRESSE_AIDE)
                .filter((q) => q.reponse !== null)
                .map((q) => (
                  <details key={q.question} className="faq-question group rounded-xl bg-paper ring-1 ring-rule open:bg-surface open:shadow-card">
                    <summary
                      className={cn(
                        'flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-[1rem] font-semibold text-ink-900',
                        focusClair,
                      )}
                    >
                      {q.question}
                      <ChevronDown
                        className="size-5 shrink-0 text-steel-500 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="faq-reponse px-5 pb-5 text-corps leading-relaxed text-steel-700">{q.reponse}</p>
                  </details>
                ))}
            </div>
          </div>
        </section>

        {/* ——— Appel final ——— */}
        <section aria-labelledby="titre-final" className="px-4 py-20 sm:px-6 md:py-24">
          <div className="bandeau-action mx-auto max-w-6xl rounded-3xl px-6 py-14 text-center text-white md:px-12 md:py-20" data-apparition="">
            <div className="accueil-grille pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
            <FondEntrepot3D ton="sombre" className="-z-10" />
            <h2
              id="titre-final"
              className="mx-auto max-w-2xl text-[1.875rem] leading-[1.15] font-semibold tracking-[-0.02em] md:text-[2.75rem]"
            >
              Prêt à suivre votre stock sereinement ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] text-white/75">
              Créez votre espace et essayez StockFlow gratuitement pendant {DUREE_ESSAI_JOURS} jours.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/inscription" className={boutonBlanc}>
                Créer mon compte
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link to="/connexion" className={boutonContour}>
                J’ai déjà un compte
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ——— Pied de page ——— */}
      <footer className="border-t border-rule bg-surface">
        <div className={cn(conteneur, 'grid gap-10 py-14 sm:grid-cols-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]')}>
          <div className="flex flex-col gap-3 sm:col-span-3 md:col-span-1">
            <span className="flex items-center gap-2.5">
              <Logo taille={28} />
              <span className="text-[1.0625rem] font-semibold text-ink-900">StockFlow</span>
            </span>
            <p className="max-w-xs text-corps text-steel-700">Gestion de stock et de ventes pour commerçants, grossistes et vendeurs.</p>
          </div>
          {PIED.map((colonne) => (
            <nav key={colonne.titre} aria-label={colonne.titre} className="flex flex-col gap-3">
              <p className="text-meta font-semibold tracking-[0.06em] text-steel-500 uppercase">{colonne.titre}</p>
              {colonne.liens.map((lien) =>
                'to' in lien ? (
                  <Link key={lien.libelle} to={lien.to} className={lienPied}>
                    {lien.libelle}
                  </Link>
                ) : (
                  <a key={lien.libelle} href={lien.href} className={lienPied}>
                    {lien.libelle}
                  </a>
                ),
              )}
            </nav>
          ))}
        </div>
        <div className="border-t border-rule">
          <p className={cn(conteneur, 'py-5 text-meta text-steel-500')}>© {new Date().getFullYear()} StockFlow</p>
        </div>
      </footer>
    </div>
  );
}

export default AccueilPage;
