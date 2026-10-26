import { useState } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { activerPush, desactiverPush, messageEchecPush, useEtatPush } from '@/lib/notificationsPush';

/**
 * Haut du panneau de la cloche : activer, sur cet appareil, les alertes en
 * notification push (avec le son du téléphone, même en veille), ou dire
 * pourquoi ce n'est pas possible ici.
 */
export function ActivationPush() {
  const etat = useEtatPush();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const agir = async (action: () => Promise<void>) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
    } catch (e) {
      setErreur(messageEchecPush(e));
    } finally {
      setEnCours(false);
    }
  };

  if (etat === 'chargement' || etat === 'indisponible') return null;

  if (etat === 'actif') {
    return (
      <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-md bg-ok-wash px-3 py-2 text-meta text-ok">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <BellRing className="size-4" aria-hidden="true" />
          Alertes activées sur cet appareil
        </span>
        <button
          type="button"
          onClick={() => void agir(desactiverPush)}
          disabled={enCours}
          className="rounded px-1.5 py-0.5 font-semibold text-steel-700 transition-colors hover:bg-white/60 disabled:opacity-60"
        >
          Désactiver
        </button>
      </div>
    );
  }

  if (etat === 'installer' || etat === 'refuse') {
    return (
      <p className="mx-3 mt-3 flex gap-2 rounded-md bg-survol px-3 py-2 text-meta text-steel-700">
        <BellOff className="mt-0.5 size-4 shrink-0 text-steel-500" aria-hidden="true" />
        {etat === 'installer'
          ? 'Pour recevoir les alertes sur iPhone ou iPad, installez d’abord l’application : Partager, puis « Sur l’écran d’accueil ».'
          : 'Les notifications sont bloquées sur cet appareil. Autorisez-les pour NimbaFlow dans les réglages du navigateur pour recevoir les alertes.'}
      </p>
    );
  }

  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-md border border-action/25 bg-action-wash px-3 py-2.5">
      <BellRing className="size-5 shrink-0 text-action" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-meta font-semibold text-ink-900">Recevoir les alertes sur cet appareil</p>
        <p className="text-meta text-steel-700">
          {erreur ?? 'Avec le son du téléphone, même en veille.'}
        </p>
      </div>
      <Button taille="sm" loading={enCours} onClick={() => void agir(activerPush)}>
        Activer
      </Button>
    </div>
  );
}
