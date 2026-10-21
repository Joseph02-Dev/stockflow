import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bell, Building2, Check, FileSpreadsheet, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNombre } from '@/lib/format';
import { Compteur } from '@/components/patterns/Compteur';

/**
 * « Comment ça marche » : trois étapes reliées par un rail qui se remplit.
 * Tant que la liste est à l'écran, l'étape active avance seule toutes les
 * 4,4 s et sa scène se joue ; un clic sur un repère y saute. Les autres
 * scènes restent sur leur état final, lisible. Sous prefers-reduced-motion,
 * la boucle continue en version douce (voir accueil.css, préfixe `etape-`).
 */

const ETAPES = [
  {
    titre: 'Créez votre espace',
    texte: 'Votre compte et votre entreprise, puis votre premier emplacement : boutique ou dépôt.',
    Scene: SceneEspace,
  },
  {
    titre: 'Ajoutez vos produits',
    texte: 'Un par un, ou en important votre catalogue depuis un fichier CSV ou Excel.',
    Scene: SceneImport,
  },
  {
    titre: 'Vendez et suivez',
    texte: 'Entrées, ventes et sorties mettent le stock à jour ; les alertes signalent ce qui manque.',
    Scene: SceneVente,
  },
];

const DUREE_ETAPE = 4400;

/**
 * Avance d'un jalon à l'autre quand `joue` passe à vrai ; sinon renvoie la
 * dernière étape (état final).
 */
function useChronologie(joue: boolean, jalons: readonly number[]) {
  const fin = jalons.length;
  const [etape, setEtape] = useState(fin);

  useEffect(() => {
    if (!joue) return;
    const minuteries = [0, ...jalons].map((ms, i) => window.setTimeout(() => setEtape(i), ms));
    return () => minuteries.forEach(window.clearTimeout);
  }, [joue, jalons]);

  return joue ? etape : fin;
}

const NOM_ENTREPRISE = 'Boutique Kaloum';
const JALONS_ESPACE = [1500, 2300, 2600];

function SceneEspace({ joue }: { joue: boolean }) {
  const etape = useChronologie(joue, JALONS_ESPACE);
  const [lettres, setLettres] = useState(NOM_ENTREPRISE.length);
  const ecrit = joue && etape === 0;

  useEffect(() => {
    if (!ecrit) return;
    const minuteries = Array.from({ length: NOM_ENTREPRISE.length + 1 }, (_, i) =>
      window.setTimeout(() => setLettres(i), 300 + i * 70),
    );
    return () => minuteries.forEach(window.clearTimeout);
  }, [ecrit]);

  const pret = etape === 3;
  return (
    <>
      <div>
        <div className="etape-libelle">Entreprise</div>
        <div className="etape-champ">
          {ecrit ? NOM_ENTREPRISE.slice(0, lettres) : NOM_ENTREPRISE}
          {ecrit && <span className="etape-curseur" />}
        </div>
      </div>
      <div>
        <div className="etape-libelle">Premier emplacement</div>
        <div className={cn('etape-choix', etape >= 1 && 'etape-choix-fait')}>
          <i />
          <span>
            <Store /> Boutique
          </span>
          <span>
            <Building2 /> Dépôt
          </span>
        </div>
      </div>
      <div className={cn('etape-valider', etape === 2 && 'etape-presse', pret && 'etape-pret')}>
        {pret && <Check />}
        {pret ? 'Espace prêt' : 'Créer mon espace'}
      </div>
    </>
  );
}

const PRODUITS = [
  ['Riz parfumé 25 kg', '180 sacs'],
  ['Huile Dinor 1 L', '64 btl'],
  ['Sucre en poudre 1 kg', '120 sachets'],
] as const;
const JALONS_IMPORT = [350, 1300, 1650, 2000];

function SceneImport({ joue }: { joue: boolean }) {
  const etape = useChronologie(joue, JALONS_IMPORT);
  const vide = etape === 0;
  return (
    <>
      <div className={cn('etape-fichier', vide && 'etape-cache')}>
        <span className="etape-tuile-ok">
          <FileSpreadsheet />
        </span>
        <span className="min-w-0">
          <b>catalogue.xlsx</b>
          <small>Import en cours</small>
        </span>
        <span className="etape-compte">
          <Compteur valeur={vide ? 0 : 248} format={formatNombre} duree={1300} /> <small>produits</small>
        </span>
      </div>
      <div className="etape-progres">
        <i className={cn(vide && 'etape-progres-vide')} />
      </div>
      <div className="etape-lignes">
        {PRODUITS.map(([nom, qte], i) => (
          <div key={nom} className={cn('etape-ligne', etape < i + 2 && 'etape-cache')}>
            <b>{nom}</b>
            <span>{qte}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const LIGNES_VENTE = [
  ['Huile Dinor 1 L × 2', 50_000],
  ['Riz parfumé 25 kg × 1', 325_000],
] as const;
const JALONS_VENTE = [300, 750, 1100, 2000];

function SceneVente({ joue }: { joue: boolean }) {
  const etape = useChronologie(joue, JALONS_VENTE);
  const vendu = etape === 4;
  return (
    <>
      <div className="etape-ticket">
        <b>Vente n° 1042</b>
        <span>Aujourd’hui, 14:32</span>
      </div>
      <div className="etape-lignes">
        {LIGNES_VENTE.map(([libelle, montant], i) => (
          <div key={libelle} className={cn('etape-ligne', etape < i + 1 && 'etape-cache')}>
            <b>{libelle}</b>
            <span>{formatNombre(montant)}</span>
          </div>
        ))}
      </div>
      <div className="etape-total">
        <span>Total</span>
        <b>
          <Compteur valeur={etape >= 3 ? 375_000 : 0} format={formatNombre} duree={900} /> GNF
        </b>
      </div>
      <div className={cn('etape-stock', vendu && 'etape-vendu')}>
        <span className="etape-stock-nom">Huile Dinor 1 L · stock</span>
        <b>
          <Compteur valeur={vendu ? 10 : 12} format={formatNombre} duree={600} /> btl
        </b>
        <span className="etape-jauge">
          <i />
          <s />
        </span>
        <span className="etape-signal">
          <Bell /> Sous le seuil (11)
        </span>
      </div>
    </>
  );
}

export function EtapesDemarrage() {
  const liste = useRef<HTMLOListElement>(null);
  const [visible, setVisible] = useState(false);
  const [actif, setActif] = useState(0);

  useEffect(() => {
    const element = liste.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observateur = new IntersectionObserver(([entree]) => setVisible(entree.isIntersecting), {
      threshold: 0.2,
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const minuterie = window.setTimeout(() => setActif((a) => (a + 1) % ETAPES.length), DUREE_ETAPE);
    return () => window.clearTimeout(minuterie);
  }, [visible, actif]);

  return (
    <ol
      ref={liste}
      className="etapes"
      style={{ '--progression': actif / (ETAPES.length - 1) } as CSSProperties}
    >
      {ETAPES.map(({ titre, texte, Scene }, index) => (
        <li
          key={titre}
          className={cn('etape', index === actif && 'etape-active', index < actif && 'etape-faite')}
          data-apparition=""
          style={{ '--delai': `${index * 90}ms` } as CSSProperties}
        >
          <button
            type="button"
            className="etape-repere"
            onClick={() => setActif(index)}
            aria-label={`Voir l’étape ${index + 1} en action`}
          >
            {index < actif ? <Check aria-hidden="true" /> : index + 1}
          </button>
          <div className="etape-texte">
            <h3 className="text-[1.125rem] font-semibold text-ink-900">
              <span className="sr-only">Étape {index + 1} : </span>
              {titre}
            </h3>
            <p className="mt-1.5 text-corps leading-relaxed text-steel-700">{texte}</p>
          </div>
          <div className="etape-scene" aria-hidden="true">
            <Scene joue={visible && index === actif} />
          </div>
        </li>
      ))}
    </ol>
  );
}
