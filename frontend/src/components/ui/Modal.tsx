import { Fenetre } from './Fenetre';
import type { FenetreProps } from './Fenetre';

interface ModalProps extends FenetreProps {
  /** Largeur sur bureau : 460 px par défaut, 520 px pour un formulaire plus dense. */
  large?: boolean;
}

/**
 * Fenêtre centrée, pour un formulaire court (jusqu'à une dizaine de
 * champs) ou une confirmation. Au-delà, préférer Drawer. Sous 768 px :
 * feuille montante. Structure en trois zones : voir Fenetre.
 */
export function Modal({ large = false, ...props }: ModalProps) {
  return <Fenetre {...props} variante="modale" largeur={large ? 'max-w-[520px]' : 'max-w-[460px]'} />;
}
