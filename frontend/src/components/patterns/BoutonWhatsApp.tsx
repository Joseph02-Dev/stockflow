import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { lienWhatsApp } from '@/lib/whatsapp';

/**
 * Lien WhatsApp (fond #25D366, texte blanc). Rendu seulement si un
 * numéro est renseigné : sans numéro, pas de bouton, plutôt qu'un bouton
 * inactif à expliquer.
 */
export function BoutonWhatsApp({
  telephone,
  texte,
  libelle,
  compact = false,
  className,
}: {
  telephone: string | null;
  texte: string;
  libelle: string;
  compact?: boolean;
  className?: string;
}) {
  if (!telephone) return null;
  return (
    <a
      href={lienWhatsApp(telephone, texte)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-whatsapp font-medium whitespace-nowrap text-white transition-colors hover:bg-whatsapp-dark focus-visible:outline-whatsapp',
        compact ? 'h-8 px-3 text-corps' : 'h-9 px-3.5 text-corps',
        className,
      )}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {libelle}
      <span className="sr-only"> (ouvre WhatsApp dans un nouvel onglet)</span>
    </a>
  );
}
