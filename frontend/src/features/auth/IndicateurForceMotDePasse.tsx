import { cn } from '@/lib/cn';

/**
 * Heuristique simple (longueur + diversité de caractères), suffisante
 * pour guider visuellement sans prétendre à une vraie analyse d'entropie
 * — la seule règle réellement appliquée reste la validation du
 * formulaire (8 caractères minimum), cet indicateur n'est qu'un repère.
 */
function evaluerForce(motDePasse: string): 0 | 1 | 2 | 3 {
  if (motDePasse.length === 0) return 0;
  let score = 0;
  if (motDePasse.length >= 8) score += 1;
  if (motDePasse.length >= 12) score += 1;
  if (/\d/.test(motDePasse) && /[a-zA-Z]/.test(motDePasse)) score += 1;
  if (/[^a-zA-Z0-9]/.test(motDePasse)) score += 1;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const NIVEAUX = [
  { libelle: '', classe: 'bg-border-subtle' },
  { libelle: 'Faible', classe: 'bg-error' },
  { libelle: 'Moyen', classe: 'bg-warning' },
  { libelle: 'Solide', classe: 'bg-success' },
] as const;

export function IndicateurForceMotDePasse({ motDePasse }: { motDePasse: string }) {
  const force = evaluerForce(motDePasse);
  const niveau = NIVEAUX[force];

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1" role="presentation">
        {[1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              segment <= force ? niveau.classe : 'bg-border-subtle',
            )}
          />
        ))}
      </div>
      {force > 0 && (
        <span
          className={cn(
            'text-xs font-medium',
            force === 1 ? 'text-error' : force === 2 ? 'text-warning' : 'text-success',
          )}
        >
          {niveau.libelle}
        </span>
      )}
    </div>
  );
}
