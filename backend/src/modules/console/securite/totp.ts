import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Codes à usage unique basés sur le temps (TOTP, RFC 6238) : la double
 * authentification de la console opérateur, compatible avec Google
 * Authenticator, Microsoft Authenticator, 2FAS, Aegis… HMAC-SHA1,
 * 6 chiffres, pas de 30 secondes : les réglages que toutes ces
 * applications lisent sans configuration.
 */
const PAS_SECONDES = 30;
const CHIFFRES = 6;
/** Un pas avant ou après : tolère 30 s de décalage d'horloge du téléphone. */
const TOLERANCE_PAS = 1;
const ALPHABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(octets: Buffer): string {
  let bits = '';
  for (const octet of octets) bits += octet.toString(2).padStart(8, '0');
  let texte = '';
  for (let i = 0; i < bits.length; i += 5) texte += ALPHABET_BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return texte;
}

export function depuisBase32(texte: string): Buffer {
  const propre = texte.toUpperCase().replace(/[\s=]/g, '');
  let bits = '';
  for (const caractere of propre) {
    const valeur = ALPHABET_BASE32.indexOf(caractere);
    if (valeur < 0) throw new Error('Clé base32 invalide.');
    bits += valeur.toString(2).padStart(5, '0');
  }
  const octets: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}

/** Nouvelle clé secrète : 160 bits aléatoires, en base32 (taille recommandée par la RFC 4226). */
export function genererSecretTotp(): string {
  return base32(randomBytes(20));
}

/** Pas de temps courant (compteur de la RFC 6238). */
export function pasCourant(maintenant: Date): number {
  return Math.floor(maintenant.getTime() / 1000 / PAS_SECONDES);
}

/** Code du pas donné (HOTP, RFC 4226 : troncature dynamique). */
export function codeTotp(secret: Buffer, pas: number, chiffres = CHIFFRES): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const hmac = createHmac('sha1', secret).update(compteur).digest();
  const decalage = hmac[hmac.length - 1] & 0x0f;
  const binaire = hmac.readUInt32BE(decalage) & 0x7fffffff;
  return String(binaire % 10 ** chiffres).padStart(chiffres, '0');
}

/**
 * Vérifie un code saisi. Renvoie le pas reconnu, ou null. Un code d'un pas
 * déjà utilisé (dernierPas) est refusé : un code intercepté ne sert
 * qu'une fois (RFC 6238, section 5.2).
 */
export function verifierCodeTotp(secret: string, code: string, maintenant: Date, dernierPas: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cle = depuisBase32(secret);
  const courant = pasCourant(maintenant);
  for (let ecart = -TOLERANCE_PAS; ecart <= TOLERANCE_PAS; ecart++) {
    const pas = courant + ecart;
    if (dernierPas !== null && pas <= dernierPas) continue;
    if (timingSafeEqual(Buffer.from(codeTotp(cle, pas)), Buffer.from(code))) return pas;
  }
  return null;
}

/** Adresse lue par les applications d'authentification (QR code ou lien sur téléphone). */
export function urlOtpauth(email: string, secret: string): string {
  const libelle = encodeURIComponent(`NimbaFlow Console:${email}`);
  return `otpauth://totp/${libelle}?secret=${secret}&issuer=${encodeURIComponent('NimbaFlow Console')}&algorithm=SHA1&digits=${CHIFFRES}&period=${PAS_SECONDES}`;
}
