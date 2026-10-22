import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { ReferenceListSection } from './ReferenceListSection';

function useNombre(endpoint: 'categories' | 'marques') {
  const { data } = useQuery({
    queryKey: [endpoint],
    queryFn: async () => (await api.get<{ id: string; nom: string }[]>(`/${endpoint}`)).data,
  });
  return data ? ` (${data.length})` : '';
}

/** Référentiels qui classent le catalogue. L'onglet suit l'adresse (?onglet=marques). */
export function CategoriesMarquesPage() {
  const [parametresUrl, setParametresUrl] = useSearchParams();
  const actif = parametresUrl.get('onglet') === 'marques' ? 'marques' : 'categories';
  const nombreCategories = useNombre('categories');
  const nombreMarques = useNombre('marques');
  const onglets = [
    { cle: 'categories', libelle: `Catégories${nombreCategories}` },
    { cle: 'marques', libelle: `Marques${nombreMarques}` },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Catégories & marques" description="Pour classer vos produits, les filtrer et lire vos statistiques." />
      <Onglets
        onglets={onglets}
        actif={actif}
        onChange={(cle) => setParametresUrl(cle === 'categories' ? {} : { onglet: cle }, { replace: true })}
        libelle="Référentiels"
      />
      <div role="tabpanel">
        {actif === 'categories' ? (
          <ReferenceListSection key="categories" endpoint="categories" champ="categorie" libelleSingulier="catégorie" exemple="Quincaillerie" lienProduits />
        ) : (
          <ReferenceListSection key="marques" endpoint="marques" champ="marque" libelleSingulier="marque" exemple="Maggi" />
        )}
      </div>
    </div>
  );
}
