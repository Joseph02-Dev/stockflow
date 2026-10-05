import { Fenetre } from './Fenetre';
import type { FenetreProps } from './Fenetre';

/**
 * Panneau latéral droit (430 px, pleine hauteur), pour les formulaires de
 * plus d'une dizaine de champs qui ne justifient pas de quitter la liste.
 * Sous 768 px : feuille montante. Structure en trois zones : voir Fenetre.
 */
export function Drawer(props: FenetreProps) {
  return <Fenetre {...props} variante="tiroir" largeur="max-w-[430px]" />;
}
