import type { ReactNode } from 'react';
import { Logo } from '@/components/patterns/Logo';
import { FondEntrepot3D } from '@/components/patterns/FondEntrepot3D';

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
    <main className="relative isolate flex min-h-full items-center justify-center overflow-hidden bg-paper px-4 py-8 md:px-6">
      {/* Lueur cuivre en haut de page, puis fond animé : derrière la carte, jamais devant. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 size-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-action)_14%,transparent),transparent)]"
      />
      <FondEntrepot3D className="-z-10" />
      <div className="fenetre-entree grid w-full max-w-[980px] grid-cols-1 overflow-hidden rounded-xl border border-rule bg-surface shadow-[0_32px_64px_-28px_rgba(22,23,27,0.35),0_2px_8px_rgba(22,23,27,0.06)] md:grid-cols-[1.05fr_1fr]">
        {/* Panneau d'encre, même dégradé que le bandeau d'action du tableau
            de bord — masqué sur mobile au profit d'un bandeau compact. */}
        <div className="bandeau-action hidden flex-col justify-between gap-10 p-9 text-white md:flex">
          <span className="trame-grille pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className="flex items-center gap-2.5">
            <Logo taille={32} />
            <span className="font-display text-[1.125rem] font-semibold tracking-[-0.02em] text-white">NimbaFlow</span>
          </div>
          <div className="apparition" style={{ animationDelay: '120ms' }}>
            {panneauGauche}
          </div>
          <p className="text-meta text-white/45">Gestion de stock et de ventes · détail, demi-gros et gros</p>
        </div>

        {/* Bandeau compact mobile */}
        <div className="bandeau-action flex items-center gap-2.5 px-5 py-4 text-white md:hidden">
          <Logo taille={28} />
          <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-white">NimbaFlow</span>
        </div>

        {/* Formulaire */}
        <div className="flex flex-col justify-center bg-surface p-6 md:p-12">
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
