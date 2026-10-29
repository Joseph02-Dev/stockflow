import { useState } from 'react';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, Phone, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { texteRelance } from '@/lib/whatsapp';
import { BoutonWhatsApp } from '@/components/patterns/BoutonWhatsApp';
import { dateCourte, gnf } from '@/lib/montant';
import { formatNombre, pluriel, tempsRelatif } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState, Squelette } from '@/components/patterns/States';
import { PastillesPaiement } from '@/features/ventes/PastillesPaiement';
import type { ModeReglement } from '@/features/ventes/types';
import { JaugeCredit } from '@/features/clients/JaugeCredit';
import { tranche, useCreances, type CleTranche, type Debiteur } from './types';
import '@/features/clients/clients.css';

/**
 * Couleurs du retard sur l'échéance (décision validée) : barre, légende et
 * avatars partagent la même échelle. Une vente récente dont l'échéance
 * est dépassée est déjà colorée ; une vente ancienne encore dans les
 * temps reste verte.
 */
const COULEUR_TRANCHE: Record<CleTranche, { fond: string; texte: string; pastille: string }> = {
  A_JOUR: { fond: 'bg-age-recent', texte: 'text-ink-900', pastille: 'bg-ok-wash text-ok' },
  RETARD_1_30: { fond: 'bg-age-moyen', texte: 'text-ink-900', pastille: 'bg-paper text-steel-700' },
  RETARD_31_60: { fond: 'bg-age-ancien', texte: 'text-ink-900', pastille: 'bg-faible-wash text-faible' },
  RETARD_PLUS_60: { fond: 'bg-age-critique', texte: 'text-white', pastille: 'bg-rupture-wash text-rupture' },
};

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const MODES_REGLEMENT: ModeReglement[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO'];

export function CreancesPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const [aEncaisser, setAEncaisser] = useState<Debiteur | null>(null);
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<ModeReglement>('ESPECES');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [maintenant] = useState(() => Date.now());

  const [filtre, setFiltre] = useState<CleTranche | null>(null);

  const { data, isLoading, isError, error, refetch } = useCreances();

  const encaisser = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ reglements: { numero: string; montant: number }[]; solde: number }>(
          `/clients/${aEncaisser!.client.id}/reglements`,
          { montant: Number.parseInt(montant, 10), mode },
        )
      ).data,
    onSuccess: (resultat) => {
      const nombre = resultat.reglements.length;
      setSucces(
        `${gnf(resultat.reglements.reduce((a, r) => a + r.montant, 0))} encaissés auprès de ${aEncaisser!.client.nom}, imputés sur ${nombre} ${pluriel('vente', nombre)} (${resultat.reglements.map((r) => r.numero).join(', ')}). Reste dû : ${gnf(resultat.solde)}.`,
      );
      setAEncaisser(null);
      for (const cle of ['creances', 'ventes', 'clients']) queryClient.invalidateQueries({ queryKey: [cle] });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’encaissement a échoué.')),
  });

  function ouvrirEncaissement(debiteur: Debiteur) {
    setErreur(null);
    setMontant('');
    setMode('ESPECES');
    setAEncaisser(debiteur);
  }

  // Avant tout retour anticipé : un hook est appelé à chaque rendu.
  const debiteursFiltres = (data?.debiteurs ?? []).filter((d) => !filtre || tranche(d.retardJours) === filtre);
  const { visibles, ancre, pagination } = usePagination(debiteursFiltres, { reinitialiser: filtre });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5" role="status">
        <span className="sr-only">Chargement des créances…</span>
        <div className="bandeau-action flex flex-col gap-5 rounded-xl px-5 py-6 sm:px-6">
          <span className="block h-3 w-24 rounded-sm bg-white/10" />
          <span className="block h-8 w-64 max-w-full rounded-sm bg-white/10" />
          <span className="block h-2.5 w-full rounded-full bg-white/10" />
        </div>
        <Card>
          <div className="border-b border-rule px-5 py-4">
            <Squelette className="h-3 w-32" />
          </div>
          <LoadingState lignes={5} />
        </Card>
      </div>
    );
  }
  if (isError || !data) return <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />;
  const { resume, debiteurs } = data;
  const montantSaisi = Number.parseInt(montant, 10) || 0;
  const nombreVentes = debiteurs.reduce((a, d) => a + d.nombreVentes, 0);

  return (
    <div className="clients-page flex flex-col gap-5">
      <h1 className="sr-only">Créances</h1>

      {/* Bandeau : qui me doit de l'argent, et depuis quand. */}
      <section className="bandeau-action creances-bandeau flex flex-col gap-6 rounded-xl px-5 py-6 text-white sm:px-6" aria-labelledby="titre-creances">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p id="titre-creances" className="text-[13px] text-white/65">
              Total dû par vos clients
            </p>
            <p className="mt-1.5 font-display text-[36px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
              {formatNombre(resume.totalDu)} <span className="font-sans text-[15px] font-semibold tracking-normal text-white/55">GNF</span>
            </p>
            <p className="mt-2 text-corps text-white/70">
              {resume.nombreClients} {pluriel('client', resume.nombreClients)} {resume.nombreClients > 1 ? 'concernés' : 'concerné'} · {nombreVentes}{' '}
              {pluriel('vente', nombreVentes)} à crédit
            </p>
          </div>
          <dl className="flex flex-wrap gap-2.5">
            <div className="creances-case flex flex-col-reverse">
              <dt>
                <span className="size-[7px] rounded-full bg-rupture-vif" aria-hidden="true" />
                En retard
              </dt>
              <dd>{formatNombre(resume.montantEnRetard)}</dd>
            </div>
            <div className="creances-case flex flex-col-reverse">
              <dt>
                <span className="size-[7px] rounded-full bg-reseau" aria-hidden="true" />
                Encaissé cette semaine
              </dt>
              <dd>{formatNombre(resume.encaisseCetteSemaine)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div
            className="creances-age"
            role="img"
            aria-label={`Vieillissement des créances : ${resume.tranches.map((t) => `${t.libelle} ${gnf(t.montant)}`).join(', ')}`}
          >
            {resume.totalDu > 0 &&
              resume.tranches.map((t) =>
                t.montant > 0 ? <span key={t.cle} className={COULEUR_TRANCHE[t.cle].fond} style={{ flexGrow: t.montant, flexBasis: 0 }} /> : null,
              )}
          </div>
          <div className="creances-tranches" role="group" aria-label="Filtrer les débiteurs par retard">
            {resume.tranches.map((t) => (
              <button
                key={t.cle}
                type="button"
                className="creances-tranche"
                aria-pressed={filtre === t.cle}
                onClick={() => setFiltre((actuel) => (actuel === t.cle ? null : t.cle))}
              >
                <span className="flex items-center gap-1.5 text-[12px] text-white/65">
                  <span className={cn('size-2 shrink-0 rounded-[2px]', COULEUR_TRANCHE[t.cle].fond)} aria-hidden="true" />
                  {t.libelle}
                </span>
                <span className="text-[15px] font-semibold whitespace-nowrap tabular-nums">{gnf(t.montant)}</span>
                <span className="text-[11.5px] text-white/50">
                  {t.nombreVentes} {pluriel('vente', t.nombreVentes)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {succes && <Alert variant="success">{succes}</Alert>}

      <Card>
        <PanneauEntete
          titre="Débiteurs"
          meta={
            filtre
              ? `Retard le plus long : ${resume.tranches.find((t) => t.cle === filtre)?.libelle.toLowerCase() ?? ''}`
              : 'Classés par retard sur l’échéance : le risque d’abord, pas le montant'
          }
          action={
            filtre ? (
              <Button variant="secondary" taille="sm" onClick={() => setFiltre(null)}>
                Tout afficher
              </Button>
            ) : (
              <Link to="/ventes/nouvelle" className={boutonClasses('secondary', 'shrink-0', { taille: 'sm' })}>
                <Plus className="size-4" aria-hidden="true" />
                Nouvelle vente
              </Link>
            )
          }
        />
        {debiteursFiltres.length === 0 ? (
          filtre ? (
            <EmptyState titre="Aucun débiteur dans cette tranche" description="Le retard le plus long de chaque client le place dans une seule tranche." />
          ) : (
            <EmptyState titre="Personne ne vous doit d’argent" description="Les ventes à crédit non soldées apparaîtront ici, les plus en retard en premier." />
          )
        ) : (
          <>
            <div ref={ancre} className="scroll-mt-20" />
            <ul className="creances-liste divide-y divide-rule">
              {visibles.map((d) => {
                const cle = tranche(d.retardJours);
                const couleur = COULEUR_TRANCHE[cle];
                const echeanceDepassee = d.echeanceAt !== null && new Date(d.echeanceAt).getTime() < maintenant;
                return (
                  <li key={d.client.id} className="creances-debiteur">
                    <span
                      className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-meta font-semibold', couleur.fond, couleur.texte)}
                      aria-hidden="true"
                    >
                      {initiales(d.client.nom)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold text-ink-900">
                        {d.client.nom}
                        {d.client.nomCommerce && <span className="font-normal text-steel-400"> · {d.client.nomCommerce}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-meta text-steel-500">
                        {d.client.telephone && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Phone className="size-3 text-steel-400" aria-hidden="true" />
                            {d.client.telephone}
                          </span>
                        )}
                        <span className="whitespace-nowrap">
                          {d.nombreVentes} {pluriel('vente', d.nombreVentes)}
                        </span>
                        <span className="whitespace-nowrap">
                          {d.dernierReglementAt ? `Dernier règlement ${tempsRelatif(d.dernierReglementAt, maintenant)}` : 'Aucun règlement'}
                        </span>
                        {d.echeanceAt && (
                          <span className={cn('whitespace-nowrap', echeanceDepassee && 'font-semibold text-rupture')}>
                            Échéance {dateCourte(d.echeanceAt)}
                          </span>
                        )}
                      </p>
                    </div>
                    {d.client.plafondCredit !== null ? (
                      <JaugeCredit solde={d.solde} plafond={d.client.plafondCredit} />
                    ) : (
                      <p className="clients-credit text-meta text-steel-400">Pas de plafond de crédit</p>
                    )}
                    <div className="creances-solde">
                      <p className="font-display text-[16px] font-semibold whitespace-nowrap text-ink-900 tabular-nums">{gnf(d.solde)}</p>
                      <span
                        className={cn('mt-1 inline-flex h-[22px] items-center rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap sm:mt-0.5', couleur.pastille)}
                      >
                        {d.retardJours > 0 ? `${d.retardJours} j de retard` : 'À jour'}
                      </span>
                    </div>
                    <div className="creances-actions flex shrink-0 gap-1.5">
                      <BoutonWhatsApp
                        compact
                        libelle="Relancer"
                        telephone={d.client.telephone}
                        texte={texteRelance({
                          entreprise: session?.entreprise.nom ?? '',
                          client: d.client.nom,
                          solde: d.solde,
                          ancienneteJours: d.ancienneteJours,
                          echeanceAt: d.echeanceAt,
                        })}
                      />
                      <Button variant="secondary" taille="sm" onClick={() => ouvrirEncaissement(d)}>
                        Encaisser
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination etat={pagination} className="border-t border-rule" />
          </>
        )}
      </Card>

      <Modal
        ouvert={aEncaisser !== null}
        onFermer={() => setAEncaisser(null)}
        titre={`Encaisser — ${aEncaisser?.client.nom ?? ''}`}
        description={aEncaisser ? `Doit ${gnf(aEncaisser.solde)}. Le montant solde ses ventes de la plus ancienne à la plus récente.` : undefined}
        pied={
          <>
            <Button variant="secondary" onClick={() => setAEncaisser(null)}>
              Annuler
            </Button>
            <Button
              disabled={!aEncaisser || montantSaisi <= 0 || montantSaisi > aEncaisser.solde}
              loading={encaisser.isPending}
              onClick={() => {
                setErreur(null);
                encaisser.mutate();
              }}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Encaisser {montantSaisi > 0 ? gnf(montantSaisi) : ''}
            </Button>
          </>
        }
      >
        {aEncaisser && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-corps font-medium text-ink-900">Montant reçu</span>
              <span className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={aEncaisser.solde}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder={String(aEncaisser.solde)}
                  className="h-10 min-w-0 flex-1 champ rounded-md border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900"
                />
                <Button variant="secondary" onClick={() => setMontant(String(aEncaisser.solde))}>
                  Tout
                </Button>
              </span>
              {montantSaisi > aEncaisser.solde && <span className="text-meta text-rupture">Le client ne doit que {gnf(aEncaisser.solde)}.</span>}
            </label>
            <PastillesPaiement libelle="Payé en" nom="mode-encaissement" modes={MODES_REGLEMENT} valeur={mode} onChange={setMode} />
            {erreur && <Alert variant="error">{erreur}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
