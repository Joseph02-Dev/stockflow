import { useSyncExternalStore } from 'react';
import { getSession, souscrireSession } from '@/lib/session';
import type { Session } from '@/lib/session';

export function useSession(): Session | null {
  return useSyncExternalStore(souscrireSession, getSession, () => null);
}
