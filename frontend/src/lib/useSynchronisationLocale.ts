import { useEffect, useSyncExternalStore } from 'react';
import axios from 'axios';
import { api } from './api';
import { baseLocale } from './baseLocale';
import { estJoignable } from './connectivite';
import { nombreMouvementsEnAttente, souscrireFile } from './mouvementsHorsLigne';
import { getSession } from './session';
import { CurseurRefuse, synchroniserBase, type ReponseSync } from './synchronisationLocale';
import { useEnLigne } from './useEnLigne';

/**
 * Déclenchement de la synchronisation de la base locale (ADR 0001,
 * SYNC-04) : au lancement, au retour du réseau, après l'envoi de la file
 * d'opérations, toutes les 5 minutes tant que l'application est visible,
 * au retour au premier plan, et au bouton « Synchroniser ».
 */

const INTERVALLE_MS = 5 * 60_000;
/** Retour au premier plan : pas de nouvelle synchronisation si la dernière a moins d'une minute. */
const ECART_PREMIER_PLAN_MS = 60_000;

export interface EtatBaseLocale {
  enCours: boolean;
  /** Fin de la dernière synchronisation complète de cet appareil ; null : jamais. */
  derniereReussite: string | null;
}

let etat: EtatBaseLocale = { enCours: false, derniereReussite: null };
const abonnes = new Set<() => void>();

function changer(partiel: Partial<EtatBaseLocale>) {
  etat = { ...etat, ...partiel };
  abonnes.forEach((rappel) => rappel());
}

function souscrire(rappel: () => void) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

export function useEtatBaseLocale(): EtatBaseLocale {
  return useSyncExternalStore(souscrire, () => etat);
}

const lirePage = async (curseur: string | null): Promise<ReponseSync> => {
  try {
    return (await api.get<ReponseSync>('/sync', { params: curseur ? { depuis: curseur } : {} })).data;
  } catch (erreur) {
    if (axios.isAxiosError(erreur) && erreur.response?.status === 400) throw new CurseurRefuse();
    throw erreur;
  }
};

let enCours: Promise<void> | null = null;

/**
 * Synchronise la base de l'entreprise connectée. Une seule à la fois dans
 * l'onglet, et d'un onglet à l'autre (Web Locks : un onglet déjà en train de
 * synchroniser suffit). Ne lève jamais : un échec (réseau, serveur,
 * déconnexion pendant l'envoi) attend le prochain déclencheur.
 */
export function synchroniserBaseLocale(): Promise<void> {
  enCours ??= (async () => {
    const entrepriseId = getSession()?.entreprise.id;
    const base = entrepriseId ? baseLocale(entrepriseId) : null;
    if (!base) return;
    changer({ enCours: true });
    try {
      const executer = () => synchroniserBase(base, lirePage);
      const reussite = navigator.locks
        ? await navigator.locks.request('stockflow.sync-locale', { ifAvailable: true }, (verrou) => (verrou ? executer() : null))
        : await executer();
      if (reussite) changer({ derniereReussite: reussite });
    } catch {
      // Prochain essai au prochain déclencheur.
    } finally {
      changer({ enCours: false });
    }
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

/** À monter une fois, dans la mise en page des écrans connectés. */
export function useSynchronisationLocale(entrepriseId: string | undefined) {
  const enLigne = useEnLigne();
  const fileVide = useSyncExternalStore(souscrireFile, () => nombreMouvementsEnAttente() === 0, () => true);

  // Date du dernier succès de cette entreprise, lue dans sa base.
  useEffect(() => {
    changer({ derniereReussite: null });
    const base = entrepriseId ? baseLocale(entrepriseId) : null;
    void base?.etat
      .get('synchronisation')
      .then((lu) => changer({ derniereReussite: lu?.derniereReussite ?? null }))
      .catch(() => undefined);
  }, [entrepriseId]);

  // Lancement, retour du réseau, file d'opérations tout juste envoyée.
  useEffect(() => {
    if (entrepriseId && enLigne && fileVide) void synchroniserBaseLocale();
  }, [entrepriseId, enLigne, fileVide]);

  // Régulièrement tant que l'application est visible, et au retour au premier plan.
  useEffect(() => {
    if (!entrepriseId) return;
    const siVisible = () => document.visibilityState === 'visible' && estJoignable();
    const minuteur = window.setInterval(() => {
      if (siVisible()) void synchroniserBaseLocale();
    }, INTERVALLE_MS);
    const premierPlan = () => {
      const derniere = etat.derniereReussite ? Date.parse(etat.derniereReussite) : 0;
      if (siVisible() && Date.now() - derniere > ECART_PREMIER_PLAN_MS) void synchroniserBaseLocale();
    };
    document.addEventListener('visibilitychange', premierPlan);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener('visibilitychange', premierPlan);
    };
  }, [entrepriseId]);
}
