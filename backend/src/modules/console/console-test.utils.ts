import * as argon2 from 'argon2';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { codeTotp, depuisBase32, genererSecretTotp, pasCourant } from './securite/totp.js';

/**
 * Outils partagés des tests de la console (non embarqués dans le build :
 * seuls les *.spec.ts les importent). Chaque helper retourne ce qu'il crée
 * pour que le test puisse tout nettoyer derrière lui.
 */
export const MOT_DE_PASSE_TEST = 'motdepasse-solide-123';

/** Clé de double authentification de chaque opérateur de test, par email. */
const secretsTotp = new Map<string, string>();

/** Code à 6 chiffres valable maintenant pour cette clé (ce que montrerait l'application). */
export function codeActuel(secret: string, decalagePas = 0): string {
  return codeTotp(depuisBase32(secret), pasCourant(new Date()) + decalagePas);
}

/** Opérateur prêt à se connecter, double authentification déjà enrôlée (sauf enrole: false). */
export async function creerOperateur(prisma: PrismaService, { enrole = true } = {}) {
  const email = `ops-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
  const totpSecret = enrole ? genererSecretTotp() : null;
  const operateur = await prisma.operateur.create({
    data: {
      email,
      nom: 'Opérateur Test',
      passwordHash: await argon2.hash(MOT_DE_PASSE_TEST),
      totpSecret,
      totpActifAt: enrole ? new Date() : null,
    },
  });
  if (totpSecret) secretsTotp.set(email, totpSecret);
  return { ...operateur, motDePasse: MOT_DE_PASSE_TEST };
}

/** Connexion complète : mot de passe, puis code de double authentification. */
export async function connecterOperateur(app: INestApplication, email: string): Promise<string> {
  const etape = await request(app.getHttpServer())
    .post('/console/auth/login')
    .send({ email, motDePasse: MOT_DE_PASSE_TEST });
  const reponse = await request(app.getHttpServer())
    .post('/console/auth/code')
    .send({ jetonEtape: etape.body.jetonEtape, code: codeActuel(secretsTotp.get(email)!) });
  return reponse.body.accessToken as string;
}

/** Crée une entreprise et son admin, email déjà vérifié, prêt à se connecter. */
export async function creerEntrepriseAvecAdmin(prisma: PrismaService, nom = 'Entreprise Console') {
  const email = `client-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
  const entreprise = await prisma.entreprise.create({ data: { nom } });
  const utilisateur = await prisma.utilisateur.create({
    data: {
      entrepriseId: entreprise.id,
      email,
      nom: 'Admin Test',
      passwordHash: await argon2.hash(MOT_DE_PASSE_TEST),
      role: 'ADMIN',
      emailVerifieAt: new Date(),
    },
  });
  return { entreprise, utilisateur };
}

export async function connecterClient(app: INestApplication, email: string) {
  return request(app.getHttpServer()).post('/auth/login').send({ email, password: MOT_DE_PASSE_TEST });
}

/** Cookie de session posé par une réponse d'auth (stockflow_refresh), tel quel. */
export function cookieSessionDe(reponse: { headers: Record<string, unknown> }): string | undefined {
  const cookies = ([] as string[]).concat((reponse.headers['set-cookie'] as string[] | string | undefined) ?? []);
  return cookies.find((c) => c.startsWith('stockflow_refresh='));
}

/** Refresh token posé par une réponse d'auth (cookie httpOnly stockflow_refresh). */
export function refreshTokenDe(reponse: { headers: Record<string, unknown> }): string {
  const cookie = cookieSessionDe(reponse);
  if (!cookie) throw new Error('Aucun cookie de session dans la réponse.');
  return decodeURIComponent(cookie.slice('stockflow_refresh='.length).split(';')[0]);
}

/** Supprime tout ce qu'un test a créé (données de test uniquement). */
export async function nettoyer(prisma: PrismaService, entrepriseIds: string[], operateurIds: string[]) {
  if (entrepriseIds.length > 0) {
    const where = { entrepriseId: { in: entrepriseIds } };
    await prisma.inventaireLigne.deleteMany({ where: { inventaire: where } });
    await prisma.inventaire.deleteMany({ where });
    await prisma.commandeLigne.deleteMany({ where: { commande: where } });
    await prisma.commandeFournisseur.deleteMany({ where });
    await prisma.retourClientLigne.deleteMany({ where: { retour: where } });
    await prisma.retourClient.deleteMany({ where });
    await prisma.retourFournisseur.deleteMany({ where });
    await prisma.reglement.deleteMany({ where: { vente: where } });
    await prisma.ligneVente.deleteMany({ where: { vente: where } });
    await prisma.vente.deleteMany({ where });
    await prisma.coucheValorisation.deleteMany({ where });
    await prisma.livraisonWebhook.deleteMany({ where: { abonnement: where } });
    await prisma.evenementWebhook.deleteMany({ where });
    await prisma.abonnementWebhook.deleteMany({ where });
    await prisma.mouvement.deleteMany({ where });
    await prisma.regleReapprovisionnement.deleteMany({ where });
    await prisma.regleRangement.deleteMany({ where });
    await prisma.conditionnement.deleteMany({ where });
    await prisma.lot.deleteMany({ where });
    await prisma.client.deleteMany({ where });
    await prisma.fournisseurProduit.deleteMany({ where: { fournisseur: where } });
    await prisma.fournisseur.deleteMany({ where });
    await prisma.alerte.deleteMany({ where });
    await prisma.stock.deleteMany({ where: { produit: where } });
    await prisma.produit.deleteMany({ where });
    await prisma.attributModele.deleteMany({ where: { modele: where } });
    await prisma.modeleProduit.deleteMany({ where });
    await prisma.emplacement.deleteMany({ where });
    await prisma.categorie.deleteMany({ where });
    await prisma.marque.deleteMany({ where });
    await prisma.importLigne.deleteMany({ where: { import: where } });
    await prisma.importCatalogue.deleteMany({ where });
    await prisma.refreshToken.deleteMany({ where: { utilisateur: where } });
    await prisma.reinitialisationMotDePasse.deleteMany({ where: { utilisateur: where } });
    await prisma.utilisateur.deleteMany({ where });
    await prisma.journalAudit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
    await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
  }
  if (operateurIds.length > 0) {
    await prisma.journalAudit.deleteMany({ where: { operateurId: { in: operateurIds } } });
    await prisma.operateur.deleteMany({ where: { id: { in: operateurIds } } });
  }
}
