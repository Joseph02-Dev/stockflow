import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { api, messageErreur } from '@/lib/api';
import { getSession, setSession } from '@/lib/session';
import type { Session } from '@/lib/session';

const schemaCompte = z.object({
  nomEntreprise: z.string().min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères.'),
  nomAdmin: z.string().min(2, 'Votre nom doit contenir au moins 2 caractères.'),
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
});

const schemaEmplacement = z.object({
  nom: z.string().min(2, 'Le nom de l’emplacement doit contenir au moins 2 caractères.'),
  adresse: z.string().optional(),
});

type FormulaireCompte = z.infer<typeof schemaCompte>;
type FormulaireEmplacement = z.infer<typeof schemaEmplacement>;

export function InscriptionPage() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState<1 | 2>(1);
  const [erreur, setErreur] = useState<string | null>(null);

  // Évalué une seule fois au montage : un utilisateur déjà connecté n'a
  // rien à faire ici et repart vers le dashboard. En revanche, la session
  // créée à l'étape 1 ne doit PAS déclencher cette redirection, sinon le
  // parcours serait interrompu avant l'étape 2.
  const [dejaConnecteAuMontage] = useState(() => getSession() !== null);

  const formCompte = useForm<FormulaireCompte>({ resolver: zodResolver(schemaCompte) });
  const formEmplacement = useForm<FormulaireEmplacement>({ resolver: zodResolver(schemaEmplacement) });

  async function creerCompte(valeurs: FormulaireCompte) {
    setErreur(null);
    try {
      const { data } = await api.post<Session>('/auth/register', valeurs);
      setSession(data);
      setEtape(2);
    } catch (error) {
      setErreur(messageErreur(error, 'La création du compte a échoué.'));
    }
  }

  async function creerEmplacement(valeurs: FormulaireEmplacement) {
    setErreur(null);
    try {
      await api.post('/emplacements', {
        nom: valeurs.nom,
        ...(valeurs.adresse ? { adresse: valeurs.adresse } : {}),
      });
      navigate('/', { replace: true });
    } catch (error) {
      setErreur(messageErreur(error, 'La création de l’emplacement a échoué.'));
    }
  }

  if (dejaConnecteAuMontage) {
    return <Navigate to="/" replace />;
  }

  if (etape === 2) {
    return (
      <AuthLayout
        titre="Votre premier emplacement"
        sousTitre="Étape 2 sur 2 — où stockez-vous vos produits ?"
      >
        <form onSubmit={formEmplacement.handleSubmit(creerEmplacement)} className="flex flex-col gap-4" noValidate>
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <Input
            label="Nom de l’emplacement"
            placeholder="Entrepôt principal"
            error={formEmplacement.formState.errors.nom?.message}
            {...formEmplacement.register('nom')}
          />
          <Input
            label="Adresse (facultatif)"
            error={formEmplacement.formState.errors.adresse?.message}
            {...formEmplacement.register('adresse')}
          />

          <Button type="submit" loading={formEmplacement.formState.isSubmitting} className="mt-2 w-full">
            Terminer
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      titre="Créer votre entreprise"
      sousTitre="Étape 1 sur 2 — votre compte administrateur."
      pied={
        <>
          Vous avez déjà un compte ?{' '}
          <Link to="/connexion" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={formCompte.handleSubmit(creerCompte)} className="flex flex-col gap-4" noValidate>
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <Input
          label="Nom de l’entreprise"
          error={formCompte.formState.errors.nomEntreprise?.message}
          {...formCompte.register('nomEntreprise')}
        />
        <Input
          label="Votre nom"
          autoComplete="name"
          error={formCompte.formState.errors.nomAdmin?.message}
          {...formCompte.register('nomAdmin')}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={formCompte.formState.errors.email?.message}
          {...formCompte.register('email')}
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          hint="Au moins 8 caractères."
          error={formCompte.formState.errors.password?.message}
          {...formCompte.register('password')}
        />

        <Button type="submit" loading={formCompte.formState.isSubmitting} className="mt-2 w-full">
          Continuer
        </Button>
      </form>
    </AuthLayout>
  );
}
