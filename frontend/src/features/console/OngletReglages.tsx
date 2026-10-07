import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { messageErreur } from '@/lib/api';
import { formatNombre } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { apiConsole } from './api';

export interface Reglages {
  limites: { emplacements: number | null; utilisateurs: number | null; references: number | null };
  modules: { inventaires: boolean; transferts: boolean };
  usage: { emplacements: number; utilisateurs: number; references: number };
}

type CleLimite = keyof Reglages['limites'];
type CleModule = keyof Reglages['modules'];

const LIMITES: { cle: CleLimite; champ: string; libelle: string; aide: string }[] = [
  { cle: 'emplacements', champ: 'limiteEmplacements', libelle: 'Emplacements', aide: 'Emplacements actifs (les archivés ne comptent pas)' },
  { cle: 'utilisateurs', champ: 'limiteUtilisateurs', libelle: 'Utilisateurs', aide: 'Comptes et invitations en attente' },
  { cle: 'references', champ: 'limiteReferences', libelle: 'Références', aide: 'Produits actifs du catalogue' },
];

const MODULES: { cle: CleModule; champ: string; libelle: string; aide: string }[] = [
  { cle: 'inventaires', champ: 'moduleInventaires', libelle: 'Inventaires', aide: 'Comptages physiques par emplacement et correction des écarts' },
  { cle: 'transferts', champ: 'moduleTransferts', libelle: 'Transferts', aide: 'Déplacement de stock d’un emplacement à un autre' },
];

/**
 * Réglages d'une entreprise (phase 2). Les valeurs sont appliquées par le
 * serveur ; une limite sous l'usage actuel est refusée ici avant même
 * l'envoi, et de toute façon par le serveur.
 */
export function OngletReglages({ entrepriseId, reglages }: { entrepriseId: string; reglages: Reglages }) {
  const queryClient = useQueryClient();
  // Saisie conservée en texte : un champ vide = illimité.
  const [limites, setLimites] = useState<Record<CleLimite, string>>({
    emplacements: reglages.limites.emplacements?.toString() ?? '',
    utilisateurs: reglages.limites.utilisateurs?.toString() ?? '',
    references: reglages.limites.references?.toString() ?? '',
  });
  const [modules, setModules] = useState(reglages.modules);
  const [motif, setMotif] = useState('');
  const [resultat, setResultat] = useState<{ ok: boolean; texte: string } | null>(null);

  // Formulaire initialisé une seule fois, puis resynchronisé avec la
  // réponse du serveur après chaque enregistrement (pas de remontage, qui
  // effacerait le message de confirmation).
  function synchroniser(valeurs: Pick<Reglages, 'limites' | 'modules'>) {
    setLimites({
      emplacements: valeurs.limites.emplacements?.toString() ?? '',
      utilisateurs: valeurs.limites.utilisateurs?.toString() ?? '',
      references: valeurs.limites.references?.toString() ?? '',
    });
    setModules(valeurs.modules);
  }

  const versValeur = (texte: string) => (texte.trim() === '' ? null : Number(texte));
  const erreurs = LIMITES.flatMap(({ cle, libelle }) => {
    const v = versValeur(limites[cle]);
    if (v === null) return [];
    if (!Number.isInteger(v) || v < 1) return [`${libelle} : saisissez un entier positif, ou laissez vide pour « illimité ».`];
    if (v < reglages.usage[cle]) return [`${libelle} : l’entreprise en utilise déjà ${reglages.usage[cle]}.`];
    return [];
  });
  const modifie =
    LIMITES.some(({ cle }) => versValeur(limites[cle]) !== reglages.limites[cle]) ||
    MODULES.some(({ cle }) => modules[cle] !== reglages.modules[cle]);

  const enregistrer = useMutation({
    mutationFn: async () => {
      const corps: Record<string, unknown> = {};
      for (const { cle, champ } of LIMITES) {
        const v = versValeur(limites[cle]);
        if (v !== reglages.limites[cle]) corps[champ] = v;
      }
      for (const { cle, champ } of MODULES) {
        if (modules[cle] !== reglages.modules[cle]) corps[champ] = modules[cle];
      }
      if (motif.trim()) corps.motif = motif.trim();
      return (await apiConsole.patch<Reglages & { changements: string[] }>(`/console/entreprises/${entrepriseId}/reglages`, corps)).data;
    },
    onSuccess: (data) => {
      synchroniser(data);
      setResultat({ ok: true, texte: `Réglages enregistrés et journalisés : ${data.changements.join(' ; ')}.` });
      setMotif('');
      queryClient.invalidateQueries({ queryKey: ['console'] });
    },
    onError: (e) => setResultat({ ok: false, texte: messageErreur(e, 'L’enregistrement a échoué.') }),
  });

  return (
    <div className="flex flex-col gap-5">
      {resultat && <Alert variant={resultat.ok ? 'success' : 'error'}>{resultat.texte}</Alert>}

      <Card>
        <PanneauEntete titre="Limites" meta="Laissez vide pour « illimité ». Une limite ne peut pas descendre sous l’usage actuel." />
        <ul className="divide-y divide-rule">
          {LIMITES.map(({ cle, libelle, aide }) => {
            const limite = versValeur(limites[cle]);
            const utilise = reglages.usage[cle];
            const ratio = limite ? Math.min(1, utilise / limite) : 0;
            const id = `limite-${cle}`;
            return (
              <li key={cle} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4">
                <div className="min-w-0">
                  <label htmlFor={id} className="text-corps font-medium text-ink-900">
                    {libelle}
                  </label>
                  <p className="text-meta text-steel-500">{aide}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-rule" aria-hidden="true">
                      <div
                        className={cn('h-full rounded-full', ratio >= 1 ? 'bg-faible' : 'bg-console')}
                        style={{ width: `${limite ? ratio * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-meta text-steel-500">
                      <span className="font-semibold text-ink-900">{formatNombre(utilise)}</span>{' '}
                      {limite ? `sur ${formatNombre(limite)}` : 'utilisés, sans limite'}
                      {limite !== null && utilise >= limite && ' — limite atteinte'}
                    </span>
                  </div>
                </div>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={Math.max(1, utilise)}
                  placeholder="Illimité"
                  value={limites[cle]}
                  onChange={(e) => setLimites((l) => ({ ...l, [cle]: e.target.value }))}
                  className="h-9 w-32 rounded-md border border-rule-strong bg-surface-elevee px-3 text-right text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-console"
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <PanneauEntete titre="Modules" meta="Un module désactivé disparaît de l’application et ses routes sont refusées par le serveur." />
        <ul className="divide-y divide-rule">
          {MODULES.map(({ cle, libelle, aide }) => (
            <li key={cle} className="flex items-center justify-between gap-6 px-5 py-4">
              <div className="min-w-0">
                <p className="text-corps font-medium text-ink-900">{libelle}</p>
                <p className="text-meta text-steel-500">{aide}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={modules[cle]}
                aria-label={libelle}
                onClick={() => setModules((m) => ({ ...m, [cle]: !m[cle] }))}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-1 pr-3 text-meta font-medium transition-colors',
                  modules[cle] ? 'border-console bg-console-wash text-console' : 'border-rule-strong bg-paper text-steel-500',
                )}
              >
                <span
                  className={cn('size-5 rounded-full transition-colors', modules[cle] ? 'bg-console' : 'bg-steel-400')}
                  aria-hidden="true"
                />
                {modules[cle] ? 'Activé' : 'Désactivé'}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="motif-reglages" className="text-corps font-medium text-ink-900">
              Motif <span className="font-normal text-steel-500">(facultatif, inscrit au journal)</span>
            </label>
            <input
              id="motif-reglages"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              maxLength={500}
              placeholder="Ex. passage à la formule Essentiel"
              className="h-9 rounded-md border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-console"
            />
          </div>
          <Button disabled={!modifie || erreurs.length > 0} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            Enregistrer les réglages
          </Button>
        </div>
        {erreurs.length > 0 && (
          <ul className="border-t border-rule px-5 py-3 text-meta text-rupture">
            {erreurs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
