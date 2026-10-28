-- Nombre exact de lignes des tables qui portent l'activité : comparé entre
-- la base de production (juste avant l'export) et la copie restaurée.
SELECT 'entreprise', count(*) FROM entreprise
UNION ALL SELECT 'utilisateur', count(*) FROM utilisateur
UNION ALL SELECT 'produit', count(*) FROM produit
UNION ALL SELECT 'emplacement', count(*) FROM emplacement
UNION ALL SELECT 'stock', count(*) FROM stock
UNION ALL SELECT 'lot', count(*) FROM lot
UNION ALL SELECT 'mouvement', count(*) FROM mouvement
UNION ALL SELECT 'vente', count(*) FROM vente
UNION ALL SELECT 'client', count(*) FROM client
UNION ALL SELECT 'fournisseur', count(*) FROM fournisseur
UNION ALL SELECT 'commande_fournisseur', count(*) FROM commande_fournisseur
UNION ALL SELECT '_prisma_migrations', count(*) FROM _prisma_migrations
ORDER BY 1;
