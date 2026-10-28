import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/patterns/Logo';
import { cn } from '@/lib/cn';
import { estLanceeCommeAppli } from '@/lib/installation';
import './auth.css';
import { boutonClasses } from '@/components/ui/boutonClasses';

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
  /** Parcours en plusieurs temps : une barre par étape, avec son libellé. */
  etape?: { actuelle: number; libelles: string[] };
  children: ReactNode;
  pied?: ReactNode;
}) {
  // Application installée : pas de page d'accueil publique, le logo mène à la connexion.
  const appli = estLanceeCommeAppli();
  const accueil = appli ? '/connexion' : '/';
  return (
    <main className="auth-ecran">
      <aside className="auth-panneau">
        <Link to={accueil} className="flex w-fit items-center gap-2.5 rounded-sm text-white">
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
          <Link to={accueil} className="flex items-center gap-2.5 rounded-sm text-ink-900 lg:invisible">
            <Logo taille={28} />
            <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em]">NimbaFlow</span>
          </Link>
          {!appli && (
            <Link
              to="/"
              className={boutonClasses('ghost', '-mr-3 text-steel-500', { taille: 'sm' })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour à l’accueil
            </Link>
          )}
        </div>

        <div className="auth-centre">
          <div className="auth-formulaire fenetre-entree">
            {etape && (
              <ol className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${etape.libelles.length}, minmax(0, 1fr))` }}>
                {etape.libelles.map((libelle, index) => {
                  const numero = index + 1;
                  const etat = numero < etape.actuelle ? 'fait' : numero === etape.actuelle ? 'actif' : 'avenir';
                  return (
                    <li key={libelle} aria-current={etat === 'actif' ? 'step' : undefined}>
                      <span className="block h-1 overflow-hidden rounded-full bg-rule">
                        <span
                          className={cn(
                            'block h-full rounded-full transition-[width] duration-500',
                            etat === 'avenir' ? 'w-0' : 'w-full',
                            etat === 'fait' ? 'bg-ok' : 'bg-action',
                          )}
                        />
                      </span>
                      <span
                        className={cn(
                          'mt-1.5 block truncate text-meta font-semibold',
                          etat === 'fait' ? 'text-ok' : etat === 'actif' ? 'text-action' : 'text-steel-400',
                        )}
                      >
                        {numero} · {libelle}
                      </span>
                    </li>
                  );
                })}
              </ol>
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
