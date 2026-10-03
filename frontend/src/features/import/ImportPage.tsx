import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, FileSpreadsheet, Undo2, Upload } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { telechargerExport } from '@/lib/exporterCsv';
import { formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { proposerCorrespondance, type ChampImport } from '@/lib/import/champs';
import { celluleEnTexte, lireCsv, tableauDepuisLignes } from '@/lib/import/lecture';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EtapeColonnes } from './EtapeColonnes';
import { EtapeVerification } from './EtapeVerification';
import type { ChoixColonne, FichierLu, OptionsImport, RapportImport, ResultatImport } from './types';

const TAILLE_MAX = 5 * 1024 * 1024;
const LIGNES_MAX = 5000;
const LIGNES_PAR_LOT = 200;
/** Longueur maximale acceptée par le serveur pour chaque valeur envoyée. */
const LONGUEUR_ENVOI: Partial<Record<ChampImport, number>> = { description: 4000 };
const NUMERIQUES = new Set<ChampImport>(['prixAchat', 'prixVente', 'prixDemiGros', 'prixGros', 'tauxTva', 'seuilAlerte', 'quantite', 'datePeremption']);

const ETAPES = ['Déposer le fichier', 'Associer les colonnes', 'Vérifier et corriger', 'Importer'];

/** Lit le fichier dans le navigateur : il n'est jamais téléversé. */
async function lireFichier(fichier: File): Promise<FichierLu> {
  if (fichier.size > TAILLE_MAX) throw new Error('Fichier trop volumineux : 5 Mo au maximum.');
  const extension = fichier.name.toLowerCase().split('.').pop();
  let lu: FichierLu;
  if (extension === 'csv' || extension === 'txt') {
    lu = { ...lireCsv(new Uint8Array(await fichier.arrayBuffer())), nom: fichier.name, format: 'csv' };
  } else if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    const lignes = await readSheet(fichier);
    lu = { ...tableauDepuisLignes(lignes.map((l) => l.map(celluleEnTexte))), nom: fichier.name, format: 'xlsx' };
  } else {
    throw new Error('Format non pris en charge : déposez un fichier .csv ou .xlsx.');
  }
  if (lu.entetes.length === 0 || lu.lignes.length === 0) throw new Error('Ce fichier ne contient aucune ligne de données.');
  if (lu.lignes.length > LIGNES_MAX) {
    throw new Error(`Ce fichier compte ${formatNombre(lu.lignes.length)} lignes : ${formatNombre(LIGNES_MAX)} au maximum par import.`);
  }
  return lu;
}

function FilEtapes({ etape }: { etape: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Étapes de l’import">
      {ETAPES.map((libelle, i) => {
        const numero = i + 1;
        const faite = numero < etape;
        const courante = numero === etape;
        return (
          <li key={libelle} className="flex items-center gap-3" aria-current={courante ? 'step' : undefined}>
            {i > 0 && <span className={cn('hidden h-px w-8 sm:block', faite || courante ? 'bg-ok' : 'bg-rule-strong')} aria-hidden="true" />}
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold',
                faite ? 'bg-ok text-white' : courante ? 'bg-action text-white' : 'border border-rule-strong bg-surface text-steel-500',
              )}
            >
              {faite ? <Check className="size-4" aria-label="Franchie" /> : numero}
            </span>
            <span className={cn('text-corps', courante ? 'font-medium text-ink-900' : 'text-steel-500', !courante && 'hidden md:inline')}>
              {libelle}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const champFichier = useRef<HTMLInputElement>(null);
  const [etape, setEtape] = useState(1);
  const [survol, setSurvol] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fichier, setFichier] = useState<FichierLu | null>(null);
  const [choix, setChoix] = useState<ChoixColonne[]>([]);
  const [emplacementId, setEmplacementId] = useState('');
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [options, setOptions] = useState<Omit<OptionsImport, 'emplacementId'>>({
    categories: {},
    marques: {},
    conserver: [],
    ignorerBloquees: false,
  });
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [annule, setAnnule] = useState<number | null>(null);

  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<{ id: string }[]>('/produits')).data,
  });
  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<{ id: string; nom: string; archive: boolean }[]>('/emplacements')).data,
  });
  const actifs = (emplacements.data ?? []).filter((e) => !e.archive);
  const emplacementChoisi = emplacementId || actifs[0]?.id || '';

  async function deposer(f: File | undefined) {
    if (!f) return;
    setErreur(null);
    setLecture(true);
    try {
      const lu = await lireFichier(f);
      setFichier(lu);
      setChoix(proposerCorrespondance(lu.entetes).map((c) => c ?? ''));
      setRapport(null);
      setEtape(2);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ce fichier n’a pas pu être lu.');
    } finally {
      setLecture(false);
    }
  }

  const corpsOptions = (o = options) => ({ ...o, emplacementId: emplacementChoisi || undefined });

  const verifier = useMutation({
    mutationFn: async ({ id, o }: { id: string; o: typeof options }) =>
      (await api.post<RapportImport>(`/produits/import/session/${id}/verifier`, corpsOptions(o))).data,
    onSuccess: (r) => {
      setRapport(r);
      setEtape(3);
    },
    onError: (e) => setErreur(messageErreur(e, 'La vérification a échoué.')),
  });

  /** Ouvre une session, envoie les lignes associées par lots de 200, puis vérifie. */
  const envoyer = useMutation({
    mutationFn: async () => {
      const f = fichier!;
      const session = (await api.post<{ id: string }>('/produits/import/session', { nomFichier: f.nom })).data;
      const lignes = f.lignes.map((l) => {
        const valeurs: Partial<Record<ChampImport, string>> = {};
        choix.forEach((c, i) => {
          if (c === '' || c === 'IGNORER') return;
          const max = LONGUEUR_ENVOI[c] ?? (NUMERIQUES.has(c) ? 100 : 500);
          valeurs[c] = (l.cellules[i] ?? '').slice(0, max);
        });
        return { numero: l.numero, valeurs };
      });
      setEnvoi({ fait: 0, total: lignes.length });
      for (let i = 0; i < lignes.length; i += LIGNES_PAR_LOT) {
        await api.post(`/produits/import/session/${session.id}/lignes`, { lignes: lignes.slice(i, i + LIGNES_PAR_LOT) });
        setEnvoi({ fait: Math.min(i + LIGNES_PAR_LOT, lignes.length), total: lignes.length });
      }
      return session.id;
    },
    onSuccess: (id) => {
      const neuves = { categories: {}, marques: {}, conserver: [], ignorerBloquees: false };
      setOptions(neuves);
      verifier.mutate({ id, o: neuves });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’envoi des lignes a échoué.')),
    onSettled: () => setEnvoi(null),
  });

  function changerOptions(nouvelles: typeof options, reverifier = true) {
    setOptions(nouvelles);
    if (reverifier && rapport) verifier.mutate({ id: rapport.id, o: nouvelles });
  }

  const executer = useMutation({
    mutationFn: async () => (await api.post<ResultatImport>(`/produits/import/session/${rapport!.id}/executer`, corpsOptions())).data,
    onMutate: () => {
      setErreur(null);
      setEtape(4);
    },
    onSuccess: (r) => {
      setResultat(r);
      for (const cle of ['produits', 'stock', 'mouvements', 'categories', 'marques', 'dashboard', 'peremptions', 'alertes']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
    },
    onError: (e) => {
      setErreur(messageErreur(e, 'L’import a échoué : rien n’a été écrit.'));
      setEtape(3);
    },
  });

  const annuler = useMutation({
    mutationFn: async () => (await api.post<{ produitsArchives: number }>(`/produits/import/${resultat!.id}/annuler`)).data,
    onSuccess: (r) => {
      setAnnule(r.produitsArchives);
      setAnnulationOuverte(false);
      for (const cle of ['produits', 'stock', 'mouvements', 'dashboard', 'peremptions']) queryClient.invalidateQueries({ queryKey: [cle] });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’annulation a échoué.')),
  });

  function recommencer() {
    setEtape(1);
    setFichier(null);
    setRapport(null);
    setResultat(null);
    setAnnule(null);
    setErreur(null);
  }

  function surDepot(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    void deposer(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Importer un catalogue"
        description="Votre fichier tel qu’il est : StockFlow s’adapte à ses colonnes. Seul le nom du produit est obligatoire."
      />
      <FilEtapes etape={etape} />
      {erreur && <Alert variant="error">{erreur}</Alert>}

      {etape === 1 && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSurvol(true);
              }}
              onDragLeave={() => setSurvol(false)}
              onDrop={surDepot}
              className={cn(
                'm-4 flex flex-col items-center gap-4 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors sm:m-5',
                survol ? 'border-action bg-action-wash' : 'border-rule-strong',
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-lg bg-action-wash text-action">
                <Upload className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-panneau text-ink-900">Glissez votre fichier ici</p>
                <p className="mt-1 text-corps text-steel-500">.csv ou .xlsx · 5 Mo et 5 000 lignes au maximum</p>
              </div>
              <Button loading={lecture} onClick={() => champFichier.current?.click()}>
                Parcourir…
              </Button>
              <input
                ref={champFichier}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label="Fichier à importer"
                onChange={(e) => {
                  void deposer(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <p className="max-w-md text-meta text-steel-500">
                Le fichier est lu sur cet appareil : il n’est jamais envoyé tel quel au serveur, et rien n’est écrit avant votre
                confirmation finale.
              </p>
            </div>
          </Card>

          <Card>
            <PanneauEntete titre="Modèles" meta="Pour partir d’un fichier prêt à remplir" />
            <ul className="divide-y divide-rule">
              {[
                { type: 'vierge', titre: 'Modèle vierge', detail: 'Toutes les colonnes, prêt à remplir', fichierNom: 'modele-import-stockflow.csv' },
                { type: 'exemples', titre: 'Modèle avec exemples', detail: '5 lignes d’exemple', fichierNom: 'modele-import-exemples.csv' },
                {
                  type: 'existant',
                  titre: 'Export de l’existant',
                  detail: `Les ${formatNombre(produits.data?.length ?? 0)} références actuelles, pour corriger en masse puis réimporter`,
                  fichierNom: 'catalogue-stockflow.csv',
                },
              ].map((m) => (
                <li key={m.type} className="flex items-center gap-3 px-5 py-3">
                  <FileSpreadsheet className="size-5 shrink-0 text-steel-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-corps font-medium text-ink-900">{m.titre}</p>
                    <p className="text-meta text-steel-500">{m.detail}</p>
                  </div>
                  <Button
                    variant="secondary"
                    taille="sm"
                    icone
                    aria-label={`Télécharger : ${m.titre}`}
                    onClick={() =>
                      telechargerExport(`/produits/import/modele?type=${m.type}`, m.fichierNom).catch((e) => setErreur(messageErreur(e)))
                    }
                  >
                    <Download className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {etape === 2 && fichier && (
        <EtapeColonnes
          fichier={fichier}
          choix={choix}
          onChoix={setChoix}
          emplacements={actifs}
          emplacementId={emplacementChoisi}
          onEmplacement={setEmplacementId}
          envoi={envoi}
          enCours={envoyer.isPending || verifier.isPending}
          onRetour={recommencer}
          onVerifier={() => {
            setErreur(null);
            envoyer.mutate();
          }}
        />
      )}

      {etape === 3 && rapport && (
        <EtapeVerification
          rapport={rapport}
          options={options}
          onOptions={changerOptions}
          enCours={verifier.isPending}
          execution={executer.isPending}
          onRetour={() => setEtape(2)}
          onImporter={() => executer.mutate()}
        />
      )}

      {etape === 4 && (
        <Card>
          {executer.isPending || !resultat ? (
            <div className="flex flex-col gap-3 p-6" role="status">
              <p className="text-panneau text-ink-900">Import en cours…</p>
              <div className="h-2 overflow-hidden rounded-full bg-paper">
                <div className="barre-progression h-full w-2/5 rounded-full bg-action" />
              </div>
              <p className="text-meta text-steel-500">Tout est écrit en une seule fois : en cas d’erreur, rien n’est enregistré.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-6">
              {annule !== null ? (
                <Alert variant="warning">
                  Import annulé : {annule} {pluriel('produit', annule)} {annule > 1 ? 'archivés' : 'archivé'} et leur stock initial
                  retiré. Les fiches mises à jour gardent leurs nouvelles valeurs.
                </Alert>
              ) : (
                <Alert variant="success">
                  Import terminé en {(resultat.dureeMs / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s.
                </Alert>
              )}
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4">
                {[
                  { libelle: 'Produits créés', valeur: resultat.lignesCreees },
                  { libelle: 'Fiches mises à jour', valeur: resultat.lignesMisesAJour },
                  { libelle: 'Lignes ignorées', valeur: resultat.lignesIgnorees },
                  { libelle: 'Entrées de stock', valeur: resultat.mouvementsCrees },
                ].map((m) => (
                  <div key={m.libelle} className="bg-surface px-4 py-3">
                    <dt className="text-meta text-steel-500">{m.libelle}</dt>
                    <dd className="text-chiffre text-ink-900">{formatNombre(m.valeur)}</dd>
                  </div>
                ))}
              </dl>
              {(resultat.categoriesCreees.length > 0 || resultat.marquesCreees.length > 0 || resultat.suiviParLot > 0) && (
                <ul className="flex flex-col gap-1 text-corps text-steel-700">
                  {resultat.categoriesCreees.length > 0 && <li>Catégories créées : {resultat.categoriesCreees.join(', ')}</li>}
                  {resultat.marquesCreees.length > 0 && <li>Marques créées : {resultat.marquesCreees.join(', ')}</li>}
                  {resultat.suiviParLot > 0 && (
                    <li>
                      {resultat.suiviParLot} {pluriel('produit', resultat.suiviParLot)} avec une date de péremption : suivi par lot activé.
                    </li>
                  )}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Link to="/produits" className={boutonClasses('primary')}>
                  Voir le catalogue
                </Link>
                <Button variant="secondary" onClick={recommencer}>
                  Importer un autre fichier
                </Button>
                {annule === null && resultat.lignesCreees > 0 && (
                  <Button variant="ghost" className="text-rupture hover:bg-rupture-wash" onClick={() => setAnnulationOuverte(true)}>
                    <Undo2 className="size-4" aria-hidden="true" />
                    Annuler cet import
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <Modal
        ouvert={annulationOuverte}
        onFermer={() => setAnnulationOuverte(false)}
        titre="Annuler cet import ?"
        description="Les produits qu’il a créés sont archivés et leur stock initial retiré. Impossible si l’un d’eux a déjà servi (vente, sortie…)."
        pied={
          <>
            <Button variant="secondary" onClick={() => setAnnulationOuverte(false)}>
              Garder l’import
            </Button>
            <Button variant="danger" loading={annuler.isPending} onClick={() => annuler.mutate()}>
              Annuler l’import
            </Button>
          </>
        }
      >
        {erreur && annulationOuverte && <Alert variant="error">{erreur}</Alert>}
      </Modal>
    </div>
  );
}
