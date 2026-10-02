import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNombre } from '@/lib/format';
import { Button } from '@/components/ui/Button';

export function Pagination({
  page,
  taille,
  total,
  onChange,
}: {
  page: number;
  taille: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / taille));
  if (total <= taille) return null;
  const debut = (page - 1) * taille + 1;
  const fin = Math.min(page * taille, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
      <p className="text-meta text-steel-500">
        {formatNombre(debut)}–{formatNombre(fin)} sur {formatNombre(total)}
      </p>
      <div className="flex gap-1.5">
        <Button variant="secondary" taille="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Précédent
        </Button>
        <Button variant="secondary" taille="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Suivant
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
