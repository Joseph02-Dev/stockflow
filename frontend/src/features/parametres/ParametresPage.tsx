import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/patterns/Page';
import { EntrepriseSection } from './EntrepriseSection';
import { EmplacementsSection } from './EmplacementsSection';
import { UtilisateursSection } from './UtilisateursSection';
import { ReferenceListSection } from './ReferenceListSection';
import { Onglets } from '@/components/patterns/Onglets';

const onglets = [
  { cle: 'entreprise', libelle: 'Entreprise' },
  { cle: 'emplacements', libelle: 'Emplacements' },
  { cle: 'utilisateurs', libelle: 'Utilisateurs' },
  { cle: 'categories', libelle: 'Catégories' },
  { cle: 'marques', libelle: 'Marques' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

function estOngletValide(valeur: string | null): valeur is CleOnglet {
  return onglets.some((o) => o.cle === valeur);
}

export function ParametresPage() {
  const [parametresUrl] = useSearchParams();
  const ongletDepuisUrl = parametresUrl.get('onglet');
  const [actif, setActif] = useState<CleOnglet>(
    estOngletValide(ongletDepuisUrl) ? ongletDepuisUrl : 'entreprise',
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Paramètres" description="Votre entreprise, vos dépôts, votre équipe et vos référentiels." />

      <Onglets onglets={onglets} actif={actif} onChange={setActif} libelle="Sections des paramètres" />

      <div role="tabpanel">
        {actif === 'entreprise' && <EntrepriseSection />}
        {actif === 'emplacements' && <EmplacementsSection />}
        {actif === 'utilisateurs' && <UtilisateursSection />}
        {actif === 'categories' && (
          <ReferenceListSection endpoint="categories" libelleSingulier="catégorie" libellePluriel="catégories" />
        )}
        {actif === 'marques' && (
          <ReferenceListSection endpoint="marques" libelleSingulier="marque" libellePluriel="marques" />
        )}
      </div>
    </div>
  );
}
