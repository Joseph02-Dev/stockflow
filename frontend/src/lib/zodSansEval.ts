import { config } from 'zod';

/**
 * Zod compile ses validations avec `new Function` quand il le peut, et le
 * vérifie au premier usage. La CSP du site (vite.config.ts) interdit eval :
 * l'essai échoue sans conséquence, mais le navigateur signale une violation
 * à chaque page. Mode sans compilation : même validation, aucun essai.
 *
 * Importé en premier par main.tsx, avant toute utilisation d'un schéma.
 */
config({ jitless: true });
