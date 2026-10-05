import { useState } from 'react';
import { messageErreur } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

/**
 * Saisie d'un nom pour créer une entrée à la volée depuis un sélecteur
 * (catégorie, marque…), prérempli avec le terme cherché. Monté à
 * l'ouverture et démonté à la fermeture : l'état repart neuf.
 */
export function ModaleNom({
  titre,
  label,
  valeurInitiale,
  onValider,
  onFermer,
}: {
  titre: string;
  label: string;
  valeurInitiale: string;
  onValider: (nom: string) => Promise<void>;
  onFermer: () => void;
}) {
  const [nom, setNom] = useState(valeurInitiale);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider() {
    if (!nom.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      await onValider(nom.trim());
      onFermer();
    } catch (e) {
      setErreur(messageErreur(e, 'La création a échoué.'));
      setEnCours(false);
    }
  }

  return (
    <Modal
      ouvert
      onFermer={onFermer}
      titre={titre}
      modifie={nom.trim() !== valeurInitiale.trim()}
      pied={
        <>
          <Button variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit" form="modale-nom" loading={enCours} disabled={!nom.trim()}>
            Créer
          </Button>
        </>
      }
    >
      <form
        id="modale-nom"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void valider();
        }}
      >
        <Input label={label} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={100} />
        {erreur && <Alert variant="error">{erreur}</Alert>}
      </form>
    </Modal>
  );
}
