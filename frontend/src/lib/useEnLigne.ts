import { useSyncExternalStore } from 'react';
import { estJoignable, souscrireConnectivite } from './connectivite';

/**
 * Vrai si le serveur est réellement joignable (voir connectivite.ts) :
 * navigator.onLine seul restait « en ligne » sur un réseau sans Internet.
 */
export function useEnLigne(): boolean {
  return useSyncExternalStore(souscrireConnectivite, estJoignable, () => true);
}
