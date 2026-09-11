import { useSyncExternalStore } from 'react';

function souscrire(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function obtenirEtat(): boolean {
  return navigator.onLine;
}

/**
 * navigator.onLine reflète la présence d'une interface réseau, pas une
 * vraie connectivité au serveur (un Wi-Fi connecté sans accès Internet
 * reste "online") — c'est une limite connue et acceptée : c'est le
 * signal le plus fiable disponible sans sonder le serveur en continu.
 */
export function useEnLigne(): boolean {
  return useSyncExternalStore(souscrire, obtenirEtat, () => true);
}
