import { defineRailway, github, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "stockflow";

// Variables du service : leurs valeurs restent celles saisies sur Railway.
// `preserve()` les déclare sans jamais écrire de valeur dans le dépôt.
// Toute variable absente de cette liste serait SUPPRIMÉE au prochain
// `railway config apply` : ajoutez-la ici avant de la créer sur Railway.
const VARIABLES = [
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "DATABASE_URL",
  "EMAIL_FROM",
  "EMAIL_PROVIDER",
  "FRONTEND_URL",
  "JWT_ACCESS_SECRET",
  "JWT_CONSOLE_SECRET",
  "JWT_REFRESH_SECRET",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  // Non lue par l'application (faute de frappe probable de JWT_REFRESH_SECRET).
  // Conservée tant que l'exploitant ne l'a pas supprimée sur Railway.
  "WT_REFRESH_SECRET",
] as const;

export default defineRailway(() => {
  const stockflow = service("stockflow", {
    source: github("Joseph02-Dev/stockflow", { rootDirectory: "backend", checkSuites: true }),
    build: { builder: "RAILPACK", buildCommand: "npm run build" },
    deploy: {
      startCommand: "npm run migrate:deploy && npm run start:prod",
      healthcheckPath: "/health",
      healthcheckTimeout: 300,
      // Politique ON_FAILURE : valeur par défaut de Railway, stockée « null »
      // côté Railway ; la déclarer créerait une différence permanente au plan.
      restartPolicyMaxRetries: 3,
      ipv6EgressEnabled: true,
    },
    variables: Object.fromEntries(VARIABLES.map((nom) => [nom, preserve()])),
  });
  return project("stockflowgn", {
    resources: [stockflow],
  });
});
