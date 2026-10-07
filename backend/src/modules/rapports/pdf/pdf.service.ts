import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma.service.js';
import type { IdentiteEntreprise } from './gabarit.js';
import { RenduPdf, type DefinitionRapport } from './rendu-pdf.js';

/** Seuls les logos de notre CDN sont récupérés (pas de requête arbitraire). */
const HOTE_LOGO = 'res.cloudinary.com';
const TAILLE_MAX_LOGO = 1024 * 1024;

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  // Rendu hors du fil principal : un rapport ne ralentit plus les autres requêtes.
  private readonly rendu = new RenduPdf();

  constructor(private readonly prisma: PrismaService) {}

  /** Coordonnées de l'entreprise et logo prêt à imprimer (absent si indisponible). */
  async identite(entrepriseId: string): Promise<IdentiteEntreprise> {
    const e = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { nom: true, adresse: true, telephone: true, email: true, rccm: true, nif: true, logoUrl: true },
    });
    return { ...e, logo: e.logoUrl ? await this.telechargerLogo(e.logoUrl) : undefined };
  }

  async nomUtilisateur(utilisateurId: string): Promise<string> {
    const u = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId }, select: { nom: true } });
    return u?.nom ?? '—';
  }

  rendre(document: DefinitionRapport): Promise<Buffer> {
    return this.rendu.rendre(document);
  }

  onModuleDestroy() {
    return this.rendu.arreter();
  }

  /**
   * Logo converti en PNG par le CDN (pdfmake ne lit ni WEBP ni SVG), puis
   * embarqué en data URL. Un logo injoignable ne bloque jamais le rapport :
   * le document sort sans logo.
   */
  private async telechargerLogo(url: string): Promise<string | undefined> {
    try {
      const adresse = new URL(url);
      if (adresse.protocol !== 'https:' || adresse.hostname !== HOTE_LOGO) return undefined;
      adresse.pathname = adresse.pathname.replace('/upload/', '/upload/f_png,w_240,h_240,c_limit/');
      const reponse = await fetch(adresse, { signal: AbortSignal.timeout(4000) });
      const type = reponse.headers.get('content-type') ?? '';
      if (!reponse.ok || !/^image\/(png|jpeg)/.test(type)) return undefined;
      const octets = Buffer.from(await reponse.arrayBuffer());
      if (octets.length > TAILLE_MAX_LOGO) return undefined;
      return `data:${type.split(';')[0]};base64,${octets.toString('base64')}`;
    } catch (erreur) {
      this.logger.warn(`Logo indisponible, rapport généré sans : ${(erreur as Error).message}`);
      return undefined;
    }
  }
}
