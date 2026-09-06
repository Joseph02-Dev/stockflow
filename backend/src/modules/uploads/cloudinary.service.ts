import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService implements OnModuleInit {
  onModuleInit() {
    // Configuré ici plutôt qu'au chargement du module : garantit que les
    // variables d'environnement sont déjà lues (dotenv) au moment de la
    // configuration, quel que soit l'ordre d'initialisation des modules.
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Téléverse une image et retourne son URL publique (HTTPS, servie par
   * le CDN Cloudinary). Le dossier isole les images par type et par
   * entreprise — jamais un mélange entre entreprises dans le même espace.
   */
  async televerserImage(
    fichier: Express.Multer.File,
    dossier: 'produits' | 'fournisseurs' | 'utilisateurs',
    entrepriseId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const flux = cloudinary.uploader.upload_stream(
        {
          folder: `stockflow/${entrepriseId}/${dossier}`,
          resource_type: 'image',
          // Limite raisonnable côté transformation : évite de stocker des
          // images inutilement lourdes pour un usage de fiche produit.
          transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
        },
        (erreur, resultat) => {
          if (erreur || !resultat) {
            reject(new InternalServerErrorException("L'envoi de l'image a échoué."));
            return;
          }
          resolve(resultat.secure_url);
        },
      );
      flux.end(fichier.buffer);
    });
  }
}
