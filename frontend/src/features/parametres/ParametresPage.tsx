import { useState } from 'react';
import { PageHeader } from '@/components/patterns/Page';
import { EntrepriseSection } from './EntrepriseSection';
import { EmplacementsSection } from './EmplacementsSection';
import { UtilisateursSection } from './UtilisateursSection';
import { ReferenceListSection } from './ReferenceListSection';
import { cn } from '@/lib/cn';

const onglets = [
  { cle: 'entreprise', libelle: 'Entreprise' },
  { cle: 'emplacements', libelle: 'Emplacements' },
  { cle: 'utilisateurs', libelle: 'Utilisateurs' },
  { cle: 'categories', libelle: 'Catégories' },
  { cle: 'marques', libelle: 'Marques' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

export function ParametresPage() {
  const [actif, setActif] = useState<CleOnglet>('entreprise');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader titre="Paramètres" description="Configuration de votre entreprise." />

      <div className="border-b border-border-subtle" role="tablist" aria-label="Sections des paramètres">
        <div className="flex gap-1 overflow-x-auto">
          {onglets.map((onglet) => (
            <button
              key={onglet.cle}
              type="button"
              role="tab"
              aria-selected={actif === onglet.cle}
              onClick={() => setActif(onglet.cle)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                actif === onglet.cle
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {onglet.libelle}
            </button>
          ))}
        </div>
      </div>

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
