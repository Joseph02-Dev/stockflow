import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Les tests d'intégration partagent une vraie base PostgreSQL : un
    // fichier à la fois, sinon le nettoyage ou l'empreinte de la base d'un
    // test (isolation transverse) verrait les données d'un autre.
    fileParallelism: false,
  },
});
