import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { ErreurImage, televerserImage, type DossierImage } from '@/lib/televerserImage';
import { cn } from '@/lib/cn';

interface ImageUploadFieldProps {
  label: string;
  valeur?: string;
  dossier: DossierImage;
  onChange: (url: string | undefined) => void;
  /** Forme ronde pour les avatars, carrée pour produits/fournisseurs. */
  forme?: 'carre' | 'rond';
}

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

    setErreur(null);
    setEnCours(true);
    try {
      onChange(await televerserImage(fichier, dossier));
    } catch (error) {
      setErreur(error instanceof ErreurImage ? error.message : messageErreur(error, 'L’envoi de l’image a échoué.'));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-corps font-medium text-ink-900">{label}</span>

      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-20 shrink-0 items-center justify-center overflow-hidden border border-rule bg-paper',
            forme === 'rond' ? 'rounded-full' : 'rounded-lg',
          )}
        >
          {enCours ? (
            <Loader2 className="size-6 animate-spin text-steel-500" aria-hidden="true" />
          ) : valeur ? (
            <img src={valeur} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-steel-500" aria-hidden="true" />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={enCours}
              className="rounded-md border border-rule bg-surface px-3 py-1.5 text-corps font-medium text-ink-900 transition-colors hover:bg-survol disabled:opacity-50"
            >
              {valeur ? 'Changer' : 'Choisir une image'}
            </button>
            {valeur && !enCours && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                aria-label="Retirer l’image"
                className="rounded-md p-1.5 text-steel-500 transition-colors hover:bg-survol hover:text-rupture"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <span className="text-meta text-steel-500">JPEG, PNG ou WEBP — 5 Mo maximum.</span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={surSelection}
        className="hidden"
      />

      {erreur && <p className="text-meta text-rupture">{erreur}</p>}
    </div>
  );
}
