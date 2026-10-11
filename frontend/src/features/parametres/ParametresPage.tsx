import { Navigate, useSearchParams } from 'react-router-dom';
import { Card, PageHeader } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { ChoixApparence } from '@/components/patterns/SelecteurTheme';
import { EntrepriseSection } from './EntrepriseSection';
import { UtilisateursSection } from './UtilisateursSection';
import { ModulesSection } from './ModulesSection';
import { useSession } from '@/lib/useSession';

const onglets = [
  { cle: 'entreprise', libelle: 'Entreprise' },
  { cle: 'utilisateurs', libelle: 'Utilisateurs' },
  { cle: 'modules', libelle: 'Modules' },
  { cle: 'apparence', libelle: 'Apparence' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

function estOngletValide(valeur: string | null): valeur is CleOnglet {
  return onglets.some((o) => o.cle === valeur);
}

/**
 * Paramètres du compte : entreprise, équipe, modules métier, apparence. Emplacements et
 * Catégories & marques ont leurs propres pages ; leurs anciennes adresses
 * (?onglet=…) y redirigent. L'onglet suit l'adresse, si bien qu'un lien
 * vers un autre onglet change bien d'onglet sur la page déjà ouverte.
 */
export function ParametresPage() {
  const [parametresUrl, setParametresUrl] = useSearchParams();
  const onglet = parametresUrl.get('onglet');
  const estAdmin = useSession()?.utilisateur.role === 'ADMIN';

  if (onglet === 'emplacements') return <Navigate to="/emplacements" replace />;
  if (onglet === 'categories' || onglet === 'marques') {
    return <Navigate to={onglet === 'marques' ? '/categories?onglet=marques' : '/categories'} replace />;
  }
  // Modules métier : réglés par l'administrateur seulement.
  const visibles = onglets.filter((o) => o.cle !== 'modules' || estAdmin);
  const actif: CleOnglet = estOngletValide(onglet) && visibles.some((o) => o.cle === onglet) ? onglet : 'entreprise';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Paramètres" description="Votre entreprise, votre équipe et l’apparence de cet appareil." />

      <Onglets
        onglets={visibles}
        actif={actif}
        onChange={(cle) => setParametresUrl(cle === 'entreprise' ? {} : { onglet: cle }, { replace: true })}
        libelle="Sections des paramètres"
      />

      <div role="tabpanel">
        {actif === 'entreprise' && <EntrepriseSection />}
        {actif === 'utilisateurs' && <UtilisateursSection />}
        {actif === 'modules' && <ModulesSection />}
        {actif === 'apparence' && (
          // Préférence propre à cet appareil, jamais enregistrée sur le compte.
          <Card className="max-w-[520px] p-5">
            <ChoixApparence />
          </Card>
        )}
      </div>
    </div>
  );
}
