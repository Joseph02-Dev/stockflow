import { useParams } from 'react-router-dom';
import { FournisseurDetail } from './FournisseurDetail';

/**
 * Page dédiée (route /fournisseurs/:id) — utilisée directement sur
 * mobile, et pour tout lien externe vers un fournisseur précis. Sur
 * desktop, FournisseursPage affiche FournisseurDetail en ligne dans une
 * vue maître-détail plutôt que de naviguer ici.
 */
export function FournisseurDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Fiche fournisseur</h1>
      <FournisseurDetail fournisseurId={id} />
    </div>
  );
}
