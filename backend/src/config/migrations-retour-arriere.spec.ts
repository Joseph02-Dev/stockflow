import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Retour arrière : Railway peut redémarrer une image précédente, mais le
 * schéma de la base reste celui de la dernière migration appliquée. Une
 * migration doit donc laisser fonctionner le code de la version d'avant
 * (docs/runbook-retour-arriere.md). Les opérations qui le cassent exigent
 * une justification explicite dans le fichier : `-- retour-arriere: …`.
 */
const DOSSIER = join(import.meta.dirname, '../../prisma/migrations');

const OPERATIONS_DESTRUCTIVES: [RegExp, string][] = [
  [/\bDROP\s+(TABLE|COLUMN)\b/i, 'suppression de table ou de colonne'],
  [/\bRENAME\b/i, 'renommage'],
  [/\bALTER\s+COLUMN\b.*\b(TYPE|SET\s+NOT\s+NULL)\b/i, 'changement de type ou NOT NULL ajouté'],
  [/\bADD\s+COLUMN\b(?!.*\bDEFAULT\b).*\bNOT\s+NULL\b/i, 'colonne obligatoire sans valeur par défaut'],
  [/\b(TRUNCATE|DELETE\s+FROM)\b/i, 'suppression de données'],
];

/** Antérieures à la règle : déjà appliquées partout. */
const HISTORIQUE = new Set(['20260830143354_add_nom_to_utilisateur']);

export function operationsBloquantes(sql: string): string[] {
  if (/^\s*--\s*retour-arriere:\s*\S/m.test(sql)) return [];
  return sql
    .split('\n')
    .filter((ligne) => !ligne.trim().startsWith('--'))
    .flatMap((ligne) => OPERATIONS_DESTRUCTIVES.filter(([motif]) => motif.test(ligne)).map(([, nom]) => `${nom} : ${ligne.trim()}`));
}

describe('Migrations compatibles avec un retour arrière du code', () => {
  it('détecte les opérations destructives, sauf justification explicite', () => {
    expect(operationsBloquantes('ALTER TABLE "produit" DROP COLUMN "prix";')).toHaveLength(1);
    expect(operationsBloquantes('ALTER TABLE "produit" ADD COLUMN "code" TEXT NOT NULL;')).toHaveLength(1);
    expect(operationsBloquantes('ALTER TABLE "produit" ADD COLUMN "code" TEXT NOT NULL DEFAULT \'\';')).toHaveLength(0);
    expect(operationsBloquantes('ALTER TABLE "produit" ADD COLUMN "code" TEXT;')).toHaveLength(0);
    expect(operationsBloquantes('-- retour-arriere: colonne vide depuis la v1.4, sauvegarde faite\nALTER TABLE "produit" DROP COLUMN "x";')).toHaveLength(0);
  });

  it('aucune migration ne casse la version précédente sans le dire', () => {
    const fautives = readdirSync(DOSSIER, { withFileTypes: true })
      .filter((entree) => entree.isDirectory() && !HISTORIQUE.has(entree.name))
      .flatMap((entree) =>
        operationsBloquantes(readFileSync(join(DOSSIER, entree.name, 'migration.sql'), 'utf8')).map((op) => `${entree.name} — ${op}`),
      );
    expect(fautives).toEqual([]);
  });
});
