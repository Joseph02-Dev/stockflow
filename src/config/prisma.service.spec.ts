import { Test } from '@nestjs/testing';
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService (intégration base de données réelle)', () => {
  it('se connecte à PostgreSQL et exécute une requête', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    const prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    // Requête triviale pour prouver que la connexion est fonctionnelle,
    // pas seulement instanciée.
    const result = await prisma.$queryRaw<{ result: number }[]>`SELECT 1 as result`;
    expect(result[0].result).toBe(1);

    // Vérifie que le schéma des 9 tables métier est bien accessible.
    const count = await prisma.entreprise.count();
    expect(count).toBe(0); // base vide à ce stade, aucune donnée insérée

    await prisma.$disconnect();
  });

  afterAll(async () => {
    // rien à nettoyer : aucune donnée n'a été insérée par ce test
  });
});
