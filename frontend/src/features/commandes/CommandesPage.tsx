import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pluriel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { STATUTS_COMMANDE } from './statutsCommande';
import type { StatutCommande } from './statutsCommande';

interface Commande {
  id: string;
  statut: StatutCommande;
  createdAt: string;
  fournisseur: { nom: string };
  emplacement: { nom: string };
  utilisateur: { nom: string };
  _count: { lignes: number };
}

/**
 * Trois piles, dans l'ordre où le gérant doit agir : ce qui reste à
 * envoyer, ce qui doit arriver (à réceptionner), puis l'historique.
 */
const SECTIONS: { titre: string; meta: string; statuts: StatutCommande[] }[] = [
  { titre: 'À envoyer', meta: 'Brouillons prêts à partir chez le fournisseur', statuts: ['BROUILLON'] },
  { titre: 'En route', meta: 'À réceptionner à leur arrivée', statuts: ['ENVOYEE'] },
  { titre: 'Historique', meta: 'Commandes reçues ou annulées', statuts: ['RECUE', 'ANNULEE'] },
];

function LigneCommande({ commande }: { commande: Commande }) {
  const statut = STATUTS_COMMANDE[commande.statut];
  const n = commande._count.lignes;
  return (
    <li>
      <Link
        to={`/commandes/${commande.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-entete-tableau sm:px-5"
      >
        <Vignette nom={commande.fournisseur.nom} taille={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-corps font-medium text-ink-900">{commande.fournisseur.nom}</span>
          <span className="block truncate text-meta text-steel-500">
            {n} {pluriel('référence', n)} pour {commande.emplacement.nom}, par {commande.utilisateur.nom} le{' '}
            {new Date(commande.createdAt).toLocaleDateString('fr-FR')}
          </span>
        </span>
        <Badge variant={statut.variant}>{statut.libelle}</Badge>
        <ChevronRight className="size-4 shrink-0 text-steel-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function CommandesPage() {
  const navigate = useNavigate();

  const commandes = useQuery({
    queryKey: ['commandes'],
    queryFn: async () => (await api.get<Commande[]>('/commandes')).data,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Commandes fournisseur"
        description="De la préparation à la réception en dépôt."
        action={
          <Button onClick={() => navigate('/commandes/nouvelle')}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle commande
          </Button>
        }
      />

      {commandes.isLoading ? (
        <LoadingState />
      ) : commandes.isError ? (
        <Card>
          <ErrorState message={messageErreur(commandes.error)} onRetry={() => commandes.refetch()} />
        </Card>
      ) : commandes.data && commandes.data.length > 0 ? (
        SECTIONS.map((section) => {
          const liste = commandes.data.filter((c) => section.statuts.includes(c.statut));
          if (liste.length === 0) return null;
          return (
            <Card key={section.titre}>
              <PanneauEntete
                titre={
                  <>
                    {section.titre} <span className="font-normal text-steel-400">{liste.length}</span>
                  </>
                }
                meta={section.meta}
              />
              <ul className="divide-y divide-rule">
                {liste.map((commande) => (
                  <LigneCommande key={commande.id} commande={commande} />
                ))}
              </ul>
            </Card>
          );
        })
      ) : (
        <Card>
          <EmptyState
            titre="Aucune commande"
            description="Créez un bon de commande manuellement, ou depuis l’écran « Ce qui manque »."
            action={<Button onClick={() => navigate('/commandes/nouvelle')}>Nouvelle commande</Button>}
          />
        </Card>
      )}
    </div>
  );
}
