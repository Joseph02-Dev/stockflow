import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Boxes,
  CalendarClock,
  Coins,
  Hourglass,
  RefreshCw,
  ScanBarcode,
  Sparkles,
  SwatchBook,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Panneau « Modules à activer selon votre métier » : reprend l'écran
 * Paramètres › Modules. Le choix d'un métier allume les modules conseillés
 * (exemple de configuration) ; le visiteur peut aussi basculer chaque
 * interrupteur. Tant que personne n'y touche, les métiers défilent seuls,
 * uniquement quand le panneau est à l'écran.
 */

type CleModule = 'lots' | 'variantes' | 'cond' | 'serie' | 'reappro' | 'valeur' | 'rotation' | 'ia' | 'webhooks';

const MODULES: { cle: CleModule; Icone: LucideIcon; nom: string; aide: string }[] = [
  { cle: 'lots', Icone: CalendarClock, nom: 'Lots et péremptions', aide: 'Numéros de lot, dates de péremption, premier périmé premier sorti.' },
  { cle: 'variantes', Icone: SwatchBook, nom: 'Variantes', aide: 'Tailles, couleurs… chaque combinaison a son propre stock.' },
  { cle: 'cond', Icone: Boxes, nom: 'Conditionnements', aide: 'Achetez en cartons, vendez à l’unité : conversion automatique.' },
  { cle: 'serie', Icone: ScanBarcode, nom: 'Numéros de série', aide: 'Chaque unité suivie avec son numéro, jusqu’à sa vente.' },
  { cle: 'reappro', Icone: RefreshCw, nom: 'Réapprovisionnement automatique', aide: 'Chaque matin, les brouillons de commande sont préparés.' },
  { cle: 'valeur', Icone: Coins, nom: 'Valorisation FIFO ou coût moyen', aide: 'La valeur réelle du stock, au coût d’achat.' },
  { cle: 'rotation', Icone: Hourglass, nom: 'Rotation et stock dormant', aide: 'Ce qui se vend, ce qui dort, l’argent immobilisé.' },
  { cle: 'ia', Icone: Sparkles, nom: 'Assistant IA (lecture seule)', aide: 'Posez vos questions sur le stock et les ventes.' },
  { cle: 'webhooks', Icone: Webhook, nom: 'Webhooks et API', aide: 'Prévenez vos autres logiciels à chaque mouvement.' },
];

const METIERS: { nom: string; article: string; modules: CleModule[] }[] = [
  { nom: 'Pharmacie', article: 'une pharmacie', modules: ['lots', 'cond', 'reappro', 'valeur'] },
  { nom: 'Boutique de mode', article: 'une boutique de mode', modules: ['variantes', 'rotation', 'valeur'] },
  { nom: 'Téléphonie', article: 'un magasin de téléphonie', modules: ['serie', 'valeur', 'rotation', 'ia'] },
  { nom: 'Grossiste', article: 'un grossiste', modules: ['lots', 'cond', 'reappro', 'rotation', 'webhooks'] },
  { nom: 'Quincaillerie', article: 'une quincaillerie', modules: ['cond', 'variantes', 'reappro', 'rotation'] },
];

const DUREE_METIER = 4200;

export function ModulesMetier() {
  const panneau = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [metier, setMetier] = useState(0);
  const [auto, setAuto] = useState(true);
  // Interrupteurs basculés à la main ; null = configuration conseillée du métier.
  const [perso, setPerso] = useState<ReadonlySet<CleModule> | null>(null);

  useEffect(() => {
    const element = panneau.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observateur = new IntersectionObserver(([entree]) => setVisible(entree.isIntersecting));
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !auto) return;
    const minuterie = window.setTimeout(() => setMetier((m) => (m + 1) % METIERS.length), DUREE_METIER);
    return () => window.clearTimeout(minuterie);
  }, [visible, auto, metier]);

  const actifs = perso ?? new Set(METIERS[metier].modules);

  const choisir = (index: number) => {
    setAuto(false);
    setPerso(null);
    setMetier(index);
  };

  const basculer = (cle: CleModule) => {
    setAuto(false);
    const suivant = new Set(actifs);
    if (suivant.has(cle)) suivant.delete(cle);
    else suivant.add(cle);
    setPerso(suivant);
  };

  return (
    <div ref={panneau} className="mt-10 rounded-xl border border-rule bg-surface p-4 shadow-card sm:p-6" data-apparition="">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-[1.0625rem] font-semibold text-ink-900">Modules à activer selon votre métier</h3>
        <span className="font-mono text-meta text-steel-500">Paramètres › Modules</span>
      </div>

      <div className="modules-metiers" role="group" aria-label="Exemples de métiers">
        {METIERS.map(({ nom }, index) => (
          <button
            key={nom}
            type="button"
            className="modules-metier"
            aria-pressed={perso === null && index === metier}
            onClick={() => choisir(index)}
          >
            {nom}
          </button>
        ))}
      </div>

      <p className="modules-resume" aria-live={auto ? 'off' : 'polite'}>
        <b>{actifs.size}</b>
        {perso === null
          ? ` modules conseillés pour ${METIERS[metier].article}`
          : ' modules activés · configuration personnalisée'}
      </p>

      <ul className="modules-liste" data-auto={perso === null ? '' : undefined}>
        {MODULES.map(({ cle, Icone, nom, aide }, rang) => {
          const actif = actifs.has(cle);
          return (
            <li
              key={cle}
              className={cn('module', actif && 'module-actif')}
              style={{ '--rang': rang } as CSSProperties}
            >
              <span className="module-tuile">
                <Icone aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <b>{nom}</b>
                <small>{aide}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={actif}
                aria-label={nom}
                className="module-interrupteur"
                onClick={() => basculer(cle)}
              />
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-meta text-steel-500">
        Exemple de configuration. L’administrateur active ou désactive chaque module à tout moment ; un module désactivé
        disparaît de l’application.
      </p>
    </div>
  );
}
