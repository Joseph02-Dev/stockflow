import { Link } from 'react-router-dom';
import { ACTIONS_JOURNAL } from './actionsJournal';
import type { EntreeJournal } from './actionsJournal';

/** « Awa Diallo a suspendu l’accès de Boutique Kaloum », avec le lien vers la fiche. */
export function PhraseJournal({ entree: e }: { entree: EntreeJournal }) {
  const a = ACTIONS_JOURNAL[e.action];
  return (
    <p className="text-corps text-ink-900">
      <span className="font-semibold">{e.operateur.nom}</span> <span className="text-steel-500">{a.verbe}</span>
      {!e.entreprise && e.action === 'CONSULTATION_ENTREPRISE' && e.detail && (
        <span className="text-steel-500"> {e.detail.charAt(0).toLowerCase() + e.detail.slice(1)}</span>
      )}
      {e.entreprise && (
        <>
          {' '}
          <Link to={`/console/entreprises/${e.entreprise.id}`} className="font-semibold text-ink-900 hover:text-action hover:underline">
            {e.entreprise.nom ?? 'Entreprise disparue'}
          </Link>
        </>
      )}
    </p>
  );
}
