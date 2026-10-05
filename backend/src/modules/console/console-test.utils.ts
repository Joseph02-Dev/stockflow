import * as argon2 from 'argon2';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';

/**
 * Outils partagés des tests de la console (non embarqués dans le build :
 * seuls les *.spec.ts les importent). Chaque helper retourne ce qu'il crée
 * pour que le test puisse tout nettoyer derrière lui.
 */
export const MOT_DE_PASSE_TEST = 'motdepasse-solide-123';

export async function creerOperateur(prisma: PrismaService) {
  const email = `ops-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
  const operateur = await prisma.operateur.create({
    data: { email, nom: 'Opérateur Test', passwordHash: await argon2.hash(MOT_DE_PASSE_TEST) },
  });
  return { ...operateur, motDePasse: MOT_DE_PASSE_TEST };
}

export async function connecterOperateur(app: INestApplication, email: string): Promise<string> {
  const reponse = await request(app.getHttpServer())
    .post('/console/auth/login')
    .send({ email, motDePasse: MOT_DE_PASSE_TEST });
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
    await prisma.mouvement.deleteMany({ where });
    await prisma.lot.deleteMany({ where });
    await prisma.client.deleteMany({ where });
    await prisma.fournisseurProduit.deleteMany({ where: { fournisseur: where } });
    await prisma.fournisseur.deleteMany({ where });
    await prisma.alerte.deleteMany({ where });
    await prisma.stock.deleteMany({ where: { produit: where } });
    await prisma.produit.deleteMany({ where });
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
