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
  /** Contenu du panneau d'encre — propre à chaque page (accroche, liste de repères, retour). */
  panneauGauche: ReactNode;
  titre: string;
  description?: string;
  /** Barre de progression facultative pour les parcours en plusieurs étapes. */
  etape?: { actuelle: number; total: number; libelle: string };
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-paper px-4 py-8 md:px-6">
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-xl border border-rule shadow-pop md:grid-cols-2">
        {/* Panneau d'encre, même dégradé que le bandeau d'action du tableau
            de bord — masqué sur mobile au profit d'un bandeau compact. */}
        <div className="bandeau-action hidden flex-col justify-between gap-10 p-8 text-white md:flex">
          <div className="flex items-center gap-2.5">
            <Logo taille={34} />
            <span className="text-panneau text-white">StockFlow</span>
          </div>
          {panneauGauche}
        </div>

        {/* Bandeau compact mobile */}
        <div className="bandeau-action flex items-center gap-2.5 px-5 py-4 text-white md:hidden">
          <Logo taille={28} />
          <span className="text-panneau text-white">StockFlow</span>
        </div>

        {/* Formulaire */}
        <div className="flex flex-col justify-center bg-surface p-6 md:p-10">
          {etape && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between text-meta">
                <span className="font-semibold text-action">
                  Étape {etape.actuelle} sur {etape.total}
                </span>
                <span className="text-steel-500">{etape.libelle}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-rule">
                <div
                  className="h-full rounded-full bg-action transition-all"
                  style={{ width: `${(etape.actuelle / etape.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          <h1 className="text-titre text-ink-900">{titre}</h1>
          {description && <p className="mt-1 text-corps text-steel-500">{description}</p>}
          <div className="mt-6">{children}</div>

          {pied && <div className="mt-4 text-center text-corps text-steel-500">{pied}</div>}
        </div>
      </div>
    </main>
  );
}
