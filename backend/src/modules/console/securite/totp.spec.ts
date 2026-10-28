import { describe, expect, it } from 'vitest';
import { base32, codeTotp, depuisBase32, genererSecretTotp, pasCourant, urlOtpauth, verifierCodeTotp } from './totp.js';

// Clé des vecteurs de test officiels (RFC 6238, annexe B, SHA-1).
const CLE_RFC = Buffer.from('12345678901234567890');

describe('TOTP — RFC 6238', () => {
  it('reproduit les vecteurs de test officiels (8 chiffres, SHA-1)', () => {
    const vecteurs: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [secondes, attendu] of vecteurs) {
      expect(codeTotp(CLE_RFC, pasCourant(new Date(secondes * 1000)), 8)).toBe(attendu);
    }
  });

  it('base32 aller-retour, et clé générée de 160 bits', () => {
    expect(base32(CLE_RFC)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(depuisBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(CLE_RFC);
    const secret = genererSecretTotp();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(depuisBase32(secret)).toHaveLength(20);
  });
});

describe('TOTP — vérification', () => {
  const secret = base32(CLE_RFC);
  const maintenant = new Date(1_234_567_890_000);
  const pas = pasCourant(maintenant);
  const code = (decalage: number) => codeTotp(CLE_RFC, pas + decalage);

  it('accepte le code courant et un pas de décalage, pas au-delà', () => {
    expect(verifierCodeTotp(secret, code(0), maintenant, null)).toBe(pas);
    expect(verifierCodeTotp(secret, code(-1), maintenant, null)).toBe(pas - 1);
    expect(verifierCodeTotp(secret, code(1), maintenant, null)).toBe(pas + 1);
    expect(verifierCodeTotp(secret, code(-2), maintenant, null)).toBeNull();
    expect(verifierCodeTotp(secret, code(2), maintenant, null)).toBeNull();
  });

  it('refuse un code déjà utilisé (rejeu) et un format invalide', () => {
    expect(verifierCodeTotp(secret, code(0), maintenant, pas)).toBeNull();
    expect(verifierCodeTotp(secret, code(-1), maintenant, pas - 1)).toBeNull();
    expect(verifierCodeTotp(secret, '12345', maintenant, null)).toBeNull();
    expect(verifierCodeTotp(secret, '12a456', maintenant, null)).toBeNull();
  });

  it('URL otpauth lisible par les applications d’authentification', () => {
    expect(urlOtpauth('ops@stockflowgn.com', 'ABC')).toBe(
      'otpauth://totp/NimbaFlow%20Console%3Aops%40stockflowgn.com?secret=ABC&issuer=NimbaFlow%20Console&algorithm=SHA1&digits=6&period=30',
    );
  });
});
