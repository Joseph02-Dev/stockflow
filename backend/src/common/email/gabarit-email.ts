/**
 * Mise en forme des emails transactionnels : une version HTML (charte
 * NimbaFlow) et une version texte équivalente, envoyées ensemble. La version
 * texte sert aux messageries qui n'affichent pas le HTML et améliore la
 * délivrabilité.
 *
 * HTML « email » : tableaux et styles en ligne, sans feuille de style
 * externe ni script, seule mise en page que Gmail et Outlook rendent
 * fidèlement. Tout texte inséré est échappé.
 */
export interface ContenuEmail {
  /** Texte d'aperçu affiché par la messagerie à côté du sujet. */
  apercu: string;
  titre: string;
  paragraphes: string[];
  /** Encadré de faits (produit, quantité…), affiché entre le texte et le bouton. */
  details?: { libelle: string; valeur: string }[];
  bouton: { libelle: string; url: string };
  /** Petites lignes sous le bouton (expiration, consigne de sécurité). */
  mentions: string[];
}

const COULEURS = {
  fond: '#f4f5f2',
  surface: '#ffffff',
  bordure: '#e3e4df',
  encre: '#15161a',
  texte: '#3a3d45',
  secondaire: '#5d616b',
  action: '#c2440b',
  actionPale: '#fcefe7',
} as const;

const POLICE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const POLICE_TITRE = "'Bricolage Grotesque', 'Hanken Grotesk', " + POLICE;

/**
 * Réseaux du pied de page, dans l'ordre de l'accueil. Même règle que
 * frontend/src/features/accueil/contenu.ts (RESEAUX_SOCIAUX), tenu identique
 * par un test : tant qu'une adresse est null, l'icône s'affiche sans lien.
 */
export const RESEAUX_SOCIAUX: { cle: string; nom: string; url: string | null }[] = [
  { cle: 'facebook', nom: 'Facebook', url: null },
  { cle: 'instagram', nom: 'Instagram', url: null },
  { cle: 'x', nom: 'X', url: null },
  { cle: 'whatsapp', nom: 'WhatsApp', url: null },
  { cle: 'tiktok', nom: 'TikTok', url: null },
  { cle: 'linkedin', nom: 'LinkedIn', url: null },
];

export function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;

/** Durée lisible dans un email : 604800000 → « 7 jours », 86400000 → « 24 heures », 1800000 → « 30 minutes ». */
export function dureeEnClair(dureeMs: number): string {
  if (dureeMs > JOUR_MS && dureeMs % JOUR_MS === 0) return `${dureeMs / JOUR_MS} jours`;
  if (dureeMs < HEURE_MS) return `${Math.max(1, Math.round(dureeMs / 60_000))} minutes`;
  const heures = Math.max(1, Math.round(dureeMs / HEURE_MS));
  return heures === 1 ? '1 heure' : `${heures} heures`;
}

/** Libellé d'un rôle dans les emails. */
export const LIBELLE_ROLE = { ADMIN: 'Administrateur', GESTIONNAIRE: 'Gestionnaire de stock' } as const;

/** Adresse publique du frontend (FRONTEND_URL), sans barre finale. */
export function adresseSite(): string {
  return (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
}

/** Images servies par le frontend : uniquement en HTTPS (les messageries bloquent les images non sécurisées). */
function imagesPermises(site: string): boolean {
  return site.startsWith('https://');
}

function enTete(site: string): string {
  // Le nom reste lisible quand les images sont bloquées.
  const logo = imagesPermises(site)
    ? `<td style="padding-right:10px;vertical-align:middle;"><img src="${echapperHtml(site)}/logo-mark.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px;"></td>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    ${logo}
    <td style="vertical-align:middle;font-family:${POLICE_TITRE};font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${COULEURS.encre};">NimbaFlow</td>
  </tr></table>`;
}

function bouton(libelle: string, url: string): string {
  // Bouton « à l'épreuve des balles » : cellule colorée + lien, rendu aussi par Outlook.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr>
    <td align="center" bgcolor="${COULEURS.action}" style="border-radius:8px;">
      <a href="${echapperHtml(url)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${POLICE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${echapperHtml(libelle)}</a>
    </td>
  </tr></table>`;
}

function details(lignes: { libelle: string; valeur: string }[]): string {
  if (lignes.length === 0) return '';
  const rangees = lignes
    .map(
      (l) => `<tr>
        <td style="padding:6px 0;font-family:${POLICE};font-size:14px;line-height:20px;color:${COULEURS.secondaire};">${echapperHtml(l.libelle)}</td>
        <td align="right" style="padding:6px 0;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:600;color:${COULEURS.encre};">${echapperHtml(l.valeur)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.actionPale}" style="margin:8px 0 0;border-radius:10px;">
    <tr><td style="padding:12px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rangees}</table></td></tr>
  </table>`;
}

/** Icônes des réseaux sociaux (PNG servis par le frontend, /email/<réseau>.png), centrées. */
function reseaux(site: string): string {
  if (!imagesPermises(site)) return '';
  const cellules = RESEAUX_SOCIAUX.map(({ cle, nom, url }) => {
    const image = `<img src="${echapperHtml(site)}/email/${cle}.png" width="28" height="28" alt="${echapperHtml(nom)}" style="display:block;border:0;">`;
    const contenu = url ? `<a href="${echapperHtml(url)}" target="_blank" title="NimbaFlow sur ${echapperHtml(nom)}">${image}</a>` : image;
    return `<td style="padding:0 5px;">${contenu}</td>`;
  }).join('');
  return `<p style="margin:0 0 10px;font-family:${POLICE};font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:${COULEURS.secondaire};">Suivez-nous</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>${cellules}</tr></table>`;
}

function html(contenu: ContenuEmail, site: string): string {
  const domaine = site.replace(/^https?:\/\//, '');
  const paragraphes = contenu.paragraphes
    .map((p) => `<p style="margin:0 0 16px;font-family:${POLICE};font-size:15px;line-height:24px;color:${COULEURS.texte};">${echapperHtml(p)}</p>`)
    .join('');
  const mentions = contenu.mentions
    .map((m) => `<p style="margin:0 0 8px;font-family:${POLICE};font-size:13px;line-height:20px;color:${COULEURS.secondaire};">${echapperHtml(m)}</p>`)
    .join('');
  const url = echapperHtml(contenu.bouton.url);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${echapperHtml(contenu.titre)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COULEURS.fond};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${echapperHtml(contenu.apercu)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.fond}">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding:0 4px 22px;">${enTete(site)}</td></tr>
      <tr><td bgcolor="${COULEURS.surface}" style="border:1px solid ${COULEURS.bordure};border-top:4px solid ${COULEURS.action};border-radius:12px;padding:36px 32px;">
        <h1 style="margin:0 0 20px;font-family:${POLICE_TITRE};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${COULEURS.encre};">${echapperHtml(contenu.titre)}</h1>
        ${paragraphes}
        ${details(contenu.details ?? [])}
        ${bouton(contenu.bouton.libelle, contenu.bouton.url)}
        ${mentions}
        <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${COULEURS.bordure};font-family:${POLICE};font-size:13px;line-height:20px;color:${COULEURS.secondaire};">
          Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br>
          <a href="${url}" target="_blank" style="color:${COULEURS.action};word-break:break-all;">${url}</a>
        </p>
      </td></tr>
      <tr><td align="center" style="padding:28px 16px 0;font-family:${POLICE};font-size:12px;line-height:18px;color:${COULEURS.secondaire};">
        ${reseaux(site)}
        <p style="margin:0 0 6px;font-family:${POLICE};font-size:12px;line-height:18px;color:${COULEURS.secondaire};">Gestion de stock et de ventes pour commerçants, grossistes et vendeurs.${domaine ? ` <a href="${echapperHtml(site)}" target="_blank" style="color:${COULEURS.secondaire};">${echapperHtml(domaine)}</a>` : ''}</p>
        <p style="margin:0;font-family:${POLICE};font-size:12px;line-height:18px;color:${COULEURS.secondaire};">${pied(process.env.EMAIL_REPLY_TO)}</p>
      </td></tr>
      <tr><td align="center" style="padding:18px 16px 0;">
        <p style="margin:0;padding-top:16px;border-top:1px solid ${COULEURS.bordure};font-family:${POLICE};font-size:12px;line-height:18px;color:${COULEURS.secondaire};">© ${new Date().getFullYear()} NimbaFlow</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Ligne de contact : l'adresse de réponse (EMAIL_REPLY_TO) quand elle existe. */
function pied(contact: string | undefined): string {
  if (!contact) return 'Email automatique, merci de ne pas y répondre.';
  const adresse = echapperHtml(contact);
  return `Une question ? Répondez à cet email ou écrivez à <a href="mailto:${adresse}" style="color:${COULEURS.secondaire};">${adresse}</a>.`;
}

function texte(contenu: ContenuEmail): string {
  const contact = process.env.EMAIL_REPLY_TO;
  return [
    contenu.titre,
    '',
    ...contenu.paragraphes.flatMap((p) => [p, '']),
    ...(contenu.details?.length ? [...contenu.details.map((d) => `${d.libelle} : ${d.valeur}`), ''] : []),
    `${contenu.bouton.libelle} : ${contenu.bouton.url}`,
    '',
    ...contenu.mentions,
    ...(contact ? ['', `Une question ? Écrivez à ${contact}.`] : []),
    '',
    `© ${new Date().getFullYear()} NimbaFlow`,
  ].join('\n');
}

/** Versions texte (`body`) et HTML (`html`) d'un même email. */
export function composerEmail(contenu: ContenuEmail): { body: string; html: string } {
  return { body: texte(contenu), html: html(contenu, adresseSite()) };
}
