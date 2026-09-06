import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';

interface ImageUploadFieldProps {
  label: string;
  valeur?: string;
  dossier: 'produits' | 'fournisseurs' | 'utilisateurs';
  onChange: (url: string | undefined) => void;
  /** Forme ronde pour les avatars, carrée pour produits/fournisseurs. */
  forme?: 'carre' | 'rond';
}

const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;
const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Téléverse directement vers le backend (qui relaie vers Cloudinary) dès
 * la sélection du fichier — pas de bouton "envoyer" séparé, l'aperçu se
 * met à jour une fois l'URL obtenue.
 */
export function ImageUploadField({ label, valeur, dossier, onChange, forme = 'carre' }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function surSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    event.target.value = ''; // permet de resélectionner le même fichier ensuite
    if (!fichier) return;

    if (!TYPES_ACCEPTES.includes(fichier.type)) {
      setErreur('Seules les images JPEG, PNG ou WEBP sont acceptées.');
      return;
    }
    if (fichier.size > TAILLE_MAX_OCTETS) {
      setErreur('Image trop volumineuse (5 Mo maximum).');
      return;
    }

    setErreur(null);
    setEnCours(true);
    try {
      const formData = new FormData();
      formData.append('fichier', fichier);
      const { data } = await api.post<{ url: string }>(`/uploads/image?type=${dossier}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data.url);
    } catch (error) {
      setErreur(messageErreur(error, 'L’envoi de l’image a échoué.'));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>

      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-20 shrink-0 items-center justify-center overflow-hidden border border-border-subtle bg-background',
            forme === 'rond' ? 'rounded-full' : 'rounded-(--radius-card)',
          )}
        >
          {enCours ? (
            <Loader2 className="size-6 animate-spin text-text-secondary" aria-hidden="true" />
          ) : valeur ? (
            <img src={valeur} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-text-secondary" aria-hidden="true" />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={enCours}
              className="rounded-(--radius-button) border border-border-subtle bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-background disabled:opacity-50"
            >
              {valeur ? 'Changer' : 'Choisir une image'}
            </button>
            {valeur && !enCours && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                aria-label="Retirer l’image"
                className="rounded-(--radius-button) p-1.5 text-text-secondary transition-colors hover:bg-background hover:text-error"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <span className="text-xs text-text-secondary">JPEG, PNG ou WEBP — 5 Mo maximum.</span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={surSelection}
        className="hidden"
      />

      {erreur && <p className="text-xs text-error">{erreur}</p>}
    </div>
  );
}
