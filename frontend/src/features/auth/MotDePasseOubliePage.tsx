import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, MailCheck, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { api, messageErreur } from '@/lib/api';

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
});

type Formulaire = z.infer<typeof schema>;

const panneauGauche = (
  <div className="flex flex-col gap-8">
    <div>
      <h2 className="text-2xl font-semibold text-white">Ça arrive à tout le monde.</h2>
      <p className="mt-3 text-sm text-navy-text">
        Indiquez votre adresse email : si un compte existe, un lien de réinitialisation vous sera envoyé.
      </p>
    </div>
    <div className="flex items-start gap-3 rounded-(--radius-button) bg-navy-light p-3">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-xs text-navy-text">
        Par sécurité, nous ne confirmons jamais si une adresse est associée à un compte — le message reste le
        même dans tous les cas.
      </p>
    </div>
  </div>
);

export function MotDePasseOubliePage() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [emailEnvoye, setEmailEnvoye] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  async function envoyer(valeurs: Formulaire) {
    setErreur(null);
    try {
      await api.post('/auth/forgot-password', valeurs);
      setEmailEnvoye(valeurs.email);
    } catch (error) {
      // forgot-password ne renvoie normalement jamais d'erreur métier
      // (message générique systématique) — seule une panne réseau/serveur
      // atterrirait ici.
      setErreur(messageErreur(error, 'L’envoi a échoué. Réessayez dans un instant.'));
    }
  }

  if (emailEnvoye) {
    return (
      <AuthLayout titre="Lien envoyé" description="Valable 30 minutes." panneauGauche={panneauGauche}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-(--radius-button) bg-background p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-text-secondary">
              Un lien de réinitialisation part vers <span className="font-medium text-text-primary">{emailEnvoye}</span>{' '}
              si un compte y est associé. Si vous n’y avez pas accès, votre administrateur peut réinitialiser votre
              accès depuis les paramètres de l’entreprise.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => envoyer(getValues())} loading={isSubmitting}>
              Renvoyer le lien
            </Button>
            <Link to="/connexion" className="flex-1">
              <Button variant="primary" className="w-full">
                Retour connexion
              </Button>
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      titre="Mot de passe oublié"
      description="Nous vous enverrons un lien pour en choisir un nouveau."
      panneauGauche={panneauGauche}
      pied={
        <Link to="/connexion" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={handleSubmit(envoyer)} className="flex flex-col gap-4" noValidate>
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <Input
          label="Adresse email"
          type="email"
          autoComplete="email"
          icone={<Mail className="size-4" aria-hidden="true" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          Envoyer le lien
        </Button>
      </form>
    </AuthLayout>
  );
}
