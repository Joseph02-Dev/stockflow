import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  Check,
  Package,
  RefreshCw,
  Store,
  Warehouse,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNombre } from '@/lib/format';
import { Compteur } from '@/components/patterns/Compteur';

/**
 * Fait défiler les étapes d'une scène en boucle, seulement quand elle est
 * à l'écran. Avant d'être vue, la scène reste sur sa dernière étape : tout
 * est lisible. Sous prefers-reduced-motion, la boucle continue mais en
 * version douce (transitions courtes, sans rotation ni oscillation : voir
 * accueil.css).
 */
function useEtapes(durees: readonly number[]) {
  const racine = useRef<HTMLDivElement>(null);
  const derniere = durees.length - 1;
  const [etape, setEtape] = useState(derniere);

  useEffect(() => {
    const element = racine.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    let minuterie: number | undefined;
    const suivante = (i: number) => {
      setEtape(i);
      minuterie = window.setTimeout(() => suivante((i + 1) % durees.length), durees[i]);
    };
    const observateur = new IntersectionObserver(([entree]) => {
      window.clearTimeout(minuterie);
      if (entree.isIntersecting) suivante(0);
    });
    observateur.observe(element);
    return () => {
      observateur.disconnect();
      window.clearTimeout(minuterie);
    };
  }, [durees]);

  return { racine, etape };
}

function Scene({ racine, etape, titre, detail, children }: {
  racine: RefObject<HTMLDivElement | null>;
  etape: number;
  titre: string;
  detail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div ref={racine} className="scene" data-etape={etape} aria-hidden="true">
      <div className="scene-tete">
        <b>{titre}</b>
        {detail}
      </div>
      {children}
    </div>
  );
}

const DUREES_LIEUX = [300, 4900] as const;
const LIEUX: { Icone: LucideIcon; nom: string; quantite: number; part: string }[] = [
  { Icone: Store, nom: 'Boutique', quantite: 48, part: '38%' },
  { Icone: Warehouse, nom: 'Dépôt', quantite: 120, part: '94%' },
  { Icone: Package, nom: 'Magasin', quantite: 12, part: '10%' },
];

/** Les jauges de chaque emplacement se remplissent, les quantités montent. */
export function SceneEmplacements() {
  const { racine, etape } = useEtapes(DUREES_LIEUX);
  const plein = etape === 1;
  return (
    <Scene racine={racine} etape={etape} titre="Riz parfumé 25 kg" detail={<span>3 emplacements</span>}>
      <div className="scene-lieux">
        {LIEUX.map(({ Icone, nom, quantite, part }) => (
          <div key={nom} className="scene-lieu" style={{ '--part': part } as CSSProperties}>
            <span className="scene-tuile scene-cuivre">
              <Icone />
            </span>
            <span>{nom}</span>
            <span className="scene-jauge">
              <i />
            </span>
            <span className="scene-qte">
              <Compteur valeur={plein ? quantite : 0} format={formatNombre} duree={900} /> <small>sacs</small>
            </span>
          </div>
        ))}
      </div>
      <div className="scene-total">
        <span>Total</span>
        <b>
          <Compteur valeur={plein ? 180 : 0} format={formatNombre} duree={900} /> sacs
        </b>
      </div>
    </Scene>
  );
}

const DUREES_SEUIL = [1400, 4800] as const;

/** Le stock passe sous la ligne de seuil : la cloche sonne, l'alerte apparaît. */
export function SceneSeuil() {
  const { racine, etape } = useEtapes(DUREES_SEUIL);
  return (
    <Scene racine={racine} etape={etape} titre="Huile Dinor 1 L" detail={<span>seuil : 10</span>}>
      <div className="scene-seuil">
        <div className="scene-cuve">
          <span className="scene-niveau" />
          <span className="scene-ligne-seuil" />
        </div>
        <div className="scene-seuil-info">
          <div>
            <div className="scene-grand">
              <Compteur valeur={etape === 1 ? 6 : 18} format={formatNombre} duree={1400} />
              <small>bidons</small>
            </div>
            <div className="scene-rappel">en stock</div>
          </div>
          <div className="scene-alerte">
            <span className="scene-tuile scene-faible scene-cloche">
              <Bell />
            </span>
            <span>
              <b>Sous le seuil</b>
              <br />à recommander
            </span>
          </div>
        </div>
      </div>
    </Scene>
  );
}

const DUREES_JOURNAL = [400, 900, 900, 3400] as const;
const MOUVEMENTS: { Icone: LucideIcon; classe: string; titre: string; detail: string; delta: string }[] = [
  { Icone: ArrowDownToLine, classe: 'scene-ok', titre: 'Entrée · Sucre 1 kg', detail: 'Dépôt · Awa · 08:12', delta: '+24' },
  { Icone: ArrowUpFromLine, classe: 'scene-rupture', titre: 'Vente · Riz 25 kg', detail: 'Boutique · Moussa · 10:40', delta: '−3' },
  { Icone: ArrowLeftRight, classe: 'scene-cuivre', titre: 'Transfert · Huile 1 L', detail: 'Dépôt → Boutique · 11:05', delta: '10' },
];

/** Les mouvements s'inscrivent dans l'historique l'un après l'autre. */
export function SceneJournal() {
  const { racine, etape } = useEtapes(DUREES_JOURNAL);
  return (
    <Scene racine={racine} etape={etape} titre="Historique" detail={<span>aujourd’hui</span>}>
      <div className="scene-journal">
        {MOUVEMENTS.map(({ Icone, classe, titre, detail, delta }, i) => (
          <div key={titre} className={cn('scene-mvt', classe, i < etape && 'scene-visible')}>
            <span className="scene-tuile">
              <Icone />
            </span>
            <span className="scene-quoi">
              <b>{titre}</b>
              <span>{detail}</span>
            </span>
            <span className="scene-delta">{delta}</span>
          </div>
        ))}
      </div>
    </Scene>
  );
}

const DUREES_RESEAU = [1800, 1800, 2800] as const;
const EN_ATTENTE = ['Sortie · Lait 400 g', 'Entrée · Savon', 'Vente · Sucre 1 kg'];
const ETATS_RESEAU: { Icone: LucideIcon; texte: string }[] = [
  { Icone: WifiOff, texte: 'Hors ligne' },
  { Icone: RefreshCw, texte: 'Envoi…' },
  { Icone: Wifi, texte: 'En ligne' },
];

/** Saisies en attente hors connexion, puis envoyées au retour du réseau. */
export function SceneHorsLigne() {
  const { racine, etape } = useEtapes(DUREES_RESEAU);
  const { Icone, texte } = ETATS_RESEAU[etape];
  return (
    <Scene
      racine={racine}
      etape={etape}
      titre="Saisies sur téléphone"
      detail={
        <span className="scene-puce scene-reseau">
          <Icone className={cn(etape === 1 && 'scene-tourne')} />
          {texte}
        </span>
      }
    >
      <div className="scene-file">
        {EN_ATTENTE.map((libelle, i) => (
          <div key={libelle} className={cn('scene-attente', etape >= 1 && 'scene-partie')} style={{ transitionDelay: etape === 1 ? `${500 + i * 450}ms` : '0ms' }}>
            <span className="scene-point" />
            <span>{libelle}</span>
            <span>en attente</span>
          </div>
        ))}
        <div className="scene-fini">
          <div>
            <span className="scene-rond">
              <Check />
            </span>
            Tout est envoyé
          </div>
        </div>
      </div>
    </Scene>
  );
}
