import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Briefcase,
  Building2,
  Check,
  Hammer,
  Mail,
  MailCheck,
  MapPin,
  Plus,
  ArrowRight,
  Banknote,
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
import { ApercuEspace } from './ApercuEspace';
import { api, messageErreur } from '@/lib/api';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/cn';
import { lienEnLigneClasses } from '@/components/ui/lienActionClasses';

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

const ETAPES = ['Votre compte', 'Email', 'Activité'];

/** Emplacements proposés en un clic à l'étape « Activité ». */
const SUGGESTIONS_EMPLACEMENTS = ['Boutique', 'Dépôt', 'Magasin'];

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
  const nomEntrepriseSaisi = useWatch({ control: formCompte.control, name: 'nomEntreprise' }) ?? '';
  const nomAdminSaisi = useWatch({ control: formCompte.control, name: 'nomAdmin' }) ?? '';
  const emailSaisi = useWatch({ control: formCompte.control, name: 'email' }) ?? '';

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

  function ajouterEmplacement(saisi: string = nouvelEmplacement) {
    const nom = saisi.trim();
    if (nom && !emplacements.includes(nom)) setEmplacements((liste) => [...liste, nom]);
    if (saisi === nouvelEmplacement) setNouvelEmplacement('');
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

  // Après le lien de confirmation, la page est rechargée : le formulaire de
  // l'étape 1 est vide, l'aperçu reprend alors les noms de la session.
  const session = sessionAuMontage ? getSession() : null;
  const libelleSecteur = SECTEURS.find((s) => s.valeur === secteurActivite)?.libelle ?? null;

  const panneauGauche = (
    <div>
      <h2 className="max-w-[18ch] font-display text-[2.375rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-white">
        {etapeEffective === 1
          ? 'Votre espace prend forme.'
          : etapeEffective === 'attente'
            ? 'Vérifiez votre boîte mail.'
            : 'Presque terminé.'}
      </h2>
      <p className="mt-3 max-w-[44ch] text-[1rem] text-white/65">
        {etapeEffective === 1
          ? 'À mesure que vous remplissez le formulaire, voici à quoi ressemblera votre espace NimbaFlow.'
          : etapeEffective === 'attente'
            ? 'Un lien de confirmation vient de partir : cliquez dessus pour activer votre compte et continuer.'
            : 'Votre secteur et vos emplacements préparent vos catégories et vos alertes.'}
      </p>
      <ApercuEspace
        entreprise={session?.entreprise.nom ?? nomEntrepriseSaisi}
        administrateur={session?.utilisateur.nom ?? nomAdminSaisi}
        email={session?.utilisateur.email ?? emailSaisi}
        emailConfirme={etapeEffective === 2}
        motDePasseValide={motDePasseSaisi.length >= 8}
        secteur={libelleSecteur}
        emplacements={emplacements}
        tva={tauxTvaParDefaut}
      />
    </div>
  );

  if (etapeEffective === 'attente') {
    return (
      <AuthLayout
        titre="Confirmez votre email"
        description="Le lien est valable 24 heures."
        etape={{ actuelle: 2, libelles: ETAPES }}
        panneauGauche={panneauGauche}
      >
        <div className="flex flex-col gap-4">
          <span className="inscription-enveloppe" aria-hidden="true">
            <MailCheck />
          </span>
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <div className="flex items-start gap-3 rounded-lg border border-rule bg-paper p-4">
            <Mail className="mt-0.5 size-5 shrink-0 text-action" aria-hidden="true" />
            <p className="text-corps text-steel-700">
              Un lien de confirmation part vers <span className="font-semibold text-ink-900">{emailInscrit}</span>.
            </p>
          </div>
          <ol className="inscription-consignes">
            <li>Ouvrez votre messagerie</li>
            <li>Cliquez sur « Confirmer mon adresse email »</li>
            <li>Vous revenez ici pour décrire votre activité</li>
          </ol>
          {renvoiConfirme ? (
            <Alert variant="success">Nouveau lien envoyé — vérifiez votre boîte mail.</Alert>
          ) : (
            <Button variant="secondary" onClick={renvoyerConfirmation} loading={renvoiEnCours} className="h-12 w-full">
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
        etape={{ actuelle: 3, libelles: ETAPES }}
        panneauGauche={panneauGauche}
      >
        <div className="flex flex-col gap-4">
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <div className="flex flex-col gap-2">
            <span className="text-corps font-semibold text-ink-900">Secteur d’activité</span>
            <div className="grid gap-2.5 min-[420px]:grid-cols-2">
              {SECTEURS.map(({ valeur, libelle, Icone }) => (
                <button
                  key={valeur}
                  type="button"
                  onClick={() => setSecteurActivite(valeur)}
                  aria-pressed={secteurActivite === valeur}
                  className="inscription-secteur"
                >
                  <span className="inscription-secteur-tuile">
                    <Icone className="size-[17px]" aria-hidden="true" />
                  </span>
                  {libelle}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-corps font-semibold text-ink-900">Emplacements de stock</span>
            {emplacements.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {emplacements.map((nom) => (
                  <span
                    key={nom}
                    className="apparition flex h-8 items-center gap-1.5 rounded-full bg-action-wash pr-1.5 pl-3 text-corps font-semibold text-action"
                  >
                    {nom}
                    <button
                      type="button"
                      onClick={() => retirerEmplacement(nom)}
                      aria-label={`Retirer ${nom}`}
                      className="rounded-full p-1 hover:bg-action/20"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  label=""
                  aria-label="Nouvel emplacement"
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
              </div>
              <Button type="button" variant="secondary" onClick={() => ajouterEmplacement()} className="h-[50px] rounded-lg">
                <Plus className="size-4" aria-hidden="true" />
                Ajouter
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-meta text-steel-500">
              <span>Suggestions :</span>
              {SUGGESTIONS_EMPLACEMENTS.filter((nom) => !emplacements.includes(nom)).map((nom) => (
                <button key={nom} type="button" onClick={() => ajouterEmplacement(nom)} className="inscription-suggestion">
                  + {nom}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 min-[420px]:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-corps font-semibold text-ink-900">Devise</span>
              <div className="flex h-[50px] items-center gap-2 rounded-lg border border-rule bg-paper px-3.5 text-corps text-steel-500">
                <Banknote className="size-[17px]" aria-hidden="true" />
                GNF · Franc guinéen
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-corps font-semibold text-ink-900">TVA par défaut</span>
              <div className="inscription-segment">
                {[18, 0].map((valeur) => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setTauxTvaParDefaut(valeur as 0 | 18)}
                    aria-pressed={tauxTvaParDefaut === valeur}
                  >
                    {valeur} %
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button type="button" loading={envoiEnCours} onClick={terminerInscription} className="auth-principal mt-2 w-full">
            Créer mon espace
            {!envoiEnCours && <ArrowRight className="size-[18px]" aria-hidden="true" />}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      titre="Créez votre entreprise"
      description="30 jours d’essai gratuit. Vous serez administrateur et pourrez inviter votre équipe ensuite."
      etape={{ actuelle: 1, libelles: ETAPES }}
      panneauGauche={panneauGauche}
      pied={
        <>
          Vous avez déjà un compte ?{' '}
          <Link to="/connexion" className={lienEnLigneClasses()}>
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
              <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-steel-500">
                <span>Obligatoire :</span>
                <Critere rempli={motDePasseSaisi.length >= 8}>8 caractères</Critere>
                <span>Conseillé :</span>
                <Critere rempli={/\d/.test(motDePasseSaisi)}>un chiffre</Critere>
                <Critere rempli={/[A-Z]/.test(motDePasseSaisi)}>une majuscule</Critere>
              </p>
            </>
          )}
        </div>

        <Button type="submit" loading={formCompte.formState.isSubmitting} className="mt-2 w-full">
          Créer mon compte
          {!formCompte.formState.isSubmitting && <ArrowRight className="size-[18px]" aria-hidden="true" />}
        </Button>
      </form>
    </AuthLayout>
  );
}

function Critere({ rempli, children }: { rempli: boolean; children: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 transition-colors', rempli && 'text-ok')}>
      <Check className={cn('size-3.5 stroke-3', !rempli && 'opacity-35')} aria-hidden="true" />
      {children}
    </span>
  );
}
