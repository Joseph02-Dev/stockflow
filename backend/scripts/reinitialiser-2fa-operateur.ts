import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Téléphone perdu ou changé : efface la double authentification d'un
 * opérateur, qui se réenrôle (nouveau QR code) à sa prochaine connexion.
 * Volontairement sans interface, comme la création d'un opérateur : il
 * faut un accès direct au serveur.
 *
 * Usage :
 *   npm run console:reinitialiser-2fa -- --email=...
 */
async function main() {
  const email = /^--email=(.+)$/.exec(process.argv.slice(2).find((a) => a.startsWith('--email=')) ?? '')?.[1];
  if (!email) {
    console.error('Usage : npm run console:reinitialiser-2fa -- --email=...');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const { count } = await prisma.operateur.updateMany({
      where: { email: email.toLowerCase() },
      data: { totpSecret: null, totpActifAt: null, totpDernierPas: null },
    });
    if (count === 0) {
      console.error(`Erreur : aucun opérateur avec l'adresse ${email.toLowerCase()}.`);
      process.exit(1);
    }
    console.log(`Double authentification réinitialisée pour ${email.toLowerCase()} : nouveau QR code à la prochaine connexion.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erreur: unknown) => {
  console.error(erreur);
  process.exit(1);
});
