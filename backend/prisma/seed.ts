import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const EMAIL_ADMIN = 'admin@demo.fr';
const EMAIL_GESTIONNAIRE = 'gestionnaire@demo.fr';
const MOT_DE_PASSE = 'motdepasse123';

/**
 * Jeu de données de démonstration.
 * Idempotent : si l'entreprise de démonstration existe déjà, elle est
 * entièrement supprimée avant d'être recréée, pour éviter les doublons.
 */
async function main() {
  const existante = await prisma.utilisateur.findUnique({ where: { email: EMAIL_ADMIN } });
  if (existante) {
    const entrepriseId = existante.entrepriseId;
    const utilisateurs = await prisma.utilisateur.findMany({ where: { entrepriseId } });
    const utilisateurIds = utilisateurs.map((u) => u.id);
    await prisma.fournisseurProduit.deleteMany({ where: { fournisseur: { entrepriseId } } });
    await prisma.alerte.deleteMany({ where: { entrepriseId } });
    await prisma.mouvement.deleteMany({ where: { entrepriseId } });
    await prisma.stock.deleteMany({ where: { produit: { entrepriseId } } });
    await prisma.invitation.deleteMany({ where: { entrepriseId } });
    await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
    await prisma.utilisateur.deleteMany({ where: { entrepriseId } });
    await prisma.fournisseur.deleteMany({ where: { entrepriseId } });
    await prisma.produit.deleteMany({ where: { entrepriseId } });
    await prisma.emplacement.deleteMany({ where: { entrepriseId } });
    await prisma.entreprise.delete({ where: { id: entrepriseId } });
    console.log('Ancien jeu de démonstration supprimé.');
  }

  const passwordHash = await argon2.hash(MOT_DE_PASSE);

  const entreprise = await prisma.entreprise.create({ data: { nom: 'Menuiserie Dupont' } });

  const admin = await prisma.utilisateur.create({
    data: {
      entrepriseId: entreprise.id,
      email: EMAIL_ADMIN,
      nom: 'Awa Diallo',
      passwordHash,
      role: 'ADMIN',
    },
  });
  await prisma.utilisateur.create({
    data: {
      entrepriseId: entreprise.id,
      email: EMAIL_GESTIONNAIRE,
      nom: 'Mamadou Camara',
      passwordHash,
      role: 'GESTIONNAIRE',
    },
  });

  const [entrepot, atelier] = await Promise.all([
    prisma.emplacement.create({
      data: { entrepriseId: entreprise.id, nom: 'Entrepôt principal', adresse: '12 rue des Artisans' },
    }),
    prisma.emplacement.create({ data: { entrepriseId: entreprise.id, nom: 'Atelier' } }),
  ]);

  const [boisEtCie, quincaillerie] = await Promise.all([
    prisma.fournisseur.create({
      data: {
        entrepriseId: entreprise.id,
        nom: 'Bois & Cie',
        emailContact: 'contact@bois-et-cie.fr',
        telephone: '+224 620 00 00 01',
      },
    }),
    prisma.fournisseur.create({
      data: {
        entrepriseId: entreprise.id,
        nom: 'Quincaillerie Centrale',
        emailContact: 'ventes@quincaillerie.fr',
      },
    }),
  ]);

  const definitions = [
    { nom: 'Planche chêne 200x20cm', reference: 'PLA-CH20', seuilAlerte: 10, fournisseur: boisEtCie },
    { nom: 'Planche pin 180x15cm', reference: 'PLA-PI18', seuilAlerte: 12, fournisseur: boisEtCie },
    { nom: 'Vis inox 4x40mm (boîte de 200)', reference: 'VIS-440', seuilAlerte: 15, fournisseur: quincaillerie },
    { nom: 'Charnières laiton (paire)', reference: 'CHA-LAI', seuilAlerte: 12, fournisseur: quincaillerie },
    { nom: 'Colle à bois D3 750ml', reference: 'COL-D3', seuilAlerte: 8, fournisseur: quincaillerie },
    { nom: 'Vernis mat 1L', reference: 'VER-MAT', seuilAlerte: 5, fournisseur: boisEtCie },
  ];

  const produits = [];
  for (const def of definitions) {
    const produit = await prisma.produit.create({
      data: {
        entrepriseId: entreprise.id,
        nom: def.nom,
        reference: def.reference,
        seuilAlerte: def.seuilAlerte,
      },
    });
    await prisma.fournisseurProduit.create({
      data: { fournisseurId: def.fournisseur.id, produitId: produit.id },
    });
    produits.push({ ...produit, fournisseurId: def.fournisseur.id });
  }

  /** Reproduit la logique métier réelle : stock, mouvement, puis alerte. */
  async function mouvement(
    produit: (typeof produits)[number],
    emplacementId: string,
    type: 'ENTREE' | 'SORTIE',
    quantite: number,
    joursAvant: number,
  ) {
    const createdAt = new Date(Date.now() - joursAvant * 24 * 60 * 60 * 1000);

    await prisma.stock.upsert({
      where: { produitId_emplacementId: { produitId: produit.id, emplacementId } },
      create: {
        produitId: produit.id,
        emplacementId,
        quantite: type === 'ENTREE' ? quantite : 0,
      },
      update: { quantite: type === 'ENTREE' ? { increment: quantite } : { decrement: quantite } },
    });

    await prisma.mouvement.create({
      data: {
        entrepriseId: entreprise.id,
        produitId: produit.id,
        emplacementId,
        type,
        quantite,
        fournisseurId: type === 'ENTREE' ? produit.fournisseurId : null,
        utilisateurId: admin.id,
        createdAt,
      },
    });

    const total = await prisma.stock.aggregate({
      where: { produitId: produit.id },
      _sum: { quantite: true },
    });
    const stockTotal = total._sum.quantite ?? 0;
    const alerteActive = await prisma.alerte.findFirst({
      where: { produitId: produit.id, statut: 'ACTIVE' },
    });

    if (stockTotal < produit.seuilAlerte || stockTotal === 0) {
      const typeAlerte = stockTotal === 0 ? 'RUPTURE' : 'STOCK_FAIBLE';
      if (alerteActive) {
        await prisma.alerte.update({
          where: { id: alerteActive.id },
          data: { type: typeAlerte, quantiteAuDeclenchement: stockTotal },
        });
      } else {
        await prisma.alerte.create({
          data: {
            entrepriseId: entreprise.id,
            produitId: produit.id,
            type: typeAlerte,
            quantiteAuDeclenchement: stockTotal,
            createdAt,
          },
        });
      }
    } else if (alerteActive) {
      await prisma.alerte.update({
        where: { id: alerteActive.id },
        data: { statut: 'RESOLUE', resolvedAt: createdAt },
      });
    }
  }

  // Approvisionnement initial
  await mouvement(produits[0], entrepot.id, 'ENTREE', 60, 12);
  await mouvement(produits[1], entrepot.id, 'ENTREE', 45, 12);
  await mouvement(produits[2], entrepot.id, 'ENTREE', 80, 11);
  await mouvement(produits[3], entrepot.id, 'ENTREE', 50, 11);
  await mouvement(produits[4], atelier.id, 'ENTREE', 24, 10);
  await mouvement(produits[5], atelier.id, 'ENTREE', 18, 10);

  // Consommation de l'atelier
  await mouvement(produits[0], entrepot.id, 'SORTIE', 18, 6);
  await mouvement(produits[2], entrepot.id, 'SORTIE', 30, 5);
  await mouvement(produits[3], entrepot.id, 'SORTIE', 12, 4);

  // Vernis : passe sous le seuil puis est réapprovisionné (alerte résolue)
  await mouvement(produits[5], atelier.id, 'SORTIE', 15, 3);
  await mouvement(produits[5], atelier.id, 'ENTREE', 20, 2);

  // Deux alertes actives à l'arrivée : stock faible et rupture
  await mouvement(produits[2], entrepot.id, 'SORTIE', 42, 1);
  await mouvement(produits[4], atelier.id, 'SORTIE', 24, 1);

  const alertes = await prisma.alerte.groupBy({ by: ['statut'], _count: true });

  console.log('\nJeu de démonstration créé.\n');
  console.log(`  Entreprise    : ${entreprise.nom}`);
  console.log(`  Administrateur: ${EMAIL_ADMIN} / ${MOT_DE_PASSE}`);
  console.log(`  Gestionnaire  : ${EMAIL_GESTIONNAIRE} / ${MOT_DE_PASSE}`);
  console.log(`  ${produits.length} produits, 2 emplacements, 2 fournisseurs, 13 mouvements`);
  console.log(`  Alertes       : ${alertes.map((a) => `${a._count} ${a.statut}`).join(', ')}\n`);
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
