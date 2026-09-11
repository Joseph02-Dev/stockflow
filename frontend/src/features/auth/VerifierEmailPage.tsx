import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { api, messageErreur } from '@/lib/api';
import { setSession } from '@/lib/session';
import type { Session } from '@/lib/session';

const panneauGauche = (
  <div className="flex flex-col gap-8">
    <div>
      <h2 className="text-2xl font-semibold text-white">Dernière étape.</h2>
      <p className="mt-3 text-sm text-navy-text">
        Un instant pendant que nous confirmons votre adresse email et activons votre compte.
      </p>
    </div>
  </div>
);

type Statut = 'en-cours' | 'reussi' | 'echec';

export function VerifierEmailPage() {
  const navigate = useNavigate();
  const [parametres] = useSearchParams();
  const token = parametres.get('token') ?? '';
  const [statut, setStatut] = useState<Statut>(token ? 'en-cours' : 'echec');
  const [erreur, setErreur] = useState<string | null>(
    token ? null : 'Ce lien est incomplet — le jeton de confirmation est manquant.',
  );
  // La confirmation ne doit être tentée qu'une seule fois : en StrictMode,
  // useEffect s'exécute deux fois en développement, et un jeton à usage
  // unique échouerait bruyamment au second essai sans cette garde.
  const dejaTente = useRef(false);

  useEffect(() => {
    if (!token || dejaTente.current) return;
    dejaTente.current = true;

    api
      .post<Session>('/auth/verify-email', { token })
      .then(({ data }) => {
        setSession(data);
        setStatut('reussi');
        // Laisse le message de succès visible un court instant avant de
        // poursuivre vers l'étape suivante de l'inscription.
        setTimeout(() => navigate('/inscription', { replace: true }), 1200);
      })
      .catch((error) => {
        setStatut('echec');
        setErreur(messageErreur(error, 'Lien de confirmation invalide, déjà utilisé, ou expiré.'));
      });
  }, [token, navigate]);

  return (
    <AuthLayout titre="Confirmation de votre email" panneauGauche={panneauGauche}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        {statut === 'en-cours' && (
          <>
            <div className="size-10 animate-spin rounded-full border-4 border-border-subtle border-t-primary" />
            <p className="text-sm text-text-secondary">Confirmation en cours…</p>
          </>
        )}
        {statut === 'reussi' && (
          <>
            <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
            <p className="text-sm text-text-secondary">Compte activé. Redirection…</p>
          </>
        )}
        {statut === 'echec' && (
          <>
            <XCircle className="size-10 text-error" aria-hidden="true" />
            {erreur && (
              <div className="w-full">
                <Alert variant="error">{erreur}</Alert>
              </div>
            )}
            <Link to="/connexion" className="w-full">
              <Button variant="primary" className="w-full">
                Retour à la connexion
              </Button>
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
