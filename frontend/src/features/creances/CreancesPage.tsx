import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, Phone, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import { texteRelance } from '@/lib/whatsapp';
import { BoutonWhatsApp } from '@/components/patterns/BoutonWhatsApp';
import { dateCourte, gnf } from '@/lib/montant';
import { pluriel, tempsRelatif } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState, Squelette } from '@/components/patterns/States';
import { PastillesPaiement } from '@/features/ventes/PastillesPaiement';
import type { ModeReglement } from '@/features/ventes/types';
import type { CategorieTarifaire } from '@/features/clients/types';

type CleTranche = 'MOINS_DE_8' | 'DE_8_A_30' | 'DE_31_A_60' | 'PLUS_DE_60';

interface Debiteur {
  client: { id: string; nom: string; telephone: string | null; nomCommerce: string | null; categorie: CategorieTarifaire };
  solde: number;
  ancienneteJours: number;
  dernierReglementAt: string | null;
  echeanceAt: string | null;
  montantEnRetard: number;
  nombreVentes: number;
}

interface Creances {
  resume: {
    totalDu: number;
    nombreClients: number;
    montantEnRetard: number;
    encaisseCetteSemaine: number;
    tranches: { cle: CleTranche; libelle: string; montant: number }[];
  };
  debiteurs: Debiteur[];
}

/** Couleurs de vieillissement : barre, légende et avatars partagent la même échelle. */
const COULEUR_TRANCHE: Record<CleTranche, { fond: string; texte: string }> = {
  MOINS_DE_8: { fond: 'bg-age-recent', texte: 'text-ink-900' },
  DE_8_A_30: { fond: 'bg-age-moyen', texte: 'text-ink-900' },
  DE_31_A_60: { fond: 'bg-age-ancien', texte: 'text-ink-900' },
  PLUS_DE_60: { fond: 'bg-age-critique', texte: 'text-white' },
};

function tranche(jours: number): CleTranche {
  if (jours < 8) return 'MOINS_DE_8';
  if (jours <= 30) return 'DE_8_A_30';
  if (jours <= 60) return 'DE_31_A_60';
  return 'PLUS_DE_60';
}

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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['creances'],
    queryFn: async () => (await api.get<Creances>('/creances')).data,
  });

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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5" role="status">
        <span className="sr-only">Chargement des créances…</span>
        <div className="bandeau-action flex flex-col gap-5 rounded-lg px-5 py-6 sm:px-[26px]">
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

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Créances</h1>

      {/* Bandeau : qui me doit de l'argent, et depuis quand. */}
      <section className="bandeau-action flex flex-col gap-6 rounded-lg px-5 py-6 text-white sm:px-[26px]" aria-labelledby="titre-creances">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p id="titre-creances" className="text-meta text-white/65">
              Total dû par vos clients
            </p>
            <p className="mt-1 text-[30px] leading-[36px] font-semibold tracking-[-0.01em]">{gnf(resume.totalDu)}</p>
            <p className="mt-1 text-corps text-white/65">
              {resume.nombreClients} {pluriel('client', resume.nombreClients)} {resume.nombreClients > 1 ? 'concernés' : 'concerné'}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:flex sm:gap-8">
            <div className="flex flex-col-reverse border-l-2 border-rupture-vif pl-3">
              <dt className="text-meta text-white/65">En retard</dt>
              <dd className="text-panneau whitespace-nowrap">{gnf(resume.montantEnRetard)}</dd>
            </div>
            <div className="flex flex-col-reverse border-l-2 border-reseau pl-3">
              <dt className="text-meta text-white/65">Encaissé cette semaine</dt>
              <dd className="text-panneau whitespace-nowrap">{gnf(resume.encaisseCetteSemaine)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div
            className="flex h-2.5 overflow-hidden rounded-full bg-white/10"
            role="img"
            aria-label={`Vieillissement des créances : ${resume.tranches.map((t) => `${t.libelle} ${gnf(t.montant)}`).join(', ')}`}
          >
            {resume.totalDu > 0 &&
              resume.tranches.map((t) =>
                t.montant > 0 ? (
                  <span key={t.cle} className={COULEUR_TRANCHE[t.cle].fond} style={{ width: `${(t.montant / resume.totalDu) * 100}%` }} />
                ) : null,
              )}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-4">
            {resume.tranches.map((t) => (
              <li key={t.cle} className="flex items-start gap-2">
                <span className={cn('mt-1 size-2.5 shrink-0 rounded-sm', COULEUR_TRANCHE[t.cle].fond)} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-meta text-white/65">{t.libelle}</span>
                  <span className="block text-corps font-medium whitespace-nowrap">{gnf(t.montant)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {succes && <Alert variant="success">{succes}</Alert>}

      <Card>
        <PanneauEntete
          titre="Débiteurs"
          meta="Classés par ancienneté de la dette : le risque d’abord, pas le montant"
          action={
            <Link to="/ventes/nouvelle" className="hidden shrink-0 items-center gap-1.5 text-corps font-medium text-action hover:underline sm:inline-flex">
              <Plus className="size-4" aria-hidden="true" />
              Nouvelle vente
            </Link>
          }
        />
        {debiteurs.length === 0 ? (
          <EmptyState titre="Personne ne vous doit d’argent" description="Les ventes à crédit non soldées apparaîtront ici, les plus anciennes en premier." />
        ) : (
          <ul className="divide-y divide-rule">
            {debiteurs.map((d) => {
              const couleur = COULEUR_TRANCHE[tranche(d.ancienneteJours)];
              const echeanceDepassee = d.echeanceAt !== null && new Date(d.echeanceAt).getTime() < maintenant;
              return (
                <li key={d.client.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-meta font-semibold', couleur.fond, couleur.texte)}
                      aria-hidden="true"
                    >
                      {initiales(d.client.nom)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-medium text-ink-900">
                        {d.client.nom}
                        {d.client.nomCommerce && <span className="font-normal text-steel-500"> · {d.client.nomCommerce}</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 text-meta text-steel-500">
                        {d.client.telephone && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Phone className="size-3 text-steel-400" aria-hidden="true" />
                            {d.client.telephone}
                          </span>
                        )}
                        <span className="whitespace-nowrap">
                          {d.dernierReglementAt ? `Dernier règlement ${tempsRelatif(d.dernierReglementAt, maintenant)}` : 'Aucun règlement'}
                        </span>
                        {d.echeanceAt && (
                          <span className={cn('whitespace-nowrap', echeanceDepassee && 'font-medium text-rupture')}>
                            Échéance {dateCourte(d.echeanceAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-corps font-semibold whitespace-nowrap text-ink-900">{gnf(d.solde)}</p>
                      <p className={cn('text-meta whitespace-nowrap', d.ancienneteJours > 30 ? 'font-medium text-rupture' : 'text-steel-500')}>
                        {d.ancienneteJours === 0 ? 'Aujourd’hui' : `${d.ancienneteJours} ${pluriel('jour', d.ancienneteJours)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
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
                  </div>
                </li>
              );
            })}
          </ul>
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
                  className="h-10 min-w-0 flex-1 rounded-md border border-rule-strong bg-surface px-3 text-corps text-ink-900"
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
