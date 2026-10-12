import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Boxes,
  ChartLine,
  Check,
  ClipboardList,
  Mail,
  Menu,
  Package,
  Receipt,
  Truck,
  Users,
  Warehouse,
  WifiOff,
  X,
} from 'lucide-react';
import { Logo } from '@/components/patterns/Logo';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { cn } from '@/lib/cn';
import { ADRESSE_AIDE } from '@/lib/contact';
import { DUREE_ESSAI_JOURS, OFFRES, faq, type Offre } from './contenu';

const TITRE_PAGE = 'StockFlow — gestion de stock et de ventes pour commerçants et grossistes';

const LIENS = [
  { href: '#fonctionnalites', libelle: 'Fonctionnalités' },
  { href: '#tarifs', libelle: 'Tarifs' },
  { href: '#faq', libelle: 'Questions fréquentes' },
];

const BENEFICES = [
  {
    Icone: Warehouse,
    titre: 'Les quantités disponibles, par emplacement',
    texte: 'Boutique, dépôt ou magasin : chaque produit affiche son stock réel, emplacement par emplacement.',
  },
  {
    Icone: Bell,
    titre: 'Les produits à recommander, repérés pour vous',
    texte: 'Une alerte apparaît dès qu’un produit passe sous le seuil que vous avez fixé.',
  },
  {
    Icone: ClipboardList,
    titre: 'L’historique de chaque mouvement',
    texte: 'Entrées, sorties, transferts, ventes et inventaires restent tracés : qui, quand, combien.',
  },
  {
    Icone: WifiOff,
    titre: 'Sur ordinateur et téléphone, même sans réseau',
    texte: 'Les mouvements de stock saisis hors connexion sont envoyés dès que le réseau revient.',
  },
];

const FONCTIONNALITES = [
  {
    Icone: Package,
    titre: 'Produits et catalogue',
    texte: 'Catégories, marques, unités, codes-barres et photos. Import du catalogue depuis un fichier CSV ou Excel.',
  },
  {
    Icone: Boxes,
    titre: 'Stock et emplacements',
    texte: 'Entrées, sorties, transferts entre emplacements et inventaires, avec ajustement des écarts.',
  },
  {
    Icone: Receipt,
    titre: 'Ventes au comptoir',
    texte: 'Prix de détail, de demi-gros et de gros, ventes à crédit avec suivi des créances, reçu envoyé par WhatsApp.',
  },
  {
    Icone: Truck,
    titre: 'Fournisseurs et commandes',
    texte: 'Commandes fournisseurs et réception en stock, retours, pertes et casses déclarées.',
  },
  {
    Icone: ChartLine,
    titre: 'Rapports et statistiques',
    texte: 'Chiffre d’affaires, tendances et meilleurs produits ; rapports en PDF.',
  },
  {
    Icone: Users,
    titre: 'Travail en équipe',
    texte: 'Invitez vos collaborateurs avec un rôle administrateur ou gestionnaire.',
  },
];

/** Modules activables dans Paramètres › Modules, selon le métier. */
const MODULES = [
  'Lots et dates de péremption',
  'Variantes de produits',
  'Conditionnements (carton, sac…)',
  'Numéros de série',
  'Réapprovisionnement automatique',
  'Valorisation du stock (FIFO ou coût moyen)',
  'Rotation et stock dormant',
  'Assistant IA, en lecture seule',
  'Webhooks et API',
];

const ETAPES = [
  {
    titre: 'Créez votre espace',
    texte: 'Votre compte, le nom de votre entreprise, puis votre premier emplacement (boutique ou dépôt).',
  },
  {
    titre: 'Ajoutez vos produits',
    texte: 'Un par un, ou en important votre catalogue depuis un fichier CSV ou Excel.',
  },
  {
    titre: 'Enregistrez vos opérations',
    texte: 'Entrées, ventes et sorties mettent le stock à jour ; les alertes signalent ce qui manque.',
  },
];

const MAILTO_OFFRES = `mailto:${ADRESSE_AIDE}?subject=${encodeURIComponent('Offres StockFlow')}`;

function prixAffiche(offre: Offre) {
  if (offre.cle === 'essai') return { montant: 'Gratuit', detail: `pendant ${DUREE_ESSAI_JOURS} jours` };
  if (!offre.prix) return { montant: 'Bientôt disponible', detail: 'Tarif en cours de définition' };
  return {
    montant: `${new Intl.NumberFormat('fr-FR').format(offre.prix.montant)} ${offre.prix.devise}`,
    detail: `par ${offre.prix.periode}`,
  };
}

/** Lien d'ancre : focus visible, cible tactile suffisante. */
const lienNav = 'rounded-md px-3 py-2 text-corps text-steel-700 transition-colors hover:bg-survol hover:text-ink-900';

/**
 * Page d'accueil publique (visiteur non connecté, à la racine du site).
 * Un utilisateur connecté voit son tableau de bord à la même adresse,
 * comme avant : voir RouteProtegee dans App.tsx.
 */
export function AccueilPage() {
  const [menuOuvert, setMenuOuvert] = useState(false);

  useEffect(() => {
    const precedent = document.title;
    document.title = TITRE_PAGE;
    return () => {
      document.title = precedent;
    };
  }, []);

  return (
    <div className="min-h-full bg-paper text-ink-900">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-30 border-b border-rule/70 bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="StockFlow, accueil">
            <Logo taille={30} />
            <span className="text-panneau text-ink-900">StockFlow</span>
          </Link>

          <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
            {LIENS.map((lien) => (
              <a key={lien.href} href={lien.href} className={lienNav}>
                {lien.libelle}
              </a>
            ))}
            <a href={`mailto:${ADRESSE_AIDE}`} className={lienNav}>
              Aide
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {/* Conteneur masqué : boutonClasses impose inline-flex, qu'un « hidden » ne remplace pas. */}
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/connexion" className={boutonClasses('ghost')}>
                Connexion
              </Link>
              <Link to="/inscription" className={boutonClasses('primary')}>
                Essai gratuit
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setMenuOuvert((o) => !o)}
              aria-expanded={menuOuvert}
              aria-controls="menu-mobile"
              aria-label={menuOuvert ? 'Fermer le menu' : 'Ouvrir le menu'}
              className={cn(boutonClasses('ghost', undefined, { icone: true }), 'md:hidden')}
            >
              {menuOuvert ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOuvert && (
          <nav id="menu-mobile" aria-label="Navigation principale" className="border-t border-rule px-4 py-3 md:hidden">
            <ul className="flex flex-col gap-1">
              {LIENS.map((lien) => (
                <li key={lien.href}>
                  <a href={lien.href} onClick={() => setMenuOuvert(false)} className={cn(lienNav, 'block')}>
                    {lien.libelle}
                  </a>
                </li>
              ))}
              <li>
                <a href={`mailto:${ADRESSE_AIDE}`} className={cn(lienNav, 'block')}>
                  Aide
                </a>
              </li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/connexion" className={boutonClasses('secondary', 'w-full')}>
                Connexion
              </Link>
              <Link to="/inscription" className={boutonClasses('primary', 'w-full')}>
                Essai gratuit
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="contenu">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:px-6 md:py-20 lg:grid-cols-[1fr_1.15fr]">
          <div className="flex flex-col gap-5">
            <p className="text-meta font-semibold tracking-wide text-action uppercase">Gestion de stock et de ventes</p>
            <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink-900 md:text-[2.75rem]">
              Votre stock, toujours sous contrôle.
            </h1>
            <p className="max-w-xl text-[1.0625rem] leading-relaxed text-steel-700">
              Gérez vos produits, vos entrées, vos sorties et vos ventes depuis un espace unique, sur ordinateur ou
              sur téléphone. Pensé pour les commerçants, grossistes et vendeurs.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/inscription" className={boutonClasses('primary', 'h-11 px-5')}>
                Commencer l’essai gratuit
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a href="#fonctionnalites" className={boutonClasses('secondary', 'h-11 px-5')}>
                Voir les fonctionnalités
              </a>
            </div>
            <p className="text-meta text-steel-500">
              Essai gratuit de {DUREE_ESSAI_JOURS} jours. Déjà inscrit ?{' '}
              <Link to="/connexion" className="font-medium text-action hover:underline">
                Connectez-vous
              </Link>
              .
            </p>
          </div>
          <figure className="min-w-0">
            <img
              src="/accueil/tableau-de-bord.webp"
              width={1360}
              height={900}
              alt="Tableau de bord de StockFlow : références suivies, ruptures, produits sous le seuil, valeur du stock et derniers mouvements."
              className="w-full rounded-xl border border-rule shadow-pop"
              fetchPriority="high"
            />
            <figcaption className="mt-2 text-center text-meta text-steel-500">
              Capture de l’application, avec des données de démonstration.
            </figcaption>
          </figure>
        </section>

        {/* Bénéfices */}
        <section aria-labelledby="titre-benefices" className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
            <h2 id="titre-benefices" className="text-titre text-ink-900">
              Ce que StockFlow change au quotidien
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFICES.map(({ Icone, titre, texte }) => (
                <li key={titre} className="flex flex-col gap-2">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-action-wash text-action">
                    <Icone className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-corps font-semibold text-ink-900">{titre}</h3>
                  <p className="text-corps text-steel-700">{texte}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" aria-labelledby="titre-fonctionnalites" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
            <h2 id="titre-fonctionnalites" className="text-titre text-ink-900">
              Fonctionnalités
            </h2>
            <p className="mt-2 max-w-2xl text-corps text-steel-700">
              L’essentiel pour suivre un commerce, et des modules à activer selon votre métier.
            </p>

            <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1.4fr_1fr]">
              <ul className="grid gap-4 sm:grid-cols-2">
                {FONCTIONNALITES.map(({ Icone, titre, texte }) => (
                  <li key={titre} className="rounded-xl border border-rule bg-surface p-5">
                    <Icone className="size-5 text-action" aria-hidden="true" />
                    <h3 className="mt-3 text-corps font-semibold text-ink-900">{titre}</h3>
                    <p className="mt-1 text-corps text-steel-700">{texte}</p>
                  </li>
                ))}
              </ul>
              <figure className="mx-auto w-full max-w-[300px]">
                <img
                  src="/accueil/mobile.webp"
                  width={390}
                  height={844}
                  loading="lazy"
                  alt="StockFlow sur téléphone : liste des produits avec leur niveau de stock."
                  className="w-full rounded-2xl border border-rule shadow-pop"
                />
                <figcaption className="mt-2 text-center text-meta text-steel-500">
                  Sur téléphone, données de démonstration.
                </figcaption>
              </figure>
            </div>

            <div className="mt-10 rounded-xl border border-rule bg-surface p-5 md:p-6">
              <h3 className="text-corps font-semibold text-ink-900">Modules à activer selon votre activité</h3>
              <p className="mt-1 text-meta text-steel-500">
                L’administrateur les active dans Paramètres › Modules ; seuls ceux utiles à votre métier s’affichent.
              </p>
              <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((module) => (
                  <li key={module} className="flex items-start gap-2 text-corps text-ink-900">
                    <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                    {module}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Comment ça marche */}
        <section aria-labelledby="titre-etapes" className="border-y border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
            <h2 id="titre-etapes" className="text-titre text-ink-900">
              Comment ça marche
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {ETAPES.map((etape, index) => (
                <li key={etape.titre} className="flex gap-4">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action text-corps font-semibold text-sur-couleur"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-corps font-semibold text-ink-900">
                      <span className="sr-only">Étape {index + 1} : </span>
                      {etape.titre}
                    </h3>
                    <p className="mt-1 text-corps text-steel-700">{etape.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" aria-labelledby="titre-tarifs" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-20">
            <h2 id="titre-tarifs" className="text-titre text-ink-900">
              Tarifs
            </h2>
            <p className="mt-2 max-w-2xl text-corps text-steel-700">
              Commencez par l’essai gratuit. Les offres Standard et Premium seront détaillées prochainement.
            </p>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {OFFRES.map((offre) => {
                const prix = prixAffiche(offre);
                const essai = offre.cle === 'essai';
                return (
                  <li
                    key={offre.cle}
                    className={cn(
                      'flex flex-col rounded-xl border bg-surface p-6',
                      essai ? 'border-action shadow-pop' : 'border-rule',
                    )}
                  >
                    <h3 className="text-panneau text-ink-900">{offre.nom}</h3>
                    <p className="mt-1 text-corps text-steel-700">{offre.positionnement}</p>
                    <p className="mt-5 text-[1.5rem] leading-tight font-semibold text-ink-900">{prix.montant}</p>
                    <p className="text-meta text-steel-500">{prix.detail}</p>
                    {offre.inclus.length > 0 ? (
                      <ul className="mt-5 flex flex-col gap-2">
                        {offre.inclus.map((element) => (
                          <li key={element} className="flex items-start gap-2 text-corps text-ink-900">
                            <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                            {element}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-5 text-corps text-steel-500">Contenu détaillé de l’offre bientôt disponible.</p>
                    )}
                    <div className="mt-auto pt-6">
                      {essai ? (
                        <Link to="/inscription" className={boutonClasses('primary', 'w-full')}>
                          Commencer l’essai
                        </Link>
                      ) : (
                        <a href={MAILTO_OFFRES} className={boutonClasses('secondary', 'w-full')}>
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

        {/* FAQ */}
        <section id="faq" aria-labelledby="titre-faq" className="scroll-mt-20 border-t border-rule bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
            <h2 id="titre-faq" className="text-titre text-ink-900">
              Questions fréquentes
            </h2>
            <div className="mt-6 divide-y divide-rule rounded-xl border border-rule bg-paper">
              {faq(ADRESSE_AIDE)
                .filter((q) => q.reponse !== null)
                .map((q) => (
                  <details key={q.question} className="group px-5 py-4">
                    <summary className="cursor-pointer list-none text-corps font-medium text-ink-900 marker:hidden">
                      <span className="flex items-center justify-between gap-4">
                        {q.question}
                        <span className="text-steel-500 transition-transform group-open:rotate-45" aria-hidden="true">
                          +
                        </span>
                      </span>
                    </summary>
                    <p className="mt-2 text-corps text-steel-700">{q.reponse}</p>
                  </details>
                ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="bandeau-action text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-12 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h2 className="text-titre text-white">Prêt à suivre votre stock ?</h2>
              <p className="mt-1 text-corps text-white/75">Essai gratuit de {DUREE_ESSAI_JOURS} jours.</p>
            </div>
            <Link
              to="/inscription"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-corps font-semibold text-ink-900 transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Créer mon compte
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:justify-between md:px-6">
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <Logo taille={24} />
              <span className="text-corps font-semibold text-ink-900">StockFlow</span>
            </span>
            <p className="text-meta text-steel-500">Gestion de stock et de ventes.</p>
          </div>
          <nav aria-label="Pied de page" className="grid grid-cols-2 gap-x-10 gap-y-2 text-corps sm:grid-cols-3">
            <a href="#fonctionnalites" className="text-steel-700 hover:text-ink-900">
              Fonctionnalités
            </a>
            <a href="#tarifs" className="text-steel-700 hover:text-ink-900">
              Tarifs
            </a>
            <a href="#faq" className="text-steel-700 hover:text-ink-900">
              Questions fréquentes
            </a>
            <a href={`mailto:${ADRESSE_AIDE}`} className="text-steel-700 hover:text-ink-900">
              Aide et contact
            </a>
            <Link to="/connexion" className="text-steel-700 hover:text-ink-900">
              Connexion
            </Link>
            <Link to="/inscription" className="text-steel-700 hover:text-ink-900">
              Inscription
            </Link>
          </nav>
        </div>
        <p className="border-t border-rule px-4 py-4 text-center text-meta text-steel-500">
          © {new Date().getFullYear()} StockFlow
        </p>
      </footer>
    </div>
  );
}

export default AccueilPage;
