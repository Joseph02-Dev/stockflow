import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Hammer,
  Mail,
  MailCheck,
  MapPin,
  Plus,
  ShieldCheck,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ChampMotDePasse } from './ChampMotDePasse';
import { IndicateurForceMotDePasse } from './IndicateurForceMotDePasse';
import { api, messageErreur } from '@/lib/api';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/cn';

const schemaCompte = z.object({
  nomEntreprise: z.string().min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères.'),
  nomAdmin: z.string().min(2, 'Votre nom doit contenir au moins 2 caractères.'),
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
});

type FormulaireCompte = z.infer<typeof schemaCompte>;

const SECTEURS = [
  { valeur: 'MATERIAUX', libelle: 'Matériaux', Icone: Building2 },
  { valeur: 'COMMERCE', libelle: 'Commerce', Icone: ShoppingBag },
  { valeur: 'ARTISANAT', libelle: 'Artisanat', Icone: Hammer },
  { valeur: 'AUTRE', libelle: 'Autre', Icone: Briefcase },
] as const;

type Secteur = (typeof SECTEURS)[number]['valeur'];

const ETAPES = [
  { numero: 1, titre: 'Compte administrateur', description: 'Nom de l’entreprise, votre identité et vos accès.' },
  { numero: 2, titre: 'Votre activité', description: 'Secteur, emplacements et TVA par défaut.' },
];

export function InscriptionPage() {
  const navigate = useNavigate();
  const [etape, setEtape] = useState<1 | 2 | 'attente'>(1);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [emailInscrit, setEmailInscrit] = useState('');
  const [renvoiEnCours, setRenvoiEnCours] = useState(false);
  const [renvoiConfirme, setRenvoiConfirme] = useState(false);

  // Une session peut déjà exister à l'arrivée sur cette page dans un seul
  // cas légitime : la personne vient de cliquer le lien de confirmation
  // reçu par email (qui connecte automatiquement). On vérifie alors si
  // l'étape 2 reste à faire, plutôt que de la renvoyer systématiquement
  // vers le dashboard.
  const [sessionAuMontage] = useState(() => getSession() !== null);
  const emplacementsExistants = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<unknown[]>('/emplacements')).data,
    enabled: sessionAuMontage,
  });

  const formCompte = useForm<FormulaireCompte>({ resolver: zodResolver(schemaCompte) });
  const motDePasseSaisi = useWatch({ control: formCompte.control, name: 'password' }) ?? '';

  // Étape 2 : pas un formulaire react-hook-form classique — une sélection
  // de puces et une liste dynamique s'y prêtent mieux qu'un schéma de
  // validation champ par champ.
  const [secteurActivite, setSecteurActivite] = useState<Secteur | null>(null);
  const [emplacements, setEmplacements] = useState<string[]>([]);
  const [nouvelEmplacement, setNouvelEmplacement] = useState('');
  const [tauxTvaParDefaut, setTauxTvaParDefaut] = useState<0 | 18 | null>(18);

  async function creerCompte(valeurs: FormulaireCompte) {
    setErreur(null);
    try {
      await api.post('/auth/register', valeurs);
      setEmailInscrit(valeurs.email);
      setEtape('attente');
    } catch (error) {
      setErreur(messageErreur(error, 'La création du compte a échoué.'));
    }
  }

  async function renvoyerConfirmation() {
    setRenvoiEnCours(true);
    try {
      await api.post('/auth/resend-verification', { email: emailInscrit });
      setRenvoiConfirme(true);
    } catch {
      // resend-verification ne renvoie normalement jamais d'erreur
      // métier (message générique systématique, même non-fuite que
      // forgot-password) — un échec ici serait réseau/serveur ; rien de
      // plus utile à afficher qu'un nouvel essai possible.
    } finally {
      setRenvoiEnCours(false);
    }
  }

  function ajouterEmplacement() {
    const nom = nouvelEmplacement.trim();
    if (!nom) return;
    if (emplacements.includes(nom)) {
      setNouvelEmplacement('');
      return;
    }
    setEmplacements((liste) => [...liste, nom]);
    setNouvelEmplacement('');
  }

  function retirerEmplacement(nom: string) {
    setEmplacements((liste) => liste.filter((e) => e !== nom));
  }

  async function terminerInscription() {
    setErreur(null);
    if (emplacements.length === 0) {
      setErreur('Ajoutez au moins un emplacement de stock.');
      return;
    }
    setEnvoiEnCours(true);
    try {
      // L'entreprise existe déjà (créée à l'étape 1) : secteur et TVA
      // sont une mise à jour partielle, pas une nouvelle création.
      if (secteurActivite || tauxTvaParDefaut !== null) {
        await api.patch('/entreprise', {
          ...(secteurActivite ? { secteurActivite } : {}),
          ...(tauxTvaParDefaut !== null ? { tauxTvaParDefaut } : {}),
        });
      }
      // Créés séquentiellement plutôt qu'en parallèle : en cas d'échec
      // partiel, l'ordre reste prévisible et le message d'erreur clair
      // (pas de promesses concurrentes dont on ne sait plus laquelle a
      // échoué).
      for (const nom of emplacements) {
        await api.post('/emplacements', { nom });
      }
      navigate('/', { replace: true });
    } catch (error) {
      setErreur(messageErreur(error, 'La création a échoué.'));
    } finally {
      setEnvoiEnCours(false);
    }
  }

  // Une session existe mais on ne sait pas encore si l'étape 2 reste à
  // faire : mieux vaut ne rien afficher qu'un écran qui clignote.
  if (sessionAuMontage && emplacementsExistants.isLoading) {
    return null;
  }
  if (sessionAuMontage && emplacementsExistants.data && emplacementsExistants.data.length > 0) {
    return <Navigate to="/" replace />;
  }
  // Valeur dérivée plutôt qu'un setState en cours de rendu : la reprise
  // après confirmation d'email saute directement à l'étape 2.
  const etapeEffective = sessionAuMontage && emplacementsExistants.data ? 2 : etape;
  // Pour la liste de repères du panneau gauche : "attente" doit afficher
  // l'étape 1 comme terminée et l'étape 2 comme pas encore commencée,
  // sans complexifier la comparaison numérique existante.
  const etapeNumero = etapeEffective === 'attente' ? 1.5 : etapeEffective;

  const panneauGauche = (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-semibold text-white">
          {etapeEffective === 1
            ? 'Deux étapes, et votre inventaire est prêt.'
            : etapeEffective === 'attente'
              ? 'Vérifiez votre boîte mail.'
              : 'Presque terminé.'}
        </h2>
        <p className="mt-3 text-sm text-navy-text">
          {etapeEffective === 1
            ? 'Vous créez d’abord votre compte administrateur, puis vous décrivez votre activité et vos emplacements.'
            : etapeEffective === 'attente'
              ? 'Un lien de confirmation vient de partir — cliquez dessus pour activer votre compte et continuer.'
              : 'Ces réglages définissent vos catégories et vos alertes par défaut.'}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {ETAPES.map((e) => (
          <li key={e.numero} className="flex items-start gap-3 py-2">
            <span
              className={
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                (e.numero < etapeNumero
                  ? 'bg-success text-white'
                  : e.numero === etapeNumero
                    ? 'bg-primary text-white'
                    : 'bg-navy-light text-navy-text')
              }
            >
              {e.numero < etapeNumero ? <CheckCircle2 className="size-4" aria-hidden="true" /> : e.numero}
            </span>
            <div>
              <p className={'text-sm font-medium ' + (e.numero <= etapeNumero ? 'text-white' : 'text-navy-text')}>
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

  if (etapeEffective === 'attente') {
    return (
      <AuthLayout titre="Confirmez votre email" description="Valable 24 heures." panneauGauche={panneauGauche}>
        <div className="flex flex-col gap-4">
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <div className="flex items-start gap-3 rounded-(--radius-button) bg-background p-4">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-text-secondary">
              Un lien de confirmation part vers{' '}
              <span className="font-medium text-text-primary">{emailInscrit}</span>. Cliquez dessus pour activer
              votre compte administrateur et poursuivre vers l’étape suivante.
            </p>
          </div>
          {renvoiConfirme ? (
            <Alert variant="success">Nouveau lien envoyé — vérifiez votre boîte mail.</Alert>
          ) : (
            <Button variant="secondary" onClick={renvoyerConfirmation} loading={renvoiEnCours} className="w-full">
              Renvoyer le lien
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  if (etapeEffective === 2) {
    return (
      <AuthLayout
        titre="Votre activité"
        description="Ces réglages définissent vos catégories et vos alertes par défaut."
        etape={{ actuelle: 2, total: 2, libelle: 'Votre activité' }}
        panneauGauche={panneauGauche}
      >
        <div className="flex flex-col gap-4">
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">Secteur d’activité</span>
            <div className="grid grid-cols-2 gap-2">
              {SECTEURS.map(({ valeur, libelle, Icone }) => (
                <button
                  key={valeur}
                  type="button"
                  onClick={() => setSecteurActivite(valeur)}
                  aria-pressed={secteurActivite === valeur}
                  className={cn(
                    'flex items-center gap-2 rounded-(--radius-button) border px-3 py-2 text-sm font-medium transition-colors',
                    secteurActivite === valeur
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border-subtle text-text-secondary hover:bg-background',
                  )}
                >
                  <Icone className="size-4 shrink-0" aria-hidden="true" />
                  {libelle}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">Emplacements de stock</span>
            {emplacements.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {emplacements.map((nom) => (
                  <span
                    key={nom}
                    className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pr-1.5 pl-3 text-sm font-medium text-primary"
                  >
                    {nom}
                    <button
                      type="button"
                      onClick={() => retirerEmplacement(nom)}
                      aria-label={`Retirer ${nom}`}
                      className="rounded-full p-0.5 hover:bg-primary/20"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                label=""
                placeholder="Dépôt Madina"
                autoComplete="off"
                icone={<MapPin className="size-4" aria-hidden="true" />}
                value={nouvelEmplacement}
                onChange={(event) => setNouvelEmplacement(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    ajouterEmplacement();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={ajouterEmplacement}>
                <Plus className="size-4" aria-hidden="true" />
                Ajouter
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">Devise</span>
              <div className="flex h-9 items-center rounded-(--radius-button) border border-border-subtle bg-background px-3 text-sm text-text-secondary">
                GNF · Franc guinéen
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">TVA par défaut</span>
              <div className="flex gap-2">
                {[18, 0].map((valeur) => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setTauxTvaParDefaut(valeur as 0 | 18)}
                    aria-pressed={tauxTvaParDefaut === valeur}
                    className={cn(
                      'flex-1 rounded-(--radius-button) border px-3 py-2 text-sm font-medium transition-colors',
                      tauxTvaParDefaut === valeur
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border-subtle text-text-secondary hover:bg-background',
                    )}
                  >
                    {valeur}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button type="button" loading={envoiEnCours} onClick={terminerInscription} className="mt-2 w-full">
            Créer mon espace
          </Button>
        </div>
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
