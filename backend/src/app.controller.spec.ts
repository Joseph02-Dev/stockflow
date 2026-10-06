import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { vi } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './config/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  const prisma = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('base joignable : 200, état minimal', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      await expect(appController.sante()).resolves.toEqual({ statut: 'ok', baseDeDonnees: 'ok' });
    });

    it('base en erreur : 503, sans aucun détail technique dans la réponse', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("Can't reach database server at db.interne.railway:5432"));
      const erreur = await appController.sante().catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ServiceUnavailableException);
      const corps = (erreur as ServiceUnavailableException).getResponse();
      expect(corps).toEqual({ statut: 'indisponible', baseDeDonnees: 'injoignable' });
      expect(JSON.stringify(corps)).not.toContain('railway');
    });

    it('base qui ne répond pas : 503 après le délai, jamais de healthcheck pendu', async () => {
      vi.useFakeTimers();
      try {
        prisma.$queryRaw.mockReturnValue(new Promise(() => {}));
        const resultat = appController.sante().catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(3000);
        expect(await resultat).toBeInstanceOf(ServiceUnavailableException);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
