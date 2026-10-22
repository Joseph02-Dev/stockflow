import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Plus, UserCheck, UserX } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Selecteur } from '@/components/ui/Selecteur';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { useSession } from '@/lib/useSession';
import { getSession, setSession, sessionActuelleEstPersistante } from '@/lib/session';
import { dateCourte } from '@/lib/montant';
import { formatNombre } from '@/lib/format';
import { DROITS, useUtilisateurs, type UtilisateurListe } from './donnees';
import { EnteteCarte, EnteteSection } from './EnteteSection';

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  role: z.enum(['ADMIN', 'GESTIONNAIRE']),
});

type Formulaire = z.infer<typeof schema>;

/**
 * Droits de chaque rôle, d'après les routes réservées à l'administrateur
 * côté serveur (@Roles('ADMIN')) ; tout le reste est ouvert au gestionnaire.
 */

export function UtilisateursSection() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aDesactiver, setADesactiver] = useState<UtilisateurListe | null>(null);

  const { data, isLoading, isError, error, refetch } = useUtilisateurs();

  const { register, handleSubmit, reset, control, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'GESTIONNAIRE' },
  });

  const inviter = useMutation({
    mutationFn: async (valeurs: Formulaire) => api.post('/users', valeurs),
    onSuccess: (_reponse, valeurs) => {
      setErreur(null);
      setSucces(`Une invitation a été envoyée à ${valeurs.email}.`);
      setModaleOuverte(false);
      reset({ email: '', role: 'GESTIONNAIRE' });
      // La personne n'apparaîtra dans la liste qu'après acceptation, mais
      // on rafraîchit au cas où elle aurait accepté entre-temps.
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
    },
    onError: (err) => setErreur(messageErreur(err, 'L’invitation a échoué.')),
  });

  const changerRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'ADMIN' | 'GESTIONNAIRE' }) =>
      api.patch(`/users/${id}/role`, { role }),
    onSuccess: (_reponse, variables) => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });

      // Si l'Admin a modifié son propre rôle, la session locale doit
      // suivre — sinon l'interface continuerait d'afficher les options
      // réservées à l'Admin jusqu'à la prochaine connexion.
      const session = getSession();
      if (session && session.utilisateur.id === variables.id) {
        setSession(
          { ...session, utilisateur: { ...session.utilisateur, role: variables.role } },
          sessionActuelleEstPersistante(),
        );
      }
    },
    onError: (err) => setErreur(messageErreur(err, 'La modification du rôle a échoué.')),
  });

  // Retrait d'accès : effet immédiat côté serveur (sessions coupées,
  // token refusé dès la requête suivante) ; le compte reste dans l'historique.
  const acces = useMutation({
    mutationFn: async ({ utilisateur, action }: { utilisateur: UtilisateurListe; action: 'desactiver' | 'reactiver' }) =>
      api.post(`/users/${utilisateur.id}/${action}`),
    onSuccess: (_reponse, { utilisateur, action }) => {
      setErreur(null);
      setADesactiver(null);
      setSucces(
        action === 'desactiver'
          ? `L’accès de ${utilisateur.nom} est retiré : ses sessions sont coupées immédiatement.`
          : `${utilisateur.nom} peut de nouveau se connecter avec son mot de passe habituel.`,
      );
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
    },
    onError: (err) => {
      setADesactiver(null);
      setErreur(messageErreur(err, 'La modification de l’accès a échoué.'));
    },
  });

  const actifs = data?.filter((u) => !u.desactiveAt) ?? [];
  const retires = data?.filter((u) => u.desactiveAt) ?? [];

  const ligne = (utilisateur: UtilisateurListe) => {
    const vous = utilisateur.id === session?.utilisateur.id;
    return (
      <li
        key={utilisateur.id}
        className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 px-4 py-3 sm:grid-cols-[40px_minmax(0,1fr)_auto_auto] sm:px-5"
      >
        <Vignette
          nom={utilisateur.nom}
          taille={40}
          teinte={utilisateur.desactiveAt ? undefined : utilisateur.role === 'ADMIN' ? 'var(--color-action)' : 'var(--color-accent)'}
          className="rounded-full! font-display text-[13px]!"
        />
        <div className={utilisateur.desactiveAt ? 'min-w-0 opacity-70' : 'min-w-0'}>
          <p className="truncate text-[14.5px] font-semibold text-ink-900">
            {utilisateur.nom}
            {vous && <span className="font-normal text-steel-400"> (vous)</span>}
          </p>
          <p className="truncate text-[12.5px] text-steel-400">
            {utilisateur.email}
            {utilisateur.desactiveAt &&
              ` · retiré le ${dateCourte(utilisateur.desactiveAt)}${utilisateur.desactivePar ? ` par ${utilisateur.desactivePar.nom}` : ''}`}
          </p>
        </div>
        {utilisateur.desactiveAt ? (
          <span className="hidden sm:block" />
        ) : (
          <Selecteur
            aria-label={`Rôle de ${utilisateur.nom}`}
            taille="sm"
            className="col-start-2 sm:col-start-auto sm:w-40"
            options={[
              { valeur: 'GESTIONNAIRE', libelle: 'Gestionnaire' },
              { valeur: 'ADMIN', libelle: 'Administrateur' },
            ]}
            value={utilisateur.role}
            disabled={changerRole.isPending}
            onChange={(role) =>
              // Comme le <select> d'avant : rien n'est envoyé si le rôle ne change pas.
              role !== utilisateur.role && changerRole.mutate({ id: utilisateur.id, role: role as 'ADMIN' | 'GESTIONNAIRE' })
            }
          />
        )}
        <div className="col-start-2 flex sm:col-start-auto sm:justify-end">
          {!vous &&
            (utilisateur.desactiveAt ? (
              <Button
                variant="secondary"
                taille="sm"
                loading={acces.isPending && acces.variables?.utilisateur.id === utilisateur.id}
                onClick={() => acces.mutate({ utilisateur, action: 'reactiver' })}
              >
                <UserCheck className="size-4" aria-hidden="true" />
                Rendre l’accès
              </Button>
            ) : (
              <Button
                variant="ghost"
                taille="sm"
                className="-ml-2 text-rupture hover:bg-rupture-wash sm:ml-0"
                onClick={() => {
                  setSucces(null);
                  setADesactiver(utilisateur);
                }}
              >
                <UserX className="size-4" aria-hidden="true" />
                Retirer l’accès
              </Button>
            ))}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <EnteteSection
        titre="Équipe"
        description="Les personnes qui peuvent saisir et consulter le stock."
        action={
          <Button
            onClick={() => {
              setErreur(null);
              setSucces(null);
              setModaleOuverte(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Inviter un utilisateur
          </Button>
        }
      />

      {succes && <Alert variant="success">{succes}</Alert>}
      {erreur && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      {isLoading ? (
        <div className="parametres-carte">
          <LoadingState />
        </div>
      ) : isError || !data ? (
        <div className="parametres-carte">
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { libelle: 'Membres actifs', nombre: actifs.length, teinte: 'var(--color-ok)' },
              { libelle: 'Administrateurs', nombre: actifs.filter((u) => u.role === 'ADMIN').length, teinte: 'var(--color-action)' },
              { libelle: 'Accès retirés', nombre: retires.length, teinte: 'var(--color-steel-400)' },
            ].map((c) => (
              <div key={c.libelle} className="parametres-carte flex flex-col-reverse px-3 py-3 sm:px-4 sm:py-3.5">
                <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-steel-500 sm:text-[13px]">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: c.teinte }} aria-hidden="true" />
                  {c.libelle}
                </dt>
                <dd className="mb-1.5 font-display text-[22px] leading-none font-semibold text-ink-900 tabular-nums sm:text-[24px]">
                  {formatNombre(c.nombre)}
                </dd>
              </div>
            ))}
          </dl>

          <div className="parametres-carte">
            <EnteteCarte titre="Membres" meta="Une invitation acceptée apparaît ici." />
            {actifs.length > 0 ? <ul className="divide-y divide-rule">{actifs.map(ligne)}</ul> : <EmptyState titre="Aucun utilisateur" />}
          </div>

          {retires.length > 0 && (
            <div className="parametres-carte">
              <EnteteCarte titre="Accès retirés" meta="Leur nom reste sur l’historique : ventes, mouvements, déclarations." />
              <ul className="divide-y divide-rule">{retires.map(ligne)}</ul>
            </div>
          )}
        </>
      )}

      <div className="parametres-carte">
        <EnteteCarte titre="Qui peut faire quoi" meta="Les deux rôles de NimbaFlow." />
        <div className="grid sm:grid-cols-2">
          {DROITS.map((d, i) => (
            <div key={d.role} className={i > 0 ? 'border-t border-rule p-4 sm:border-t-0 sm:border-l sm:p-5' : 'p-4 sm:p-5'}>
              <p className="mb-2.5 flex items-center gap-2 text-[14.5px] font-semibold text-ink-900">
                <span className="size-2.5 rounded-full" style={{ background: d.teinte }} aria-hidden="true" />
                {d.libelle}
              </p>
              <ul className="flex flex-col gap-1.5 text-corps text-steel-700">
                {d.droits.map((droit) => (
                  <li key={droit} className="flex gap-2">
                    <Check className="mt-0.5 size-[15px] shrink-0" style={{ color: d.teinte }} aria-hidden="true" />
                    {droit}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <Modal
        ouvert={aDesactiver !== null}
        onFermer={() => setADesactiver(null)}
        titre={`Retirer l’accès de ${aDesactiver?.nom ?? ''} ?`}
        description="La personne est déconnectée immédiatement, sur tous ses appareils. Son nom reste sur l’historique (ventes, mouvements, déclarations) ; vous pourrez lui rendre l’accès."
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setADesactiver(null)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={acces.isPending}
              onClick={() => aDesactiver && acces.mutate({ utilisateur: aDesactiver, action: 'desactiver' })}
            >
              Retirer l’accès
            </Button>
          </>
        }
      >
        <p className="text-corps text-ink-900">
          {aDesactiver?.email} · {aDesactiver?.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
        </p>
      </Modal>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Inviter un utilisateur"
        description="La personne recevra un email avec un lien pour créer son compte."
        modifie={formState.isDirty}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-invitation" loading={inviter.isPending}>
              Envoyer l’invitation
            </Button>
          </>
        }
      >
        <form
          id="formulaire-invitation"
          onSubmit={handleSubmit((valeurs) => inviter.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <Input
            label="Email"
            type="email"
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <SelecteurChamp
            name="role"
            control={control}
            label="Rôle"
            options={[
              { valeur: 'GESTIONNAIRE', libelle: 'Gestionnaire de stock' },
              { valeur: 'ADMIN', libelle: 'Administrateur' },
            ]}
          />
        </form>
      </Modal>
    </div>
  );
}
