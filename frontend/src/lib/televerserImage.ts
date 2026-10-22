import { api } from '@/lib/api';

export type DossierImage = 'produits' | 'fournisseurs' | 'utilisateurs' | 'pertes' | 'entreprise';

const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;
const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp'];

/** Fichier refusé avant tout envoi (type ou taille) : message prêt à afficher. */
export class ErreurImage extends Error {}

/**
 * Vérifie puis téléverse une image vers le backend (qui relaie vers
 * Cloudinary) et renvoie son URL. Lève ErreurImage pour un fichier refusé.
 */
export async function televerserImage(fichier: File, dossier: DossierImage): Promise<string> {
  if (!TYPES_ACCEPTES.includes(fichier.type)) throw new ErreurImage('Seules les images JPEG, PNG ou WEBP sont acceptées.');
  if (fichier.size > TAILLE_MAX_OCTETS) throw new ErreurImage('Image trop volumineuse (5 Mo maximum).');
  const formData = new FormData();
  formData.append('fichier', fichier);
  const { data } = await api.post<{ url: string }>(`/uploads/image?type=${dossier}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.url;
}
