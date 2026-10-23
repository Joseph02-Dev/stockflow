import { useNavigate } from 'react-router-dom';
import { FormulaireCasse } from './FormulaireCasse';

/** Déclaration de casse en pleine page : l'écran utilisé au dépôt, sur téléphone. */
export function DeclarationCassePage() {
  const navigate = useNavigate();
  return (
    <FormulaireCasse
      presentation="page"
      onFermer={() => navigate('/pertes')}
      onDeclaree={(message) => navigate('/pertes', { state: { succes: message } })}
    />
  );
}
