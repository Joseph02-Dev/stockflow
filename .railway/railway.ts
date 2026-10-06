import { defineRailway, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "stockflow";

export default defineRailway(() => {
  const stockflow = service("stockflow", {
    build: "npm run build",
    start: "npm run migrate:deploy && npm run start:prod",
    healthcheck: "/health",
    healthcheckTimeout: 300,
    // builder from CaC: "RAILPACK"
  });
  return project("stockflow", {
    resources: [stockflow],
  });
});
