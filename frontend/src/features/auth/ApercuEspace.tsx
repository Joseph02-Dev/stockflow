import { useEffect, useRef } from 'react';
import { Banknote, Check, MailCheck, MapPin, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Aperçu de l'espace dans le panneau d'inscription : il se remplit à mesure
 * que la personne saisit ses informations (entreprise, administrateur,
 * email, secteur, emplacements, TVA), avec une jauge de complétude.
 * Purement décoratif : les vraies valeurs restent dans le formulaire.
 */
export function ApercuEspace({
  entreprise,
  administrateur,
  email,
  emailConfirme,
  motDePasseValide,
  secteur,
  emplacements,
  tva,
}: {
  entreprise: string;
  administrateur: string;
  email: string;
  emailConfirme: boolean;
  motDePasseValide: boolean;
  secteur: string | null;
  emplacements: string[];
  tva: number | null;
}) {
  const initiales =
    entreprise
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((mot) => mot[0])
      .join('')
      .toUpperCase() || '?';

  // Petit rebond du logo quand les initiales changent.
  const logo = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = logo.current;
    if (!element || initiales === '?') return;
    element.classList.remove('apercu-rebond');
    void element.offsetWidth;
    element.classList.add('apercu-rebond');
  }, [initiales]);

  const remplis = [
    entreprise.trim(),
    administrateur.trim(),
    email.trim(),
    motDePasseValide || emailConfirme,
    emailConfirme,
    secteur,
    emplacements.length > 0,
  ].filter(Boolean).length;
  const pourcentage = Math.round((remplis / 7) * 100);

  const attente = <span className="text-white/35">—</span>;

  return (
    <div className="apercu-espace" aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-white/8 p-4">
        <span ref={logo} className="apercu-logo">
          {initiales}
        </span>
        <span className="min-w-0">
          <b className="block truncate font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-white">
            {entreprise.trim() || <span className="font-medium text-white/35 italic">Nom de votre entreprise</span>}
          </b>
          <small className="block truncate text-meta text-white/55">Administrateur : {administrateur.trim() || '—'}</small>
        </span>
      </div>
      <dl className="grid gap-3 px-4 py-3.5 text-[0.84375rem]">
        <div className="apercu-ligne">
          <dt>
            <MailCheck />
            Email
          </dt>
          <dd>
            {emailConfirme ? (
              <span className="inline-flex items-center gap-1 text-[#6fd3b1]">
                <Check className="size-3.5" /> confirmé
              </span>
            ) : email.trim() ? (
              <span className="text-white/45">à confirmer</span>
            ) : (
              attente
            )}
          </dd>
        </div>
        <div className="apercu-ligne">
          <dt>
            <ShoppingBag />
            Secteur
          </dt>
          <dd>{secteur ? <b className="font-semibold text-white">{secteur}</b> : attente}</dd>
        </div>
        <div className="apercu-ligne">
          <dt>
            <MapPin />
            Emplacements
          </dt>
          <dd className="flex flex-wrap justify-end gap-1">
            {emplacements.length > 0
              ? emplacements.map((nom) => (
                  <span key={nom} className="rounded-full bg-[#f27a35]/18 px-2 py-0.5 text-meta font-semibold text-[#f6a06d]">
                    {nom}
                  </span>
                ))
              : attente}
          </dd>
        </div>
        <div className="apercu-ligne">
          <dt>
            <Banknote />
            Devise · TVA
          </dt>
          <dd>
            <b className="font-semibold text-white">GNF{tva !== null ? ` · ${tva} %` : ''}</b>
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-2 border-t border-white/8 bg-white/[0.04] px-4 py-2.5 text-meta text-white/50">
        <span className="font-mono">{pourcentage} %</span>
        <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/10">
          <span className={cn('block h-full rounded-full bg-[#f27a35] transition-[width] duration-400')} style={{ width: `${pourcentage}%` }} />
        </span>
        <span>prêt</span>
      </div>
    </div>
  );
}
