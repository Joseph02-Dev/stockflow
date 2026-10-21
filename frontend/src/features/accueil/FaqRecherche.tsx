import { useId, useState, type ReactNode } from 'react';
import { Banknote, CircleHelp, Package, Rocket, Search, Smartphone, Store, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { QuestionFaq } from './contenu';

/**
 * Accordéon des questions fréquentes, avec une recherche qui filtre les
 * questions (sans tenir compte des accents) et surligne les termes trouvés.
 * Une seule réponse ouverte à la fois ; la première l'est au départ. Sans
 * résultat, le visiteur peut envoyer sa question par email, la recherche en
 * objet. Animations dans accueil.css (préfixe `faq-`).
 */

/** Pictogramme de chaque question ; les questions ajoutées plus tard prennent CircleHelp. */
const ICONES: Record<string, LucideIcon> = {
  'Qu’est-ce que NimbaFlow ?': Package,
  'À qui s’adresse NimbaFlow ?': Store,
  'Comment commencer l’essai ?': Rocket,
  'Puis-je utiliser NimbaFlow sur mon téléphone ?': Smartphone,
  'Dans quelle devise sont gérés les montants ?': Banknote,
};

const sansAccents = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Découpe `texte` autour des occurrences de `terme` (insensible aux accents et à la casse). */
function surligner(texte: string, terme: string): ReactNode[] {
  if (!terme) return [texte];
  // La normalisation NFD peut changer la longueur : on compare caractère par caractère.
  const base = Array.from({ length: texte.length }, (_, i) => sansAccents(texte[i]));
  const cible = sansAccents(terme);
  const morceaux: ReactNode[] = [];
  let debut = 0;
  for (let i = 0; i < base.length; i += 1) {
    let longueur = 0;
    let lu = '';
    while (i + longueur < base.length && lu.length < cible.length) {
      lu += base[i + longueur];
      longueur += 1;
    }
    if (lu !== cible) continue;
    if (i > debut) morceaux.push(texte.slice(debut, i));
    morceaux.push(<mark key={i}>{texte.slice(i, i + longueur)}</mark>);
    debut = i + longueur;
    i = debut - 1;
  }
  if (debut < texte.length) morceaux.push(texte.slice(debut));
  return morceaux;
}

export function FaqRecherche({ questions, adresse }: { questions: QuestionFaq[]; adresse: string }) {
  const id = useId();
  const [terme, setTerme] = useState('');
  const [ouverte, setOuverte] = useState<number | null>(0);

  const recherche = terme.trim();
  const cible = sansAccents(recherche);
  const visibles = questions
    .map((q, index) => ({ ...q, index }))
    .filter((q) => !cible || sansAccents(`${q.question} ${q.reponse ?? ''}`).includes(cible));
  // Pendant une recherche, la réponse ouverte doit rester visible : sinon la première trouvée s'ouvre.
  const active =
    recherche && !visibles.some((q) => q.index === ouverte) ? (visibles[0]?.index ?? null) : ouverte;

  const reponse = (texte: string) => {
    const [avant, apres] = texte.split(adresse);
    if (apres === undefined) return surligner(texte, recherche);
    return [
      ...surligner(avant, recherche),
      <a key="mail" href={`mailto:${adresse}`} className="font-semibold text-action hover:underline">
        {adresse}
      </a>,
      ...surligner(apres, recherche),
    ];
  };

  return (
    <>
      <div className="faq-recherche">
        <Search className="faq-loupe" aria-hidden="true" />
        <input
          type="search"
          value={terme}
          onChange={(e) => setTerme(e.target.value)}
          placeholder="Rechercher : essai, téléphone, devise…"
          aria-label="Rechercher une question"
          autoComplete="off"
        />
        {terme && (
          <button type="button" onClick={() => setTerme('')} aria-label="Effacer la recherche">
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="faq-compte" aria-live="polite">
        {recherche && visibles.length > 0
          ? `${visibles.length} question${visibles.length > 1 ? 's' : ''} sur ${questions.length}`
          : ''}
      </p>

      <div className="faq-liste">
        {visibles.length > 0 ? (
          <ul className="grid gap-2.5">
            {visibles.map(({ question, reponse: texte, index }) => {
              const Icone = ICONES[question] ?? CircleHelp;
              const estOuverte = index === active;
              return (
                <li key={question} className={cn('faq-question', estOuverte && 'faq-ouverte')}>
                  <button
                    type="button"
                    id={`${id}-q${index}`}
                    className="faq-declencheur"
                    aria-expanded={estOuverte}
                    aria-controls={`${id}-r${index}`}
                    onClick={() => setOuverte(estOuverte ? null : index)}
                  >
                    <span className="faq-tuile">
                      <Icone aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="faq-numero">{String(index + 1).padStart(2, '0')}</span>
                      <span className="faq-intitule">{surligner(question, recherche)}</span>
                    </span>
                    <span className="faq-signe" aria-hidden="true" />
                  </button>
                  <div
                    className="faq-corps"
                    id={`${id}-r${index}`}
                    role="region"
                    aria-labelledby={`${id}-q${index}`}
                    inert={!estOuverte}
                  >
                    <div>
                      <p className="faq-reponse">{texte && reponse(texte)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="faq-vide">
            <b>Aucune question ne correspond.</b>
            Posez-la nous directement, nous vous répondrons par email.
            <br />
            <a href={`mailto:${adresse}?subject=${encodeURIComponent(`Question : ${recherche}`)}`}>
              Envoyer ma question →
            </a>
          </div>
        )}
      </div>
    </>
  );
}
