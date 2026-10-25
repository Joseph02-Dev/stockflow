import { useSyncExternalStore } from 'react';

/**
 * Installation de l'application (PWA). Chrome et Edge (Android, Windows,
 * macOS, Linux) annoncent qu'elle est installable par l'événement
 * beforeinstallprompt : on le garde pour le bouton « Installer
 * l'application ». Safari (iPhone, iPad) n'a pas cet événement :
 * l'installation passe par Partager → « Sur l'écran d'accueil ».
 */
interface InvitationInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let invitation: InvitationInstallation | null = null;
let installee = false;
const abonnes = new Set<() => void>();
const notifier = () => abonnes.forEach((rappel) => rappel());

/** Ouverte depuis son icône (fenêtre d'application), et non dans un onglet du navigateur. */
export function estLanceeCommeAppli(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function estAppliInstallee(): boolean {
  return installee || estLanceeCommeAppli();
}

/** iPhone, iPad (y compris iPadOS qui se présente comme un Mac). */
export function estAppareilApple(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function ecouterInstallation(): void {
  window.addEventListener('beforeinstallprompt', (evenement) => {
    // Pas de bandeau automatique du navigateur : l'invitation passe par le menu.
    evenement.preventDefault();
    invitation = evenement as InvitationInstallation;
    notifier();
  });
  window.addEventListener('appinstalled', () => {
    invitation = null;
    installee = true;
    notifier();
  });
}

export type ModeInstallation = 'invitation' | 'apple' | null;

function modeActuel(): ModeInstallation {
  if (estAppliInstallee()) return null;
  if (invitation) return 'invitation';
  return estAppareilApple() ? 'apple' : null;
}

function souscrire(rappel: () => void) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

/** Comment proposer l'installation ici : invitation du navigateur, guide Safari, ou rien (déjà installée, navigateur incompatible). */
export function useModeInstallation(): ModeInstallation {
  return useSyncExternalStore(souscrire, modeActuel, () => null);
}

/** Ouvre la fenêtre d'installation du navigateur. Vrai si la personne a accepté. */
export async function installerAppli(): Promise<boolean> {
  if (!invitation) return false;
  const courante = invitation;
  invitation = null;
  await courante.prompt();
  const { outcome } = await courante.userChoice;
  notifier();
  return outcome === 'accepted';
}
