import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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
      <nav aria-label="Fil d’Ariane" className="flex items-center gap-1 text-sm text-text-secondary">
        <Link to="/fournisseurs" className="hover:text-text-primary hover:underline">
          Fournisseurs
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span className="text-text-primary">Détail</span>
      </nav>
      <FournisseurDetail fournisseurId={id} />
    </div>
  );
}
