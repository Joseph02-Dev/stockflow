import { cn } from '@/lib/cn';
import { formatNombre } from '@/lib/format';

/** Seuil à partir duquel la jauge passe à l'orange. */
const SEUIL_VIGILANCE = 0.8;

/**
 * Ce que doit un client face à son plafond de crédit. Le dépassement est
 * dit en toutes lettres : la couleur ne porte jamais seule l'information.
 */
export function JaugeCredit({ solde, plafond }: { solde: number; plafond: number }) {
  const depasse = solde > plafond;
  const ratio = plafond > 0 ? solde / plafond : 0;
  const teinte = depasse ? 'var(--color-rupture)' : ratio >= SEUIL_VIGILANCE ? 'var(--color-faible)' : 'var(--color-ok)';
  return (
    <div className="clients-credit">
      <p className="clients-credit-ligne">
        <span>
          Doit <b className={cn('font-semibold', depasse ? 'text-rupture' : 'text-ink-900')}>{formatNombre(solde)}</b> /{' '}
          {formatNombre(plafond)} GNF
        </span>
        <span className={cn('whitespace-nowrap', depasse && 'font-semibold text-rupture')}>
          {depasse ? 'Plafond dépassé' : `${Math.round(ratio * 100)} %`}
        </span>
      </p>
      <div className="clients-jauge" aria-hidden="true">
        <i style={{ width: `${depasse ? 100 : ratio * 100}%`, background: teinte }} />
      </div>
    </div>
  );
}
