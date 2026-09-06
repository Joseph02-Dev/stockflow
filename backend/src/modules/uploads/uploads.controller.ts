import {
  BadRequestException,
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CloudinaryService } from './cloudinary.service.js';

const DOSSIERS_AUTORISES = ['produits', 'fournisseurs', 'utilisateurs'] as const;
type Dossier = (typeof DOSSIERS_AUTORISES)[number];

const TYPES_MIME_AUTORISES = ['image/jpeg', 'image/png', 'image/webp'];
const TAILLE_MAX_OCTETS = 5 * 1024 * 1024; // 5 Mo

@Controller('uploads')
export class UploadsController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('fichier'))
  async televerser(
    @CurrentTenant() entrepriseId: string,
    @Query('type') type: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: TAILLE_MAX_OCTETS, message: 'Image trop volumineuse (5 Mo maximum).' }),
        ],
        fileIsRequired: true,
      }),
    )
    fichier: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!DOSSIERS_AUTORISES.includes(type as Dossier)) {
      throw new BadRequestException(
        `Le paramètre "type" doit être l'un de : ${DOSSIERS_AUTORISES.join(', ')}.`,
      );
    }
    if (!TYPES_MIME_AUTORISES.includes(fichier.mimetype)) {
      throw new BadRequestException('Seules les images JPEG, PNG ou WEBP sont acceptées.');
    }

    const url = await this.cloudinaryService.televerserImage(fichier, type as Dossier, entrepriseId);
    return { url };
  }
}
