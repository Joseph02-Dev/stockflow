import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useModules } from '@/lib/useModules';
import { Alert } from '@/components/ui/Alert';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { LoadingState } from '@/components/patterns/States';

type CleModule = 'lots' | 'arborescence';

/** Modules métier : l'administrateur n'affiche que ce dont son activité a besoin. */
const MODULES: { cle: CleModule; champ: string; libelle: string; aide: string }[] = [
  {
    cle: 'lots',
    champ: 'moduleLots',
    libelle: 'Lots et péremptions',
    aide: 'Numéros de lot, dates de péremption et sorties « premier périmé, premier sorti ». Pharmacie, alimentaire, cosmétique…',
  },
  {
    cle: 'arborescence',
    champ: 'moduleArborescence',
    libelle: 'Arborescence des emplacements',
    aide: 'Ranger les emplacements les uns dans les autres : Dépôt › Zone › Allée › Étagère.',
  },
];

export function ModulesSection() {
  const queryClient = useQueryClient();
  const modules = useModules();
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  const basculer = useMutation({
    mutationFn: async ({ champ, valeur }: { champ: string; valeur: boolean }) => api.patch('/entreprise', { [champ]: valeur }),
    onSuccess: (_, { valeur }) => {
      setResultat({ ok: true, texte: valeur ? 'Module activé.' : 'Module désactivé.' });
      queryClient.invalidateQueries({ queryKey: ['entreprise'] });
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
    },
    onError: (e) => setResultat({ ok: false, texte: messageErreur(e, 'La modification a échoué.') }),
  });

  if (!modules.charge) return <LoadingState />;

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {resultat && <Alert variant={resultat.ok ? 'success' : 'error'}>{resultat.texte}</Alert>}
      <Card>
        <PanneauEntete titre="Modules métier" meta="Un module désactivé disparaît de l’application : l’interface reste simple." />
        <ul className="divide-y divide-rule">
          {MODULES.map(({ cle, champ, libelle, aide }) => {
            const actif = modules[cle];
            return (
              <li key={cle} className="flex items-center justify-between gap-6 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-corps font-medium text-ink-900">{libelle}</p>
                  <p className="text-meta text-steel-500">{aide}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={actif}
                  aria-label={libelle}
                  disabled={basculer.isPending}
                  onClick={() => basculer.mutate({ champ, valeur: !actif })}
                  className={cn(
                    'inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-1 pr-3 text-meta font-medium transition-colors disabled:opacity-60',
                    actif ? 'border-action bg-action-wash text-action' : 'border-rule-strong bg-paper text-steel-500',
                  )}
                >
                  <span className={cn('size-5 rounded-full transition-colors', actif ? 'bg-action' : 'bg-steel-400')} aria-hidden="true" />
                  {actif ? 'Activé' : 'Désactivé'}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
