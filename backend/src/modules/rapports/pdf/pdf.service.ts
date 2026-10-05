import { Injectable, Logger } from '@nestjs/common';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';
import { PrismaService } from '../../../config/prisma.service.js';
import type { IdentiteEntreprise } from './gabarit.js';

const require = createRequire(import.meta.url);
const DOSSIER_POLICES = join(dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');

// Roboto (livrée avec pdfmake) couvre le français : é, è, ê, à, ç, œ, «, ».
// Courier est une police standard PDF, sans fichier : références produit.
pdfmake.setFonts({
  Roboto: {
    normal: join(DOSSIER_POLICES, 'Roboto-Regular.ttf'),
    bold: join(DOSSIER_POLICES, 'Roboto-Medium.ttf'),
    italics: join(DOSSIER_POLICES, 'Roboto-Italic.ttf'),
    bolditalics: join(DOSSIER_POLICES, 'Roboto-MediumItalic.ttf'),
  },
  Courier: {
    normal: 'Courier',
    bold: 'Courier-Bold',
    italics: 'Courier-Oblique',
    bolditalics: 'Courier-BoldOblique',
  },
});
// pdfmake ne télécharge rien lui-même (le logo est récupéré ici, sous
// contrôle) et ne lit sur le disque que les fichiers de police.
pdfmake.setUrlAccessPolicy(() => false);
const POLICES_STANDARD = new Set(['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']);
pdfmake.setLocalAccessPolicy((chemin) => POLICES_STANDARD.has(chemin) || chemin.startsWith(DOSSIER_POLICES));

/** Seuls les logos de notre CDN sont récupérés (pas de requête arbitraire). */
const HOTE_LOGO = 'res.cloudinary.com';
const TAILLE_MAX_LOGO = 1024 * 1024;

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

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

  async rendre(document: TDocumentDefinitions): Promise<Buffer> {
    return pdfmake.createPdf(document).getBuffer();
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
