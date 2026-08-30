# StockFlow

Application SaaS de gestion de stock pour PME : produits, mouvements d'entrée/sortie, fournisseurs, alertes et dashboard.

## Structure du monorepo

```
stockflow/
├── backend/    # API NestJS + PostgreSQL (Prisma) — MVP terminé, 90 tests
└── frontend/   # Application React + Vite + Tailwind — en cours
```

## Démarrage

### Backend

```bash
cd backend
npm install
cp .env.example .env      # renseigner DATABASE_URL, JWT_*, EMAIL_PROVIDER
npx prisma migrate dev
npm run start:dev         # http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Le frontend appelle `/api/*`, relayé vers le backend par le proxy Vite — aucune configuration CORS nécessaire en développement. Le backend doit tourner pour que l'application fonctionne.

## Documentation

- `backend/README.md` — architecture, principe multi-tenant, contrôle d'accès, liste complète des routes API et état d'avancement du backlog.
