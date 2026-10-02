import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, BellOff, LogOut, Undo2 } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiConsole } from './api';

const MOTIFS = [
  'Impayé',
  'Demande de l’entreprise',
  'Usage anormal détecté',
  'Période d’essai terminée',
  'Autre',
] as const;

export interface CibleSuspension {
  id: string;
  nom: string;
  utilisateurs: number;
  references: number;
}

/**
 * Pas de « êtes-vous sûr ? » : la modale montre ce que la suspension
 * va réellement produire, chiffré depuis les données de l'entreprise.
 * Le motif est obligatoire et part au journal d'audit.
 */
export function ModaleSuspension({ cible, onFermer }: { cible: CibleSuspension | null; onFermer: () => void }) {
  const queryClient = useQueryClient();
  const [motif, setMotif] = useState<(typeof MOTIFS)[number] | null>(null);
  const [precision, setPrecision] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const motifFinal = motif === 'Autre' ? precision.trim() && `Autre : ${precision.trim()}` : motif;

  const suspendre = useMutation({
    mutationFn: async () => apiConsole.post(`/console/entreprises/${cible?.id}/suspendre`, { motif: motifFinal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['console'] });
      fermer();
    },
    onError: (e) => setErreur(messageErreur(e, 'La suspension a échoué.')),
  });

  function fermer() {
    setMotif(null);
    setPrecision('');
    setErreur(null);
    onFermer();
  }

  if (!cible) return null;

  const impacts = [
    {
      Icone: LogOut,
      texte: `${formatNombre(cible.utilisateurs)} ${pluriel('utilisateur', cible.utilisateurs)} ${
        cible.utilisateurs > 1 ? 'seront déconnectés' : 'sera déconnecté'
      } immédiatement et ne ${cible.utilisateurs > 1 ? 'pourront' : 'pourra'} plus se reconnecter`,
      grave: true,
    },
    {
      Icone: ArchiveRestore,
      texte: `Les ${formatNombre(cible.references)} ${pluriel('référence', cible.references)} et l’historique des mouvements sont conservés, rien n’est supprimé`,
    },
    { Icone: BellOff, texte: 'Les alertes de stock et les emails cessent d’être envoyés' },
    { Icone: Undo2, texte: 'L’accès est rétabli en un clic, les données retrouvées intactes' },
  ];

  return (
    <Modal
      ouvert
      onFermer={fermer}
      titre={`Suspendre l’accès de ${cible.nom}`}
      pied={
        <>
          <Button variant="secondary" onClick={fermer}>
            Annuler
          </Button>
          <Button variant="danger" disabled={!motifFinal} loading={suspendre.isPending} onClick={() => suspendre.mutate()}>
            Suspendre l’accès
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <ul className="flex flex-col gap-2.5">
          {impacts.map(({ Icone, texte, grave }) => (
            <li key={texte} className="flex items-start gap-2.5 text-corps text-ink-900">
              <span
                className={cn(
                  'mt-px flex size-[22px] shrink-0 items-center justify-center rounded-sm',
                  grave ? 'bg-rupture-wash text-rupture' : 'bg-paper text-steel-500',
                )}
                aria-hidden="true"
              >
                <Icone className="size-3.5" />
              </span>
              {texte}
            </li>
          ))}
        </ul>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-corps font-medium text-ink-900">
            Motif <span className="font-normal text-steel-500">(obligatoire, inscrit au journal)</span>
          </legend>
          {MOTIFS.map((m) => (
            <label
              key={m}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-corps transition-colors',
                motif === m ? 'border-console bg-console-wash text-ink-900' : 'border-rule hover:border-rule-strong',
              )}
            >
              <input
                type="radio"
                name="motif"
                value={m}
                checked={motif === m}
                onChange={() => setMotif(m)}
                className="size-4 accent-console"
              />
              {m}
            </label>
          ))}
          {motif === 'Autre' && (
            <textarea
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              maxLength={400}
              rows={2}
              placeholder="Précisez le motif"
              aria-label="Précision du motif"
              className="mt-1 rounded-md border border-rule-strong px-3 py-2 text-corps text-ink-900 placeholder:text-steel-400 focus:border-console"
            />
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
