import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, KeyRound, Mail, RotateCcwClock, ShieldCheck, Smartphone, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Logo } from '@/components/patterns/Logo';
import { ChampMotDePasse } from '@/features/auth/ChampMotDePasse';
import { messageErreur } from '@/lib/api';
import { apiConsole } from './api';
import { setSessionConsole, useSessionConsole } from './session';
import type { SessionConsole } from './session';
import './console.css';

const GARANTIES = [
  { Icone: RotateCcwClock, texte: 'Chaque connexion et chaque action sont journalisées' },
  { Icone: Timer, texte: 'Session limitée à 2 heures, sans renouvellement' },
  { Icone: Smartphone, texte: 'Double authentification obligatoire' },
  { Icone: ShieldCheck, texte: 'Aucun accès aux mots de passe des entreprises' },
];

/** Réponse de la première étape (mot de passe) : code attendu, ou enrôlement de la double authentification. */
type Etape =
  | { etape: 'CODE'; jetonEtape: string }
  | { etape: 'ENROLEMENT'; jetonEtape: string; secret: string; otpauth: string };

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  motDePasse: z.string().min(1, 'Le mot de passe est requis.'),
});

type Formulaire = z.infer<typeof schema>;

const schemaCode = z.object({ code: z.string().regex(/^\d{6}$/, 'Saisissez les 6 chiffres affichés par l’application.') });
type FormulaireCode = z.infer<typeof schemaCode>;

/**
 * Connexion opérateur. Volontairement sobre, et sans lien « créer un
 * compte » : un opérateur ne se crée qu'en ligne de commande.
 */
export function ConsoleConnexionPage() {
  const session = useSessionConsole();
  const navigate = useNavigate();
  const [etape, setEtape] = useState<Etape | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [majuscules, setMajuscules] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  if (session) return <Navigate to="/console/apercu" replace />;

  async function onSubmit(valeurs: Formulaire) {
    setErreur(null);
    try {
      const { data } = await apiConsole.post<Etape>('/console/auth/login', valeurs);
      setEtape(data);
    } catch (error) {
      setErreur(messageErreur(error, 'Email ou mot de passe incorrect.'));
    }
  }

  async function valider(code: string) {
    const { data } = await apiConsole.post<SessionConsole>('/console/auth/code', { jetonEtape: etape!.jetonEtape, code });
    setSessionConsole(data);
    navigate('/console/apercu', { replace: true });
  }

  return (
    <main className="console-connexion">
      <section className="flex flex-col gap-8 px-5 pt-7 md:justify-between md:px-12 md:py-10 md:pb-24">
        <div className="flex items-center gap-2.5">
          <Logo taille={30} />
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold">NimbaFlow</p>
            <p className="text-meta text-console-clair">Console opérateur</p>
          </div>
        </div>
        <div>
          <h1 className="max-w-[440px] font-display text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.02em] md:text-[2.5rem]">
            L’exploitation de la plateforme, sous contrôle.
          </h1>
          <p className="mt-3 max-w-[420px] text-corps text-white/70">
            Accès réservé aux opérateurs. Les comptes se créent uniquement depuis le serveur.
          </p>
          <ul className="mt-5 flex flex-col gap-2.5 text-corps text-white/80">
            {GARANTIES.map(({ Icone, texte }) => (
              <li key={texte} className="flex items-center gap-2.5">
                <Icone className="size-[17px] shrink-0 text-console-clair" strokeWidth={1.75} aria-hidden="true" />
                {texte}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid place-items-center px-4 pt-6 pb-10 md:p-8">
        <div className="w-full max-w-[400px] rounded-[22px] bg-surface p-7 text-ink-900 shadow-pop">
          {etape ? (
            <EtapeCode
              etape={etape}
              valider={valider}
              recommencer={() => {
                setEtape(null);
                setErreur(null);
              }}
            />
          ) : (
            <>
              <h2 className="font-display text-[1.5rem] font-semibold">Console opérateur</h2>
              <p className="mt-1 text-corps text-steel-500">Connecte-toi avec ton compte opérateur.</p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
                {erreur && <Alert variant="error">{erreur}</Alert>}
                <Input
                  label="Adresse email"
                  type="email"
                  autoComplete="username"
                  icone={<Mail className="size-4" aria-hidden="true" />}
                  error={errors.email?.message}
                  {...register('email')}
                />
                <ChampMotDePasse
                  label="Mot de passe"
                  autoComplete="current-password"
                  error={errors.motDePasse?.message}
                  hint={majuscules ? 'Majuscules verrouillées' : undefined}
                  onKeyUp={(e) => setMajuscules(e.getModifierState('CapsLock'))}
                  {...register('motDePasse')}
                />
                <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
                  Se connecter
                </Button>
              </form>
            </>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-meta text-steel-400">
            <ShieldCheck className="size-[15px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Chaque connexion est inscrite au journal d’audit.
          </p>
        </div>
      </section>
    </main>
  );
}

/**
 * Seconde étape : le code à 6 chiffres de l'application d'authentification.
 * Au premier passage, l'opérateur scanne d'abord le QR code (ou saisit la
 * clé à la main) ; le premier code juste confirme l'enrôlement.
 */
function EtapeCode({
  etape,
  valider,
  recommencer,
}: {
  etape: Etape;
  valider: (code: string) => Promise<void>;
  recommencer: () => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormulaireCode>({ resolver: zodResolver(schemaCode) });
  const enrolement = etape.etape === 'ENROLEMENT' ? etape : null;

  useEffect(() => {
    if (!enrolement) return;
    let actif = true;
    void QRCode.toDataURL(enrolement.otpauth, {
      margin: 1,
      width: 200,
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (actif) setQr(url);
    });
    return () => {
      actif = false;
    };
  }, [enrolement]);

  async function onSubmit({ code }: FormulaireCode) {
    setErreur(null);
    try {
      await valider(code);
    } catch (error) {
      setErreur(messageErreur(error, 'Code incorrect ou expiré.'));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={recommencer}
        className="mb-3 inline-flex items-center gap-1 text-meta font-semibold text-steel-500 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Recommencer
      </button>
      <h2 className="font-display text-[1.5rem] font-semibold">
        {enrolement
          ? 'Active la double authentification'
          : 'Code de vérification'}
      </h2>
      <p className="mt-1 text-corps text-steel-500">
        {enrolement
          ? 'Scanne ce QR code avec Google Authenticator, Microsoft Authenticator ou 2FAS, puis saisis le code affiché.'
          : 'Saisis le code à 6 chiffres affiché par ton application d’authentification.'}
      </p>

      {enrolement && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-rule p-4">
          {qr ? (
            <img
              src={qr}
              width={200}
              height={200}
              alt="QR code de la double authentification"
              className="rounded-md bg-white"
            />
          ) : (
            <div
              className="size-[200px] animate-pulse rounded-md bg-survol"
              aria-hidden="true"
            />
          )}
          <a
            href={enrolement.otpauth}
            className="text-meta font-semibold text-action hover:underline"
          >
            Sur ce téléphone : ouvrir dans l’application
          </a>
          <div className="w-full text-center">
            <p className="text-meta text-steel-500">
              Ou saisis cette clé à la main :
            </p>
            <p className="mt-1 font-mono text-[13px] break-all text-ink-900 select-all">
              {enrolement.secret.match(/.{1,4}/g)?.join(' ')}
            </p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-5 flex flex-col gap-4"
        noValidate
      >
        {erreur && <Alert variant="error">{erreur}</Alert>}
        <Input
          label="Code à 6 chiffres"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          icone={<KeyRound className="size-4" aria-hidden="true" />}
          error={errors.code?.message}
          {...register('code')}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          {enrolement ? 'Activer et se connecter' : 'Vérifier'}
        </Button>
      </form>
    </>
  );
}
