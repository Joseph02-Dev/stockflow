import { useRef, useState, type KeyboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Check, KeyRound, Loader2, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { ErreurImage, televerserImage } from '@/lib/televerserImage';
import { getSession, setSession, sessionActuelleEstPersistante } from '@/lib/session';
import { useSession } from '@/lib/useSession';
import { definirPreference, usePreferenceTheme } from '@/lib/theme';
import { DROITS, MODES_APPARENCE } from '@/features/parametres/donnees';
import './profil.css';

const ICONES_MODE = { light: Sun, dark: Moon, auto: Monitor };

/**
 * Fenêtre « Mon profil » : identité et photo, ce que le rôle permet,
 * apparence de cet appareil, mot de passe (lien par email) et déconnexion.
 * Nom, email et rôle ne se modifient pas ici : le serveur ne l'expose pas.
 */
export function ProfilModal({
  ouvert,
  onFermer,
  onDeconnecter,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onDeconnecter: () => void;
}) {
  const session = useSession();
  const preference = usePreferenceTheme();
  const fichierRef = useRef<HTMLInputElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const [photoEnAttente, setPhotoEnAttente] = useState<string>();
  const [televersement, setTeleversement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const utilisateur = session?.utilisateur;
  const droits = DROITS.find((d) => d.role === utilisateur?.role) ?? DROITS[1];
  const initiales = utilisateur?.nom
    .split(' ')
    .map((partie) => partie[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const photo = photoEnAttente ?? utilisateur?.photoUrl ?? undefined;

  function fermer() {
    setPhotoEnAttente(undefined);
    setErreur(null);
    lienMotDePasse.reset();
    onFermer();
  }

  async function surSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    event.target.value = ''; // permet de resélectionner le même fichier ensuite
    if (!fichier) return;
    setErreur(null);
    setTeleversement(true);
    try {
      setPhotoEnAttente(await televerserImage(fichier, 'utilisateurs'));
    } catch (err) {
      setErreur(err instanceof ErreurImage ? err.message : messageErreur(err, 'L’envoi de l’image a échoué.'));
    } finally {
      setTeleversement(false);
    }
  }

  const enregistrer = useMutation({
    mutationFn: async (photoUrl: string) => api.patch('/users/me/photo', { photoUrl }),
    onSuccess: (_reponse, photoUrl) => {
      setErreur(null);
      const courante = getSession();
      if (courante) {
        setSession({ ...courante, utilisateur: { ...courante.utilisateur, photoUrl } }, sessionActuelleEstPersistante());
      }
      setPhotoEnAttente(undefined);
    },
    onError: (err) => setErreur(messageErreur(err, 'La mise à jour a échoué.')),
  });

  // Même route que « Mot de passe oublié » : le lien part vers l'email du compte.
  const lienMotDePasse = useMutation({
    mutationFn: async () => api.post('/auth/forgot-password', { email: utilisateur?.email }),
  });

  // Motif ARIA « radiogroup » : ← → ↑ ↓ changent de mode.
  function surToucheMode(e: KeyboardEvent, index: number) {
    const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = (index + pas + MODES_APPARENCE.length) % MODES_APPARENCE.length;
    definirPreference(MODES_APPARENCE[suivant].valeur);
    modesRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[suivant]?.focus();
  }

  return (
    <Modal
      ouvert={ouvert}
      onFermer={fermer}
      titre="Mon profil"
      large
      modifie={!!photoEnAttente}
      pied={
        <Button variant="secondary" onClick={fermer}>
          Fermer
        </Button>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <div className="profil-couverture" aria-hidden="true" />
          <div className="-mt-9 flex items-end gap-4 px-2">
            <div className="relative shrink-0">
              <span className="profil-avatar">
                {televersement ? (
                  <Loader2 className="size-7 animate-spin" aria-hidden="true" />
                ) : photo ? (
                  <img src={photo} alt="" className="size-full object-cover" />
                ) : (
                  initiales
                )}
              </span>
              <button
                type="button"
                onClick={() => fichierRef.current?.click()}
                disabled={televersement || enregistrer.isPending}
                aria-label="Changer la photo de profil"
                title="Changer la photo"
                className="profil-appareil"
              >
                <Camera className="size-4" aria-hidden="true" />
              </button>
              <input
                ref={fichierRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={surSelection}
                className="hidden"
              />
            </div>
            <div className="min-w-0 pb-1">
              <p className="truncate font-display text-[21px] leading-tight font-semibold text-ink-900">{utilisateur?.nom}</p>
              <p className="text-corps break-all text-steel-500">{utilisateur?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-rule bg-paper px-2.5 text-meta font-semibold text-steel-700">
              <span className="size-[7px] rounded-full" style={{ background: droits.teinte }} aria-hidden="true" />
              {droits.libelle}
            </span>
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-rule bg-paper px-2.5 text-meta font-semibold text-steel-700">
              <span className="size-[7px] rounded-full bg-ok" aria-hidden="true" />
              {session?.entreprise.nom}
            </span>
          </div>
        </div>

        {erreur && <Alert variant="error">{erreur}</Alert>}

        {photoEnAttente && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2.5 rounded-lg border border-action/30 bg-action-wash px-3 py-2.5 text-corps text-ink-900"
          >
            <span className="min-w-0 flex-1 basis-56">Nouvelle photo prête. Elle remplacera l’actuelle partout dans l’application.</span>
            <Button variant="secondary" taille="sm" onClick={() => setPhotoEnAttente(undefined)} disabled={enregistrer.isPending}>
              Annuler
            </Button>
            <Button taille="sm" onClick={() => enregistrer.mutate(photoEnAttente)} loading={enregistrer.isPending}>
              Enregistrer
            </Button>
          </div>
        )}

        <section className="profil-bloc" aria-labelledby="profil-droits">
          <header>
            <span className="profil-pastille" style={{ '--teinte': droits.teinte } as React.CSSProperties} aria-hidden="true">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h3 id="profil-droits" className="text-[14.5px] font-semibold text-ink-900">
                Ce que votre rôle permet
              </h3>
              <p className="text-meta text-steel-400">Fixé par un administrateur</p>
            </div>
          </header>
          <ul className="grid gap-x-3.5 gap-y-1.5 px-3.5 py-3 text-corps text-steel-700 sm:grid-cols-2">
            {droits.droits.map((droit) => (
              <li key={droit} className="flex gap-2">
                <Check className="mt-0.5 size-[15px] shrink-0" style={{ color: droits.teinte }} aria-hidden="true" />
                {droit}
              </li>
            ))}
          </ul>
        </section>

        <section className="profil-bloc" aria-labelledby="profil-apparence">
          <header>
            <span className="profil-pastille" style={{ '--teinte': 'var(--color-accent)' } as React.CSSProperties} aria-hidden="true">
              <Palette className="size-4" />
            </span>
            <div>
              <h3 id="profil-apparence" className="text-[14.5px] font-semibold text-ink-900">
                Apparence
              </h3>
              <p className="text-meta text-steel-400">Sur cet appareil seulement</p>
            </div>
          </header>
          <div ref={modesRef} role="radiogroup" aria-labelledby="profil-apparence" className="grid grid-cols-3 gap-2 px-3.5 py-3">
            {MODES_APPARENCE.map((mode, i) => {
              const Icone = ICONES_MODE[mode.valeur];
              const choisi = mode.valeur === preference;
              return (
                <button
                  key={mode.valeur}
                  type="button"
                  role="radio"
                  aria-checked={choisi}
                  tabIndex={choisi ? 0 : -1}
                  onClick={() => definirPreference(mode.valeur)}
                  onKeyDown={(e) => surToucheMode(e, i)}
                  className="profil-mode"
                >
                  <Icone className="size-5" aria-hidden="true" />
                  {mode.libelle}
                </button>
              );
            })}
          </div>
        </section>

        <section className="profil-bloc" aria-labelledby="profil-securite">
          <header>
            <span className="profil-pastille" style={{ '--teinte': 'var(--color-ok)' } as React.CSSProperties} aria-hidden="true">
              <KeyRound className="size-4" />
            </span>
            <h3 id="profil-securite" className="text-[14.5px] font-semibold text-ink-900">
              Sécurité
            </h3>
          </header>
          <div className="profil-ligne">
            <div className="min-w-0 flex-1 basis-52">
              <p className="text-[14px] font-semibold text-ink-900">Mot de passe</p>
              <p className={lienMotDePasse.isSuccess ? 'text-corps text-ok' : 'text-corps text-steel-500'} aria-live="polite">
                {lienMotDePasse.isSuccess
                  ? `Lien envoyé à ${utilisateur?.email}, valable 30 minutes.`
                  : lienMotDePasse.isError
                    ? messageErreur(lienMotDePasse.error, 'L’envoi a échoué. Réessayez dans un instant.')
                    : 'Recevez par email un lien pour le changer.'}
              </p>
            </div>
            <Button
              variant="secondary"
              taille="sm"
              onClick={() => lienMotDePasse.mutate()}
              loading={lienMotDePasse.isPending}
              disabled={lienMotDePasse.isSuccess}
            >
              {lienMotDePasse.isSuccess ? 'Lien envoyé' : 'Envoyer le lien'}
            </Button>
          </div>
          <div className="profil-ligne">
            <div className="min-w-0 flex-1 basis-52">
              <p className="text-[14px] font-semibold text-ink-900">Cet appareil</p>
              <p className="text-corps text-steel-500">
                {sessionActuelleEstPersistante()
                  ? 'Vous restez connecté ici, même après fermeture.'
                  : 'Votre session se ferme avec le navigateur.'}
              </p>
            </div>
            <Button variant="secondary" taille="sm" onClick={onDeconnecter} className="text-rupture!">
              <LogOut className="size-4" aria-hidden="true" />
              Déconnexion
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
