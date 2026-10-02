/**
 * Clés de métadonnées de la console, isolées dans leur propre fichier pour
 * être lues par le RolesGuard client et par ConsoleGuard sans dépendance
 * circulaire avec les décorateurs.
 */
export const IS_CONSOLE_KEY = 'isConsole';
export const IS_CONSOLE_PUBLIQUE_KEY = 'isConsolePublique';
