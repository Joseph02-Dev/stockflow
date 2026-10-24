import { useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/patterns/Logo';
import { installerAppli, useModeInstallation } from '@/lib/installation';

/**
 * « Installer l'application » : fenêtre d'installation du navigateur
 * (Android, ordinateurs), ou guide pas à pas sur iPhone et iPad, où Safari
 * n'en propose pas. Rien quand l'application est déjà installée ou que le
 * navigateur ne sait pas l'installer.
 *
 * - menu : ligne du menu du compte (bureau) ;
 * - carte : encart du menu mobile.
 */
export function BoutonInstaller({ variante, onAction }: { variante: 'menu' | 'carte'; onAction?: () => void }) {
  const mode = useModeInstallation();
  const [guideOuvert, setGuideOuvert] = useState(false);
  if (!mode) return null;

  function installer() {
    onAction?.();
    if (mode === 'apple') setGuideOuvert(true);
    else void installerAppli();
  }

  return (
    <>
      {variante === 'menu' ? (
        <button
          type="button"
          onClick={installer}
          className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-corps font-medium text-ink-900 hover:bg-survol"
        >
          <Download className="size-4 text-steel-500" aria-hidden="true" />
          Installer l’application
        </button>
      ) : (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-[14px] border border-rule bg-paper p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-action text-sur-couleur" aria-hidden="true">
            <Logo taille={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-corps font-semibold text-ink-900">Installer NimbaFlow</p>
            <p className="text-meta text-steel-500">Sur l’écran d’accueil, utilisable hors ligne.</p>
          </div>
          <Button taille="sm" onClick={installer}>
            <Download className="size-4" aria-hidden="true" />
            Installer
          </Button>
        </div>
      )}

      <Modal
        ouvert={guideOuvert}
        onFermer={() => setGuideOuvert(false)}
        titre="Installer sur iPhone ou iPad"
        description="Safari installe l’application en deux gestes."
        pied={<Button onClick={() => setGuideOuvert(false)}>J’ai compris</Button>}
      >
        <ol className="flex flex-col gap-3">
          {[
            { Icone: Share, texte: 'Touchez le bouton Partager, en bas de l’écran (en haut sur iPad).' },
            { Icone: SquarePlus, texte: 'Choisissez « Sur l’écran d’accueil », puis « Ajouter ».' },
          ].map(({ Icone, texte }, i) => (
            <li key={texte} className={cn('flex items-center gap-3 rounded-lg border border-rule p-3 text-corps text-ink-900')}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-action-wash font-semibold text-action">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">{texte}</span>
              <Icone className="size-5 shrink-0 text-action" strokeWidth={1.75} aria-hidden="true" />
            </li>
          ))}
        </ol>
        <p className="mt-3 text-meta text-steel-500">
          NimbaFlow s’ouvre ensuite depuis son icône, en plein écran, comme une application.
        </p>
      </Modal>
    </>
  );
}
