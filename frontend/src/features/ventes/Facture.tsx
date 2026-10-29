import type { ReactNode, Ref } from 'react';
import { formatNombre } from '@/lib/format';
import { dateCourte, dateHeure } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { MODES } from './modes';
import './facture.css';
import type { VenteDetail } from './types';

/**
 * Facture à l'écran, même contenu et même ordre que le PDF du serveur
 * (backend/src/modules/ventes/facture/facture-pdf.ts). Toujours sur fond
 * papier, thème sombre compris : c'est un document, et c'est elle qui part
 * à l'impression (imprimerFacture.ts, facture.css).
 */

function statutFacture(vente: Pick<VenteDetail, 'statut' | 'paye' | 'resteDu'>) {
  if (vente.statut === 'ANNULEE') return { libelle: 'Annulée', classes: 'bg-[#fdecea] text-[#c0362c]' };
  if (vente.resteDu <= 0) return { libelle: 'Réglée', classes: 'bg-[#e7f6ec] text-[#067647]' };
  if (vente.paye > 0) return { libelle: 'Partiellement réglée', classes: 'bg-[#fef3e2] text-[#b54708]' };
  return { libelle: 'À régler', classes: 'bg-[#fef3e2] text-[#b54708]' };
}

function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-[#fafbfc] p-4">
      <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#667085] uppercase">{titre}</p>
      <div className="flex flex-col gap-0.5 text-[13px]">{children}</div>
    </div>
  );
}

function LigneTotal({ libelle, valeur, className }: { libelle: string; valeur: string; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 px-3 py-1.5', className)}>
      <span>{libelle}</span>
      <span className="tabular-nums whitespace-nowrap">{valeur}</span>
    </div>
  );
}

export function Facture({ vente, ref }: { vente: VenteDetail; ref?: Ref<HTMLElement> }) {
  const { entreprise, client } = vente;
  const annulee = vente.statut === 'ANNULEE';
  const statut = statutFacture(vente);
  const coordonnees = [
    entreprise.adresse,
    [entreprise.telephone, entreprise.email].filter(Boolean).join(' · '),
    [entreprise.rccm && `RCCM ${entreprise.rccm}`, entreprise.nif && `NIF ${entreprise.nif}`].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const tva = vente.tvaParTaux.filter((t) => t.montant > 0 || vente.tvaParTaux.length === 1);

  return (
    <article
      ref={ref}
      aria-label={`Facture ${vente.numero}`}
      className="mx-auto w-full max-w-[46rem] overflow-hidden rounded-xl bg-white text-[#344054] shadow-card"
    >
      <div className="h-1.5 bg-[#c2440b]" />
      <div className="flex flex-col gap-6 p-5 sm:p-8">
        <header className="flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {entreprise.logoUrl && (
              <img src={entreprise.logoUrl} alt="" className="size-14 shrink-0 rounded-lg object-contain" />
            )}
            <div className="min-w-0">
              <p className="text-lg font-semibold text-[#101828]">{entreprise.nom}</p>
              {coordonnees.map((ligne) => (
                <p key={ligne} className="text-xs text-[#667085]">
                  {ligne}
                </p>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:items-end">
            <p className="text-2xl font-bold tracking-[0.08em] text-[#c2440b]">FACTURE</p>
            <p className="text-sm font-semibold text-[#101828]">N° {vente.numero}</p>
            <span className={cn('mt-2 w-fit rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase', statut.classes)}>
              {statut.libelle}
            </span>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Carte titre="Facturé à">
            {client ? (
              <>
                <span className="text-sm font-semibold text-[#101828]">{client.nom}</span>
                {client.nomCommerce && <span>{client.nomCommerce}</span>}
                {client.telephone && <span>{client.telephone}</span>}
              </>
            ) : (
              <span className="text-sm font-semibold text-[#101828]">Client de passage</span>
            )}
          </Carte>
          <Carte titre="Détails">
            <span>Date : {dateHeure(vente.createdAt)}</span>
            <span>Point de vente : {vente.emplacement.nom}</span>
            <span>Vendeur : {vente.utilisateur.nom}</span>
            {!annulee && vente.resteDu > 0 && vente.echeanceAt && (
              <span className="font-semibold text-[#101828]">Échéance du solde : {dateCourte(vente.echeanceAt)}</span>
            )}
          </Carte>
        </div>

        {annulee && (
          <p className="rounded-lg bg-[#fdecea] px-3 py-2 text-[13px] font-semibold text-[#c0362c]">
            Vente annulée{vente.annuleeAt && ` le ${dateHeure(vente.annuleeAt)}`}
            {vente.motifAnnulation && ` — ${vente.motifAnnulation}`}.
          </p>
        )}

        <div>
          <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_auto_auto_auto_auto] gap-x-4 rounded-t-md bg-[#101828] px-3 py-2 text-[11px] font-semibold text-white sm:grid">
            <span>#</span>
            <span>Désignation</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Prix unitaire</span>
            <span className="text-right">TVA</span>
            <span className="text-right">Montant HT</span>
          </div>
          <ul className="divide-y divide-[#e4e7ec] border-y border-[#e4e7ec] sm:border-t-0">
            {vente.lignes.map((l, i) => (
              <li
                key={l.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-3 py-2.5 text-[13px] sm:grid-cols-[1.5rem_minmax(0,1fr)_auto_auto_auto_auto] sm:items-baseline"
              >
                <span className="hidden text-[#667085] sm:inline">{i + 1}</span>
                <span className="min-w-0 text-[#101828]">
                  {l.libelle}
                  <span className="block text-xs text-[#667085] sm:hidden">
                    {formatNombre(l.quantite)} × {formatNombre(l.prixUnitaire)} · TVA {l.tauxTva} %
                  </span>
                </span>
                <span className="hidden text-right tabular-nums sm:inline">{formatNombre(l.quantite)}</span>
                <span className="hidden text-right tabular-nums sm:inline">{formatNombre(l.prixUnitaire)}</span>
                <span className="hidden text-right text-[#667085] sm:inline">{l.tauxTva} %</span>
                <span className="text-right font-semibold whitespace-nowrap text-[#101828] tabular-nums">
                  {formatNombre(l.montantLigne)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ml-auto flex w-full flex-col text-[13px] sm:w-80">
          <LigneTotal libelle="Sous-total HT" valeur={formatNombre(vente.sousTotal)} />
          {vente.remise > 0 && <LigneTotal libelle={`Remise ${vente.tauxRemise} %`} valeur={formatNombre(-vente.remise)} />}
          {tva.map((t) => (
            <LigneTotal key={t.taux} libelle={`TVA ${t.taux} %`} valeur={formatNombre(t.montant)} />
          ))}
          <LigneTotal
            libelle="TOTAL TTC"
            valeur={`${formatNombre(vente.total)} GNF`}
            className="my-1 rounded-md bg-[#c2440b] py-2.5 text-sm font-bold text-white"
          />
          {!annulee && (
            <>
              <LigneTotal libelle="Payé" valeur={formatNombre(vente.paye)} />
              <LigneTotal
                libelle="Reste dû"
                valeur={vente.resteDu > 0 ? `${formatNombre(vente.resteDu)} GNF` : '0'}
                className={cn('font-semibold', vente.resteDu > 0 ? 'text-[#c0362c]' : 'text-[#067647]')}
              />
            </>
          )}
          {annulee && vente.montantARembourser > 0 && (
            <LigneTotal
              libelle="À rembourser au client"
              valeur={`${formatNombre(vente.montantARembourser)} GNF`}
              className="font-semibold text-[#c0362c]"
            />
          )}
        </div>

        {vente.reglements.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[#101828]">Règlements</h3>
            <ul className="divide-y divide-[#e4e7ec] border-y border-[#e4e7ec] text-[13px]">
              {vente.reglements.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-4 px-3 py-2">
                  <span>
                    {dateHeure(r.createdAt)} · {MODES[r.mode].libelle}
                  </span>
                  <span className="tabular-nums whitespace-nowrap text-[#101828]">{formatNombre(r.montant)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-[#e4e7ec] pt-4 text-center">
          <p className="font-semibold text-[#101828]">Merci de votre confiance.</p>
          <p className="text-xs text-[#667085]">Montants en francs guinéens (GNF).</p>
        </footer>
      </div>
    </article>
  );
}
