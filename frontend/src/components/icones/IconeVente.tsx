import { cn } from '@/lib/cn';
import './iconeVente.css';

/** Chariot animé de la vente (icône A retenue). Décoratif : le libellé est porté par le lien. */
export function IconeVente({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('icone-vente', className)}
    >
      <rect className="colis" x="11" y="5" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
      <g className="caisse">
        <path d="M2 4h3l2.6 11.2a1.5 1.5 0 0 0 1.5 1.2h9.6a1.5 1.5 0 0 0 1.5-1.1L22 8H6.2" />
        <circle className="roue" cx="10" cy="21" r="1.7" />
        <circle className="roue" cx="18" cy="21" r="1.7" />
      </g>
    </svg>
  );
}
