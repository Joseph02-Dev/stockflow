import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { ReferenceListSection } from './ReferenceListSection';

const onglets = [
  { cle: 'categories', libelle: 'Catégories' },
  { cle: 'marques', libelle: 'Marques' },
] as const;

/** Référentiels qui classent le catalogue. L'onglet suit l'adresse (?onglet=marques). */
export function CategoriesMarquesPage() {
  const [parametresUrl, setParametresUrl] = useSearchParams();
  const actif = parametresUrl.get('onglet') === 'marques' ? 'marques' : 'categories';

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
          <ReferenceListSection endpoint="categories" libelleSingulier="catégorie" libellePluriel="catégories" />
        ) : (
          <ReferenceListSection endpoint="marques" libelleSingulier="marque" libellePluriel="marques" />
        )}
      </div>
    </div>
  );
}
