import { useSyncExternalStore } from 'react';

/**
 * Apparence de l'application : clair, sombre, ou automatique (réglage du
 * système, via prefers-color-scheme).
 *
 * La préférence est rangée par appareil (localStorage), pas par compte :
 * on peut vouloir le sombre sur le téléphone du dépôt et le clair sur
 * l'ordinateur du bureau. Elle survit à la déconnexion (clearSession ne
 * touche qu'aux clés de session).
 *
 * Le premier rendu est déjà dans la bonne apparence : le script bloquant
 * de index.html pose l'attribut data-theme avant le chargement de React.
 * Ce module prend le relais ensuite (choix de l'utilisateur, changement du
 * réglage système en mode automatique, autres onglets).
 */
export type PreferenceTheme = 'light' | 'dark' | 'auto';

/** Clé partagée avec le script de index.html : ne pas la renommer seule. */
export const CLE_THEME = 'stockflow.theme';

/** Couleur de la barre d'adresse mobile : celle de la barre supérieure. */
const COULEUR_BARRE = { light: '#ffffff', dark: '#141b28' } as const;

const DUREE_TRANSITION_MS = 200;
const EVENEMENT = 'stockflow:theme';

const requeteSombre = () => window.matchMedia('(prefers-color-scheme: dark)');

function estPreference(valeur: unknown): valeur is PreferenceTheme {
  return valeur === 'light' || valeur === 'dark' || valeur === 'auto';
}

export function lirePreference(): PreferenceTheme {
  try {
    const valeur = localStorage.getItem(CLE_THEME);
    return estPreference(valeur) ? valeur : 'auto';
  } catch {
    // Navigation privée stricte : stockage indisponible, on suit le système.
    return 'auto';
  }
}

function apparenceEffective(preference: PreferenceTheme): 'light' | 'dark' {
  if (preference === 'auto') return requeteSombre().matches ? 'dark' : 'light';
  return preference;
}

function appliquer(preference: PreferenceTheme, avecTransition: boolean) {
  const racine = document.documentElement;
  const apparence = apparenceEffective(preference);
  const actuelle = racine.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (apparence === actuelle) return;

  const transition = avecTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (transition) {
    racine.classList.add('changement-theme');
    window.setTimeout(() => racine.classList.remove('changement-theme'), DUREE_TRANSITION_MS);
  }
  if (apparence === 'dark') racine.setAttribute('data-theme', 'dark');
  else racine.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COULEUR_BARRE[apparence]);
}

export function definirPreference(preference: PreferenceTheme) {
  try {
    localStorage.setItem(CLE_THEME, preference);
  } catch {
    // Stockage indisponible : le choix vaut pour la session en cours.
  }
  preferenceCourante = preference;
  appliquer(preference, true);
  window.dispatchEvent(new Event(EVENEMENT));
}

let preferenceCourante: PreferenceTheme = 'auto';

/**
 * À appeler une fois au démarrage : synchronise l'état avec le script de
 * index.html et écoute le réglage système et les autres onglets.
 */
export function initialiserTheme() {
  preferenceCourante = lirePreference();
  appliquer(preferenceCourante, false);
  // La feuille de style a pris le relais du réglage posé par index.html.
  document.documentElement.style.removeProperty('color-scheme');

  // Mode automatique : l'application suit le système en direct.
  requeteSombre().addEventListener('change', () => {
    if (preferenceCourante === 'auto') appliquer('auto', true);
  });
  // Choix fait dans un autre onglet.
  window.addEventListener('storage', (e) => {
    if (e.key !== CLE_THEME) return;
    preferenceCourante = lirePreference();
    appliquer(preferenceCourante, true);
    window.dispatchEvent(new Event(EVENEMENT));
  });
}

function souscrire(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  return () => window.removeEventListener(EVENEMENT, rappel);
}

/** Préférence courante, mise à jour à chaque changement. */
export function usePreferenceTheme(): PreferenceTheme {
  return useSyncExternalStore(souscrire, () => preferenceCourante);
}
