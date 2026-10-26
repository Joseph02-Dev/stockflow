import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';
import { creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { etapePeremption, PeremptionPlanificateur } from './peremption-planificateur.js';

const JOUR_MS = 86_400_000;

describe('Péremptions — étapes', () => {
  it('périmé, moins de 7 jours, sous le seuil de surveillance, sinon rien', () => {
    expect(etapePeremption(-1, 30)).toBe('PERIME');
    expect(etapePeremption(0, 30)).toBe('MOINS_7');
    expect(etapePeremption(7, 30)).toBe('MOINS_7');
    expect(etapePeremption(8, 30)).toBe('SURVEILLANCE');
    expect(etapePeremption(30, 30)).toBe('SURVEILLANCE');
    expect(etapePeremption(31, 30)).toBeNull();
    expect(etapePeremption(10, 5)).toBeNull();
  });
});

describe('Péremptions — email et push quotidiens, base PostgreSQL réelle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let devEmail: DevEmailService;
  let planificateur: PeremptionPlanificateur;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    devEmail = moduleRef.get(DevEmailService);
    planificateur = moduleRef.get(PeremptionPlanificateur);
  });

  afterEach(async () => {
    await prisma.lot.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
    await nettoyer(prisma, entrepriseIds.splice(0), []);
  });

  afterAll(async () => {
    await app.close();
  });

  async function entrepriseAvecLots(maintenant: Date, joursParLot: number[]) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Péremptions Kaloum');
    entrepriseIds.push(entreprise.id);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleLots: true } });
    const produit = await prisma.produit.create({ data: { entrepriseId: entreprise.id, nom: 'Lait en poudre 400 g' } });
    const emplacement = await prisma.emplacement.create({ data: { entrepriseId: entreprise.id, nom: 'Dépôt Madina' } });
    for (const [i, jours] of joursParLot.entries()) {
      await prisma.lot.create({
        data: {
          entrepriseId: entreprise.id,
          produitId: produit.id,
          emplacementId: emplacement.id,
          numero: `L-${i + 1}`,
          quantite: 10,
          datePeremption: new Date(maintenant.getTime() + jours * JOUR_MS),
        },
      });
    }
    const contexte = await prisma.entreprise.findUniqueOrThrow({
      where: { id: entreprise.id },
      select: { id: true, nom: true, seuilAlertePeremptionJours: true },
    });
    return { entreprise: contexte, email: utilisateur.email };
  }

  it('signale une fois chaque lot qui change d’étape, puis plus rien le lendemain', async () => {
    const aujourdhui = new Date('2026-11-02T07:00:00Z');
    const { entreprise, email } = await entrepriseAvecLots(aujourdhui, [-2, 3, 20, 60]);
    devEmail.clear();

    expect(await planificateur.signaler(entreprise, aujourdhui)).toBe(3);
    const [message] = devEmail.getSentEmails().filter((e) => e.to === email);
    expect(message.subject).toBe('Lots périmés en stock : 3 lots à traiter, dont 1 périmé.');
    expect(message.body).toContain('Lait en poudre 400 g · lot L-1 · Dépôt Madina : périmé');
    expect(message.body).toContain('lot L-2 · Dépôt Madina : expire dans 3 jours');
    expect(message.body).not.toContain('L-4');
    expect(message.html).toContain('/peremptions"');

    // Le lendemain, rien n'a changé d'étape : aucun nouveau message.
    devEmail.clear();
    expect(await planificateur.signaler(entreprise, new Date(aujourdhui.getTime() + JOUR_MS))).toBe(0);
    expect(devEmail.getSentEmails()).toHaveLength(0);

    // 14 jours plus tard, L-3 passe sous 7 jours et L-2 est périmé.
    expect(await planificateur.signaler(entreprise, new Date(aujourdhui.getTime() + 14 * JOUR_MS))).toBe(2);
  });

  it('ignore les lots vides et les entreprises sans module Lots', async () => {
    const aujourdhui = new Date('2026-11-02T07:00:00Z');
    const { entreprise, email } = await entrepriseAvecLots(aujourdhui, [-1]);
    await prisma.lot.updateMany({ where: { entrepriseId: entreprise.id }, data: { quantite: 0 } });
    devEmail.clear();
    expect(await planificateur.signaler(entreprise, aujourdhui)).toBe(0);

    await prisma.lot.updateMany({ where: { entrepriseId: entreprise.id }, data: { quantite: 5 } });
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleLots: false } });
    await planificateur.signalerQuotidien(aujourdhui);
    // Les autres entreprises de la base de test peuvent recevoir les leurs.
    expect(devEmail.getSentEmails().filter((e) => e.to === email)).toHaveLength(0);
  });
});
