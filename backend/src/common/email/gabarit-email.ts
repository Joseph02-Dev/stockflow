/**
 * Mise en forme des emails transactionnels : une version HTML (charte
 * StockFlow) et une version texte équivalente, envoyées ensemble. La version
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
  bouton: { libelle: string; url: string };
  /** Petites lignes sous le bouton (expiration, consigne de sécurité). */
  mentions: string[];
}

const COULEURS = {
  fond: '#f2f4f7',
  surface: '#ffffff',
  bordure: '#e4e7ec',
  encre: '#0b0f17',
  texte: '#344054',
  secondaire: '#5a6678',
  action: '#2242c7',
} as const;

const POLICE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Adresse publique du frontend (FRONTEND_URL), sans barre finale. */
function adresseSite(): string {
  return (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
}

function enTete(site: string): string {
  // Logo servi par le frontend : uniquement en HTTPS (les messageries
  // bloquent les images non sécurisées). Le nom reste lisible sans image.
  const logo = site.startsWith('https://')
    ? `<img src="${echapperHtml(site)}/logo-mark.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:6px;">`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    ${logo ? `<td style="padding-right:10px;vertical-align:middle;">${logo}</td>` : ''}
    <td style="vertical-align:middle;font-family:${POLICE};font-size:18px;font-weight:700;color:${COULEURS.encre};">StockFlow</td>
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
      <tr><td style="padding:0 4px 20px;">${enTete(site)}</td></tr>
      <tr><td bgcolor="${COULEURS.surface}" style="padding:36px 32px;border:1px solid ${COULEURS.bordure};border-radius:12px;">
        <h1 style="margin:0 0 20px;font-family:${POLICE};font-size:22px;line-height:30px;font-weight:700;color:${COULEURS.encre};">${echapperHtml(contenu.titre)}</h1>
        ${paragraphes}
        ${bouton(contenu.bouton.libelle, contenu.bouton.url)}
        ${mentions}
        <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${COULEURS.bordure};font-family:${POLICE};font-size:13px;line-height:20px;color:${COULEURS.secondaire};">
          Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br>
          <a href="${url}" target="_blank" style="color:${COULEURS.action};word-break:break-all;">${url}</a>
        </p>
      </td></tr>
      <tr><td align="center" style="padding:24px 16px 0;font-family:${POLICE};font-size:12px;line-height:18px;color:${COULEURS.secondaire};">
        StockFlow — gestion de stock${domaine ? ` · <a href="${echapperHtml(site)}" target="_blank" style="color:${COULEURS.secondaire};">${echapperHtml(domaine)}</a>` : ''}<br>
        ${pied(process.env.EMAIL_REPLY_TO)}
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
    `${contenu.bouton.libelle} : ${contenu.bouton.url}`,
    '',
    ...contenu.mentions,
    ...(contact ? ['', `Une question ? Écrivez à ${contact}.`] : []),
  ].join('\n');
}

/** Versions texte (`body`) et HTML (`html`) d'un même email. */
export function composerEmail(contenu: ContenuEmail): { body: string; html: string } {
  return { body: texte(contenu), html: html(contenu, adresseSite()) };
}
