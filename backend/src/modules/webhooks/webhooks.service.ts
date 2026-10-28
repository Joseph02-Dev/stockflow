import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreerAbonnementDto, ModifierAbonnementDto } from './dto/abonnement.dto.js';
import { signalerEmission } from './emission.js';
import { EVENEMENT_TEST } from './regles-webhook.js';
import { refusUrlWebhook } from './securite-url.js';

const SANS_SECRET = { id: true, url: true, evenements: true, actif: true, echecsConsecutifs: true, createdAt: true } as const;

/**
 * Abonnements webhook (module « webhooks »). Le secret de signature n'est
 * montré qu'une fois, à la création : il sert à vérifier l'en-tête
 * X-StockFlow-Signature de chaque envoi.
 */
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  lister(entrepriseId: string) {
    return this.prisma.abonnementWebhook.findMany({ where: { entrepriseId }, select: SANS_SECRET, orderBy: { createdAt: 'asc' } });
  }

  async creer(entrepriseId: string, dto: CreerAbonnementDto) {
    const refus = await refusUrlWebhook(dto.url);
    if (refus) throw new BadRequestException(refus);
    return this.prisma.abonnementWebhook.create({
      data: { entrepriseId, url: dto.url, evenements: dto.evenements, secret: `whsec_${randomBytes(24).toString('hex')}` },
      select: { ...SANS_SECRET, secret: true },
    });
  }

  async modifier(entrepriseId: string, id: string, dto: ModifierAbonnementDto) {
    await this.abonnementOuEchouer(entrepriseId, id);
    return this.prisma.abonnementWebhook.update({
      where: { id },
      data: { ...dto, ...(dto.actif ? { echecsConsecutifs: 0 } : {}) },
      select: SANS_SECRET,
    });
  }

  /** Les livraisons partent avec l'abonnement : leur journal n'a plus d'objet. */
  async supprimer(entrepriseId: string, id: string) {
    await this.abonnementOuEchouer(entrepriseId, id);
    await this.prisma.$transaction([
      this.prisma.livraisonWebhook.deleteMany({ where: { abonnementId: id } }),
      this.prisma.abonnementWebhook.delete({ where: { id } }),
    ]);
    return { supprime: true };
  }

  /** Les 50 dernières livraisons, pour diagnostiquer un destinataire. */
  async livraisons(entrepriseId: string, id: string) {
    await this.abonnementOuEchouer(entrepriseId, id);
    return this.prisma.livraisonWebhook.findMany({
      where: { abonnementId: id },
      select: {
        id: true,
        statut: true,
        tentatives: true,
        codeHttp: true,
        erreur: true,
        prochaineTentativeAt: true,
        livreeAt: true,
        createdAt: true,
        evenement: { select: { type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Événement « test.ping » pour ce seul abonnement, envoyé au prochain passage du livreur. */
  async tester(entrepriseId: string, id: string) {
    await this.abonnementOuEchouer(entrepriseId, id);
    signalerEmission();
    const evenement = await this.prisma.evenementWebhook.create({
      data: {
        entrepriseId,
        type: EVENEMENT_TEST,
        charge: { message: 'Test depuis NimbaFlow' },
        livraisons: { create: [{ abonnementId: id }] },
      },
      select: { id: true },
    });
    return { evenementId: evenement.id };
  }

  private async abonnementOuEchouer(entrepriseId: string, id: string) {
    const abonnement = await this.prisma.abonnementWebhook.findUnique({ where: { id }, select: { entrepriseId: true } });
    if (!abonnement || abonnement.entrepriseId !== entrepriseId) throw new NotFoundException('Abonnement introuvable.');
  }
}
