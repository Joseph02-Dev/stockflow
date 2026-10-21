import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Check,
  ClipboardList,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  Warehouse,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNombre } from '@/lib/format';

/**
 * Section « Sur téléphone » : trois onglets qui avancent seuls (barre de
 * progression, en pause au survol ou hors écran) et un téléphone dessiné en
 * HTML qui rejoue l'écran correspondant de l'application : vente, stock,
 * mouvements hors ligne. Données d'exemple. Styles dans accueil.css,
 * préfixes `mobile-` et `tel-`.
 */

const DUREE_ONGLET = 6000;

const ONGLETS: { Icone: LucideIcon; titre: string; texte: string }[] = [
  { Icone: ReceiptText, titre: 'Vendre au comptoir', texte: 'Ajoutez les articles, encaissez : le stock suit la vente.' },
  { Icone: Warehouse, titre: 'Le stock à portée de pouce', texte: 'Quantités, seuils et emplacements, partout où vous êtes.' },
  { Icone: WifiOff, titre: 'Même quand le réseau faiblit', texte: 'Les mouvements de stock attendent hors ligne, puis partent seuls.' },
];

/** Étape courante d'une scène : avance de jalon en jalon quand `joue` passe à vrai. */
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

const ARTICLES = [
  { nom: 'Riz parfumé 25 kg', detail: '245 000 GNF / sac · 55 en stock' },
  { nom: 'Sucre en poudre 1 kg', detail: '12 000 GNF / paquet · 125 en stock' },
  { nom: 'Huile végétale 5 L', detail: '95 000 GNF / bidon · 2 en stock' },
] as const;
// Total après chaque étape : riz, + 2 sucres, + huile, puis 2e sac de riz.
const TOTAUX = [0, 245_000, 269_000, 364_000, 364_000, 609_000, 609_000, 609_000];
const JALONS_VENTE = [300, 850, 1400, 2000, 2250, 3100, 3350];

function EcranVente({ joue }: { joue: boolean }) {
  const etape = useChronologie(joue, JALONS_VENTE);
  const valide = etape >= 7;
  return (
    <>
      <p className="tel-titre">Nouvelle vente</p>
      <p className="tel-sous">Client de passage · prix de détail</p>
      <div className="tel-carte">
        {ARTICLES.map(({ nom, detail }, i) => (
          <div key={nom} className={cn('tel-article', etape < i + 1 && 'tel-cache')}>
            <b>{nom}</b>
            <span className="tel-qte">
              <i>−</i>
              <span>{i === 0 ? (etape >= 5 ? 2 : 1) : i === 1 ? 2 : 1}</span>
              <i className={cn(i === 0 && etape === 4 && 'tel-presse')}>+</i>
            </span>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="tel-pied-vente">
        <span>
          <small>Total</small>
          <b>{formatNombre(TOTAUX[etape])} GNF</b>
        </span>
        <span className={cn('tel-valider', etape === 6 && 'tel-presse', valide && 'tel-valide')}>
          {valide ? <Check /> : 'Valider'}
        </span>
      </div>
      <div className={cn('tel-toast', valide && 'tel-toast-visible')}>
        <Check /> Vente enregistrée · stock mis à jour
      </div>
    </>
  );
}

const PRODUITS = [
  { ini: 'EM', nom: 'Eau minérale 1,5 L', qte: '80', unite: 'bouteilles', prix: 5_000, part: 82, seuil: 12, bas: false },
  { ini: 'HV', nom: 'Huile végétale 5 L', qte: '1', unite: 'bidon · seuil 12', prix: 95_000, part: 6, seuil: 48, bas: true },
  { ini: 'LP', nom: 'Lait en poudre 400 g', qte: '39', unite: 'boîtes · seuil 15', prix: 38_000, part: 58, seuil: 22, bas: false },
  { ini: 'RP', nom: 'Riz parfumé 25 kg', qte: '54', unite: 'sacs · Dépôt Madina', prix: 245_000, part: 70, seuil: 18, bas: false },
];
const JALONS_STOCK = [150];

function EcranStock({ joue }: { joue: boolean }) {
  const pleines = useChronologie(joue, JALONS_STOCK) >= 1;
  return (
    <>
      <p className="tel-titre">Produits</p>
      <p className="tel-sous">Votre catalogue, où il se trouve et ce qu’il en reste.</p>
      <div className="tel-carte">
        {PRODUITS.map(({ ini, nom, qte, unite, prix, part, seuil, bas }, i) => (
          <div key={nom} className="tel-produit">
            <span className="tel-ini">{ini}</span>
            <b>{nom}</b>
            <span className={cn('tel-badge', bas ? 'tel-badge-bas' : 'tel-badge-ok')}>{bas ? 'Sous le seuil' : 'En stock'}</span>
            <span className="tel-jauge">
              <i
                className={cn(bas && 'tel-jauge-bas')}
                style={{ width: pleines ? `${part}%` : 0, transitionDelay: `${i * 160}ms` }}
              />
              <s style={{ left: `${seuil}%` }} />
            </span>
            <span className="tel-chiffre">
              <span>
                <b>{qte}</b> {unite}
              </span>
              <span>{formatNombre(prix)} GNF</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const MOUVEMENTS = [
  { sortie: true, titre: 'Sortie · Huile végétale 5 L', detail: '−1 bidon · Boutique' },
  { sortie: false, titre: 'Entrée · Riz parfumé 25 kg', detail: '+20 sacs · Dépôt Madina' },
  { sortie: true, titre: 'Sortie · Sucre en poudre 1 kg', detail: '−6 paquets · Boutique' },
];
const JALONS_RESEAU = [2200, 2700, 3150, 3600, 4200];

function EcranHorsLigne({ joue, surEtat }: { joue: boolean; surEtat: (enLigne: boolean) => void }) {
  const etape = useChronologie(joue, JALONS_RESEAU);
  const enLigne = etape >= 1;
  useEffect(() => surEtat(enLigne), [enLigne, surEtat]);

  const [Icone, classe, texte]: [LucideIcon, string, string] =
    etape === 0
      ? [WifiOff, 'tel-reseau-horsligne', 'Hors ligne · 3 mouvements en attente']
      : etape < 5
        ? [RefreshCw, 'tel-reseau-envoi', 'Connexion retrouvée · envoi…']
        : [Wifi, 'tel-reseau-enligne', 'En ligne · tout est envoyé'];
  return (
    <>
      <p className="tel-titre">Mouvements</p>
      <p className="tel-sous">Saisis sur place, même sans connexion.</p>
      <div className={cn('tel-reseau', classe)}>
        <Icone />
        {texte}
      </div>
      <div className="tel-carte">
        {MOUVEMENTS.map(({ sortie, titre, detail }, i) => {
          const IconeMvt = sortie ? ArrowUpFromLine : ArrowDownToLine;
          return (
            <div key={titre} className={cn('tel-mvt', sortie ? 'tel-mvt-sortie' : 'tel-mvt-entree', etape >= i + 2 && 'tel-mvt-parti')}>
              <span className="tel-mvt-tuile">
                <IconeMvt />
              </span>
              <span className="min-w-0">
                <b>{titre}</b>
                <small>{detail}</small>
              </span>
              <span className="tel-mvt-etat">
                <Check />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const NAV_APP: { Icone: LucideIcon; libelle: string; onglets: number[] }[] = [
  { Icone: LayoutDashboard, libelle: 'Vue d’ensemble', onglets: [] },
  { Icone: ReceiptText, libelle: 'Ventes', onglets: [0] },
  { Icone: Warehouse, libelle: 'Stock', onglets: [1, 2] },
  { Icone: ClipboardList, libelle: 'Commandes', onglets: [] },
];

export function TelephoneAnime({ entete }: { entete: ReactNode }) {
  const racine = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [actif, setActif] = useState(0);
  const [enLigne, setEnLigne] = useState(true);

  useEffect(() => {
    const element = racine.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observateur = new IntersectionObserver(([entree]) => setVisible(entree.isIntersecting), { threshold: 0.25 });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  const reseauAffiche = actif === 2 ? enLigne : true;
  const IconeStatut = reseauAffiche ? Wifi : WifiOff;

  return (
    <div ref={racine} className="mobile-grille">
      <div className="mobile-entete flex min-w-0 flex-col items-start gap-5" data-apparition="">
        {entete}
      </div>
      <div className="mobile-zone-onglets flex min-w-0 flex-col items-start gap-5" data-apparition="">
        <div className="mobile-onglets" role="tablist" aria-label="Le téléphone en action">
          {ONGLETS.map(({ Icone, titre, texte }, index) => (
            <button
              key={titre}
              type="button"
              role="tab"
              aria-selected={index === actif}
              className="mobile-onglet"
              onClick={() => setActif(index)}
              onMouseEnter={() => setSurvol(true)}
              onMouseLeave={() => setSurvol(false)}
            >
              <span className="mobile-onglet-tuile">
                <Icone aria-hidden="true" />
              </span>
              <b>{titre}</b>
              <span className="mobile-onglet-texte">{texte}</span>
              {index === actif && (
                <span
                  key={actif}
                  className="mobile-progression"
                  style={
                    {
                      '--duree': `${DUREE_ONGLET}ms`,
                      animationPlayState: visible && !survol ? 'running' : 'paused',
                    } as CSSProperties
                  }
                  onAnimationEnd={() => setActif((a) => (a + 1) % ONGLETS.length)}
                />
              )}
            </button>
          ))}
        </div>
        <ul className="flex flex-wrap gap-2">
          {['Sans installation', 'Depuis le navigateur', 'Même compte que sur ordinateur'].map((atout) => (
            <li key={atout} className="mobile-puce">
              <Check aria-hidden="true" />
              {atout}
            </li>
          ))}
        </ul>
      </div>

      <div className="mobile-scene" aria-hidden="true" data-apparition="" style={{ '--delai': '120ms' } as CSSProperties}>
        <span className="mobile-halo" />
        <div className="tel">
          <div className="tel-ecran">
            <span className="tel-encoche" />
            <div className="tel-statut">
              <span>14:32</span>
              <span className="inline-flex items-center gap-1">
                <IconeStatut />
                4G
              </span>
            </div>
            <div className="tel-tete">
              <b>
                <span className="tel-logo">
                  {[0, 0, 2, 0, 1, 1, 1, 1, 1].map((v, i) => (
                    <i key={i} className={cn(v === 0 && 'tel-logo-vide', v === 2 && 'tel-logo-cuivre')} />
                  ))}
                </span>
                Boutique Démo
              </b>
              <span className="tel-cloche">
                <Bell />
                <em>4</em>
              </span>
            </div>
            <div className="tel-vues">
              <div className={cn('tel-vue', actif === 0 && 'tel-vue-active')}>
                <EcranVente joue={visible && actif === 0} />
              </div>
              <div className={cn('tel-vue', actif === 1 && 'tel-vue-active')}>
                <EcranStock joue={visible && actif === 1} />
              </div>
              <div className={cn('tel-vue', actif === 2 && 'tel-vue-active')}>
                <EcranHorsLigne joue={visible && actif === 2} surEtat={setEnLigne} />
              </div>
            </div>
            <div className="tel-nav">
              {NAV_APP.map(({ Icone, libelle, onglets }) => (
                <span key={libelle} className={cn(onglets.includes(actif) && 'tel-nav-actif')}>
                  <i>
                    <Icone />
                  </i>
                  {libelle}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
