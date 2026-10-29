import { Injectable } from '@nestjs/common';
import { PdfService } from '../../rapports/pdf/pdf.service.js';
import { VentesService } from '../ventes.service.js';
import { definitionFacture } from './facture-pdf.js';

@Injectable()
export class FactureService {
  constructor(
    private readonly ventes: VentesService,
    private readonly pdf: PdfService,
  ) {}

  /** Facture PDF d'une vente de l'entreprise (404 sinon, comme la vente elle-même). */
  async generer(entrepriseId: string, venteId: string): Promise<{ nomFichier: string; pdf: Buffer }> {
    const vente = await this.ventes.obtenir(entrepriseId, venteId);
    const identite = await this.pdf.identite(entrepriseId);
    return { nomFichier: `facture-${vente.numero}`, pdf: await this.pdf.rendre(definitionFacture(vente, identite)) };
  }
}
