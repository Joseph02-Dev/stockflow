import type { ReactNode } from 'react';
import { Logo } from '@/components/patterns/Logo';

export function AuthLayout({
  panneauGauche,
  titre,
  description,
  etape,
  children,
  pied,
}: {
  /** Contenu du panneau bleu nuit — propre à chaque page (accroche, liste de repères, retour). */
  panneauGauche: ReactNode;
  titre: string;
  description?: string;
  /** Barre de progression facultative pour les parcours en plusieurs étapes. */
  etape?: { actuelle: number; total: number; libelle: string };
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-background px-4 py-8 md:px-6">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-(--radius-modal) shadow-lg md:grid-cols-2">
        {/* Panneau navy — masqué sur mobile au profit d'un bandeau compact */}
        <div className="hidden flex-col justify-between bg-navy p-8 text-white md:flex">
          <div className="flex items-center gap-2">
            <Logo taille={36} />
            <span className="text-lg font-semibold">StockFlow</span>
          </div>
          {panneauGauche}
        </div>

        {/* Bandeau compact mobile */}
        <div className="flex items-center gap-2 bg-navy px-5 py-4 text-white md:hidden">
          <Logo taille={28} />
          <span className="font-semibold">StockFlow</span>
        </div>

        {/* Formulaire */}
        <div className="flex flex-col justify-center bg-surface p-6 md:p-10">
          {etape && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="font-semibold tracking-wide text-primary uppercase">
                  Étape {etape.actuelle} sur {etape.total}
                </span>
                <span className="text-text-secondary">{etape.libelle}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(etape.actuelle / etape.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <h1 className="text-2xl font-semibold text-text-primary">{titre}</h1>
          {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
          <div className="mt-6">{children}</div>

          {pied && <div className="mt-4 text-center text-sm text-text-secondary">{pied}</div>}
        </div>
      </div>
    </main>
  );
}
