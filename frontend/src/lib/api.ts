import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  clearSession,
  getAccessToken,
  getSession,
  oublierRefreshTokenHerite,
  refreshTokenHerite,
  sessionActuelleEstPersistante,
  setSession,
  type ReponseSession,
} from './session';
import { signalerEchecReseau } from './connectivite';

// En développement local, /api est redirigé vers le backend par le proxy
// Vite (voir vite.config.ts) — ce proxy n'existe pas une fois le site
// construit et hébergé. En production, VITE_API_URL doit pointer vers
// l'URL publique complète du backend déployé.
const baseURL = import.meta.env.VITE_API_URL ?? '/api';

// withCredentials : le cookie httpOnly du refresh token (posé par l'API,
// limité à /auth) doit être reçu à la connexion et renvoyé au renouvellement.
export const api = axios.create({ baseURL, withCredentials: true });

/** Routes d'authentification publiques : jamais précédées d'un renouvellement. */
function estRoutePublique(url: string | undefined): boolean {
  return !!url?.startsWith('/auth/') && url !== '/auth/logout';
}

api.interceptors.request.use(async (config) => {
  let token = getAccessToken();
  // Page rechargée : la session est connue mais l'access token, gardé en
  // mémoire seulement, est perdu. Le cookie en redonne un avant l'envoi.
  if (!token && getSession() && !estRoutePublique(config.url)) {
    const issue = await renouvelerUneFois();
    if (issue && issue !== RESEAU_INDISPONIBLE) token = issue.accessToken;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Requête déjà rejouée une fois après renouvellement : pas de seconde tentative. */
type RequeteRejouable = InternalAxiosRequestConfig & { _retry?: boolean };

const CODE_ENTREPRISE_SUSPENDUE = 'ENTREPRISE_SUSPENDUE';
const CODE_COMPTE_DESACTIVE = 'COMPTE_DESACTIVE';

/**
 * Entreprise suspendue par la console, ou accès de l'utilisateur retiré par
 * un administrateur : la session est inutilisable, on la purge et on
 * renvoie vers la connexion, qui explique pourquoi. Pas de redirection
 * depuis la connexion elle-même (elle affiche déjà le message renvoyé par
 * le serveur).
 */
function traiterSuspension(error: unknown): void {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return;
  const corps = error.response.data as { code?: string } | undefined;
  const motif =
    corps?.code === CODE_ENTREPRISE_SUSPENDUE ? 'suspendue' : corps?.code === CODE_COMPTE_DESACTIVE ? 'desactive' : null;
  if (!motif) return;
  clearSession();
  if (window.location.pathname !== '/connexion') {
    window.location.replace(`/connexion?${motif}=1`);
  }
}

/**
 * Obtient un nouvel access token grâce au cookie httpOnly du refresh token
 * (que le navigateur joint seul : aucun script ne le lit).
 *
 * Client axios nu, sans intercepteur ni en-tête Authorization : l'access
 * token expiré serait refusé par le serveur avant même d'atteindre la
 * route, et /auth/refresh ne doit jamais relancer cette logique.
 *
 * Verrou inter-onglets (Web Locks) : les onglets partagent le cookie et
 * chaque refresh token ne sert qu'une fois. Sans verrou, deux onglets
 * renouvelant en même temps présenteraient le même cookie ; le second
 * serait pris pour une réutilisation frauduleuse et toutes les sessions
 * seraient révoquées. Sous verrou, le second part avec le cookie que la
 * réponse du premier vient de remplacer.
 */
/** Le renouvellement n'a pas pu joindre le serveur : ce n'est pas un refus. */
const RESEAU_INDISPONIBLE = Symbol('RESEAU_INDISPONIBLE');
type IssueRenouvellement = ReponseSession | null | typeof RESEAU_INDISPONIBLE;

async function renouvelerSession(): Promise<IssueRenouvellement> {
  if (!getSession()) return null;

  const renouveler = async (): Promise<IssueRenouvellement> => {
    if (!getSession()) return null;

    const persistante = sessionActuelleEstPersistante();
    // Session ouverte avant le cookie : son refresh token, une seule fois.
    const herite = refreshTokenHerite();
    try {
      const { data } = await axios.post<ReponseSession>(
        `${baseURL}/auth/refresh`,
        { resterConnecte: persistante, ...(herite ? { refreshToken: herite } : {}) },
        { withCredentials: true },
      );
      oublierRefreshTokenHerite();
      // Même emplacement qu'avant : « Rester connectée » est préservé.
      setSession(data, persistante);
      return data;
    } catch (erreur) {
      // Coupure réseau pendant le renouvellement : la session reste
      // valable, on ne déconnecte pas une personne simplement hors ligne.
      if (axios.isAxiosError(erreur) && !erreur.response) {
        signalerEchecReseau();
        return RESEAU_INDISPONIBLE;
      }
      traiterSuspension(erreur);
      return null;
    }
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('stockflow.refresh', renouveler);
  }
  return renouveler();
}

// Un seul renouvellement à la fois dans l'onglet : les requêtes qui
// échouent ensemble attendent toutes la même promesse.
let renouvellementEnCours: Promise<IssueRenouvellement> | null = null;

function renouvelerUneFois(): Promise<IssueRenouvellement> {
  renouvellementEnCours ??= renouvelerSession().finally(() => {
    renouvellementEnCours = null;
  });
  return renouvellementEnCours;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Aucune réponse du serveur (et pas une annulation volontaire) : le
    // réseau est tombé, même si navigator.onLine affirme le contraire.
    if (!error.response && !axios.isCancel(error)) {
      signalerEchecReseau();
    }
    // Access token expiré : on tente un renouvellement, puis on rejoue la
    // requête une seule fois. La session n'est purgée que si le
    // renouvellement échoue. Sans session (écran de connexion), un 401
    // est un simple refus d'identifiants.
    const requete = error.config as RequeteRejouable | undefined;
    if (error.response?.status === 401 && requete && !requete._retry && getSession()) {
      requete._retry = true;
      // Envoyée avec un access token déjà remplacé entre-temps : il suffit
      // de la rejouer avec le token courant, sans nouvelle rotation.
      const courant = getAccessToken();
      const issue =
        courant && requete.headers.Authorization !== `Bearer ${courant}` ? courant : await renouvelerUneFois();
      if (issue === RESEAU_INDISPONIBLE) {
        return Promise.reject(error);
      }
      if (issue) {
        requete.headers.Authorization = `Bearer ${typeof issue === 'string' ? issue : issue.accessToken}`;
        return api(requete);
      }
      clearSession();
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      clearSession();
    }
    // Un 429 (limitation de débit) n'invalide pas la session : on la
    // conserve et on remplace le corps par le message neutre, pour que
    // l'écran affiche une consigne claire même si un intermédiaire a
    // répondu sans corps exploitable.
    if (estTropDeRequetes(error) && error.response) {
      error.response.data = { statusCode: 429, message: MESSAGE_TROP_DE_REQUETES };
    }
    traiterSuspension(error);
    return Promise.reject(error);
  },
);

/** Message affiché quand le serveur limite le débit (HTTP 429). */
export const MESSAGE_TROP_DE_REQUETES = 'Trop de requêtes. Réessayez dans quelques minutes.';

/** Vrai si l'erreur est un refus pour excès de requêtes (HTTP 429). */
export function estTropDeRequetes(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

/**
 * Extrait un message lisible depuis une erreur Axios.
 * Le backend renvoie soit une chaîne, soit un tableau de messages de
 * validation (class-validator) — les deux cas sont gérés ici pour ne
 * jamais afficher "[object Object]" à l'utilisateur.
 */
export function messageErreur(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (estTropDeRequetes(error)) return MESSAGE_TROP_DE_REQUETES;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}
