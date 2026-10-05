import { useNavigate } from 'react-router-dom';
import { gnf } from '@/lib/montant';
import { FormulaireCasse } from './FormulaireCasse';

/** Déclaration de casse en pleine page : l'écran utilisé au dépôt, sur téléphone. */
export function DeclarationCassePage() {
  const navigate = useNavigate();
  return (
    <FormulaireCasse
      presentation="page"
      onFermer={() => navigate('/pertes')}
      onDeclaree={(pertes) => {
        const valeur = pertes.reduce((a, p) => a + (p.valeurTotale ?? 0), 0);
        const quantite = pertes.reduce((a, p) => a + p.quantite, 0);
        navigate('/pertes', {
          state: { succes: `Perte déclarée : ${quantite} × ${pertes[0]?.produit.nom}, ${gnf(valeur)} au prix d’achat.` },
        });
      }}
    />
  );
}
