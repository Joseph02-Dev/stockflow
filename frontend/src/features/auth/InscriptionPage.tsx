import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, CheckCircle2, Mail, MapPin, ShieldCheck, User } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ChampMotDePasse } from './ChampMotDePasse';
import { IndicateurForceMotDePasse } from './IndicateurForceMotDePasse';
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

const ETAPES = [
  { numero: 1, titre: 'Compte administrateur', description: 'Nom de l’entreprise, votre identité et vos accès.' },
  { numero: 2, titre: 'Premier emplacement', description: 'Où stockez-vous vos produits.' },
];

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
  const motDePasseSaisi = useWatch({ control: formCompte.control, name: 'password' }) ?? '';

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

  const panneauGauche = (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-semibold text-white">
          {etape === 1 ? 'Deux étapes, et votre inventaire est prêt.' : 'Presque terminé.'}
        </h2>
        <p className="mt-3 text-sm text-navy-text">
          {etape === 1
            ? 'Vous créez d’abord votre compte administrateur, puis vous indiquez où vous stockez vos produits.'
            : 'Un dernier champ, et vous accédez directement à votre tableau de bord.'}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {ETAPES.map((e) => (
          <li key={e.numero} className="flex items-start gap-3 py-2">
            <span
              className={
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                (e.numero < etape
                  ? 'bg-success text-white'
                  : e.numero === etape
                    ? 'bg-primary text-white'
                    : 'bg-navy-light text-navy-text')
              }
            >
              {e.numero < etape ? <CheckCircle2 className="size-4" aria-hidden="true" /> : e.numero}
            </span>
            <div>
              <p className={'text-sm font-medium ' + (e.numero <= etape ? 'text-white' : 'text-navy-text')}>
                {e.titre}
              </p>
              <p className="text-xs text-navy-text">{e.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-2 rounded-(--radius-button) bg-navy-light p-3 text-xs text-navy-text">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        Vos données restent hébergées sur votre espace, exportables à tout moment.
      </div>
    </div>
  );

  if (etape === 2) {
    return (
      <AuthLayout
        titre="Votre premier emplacement"
        description="Un dépôt, une boutique — vous pourrez en ajouter d’autres ensuite."
        etape={{ actuelle: 2, total: 2, libelle: 'Compte administrateur' }}
        panneauGauche={panneauGauche}
      >
        <form onSubmit={formEmplacement.handleSubmit(creerEmplacement)} className="flex flex-col gap-4" noValidate>
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <Input
            label="Nom de l’emplacement"
            placeholder="Entrepôt principal"
            autoComplete="off"
            icone={<MapPin className="size-4" aria-hidden="true" />}
            error={formEmplacement.formState.errors.nom?.message}
            {...formEmplacement.register('nom')}
          />
          <Input
            label="Adresse (facultatif)"
            autoComplete="off"
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
      description="Vous serez administrateur et pourrez inviter vos gestionnaires ensuite."
      etape={{ actuelle: 1, total: 2, libelle: 'Compte administrateur' }}
      panneauGauche={panneauGauche}
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
          icone={<Building2 className="size-4" aria-hidden="true" />}
          error={formCompte.formState.errors.nomEntreprise?.message}
          {...formCompte.register('nomEntreprise')}
        />
        <Input
          label="Votre nom"
          autoComplete="name"
          icone={<User className="size-4" aria-hidden="true" />}
          error={formCompte.formState.errors.nomAdmin?.message}
          {...formCompte.register('nomAdmin')}
        />
        <Input
          label="Adresse email"
          type="email"
          autoComplete="email"
          icone={<Mail className="size-4" aria-hidden="true" />}
          error={formCompte.formState.errors.email?.message}
          {...formCompte.register('email')}
        />
        <div className="flex flex-col gap-1.5">
          <ChampMotDePasse
            label="Mot de passe"
            autoComplete="new-password"
            error={formCompte.formState.errors.password?.message}
            {...formCompte.register('password')}
          />
          {!formCompte.formState.errors.password && (
            <>
              <IndicateurForceMotDePasse motDePasse={motDePasseSaisi} />
              <p className="text-xs text-text-secondary">Au moins 8 caractères.</p>
            </>
          )}
        </div>

        <Button type="submit" loading={formCompte.formState.isSubmitting} className="mt-2 w-full">
          Continuer
        </Button>
      </form>
    </AuthLayout>
  );
}
