import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { CHAMPS_IMPORT, LIBELLES_CHAMPS, type ChampImport } from '@/lib/import/champs';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import type { ChoixColonne, FichierLu } from './types';

const LIBELLES_ENCODAGE = { 'utf-8': 'UTF-8', 'windows-1252': 'Windows-1252', 'utf-16le': 'UTF-16', 'utf-16be': 'UTF-16' } as const;
const LIBELLES_SEPARATEUR = { ';': 'point-virgule', ',': 'virgule', '\t': 'tabulation' } as const;

/**
 * Étape 2 — la pièce maîtresse : chaque colonne du fichier, un extrait de
 * sa première valeur, et le champ StockFlow qu'elle alimente.
 */
export function EtapeColonnes({
  fichier,
  choix,
  onChoix,
  emplacements,
  emplacementId,
  onEmplacement,
  envoi,
  enCours,
  onRetour,
  onVerifier,
}: {
  fichier: FichierLu;
  choix: ChoixColonne[];
  onChoix: (choix: ChoixColonne[]) => void;
  emplacements: { id: string; nom: string }[];
  emplacementId: string;
  onEmplacement: (id: string) => void;
  envoi: { fait: number; total: number } | null;
  enCours: boolean;
  onRetour: () => void;
  onVerifier: () => void;
}) {
  const utilises = new Set(choix.filter((c): c is ChampImport => c !== '' && c !== 'IGNORER'));
  const nomAssocie = utilises.has('nom');
  const aChoisir = choix.filter((c) => c === '').length;
  const extrait = (i: number) => fichier.lignes.find((l) => (l.cellules[i] ?? '') !== '')?.cellules[i] ?? '';

  function changer(i: number, valeur: ChoixColonne) {
    onChoix(choix.map((c, j) => (j === i ? valeur : c)));
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <PanneauEntete
          titre={fichier.nom}
          meta={[
            `${formatNombre(fichier.lignes.length)} ${pluriel('ligne', fichier.lignes.length)}`,
            `${fichier.entetes.length} colonnes`,
            fichier.format === 'xlsx' ? 'Excel' : `${LIBELLES_ENCODAGE[fichier.encodage!]} · ${LIBELLES_SEPARATEUR[fichier.separateur!]}`,
          ].join(' · ')}
        />
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_112px] gap-4 border-b border-rule bg-entete-tableau px-5 py-2 text-meta font-medium text-steel-500 md:grid">
          <span>Colonne du fichier</span>
          <span>Première valeur</span>
          <span>Champ StockFlow</span>
          <span>État</span>
        </div>
        <ul className="divide-y divide-rule">
          {fichier.entetes.map((entete, i) => {
            const valeur = choix[i] ?? '';
            const etat = valeur === '' ? 'choisir' : valeur === 'IGNORER' ? 'ignoree' : 'reconnue';
            const id = `colonne-${i}`;
            return (
              <li
                key={i}
                className={cn(
                  'grid grid-cols-1 gap-2 px-5 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_112px] md:items-center md:gap-4',
                  etat === 'choisir' && 'bg-[#FFFCF6]',
                  etat === 'ignoree' && 'opacity-60',
                )}
              >
                <label htmlFor={id} className="truncate font-mono text-corps text-ink-900" title={entete}>
                  {entete || <span className="text-steel-400">(sans titre)</span>}
                </label>
                <span className="truncate text-corps text-steel-500" title={extrait(i)}>
                  {extrait(i) || <span className="text-steel-400">vide</span>}
                </span>
                <select
                  id={id}
                  value={valeur}
                  onChange={(e) => changer(i, e.target.value as ChoixColonne)}
                  className={cn(
                    'h-9 w-full min-w-0 rounded-md border bg-surface px-3 text-corps text-ink-900',
                    etat === 'choisir' ? 'border-faible' : 'border-rule-strong',
                  )}
                >
                  <option value="">Choisir un champ…</option>
                  {CHAMPS_IMPORT.map((champ) => (
                    <option key={champ} value={champ} disabled={utilises.has(champ) && valeur !== champ}>
                      {LIBELLES_CHAMPS[champ]}
                      {utilises.has(champ) && valeur !== champ ? ' (déjà associé)' : ''}
                    </option>
                  ))}
                  <option value="IGNORER">Ignorer cette colonne</option>
                </select>
                <span>
                  {etat === 'reconnue' ? (
                    <Badge variant="ok">Reconnue</Badge>
                  ) : etat === 'choisir' ? (
                    <Badge variant="faible">À choisir</Badge>
                  ) : (
                    <Badge variant="neutral">Ignorée</Badge>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {utilises.has('quantite') && (
        <Card>
          <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="emplacement-import" className="text-corps text-ink-900">
              Les quantités initiales entrent dans
            </label>
            <select
              id="emplacement-import"
              value={emplacementId}
              onChange={(e) => onEmplacement(e.target.value)}
              className="h-9 rounded-md border border-rule-strong bg-surface px-3 text-corps text-ink-900 sm:w-64"
            >
              {emplacements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {!nomAssocie && <Alert variant="warning">Associez une colonne au « Nom du produit » : c’est la seule obligatoire.</Alert>}
      {nomAssocie && aChoisir > 0 && (
        <p className="text-meta text-steel-500">
          {aChoisir} {pluriel('colonne', aChoisir)} sans champ {aChoisir > 1 ? 'seront ignorées' : 'sera ignorée'}.
        </p>
      )}

      {envoi && (
        <div className="flex flex-col gap-1.5" role="status">
          <p className="text-meta text-steel-500">
            Envoi des lignes : {formatNombre(envoi.fait)} / {formatNombre(envoi.total)}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-action transition-all" style={{ width: `${(envoi.fait / envoi.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" onClick={onRetour}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Changer de fichier
        </Button>
        <Button disabled={!nomAssocie} loading={enCours} onClick={onVerifier}>
          Vérifier {formatNombre(fichier.lignes.length)} {pluriel('ligne', fichier.lignes.length)}
        </Button>
      </div>
    </div>
  );
}
