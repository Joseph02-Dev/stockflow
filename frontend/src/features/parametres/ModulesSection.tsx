import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { useModules } from '@/lib/useModules';
import { Alert } from '@/components/ui/Alert';
import { LoadingState } from '@/components/patterns/States';
import { STRATEGIES } from '@/lib/strategieSortie';
import { FAMILLES, ICONES_MODULE, MODULES, type CleModule } from './modulesMetier';
import { EnteteSection } from './EnteteSection';

/** Réglage propre à un module, affiché dans sa carte quand il est activé. */
interface ReglageModule {
  titre: string;
  aide: string;
  champ: 'methodeValorisation' | 'strategieSortie';
  options: { valeur: string; libelle: string }[];
}

const REGLAGES: Partial<Record<CleModule, ReglageModule>> = {
  valorisation: {
    titre: 'Coût des sorties',
    aide: 'La valeur des entrées est toujours leur coût d’achat.',
    champ: 'methodeValorisation',
    options: [
      { valeur: 'PMP', libelle: 'Coût moyen pondéré' },
      { valeur: 'FIFO', libelle: 'Premier entré, premier sorti' },
    ],
  },
  strategiesSortie: {
    titre: 'Ordre de sortie par défaut',
    aide: 'Chaque emplacement peut en choisir un autre.',
    champ: 'strategieSortie',
    // « FEFO — premier périmé, premier sorti » → « Premier périmé, premier sorti »
    options: STRATEGIES.map((s) => {
      const libelle = s.libelle.split(' — ')[1] ?? s.libelle;
      return { valeur: s.valeur, libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1) };
    }),
  },
};

export function ModulesSection() {
  const queryClient = useQueryClient();
  const modules = useModules();
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  const basculer = useMutation({
    mutationFn: async ({ champ, valeur }: { champ: string; valeur: boolean | string }) =>
      api.patch('/entreprise', { [champ]: valeur }),
    onSuccess: (_, { valeur }) => {
      setResultat({
        ok: true,
        texte: typeof valeur === 'string' ? 'Réglage enregistré.' : valeur ? 'Module activé.' : 'Module désactivé.',
      });
      queryClient.invalidateQueries({ queryKey: ['entreprise'] });
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
    },
    onError: (e) => setResultat({ ok: false, texte: messageErreur(e, 'La modification a échoué.') }),
  });

  if (!modules.charge) return <LoadingState />;

  const nombreActifs = MODULES.filter((m) => modules[m.cle]).length;
  const valeurReglage = (champ: ReglageModule['champ']) =>
    champ === 'methodeValorisation' ? modules.methodeValorisation : modules.strategieSortie;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <EnteteSection
          titre="Modules métier"
          description={
            <>
              <b className="font-semibold text-ink-900 tabular-nums">
                {nombreActifs} {nombreActifs > 1 ? 'modules activés' : 'module activé'} sur {MODULES.length}
              </b>{' '}
              — un module désactivé disparaît de l’application : l’interface reste simple.
            </>
          }
        />
        <div className="parametres-jauge mt-3" aria-hidden="true">
          {MODULES.map((m) => (
            <i key={m.cle} data-actif={modules[m.cle] || undefined} />
          ))}
        </div>
      </div>

      {resultat && <Alert variant={resultat.ok ? 'success' : 'error'}>{resultat.texte}</Alert>}

      {FAMILLES.map((famille) => (
        <section key={famille.titre} aria-label={famille.titre}>
          <h3 className="parametres-famille">{famille.titre}</h3>
          <div className="parametres-modules">
            {famille.modules.map((cle) => {
              const { champ, libelle, aide } = MODULES.find((m) => m.cle === cle)!;
              const actif = modules[cle];
              const Icone = ICONES_MODULE[cle];
              const reglage = REGLAGES[cle];
              return (
                <div key={cle} className="parametres-carte parametres-module" data-actif={actif || undefined}>
                  <div className="flex items-start gap-3">
                    <span className="parametres-module-icone" aria-hidden="true">
                      <Icone className="size-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-[14.5px] font-semibold text-ink-900">{libelle}</h4>
                      <p className="mt-0.5 text-[12.5px] leading-[1.5] text-steel-500">{aide}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={actif}
                      aria-label={libelle}
                      disabled={basculer.isPending}
                      onClick={() => basculer.mutate({ champ, valeur: !actif })}
                      className="parametres-interrupteur"
                    />
                  </div>
                  {reglage && actif && (
                    <div className="border-t border-dashed border-rule pt-2.5" role="group" aria-label={reglage.titre}>
                      <p className="mb-1.5 text-[12px] font-semibold text-steel-500">{reglage.titre}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {reglage.options.map((o) => (
                          <button
                            key={o.valeur}
                            type="button"
                            className="parametres-segment"
                            aria-pressed={valeurReglage(reglage.champ) === o.valeur}
                            disabled={basculer.isPending}
                            onClick={() =>
                              valeurReglage(reglage.champ) !== o.valeur && basculer.mutate({ champ: reglage.champ, valeur: o.valeur })
                            }
                          >
                            <span className="font-mono">{o.valeur}</span> · {o.libelle}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[12px] text-steel-400">{reglage.aide}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
