import { useEffect, useSyncExternalStore } from 'react';
import axios from 'axios';
import { api } from './api';
import { estAppareilApple, estLanceeCommeAppli } from './installation';

/**
 * Notifications push des alertes (Web Push) sur cet appareil : affichées
 * par le système, avec le son du téléphone, même application fermée ou
 * appareil en veille (service worker, public/sw.js).
 *
 * L'appareil n'est abonné que tant qu'une personne y est connectée :
 * désabonné à la déconnexion, réabonné à la connexion suivante si la
 * permission avait déjà été donnée.
 */
export type EtatPush =
  | 'chargement'
  /** Navigateur sans push, ou push non configuré sur le serveur. */
  | 'indisponible'
  /** iPhone, iPad : le push n'existe que dans l'application installée. */
  | 'installer'
  /** Permission refusée : seuls les réglages du navigateur peuvent la rendre. */
  | 'refuse'
  | 'inactif'
  | 'actif';

let etat: EtatPush = 'chargement';
let clePubliqueServeur: Promise<string | null> | null = null;
const abonnes = new Set<() => void>();

function changerEtat(nouveau: EtatPush) {
  etat = nouveau;
  abonnes.forEach((rappel) => rappel());
}

function pushPrisEnCharge(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Clé publique du serveur (une lecture par chargement) ; null si le push n'y est pas configuré. */
function clePublique(): Promise<string | null> {
  clePubliqueServeur ??= api
    .get<{ clePublique: string | null }>('/notifications/push/cle')
    .then((r) => r.data.clePublique)
    .catch(() => {
      clePubliqueServeur = null;
      return null;
    });
  return clePubliqueServeur;
}

function octetsDepuisBase64Url(texte: string): Uint8Array<ArrayBuffer> {
  const base64 = (texte + '='.repeat((4 - (texte.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function memeCle(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const octets = new Uint8Array(a);
  return octets.every((octet, i) => octet === b[i]);
}

async function abonnementActuel(): Promise<PushSubscription | null> {
  const enregistrement = await navigator.serviceWorker.ready;
  return enregistrement.pushManager.getSubscription();
}

/** Abonne cet appareil (ou confirme son abonnement) auprès du serveur. */
async function abonner(cle: string): Promise<void> {
  const enregistrement = await navigator.serviceWorker.ready;
  const cleServeur = octetsDepuisBase64Url(cle);
  let abonnement = await enregistrement.pushManager.getSubscription();
  // Clés du serveur changées depuis : l'ancien abonnement ne reçoit plus rien.
  if (abonnement && !memeCle(abonnement.options.applicationServerKey, cleServeur)) {
    await abonnement.unsubscribe();
    abonnement = null;
  }
  abonnement ??= await enregistrement.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleServeur });
  await api.post('/notifications/push/abonnement', abonnement.toJSON());
}

export async function rafraichirEtatPush(): Promise<void> {
  if (!pushPrisEnCharge()) {
    changerEtat(estAppareilApple() && !estLanceeCommeAppli() ? 'installer' : 'indisponible');
    return;
  }
  if (!(await clePublique())) return changerEtat('indisponible');
  if (Notification.permission === 'denied') return changerEtat('refuse');
  const abonnement = Notification.permission === 'granted' ? await abonnementActuel() : null;
  changerEtat(abonnement ? 'actif' : 'inactif');
}

/** Demande la permission (à appeler depuis un geste : toucher un bouton) puis abonne l'appareil. */
export async function activerPush(): Promise<void> {
  const cle = await clePublique();
  if (!cle) return changerEtat('indisponible');
  const permission = await Notification.requestPermission();
  if (permission === 'granted') await abonner(cle);
  await rafraichirEtatPush();
}

/** Raison d'un échec d'activation, dite à la personne (la cause change ce qu'elle peut faire). */
export function messageEchecPush(erreur: unknown): string {
  if (axios.isAxiosError(erreur)) {
    return erreur.response
      ? `Le serveur a refusé l’abonnement (erreur ${erreur.response.status}). Réessayez plus tard.`
      : 'Serveur injoignable. Vérifiez la connexion puis réessayez.';
  }
  const nom = erreur instanceof DOMException || erreur instanceof Error ? erreur.name : '';
  if (nom === 'InvalidAccessError' || nom === 'InvalidCharacterError') {
    return 'La clé de notification du serveur est invalide : l’administrateur doit vérifier VAPID_PUBLIC_KEY.';
  }
  if (nom === 'AbortError') {
    return 'Le service de notification de ce navigateur ne répond pas. Utilisez Chrome à jour ; sur Brave, activez « Services Google pour la messagerie push ».';
  }
  return 'L’activation a échoué. Réessayez.';
}

/** Désabonne cet appareil : à la déconnexion (avant l'appel de déconnexion, la session sert encore), ou à la demande. */
export async function desactiverPush(): Promise<void> {
  if (!pushPrisEnCharge()) return;
  try {
    const abonnement = await Promise.race([
      abonnementActuel(),
      // Service worker absent (navigation privée) : ready ne se résout jamais.
      new Promise<null>((resoudre) => setTimeout(() => resoudre(null), 2000)),
    ]);
    if (!abonnement) return;
    await api.delete('/notifications/push/abonnement', { data: { endpoint: abonnement.endpoint } }).catch(() => undefined);
    await abonnement.unsubscribe();
  } catch {
    // La déconnexion ne doit jamais échouer pour une notification.
  } finally {
    await rafraichirEtatPush().catch(() => undefined);
  }
}

/**
 * À l'ouverture de l'application par une personne connectée : si cet
 * appareil avait déjà la permission, il est réabonné (après une
 * reconnexion) ou son abonnement confirmé au serveur.
 */
export async function resynchroniserPush(): Promise<void> {
  try {
    if (!pushPrisEnCharge() || Notification.permission !== 'granted') return;
    const cle = await clePublique();
    if (cle) await abonner(cle);
  } catch {
    // Sans réseau ou service push indisponible : nouvelle tentative au prochain lancement.
  } finally {
    await rafraichirEtatPush().catch(() => undefined);
  }
}

function souscrire(rappel: () => void) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

export function useEtatPush(): EtatPush {
  useEffect(() => {
    if (etat === 'chargement') void rafraichirEtatPush().catch(() => changerEtat('indisponible'));
  }, []);
  return useSyncExternalStore(souscrire, () => etat);
}
