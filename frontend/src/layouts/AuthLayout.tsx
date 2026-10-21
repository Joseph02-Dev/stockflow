import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/patterns/Logo';
import './auth.css';

/**
 * Écrans d'authentification en plein écran : panneau d'encre à gauche (dès
 * lg), propre à chaque page, et formulaire à droite. Sur mobile et tablette,
 * seul le formulaire reste, sous une barre compacte. Styles dans auth.css.
 */
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
    <main className="auth-ecran">
      <aside className="auth-panneau">
        <Link to="/" className="flex w-fit items-center gap-2.5 rounded-sm text-white">
          <Logo taille={32} />
          <span className="font-display text-[1.1875rem] font-semibold tracking-[-0.02em]">NimbaFlow</span>
        </Link>
        <div className="apparition" style={{ animationDelay: '120ms' }}>
          {panneauGauche}
        </div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-white/45">
          <span>Détail, demi-gros et gros</span>
          <span>Montants en GNF</span>
          <span>Ordinateur, tablette et téléphone</span>
        </p>
      </aside>

      <section className="auth-cote">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 rounded-sm text-ink-900 lg:invisible">
            <Logo taille={28} />
            <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em]">NimbaFlow</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-sm text-corps font-medium text-steel-500 transition-colors hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour à l’accueil
          </Link>
        </div>

        <div className="auth-centre">
          <div className="auth-formulaire fenetre-entree">
            {etape && (
              <div className="mb-5">
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

            <h1 className="font-display text-[1.875rem] leading-[1.15] font-semibold tracking-[-0.025em] text-ink-900">
              {titre}
            </h1>
            {description && <p className="mt-2 text-[0.96875rem] text-steel-500">{description}</p>}
            <div className="mt-7">{children}</div>

            {pied && <div className="mt-5 text-center text-corps text-steel-500">{pied}</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
