import { useEffect, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Building2, Cable, Contrast, LayoutGrid, Users } from 'lucide-react';
import { PageHeader } from '@/components/patterns/Page';
import { useModules } from '@/lib/useModules';
import { usePreferenceTheme } from '@/lib/theme';
import { EntrepriseSection } from './EntrepriseSection';
import { UtilisateursSection } from './UtilisateursSection';
import { ModulesSection } from './ModulesSection';
import { IntegrationsSection } from './IntegrationsSection';
import { ApparenceSection } from './ApparenceSection';
import { MODULES } from './modulesMetier';
import { CHAMPS_IDENTITE, MODES_APPARENCE, useEntreprise, useUtilisateurs, useWebhooks } from './donnees';
import './parametres.css';

const SECTIONS = [
  { cle: 'entreprise', libelle: 'Entreprise', Icone: Building2 },
  { cle: 'utilisateurs', libelle: 'Équipe', Icone: Users },
  { cle: 'modules', libelle: 'Modules', Icone: LayoutGrid },
  { cle: 'integrations', libelle: 'Intégrations', Icone: Cable },
  { cle: 'apparence', libelle: 'Apparence', Icone: Contrast },
] as const;

type CleSection = (typeof SECTIONS)[number]['cle'];

function estSectionValide(valeur: string | null): valeur is CleSection {
  return SECTIONS.some((s) => s.cle === valeur);
}

/** Résumé d'une section sous son nom dans le menu (rien tant que la donnée charge). */
type Resume = { texte: string; teinte?: string } | null;

function useResumes(): Record<CleSection, Resume> {
  const entreprise = useEntreprise();
  const utilisateurs = useUtilisateurs();
  const modules = useModules();
  const webhooks = useWebhooks(modules.webhooks);
  const preference = usePreferenceTheme();

  const remplis = entreprise.data ? CHAMPS_IDENTITE.filter(({ champ }) => entreprise.data[champ]).length : 0;
  const actifs = utilisateurs.data?.filter((u) => !u.desactiveAt).length ?? 0;
  const modulesActifs = MODULES.filter((m) => modules[m.cle]).length;
  const desactives = webhooks.data?.filter((w) => !w.actif).length ?? 0;
  const enService = (webhooks.data?.length ?? 0) - desactives;

  return {
    entreprise: entreprise.data
      ? {
          texte: `Identité ${remplis}/${CHAMPS_IDENTITE.length}`,
          teinte: remplis === CHAMPS_IDENTITE.length ? 'var(--color-ok)' : 'var(--color-faible)',
        }
      : null,
    utilisateurs: utilisateurs.data ? { texte: `${actifs} ${actifs > 1 ? 'membres actifs' : 'membre actif'}` } : null,
    modules: modules.charge ? { texte: `${modulesActifs} sur ${MODULES.length} activés` } : null,
    integrations: !modules.charge
      ? null
      : !modules.webhooks
        ? { texte: 'API' }
        : !webhooks.data
          ? null
          : desactives > 0
            ? { texte: `${desactives} webhook${desactives > 1 ? 's' : ''} désactivé${desactives > 1 ? 's' : ''}`, teinte: 'var(--color-rupture)' }
            : enService > 0
              ? { texte: `${enService} webhook${enService > 1 ? 's' : ''} actif${enService > 1 ? 's' : ''}`, teinte: 'var(--color-ok)' }
              : { texte: 'Aucun webhook' },
    apparence: { texte: MODES_APPARENCE.find((m) => m.valeur === preference)?.libelle ?? '' },
  };
}

/**
 * Paramètres du compte (administrateur seulement, voir RouteAdmin) :
 * entreprise, équipe, modules métier, intégrations, apparence. Emplacements
 * et Catégories & marques ont leurs propres pages ; leurs anciennes adresses
 * (?onglet=…) y redirigent. La section suit l'adresse, si bien qu'un lien
 * vers une autre section change bien de section sur la page déjà ouverte.
 */
export function ParametresPage() {
  const [parametresUrl, setParametresUrl] = useSearchParams();
  const onglet = parametresUrl.get('onglet');
  const resumes = useResumes();
  const navRef = useRef<HTMLDivElement>(null);
  const actif: CleSection = estSectionValide(onglet) ? onglet : 'entreprise';

  // Sur mobile, le menu défile à l'horizontale : la section choisie reste
  // visible, sans faire défiler la page elle-même.
  useEffect(() => {
    const nav = navRef.current;
    const bouton = nav?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!nav || !bouton || nav.scrollWidth <= nav.clientWidth) return;
    const cadre = nav.getBoundingClientRect();
    const cible = bouton.getBoundingClientRect();
    if (cible.left < cadre.left) nav.scrollLeft += cible.left - cadre.left - 16;
    else if (cible.right > cadre.right) nav.scrollLeft += cible.right - cadre.right + 16;
  }, [actif]);

  if (onglet === 'emplacements') return <Navigate to="/emplacements" replace />;
  if (onglet === 'categories' || onglet === 'marques') {
    return <Navigate to={onglet === 'marques' ? '/categories?onglet=marques' : '/categories'} replace />;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Paramètres" description="Votre entreprise, votre équipe, vos modules métier et l’apparence de cet appareil." />

      <div className="parametres-grille">
        <div ref={navRef} role="tablist" aria-label="Sections des paramètres" aria-orientation="vertical" className="parametres-nav">
          {SECTIONS.map(({ cle, libelle, Icone }) => {
            const resume = resumes[cle];
            return (
              <button
                key={cle}
                type="button"
                role="tab"
                id={`section-${cle}`}
                aria-selected={actif === cle}
                aria-controls="panneau-parametres"
                onClick={() => setParametresUrl(cle === 'entreprise' ? {} : { onglet: cle }, { replace: true })}
              >
                <span className="parametres-pastille" aria-hidden="true">
                  <Icone className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink-900">{libelle}</span>
                  <span className="parametres-resume">
                    {resume?.teinte && <span className="size-1.5 shrink-0 rounded-full" style={{ background: resume.teinte }} aria-hidden="true" />}
                    {resume?.texte ?? '…'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="panneau-parametres" aria-labelledby={`section-${actif}`} className="min-w-0">
          {actif === 'entreprise' && <EntrepriseSection />}
          {actif === 'utilisateurs' && <UtilisateursSection />}
          {actif === 'modules' && <ModulesSection />}
          {actif === 'integrations' && <IntegrationsSection />}
          {actif === 'apparence' && <ApparenceSection />}
        </div>
      </div>
    </div>
  );
}
