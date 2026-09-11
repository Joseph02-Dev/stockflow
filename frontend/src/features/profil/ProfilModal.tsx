import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { getSession, setSession, sessionActuelleEstPersistante } from '@/lib/session';
import { useSession } from '@/lib/useSession';

export function ProfilModal({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const session = useSession();
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(session?.utilisateur.photoUrl ?? undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = useMutation({
    mutationFn: async () => api.patch('/users/me/photo', { photoUrl }),
    onSuccess: () => {
      setErreur(null);
      const courante = getSession();
      if (courante && photoUrl) {
        setSession({ ...courante, utilisateur: { ...courante.utilisateur, photoUrl } }, sessionActuelleEstPersistante());
      }
      onFermer();
    },
    onError: (err) => setErreur(messageErreur(err, 'La mise à jour a échoué.')),
  });

  return (
    <Modal ouvert={ouvert} onFermer={onFermer} titre="Mon profil" description={session?.utilisateur.email}>
      <div className="flex flex-col gap-4">
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <ImageUploadField
          label="Photo de profil"
          valeur={photoUrl}
          dossier="utilisateurs"
          onChange={setPhotoUrl}
          forme="rond"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onFermer}>
            Fermer
          </Button>
          <Button
            onClick={() => enregistrer.mutate()}
            loading={enregistrer.isPending}
            disabled={!photoUrl || photoUrl === session?.utilisateur.photoUrl}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
