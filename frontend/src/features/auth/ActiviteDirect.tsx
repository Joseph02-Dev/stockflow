import { useEffect, useState } from 'react';
import { ArrowDownToLine, Bell, ReceiptText, RefreshCw, type LucideIcon } from 'lucide-react';

/**
 * Activité d'une boutique qui défile dans le panneau de connexion : une
 * carte entre en haut toutes les 2,8 s, les autres descendent puis
 * s'effacent. Données d'exemple, purement décoratives (aria-hidden). Styles
 * dans layouts/auth.css (préfixe `activite-`).
 */

const EVENEMENTS: { Icone: LucideIcon; teinte: string; titre: string; detail: string; valeur: string }[] = [
  { Icone: ReceiptText, teinte: 'bg-[#f27a35]/18 text-[#f6a06d]', titre: 'Vente n° 1042', detail: 'Boutique · il y a un instant', valeur: '609 000 GNF' },
  { Icone: Bell, teinte: 'bg-[#e8b33c]/16 text-[#e8b33c]', titre: 'Huile végétale 5 L sous le seuil', detail: 'Reste 1 bidon · seuil 12', valeur: '' },
  { Icone: RefreshCw, teinte: 'bg-[#3ebe94]/16 text-[#6fd3b1]', titre: '3 mouvements envoyés', detail: 'Saisis hors ligne au dépôt', valeur: '' },
  { Icone: ArrowDownToLine, teinte: 'bg-[#6fa0e6]/16 text-[#9cc0f0]', titre: 'Entrée · Riz parfumé 25 kg', detail: 'Dépôt Madina', valeur: '+20 sacs' },
  { Icone: ReceiptText, teinte: 'bg-[#f27a35]/18 text-[#f6a06d]', titre: 'Vente n° 1043', detail: 'Boutique · client Diallo', valeur: '95 000 GNF' },
];

const ECART_PX = 70;
const VISIBLES = 4;
const DELAI_MS = 2800;

export function ActiviteDirect() {
  // Compteur d'événements émis : la carte n a pour contenu EVENEMENTS[n % 5].
  const [emis, setEmis] = useState(3);
  // Faux au premier rendu de chaque nouvelle carte : elle part du haut, invisible.
  const [pose, setPose] = useState(true);

  useEffect(() => {
    const minuterie = window.setInterval(() => {
      setPose(false);
      setEmis((n) => n + 1);
    }, DELAI_MS);
    return () => window.clearInterval(minuterie);
  }, []);

  useEffect(() => {
    if (pose) return;
    const image = requestAnimationFrame(() => requestAnimationFrame(() => setPose(true)));
    return () => cancelAnimationFrame(image);
  }, [pose]);

  // Cartes affichées, de la plus récente (rang 0) à la plus ancienne.
  const cartes = Array.from({ length: VISIBLES + 1 }, (_, rang) => emis - 1 - rang).filter((n) => n >= 0);

  return (
    <div className="mt-8 max-w-[440px]" aria-hidden="true">
      <p className="mb-3 flex items-center gap-2 text-meta font-semibold tracking-[0.04em] text-white/60 uppercase">
        <i className="activite-pouls" />
        Activité de la boutique · exemple
      </p>
      <div className="activite-flux">
        {cartes.map((n, rang) => {
          const { Icone, teinte, titre, detail, valeur } = EVENEMENTS[n % EVENEMENTS.length];
          const entrante = rang === 0 && !pose;
          const position = entrante ? -ECART_PX : rang * ECART_PX;
          const opacite = entrante || rang >= VISIBLES ? 0 : 1 - rang * 0.14;
          return (
            <div
              key={n}
              className="activite-carte"
              style={{ transform: `translateY(${position}px)`, opacity: opacite }}
            >
              <span className={`activite-tuile ${teinte}`}>
                <Icone />
              </span>
              <span className="min-w-0">
                <b className="block truncate text-[0.875rem] font-semibold text-white">{titre}</b>
                <small className="text-[0.78125rem] text-white/55">{detail}</small>
              </span>
              <span className="font-mono text-[0.8125rem] font-semibold whitespace-nowrap text-white">{valeur}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
