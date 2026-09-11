import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ChampMotDePasse } from './ChampMotDePasse';
import { IndicateurForceMotDePasse } from './IndicateurForceMotDePasse';
import { api, messageErreur } from '@/lib/api';

const schema = z.object({
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
});

type Formulaire = z.infer<typeof schema>;

const panneauGauche = (
  <div className="flex flex-col gap-8">
    <div>
      <h2 className="text-2xl font-semibold text-white">Choisissez un nouveau mot de passe.</h2>
      <p className="mt-3 text-sm text-navy-text">
        Toutes vos sessions actives seront déconnectées par sécurité — vous devrez vous reconnecter partout.
      </p>
    </div>
    <div className="flex items-start gap-3 rounded-(--radius-button) bg-navy-light p-3">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-xs text-navy-text">Ce lien n’est valable que 30 minutes et ne peut servir qu’une seule fois.</p>
    </div>
  </div>
);

export function ReinitialiserMotDePassePage() {
  const navigate = useNavigate();
  const [parametres] = useSearchParams();
  const token = parametres.get('token') ?? '';
  const [erreur, setErreur] = useState<string | null>(null);
  const [reussi, setReussi] = useState(false);

  const { register, handleSubmit, control, formState } = useForm<Formulaire>({ resolver: zodResolver(schema) });
  const motDePasseSaisi = useWatch({ control, name: 'password' }) ?? '';

  async function reinitialiser(valeurs: Formulaire) {
    setErreur(null);
    if (!token) {
      setErreur('Ce lien est invalide : le jeton de réinitialisation est manquant.');
      return;
    }
    try {
      await api.post('/auth/reset-password', { token, password: valeurs.password });
      setReussi(true);
      setTimeout(() => navigate('/connexion', { replace: true }), 2500);
    } catch (error) {
      setErreur(messageErreur(error, 'Lien invalide, déjà utilisé, ou expiré.'));
    }
  }

  if (reussi) {
    return (
      <AuthLayout titre="Mot de passe modifié" panneauGauche={panneauGauche}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Redirection vers la connexion…</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      titre="Réinitialiser le mot de passe"
      description="Choisissez un nouveau mot de passe pour votre compte."
      panneauGauche={panneauGauche}
      pied={
        <Link to="/connexion" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={handleSubmit(reinitialiser)} className="flex flex-col gap-4" noValidate>
        {!token && (
          <Alert variant="error">
            Ce lien est incomplet — le jeton de réinitialisation est manquant. Redemandez un lien depuis la page
            précédente.
          </Alert>
        )}
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <div className="flex flex-col gap-1.5">
          <ChampMotDePasse
            label="Nouveau mot de passe"
            autoComplete="new-password"
            error={formState.errors.password?.message}
            {...register('password')}
          />
          {!formState.errors.password && (
            <>
              <IndicateurForceMotDePasse motDePasse={motDePasseSaisi} />
              <p className="text-xs text-text-secondary">Au moins 8 caractères.</p>
            </>
          )}
        </div>

        <Button type="submit" loading={formState.isSubmitting} disabled={!token} className="mt-2 w-full">
          Réinitialiser le mot de passe
        </Button>
      </form>
    </AuthLayout>
  );
}
