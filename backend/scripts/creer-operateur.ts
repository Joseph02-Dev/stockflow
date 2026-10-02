import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Création d'un opérateur de la console — volontairement sans interface :
 * un opérateur ne peut naître que d'un accès direct au serveur.
 *
 * Usage :
 *   npm run console:creer-operateur -- --email=... --nom="..." --motdepasse=...
 */

const LONGUEUR_MIN_MOT_DE_PASSE = 12;

function lireArguments(): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const argument of process.argv.slice(2)) {
    const correspondance = /^--([a-z]+)=(.*)$/.exec(argument);
    if (correspondance) valeurs[correspondance[1]] = correspondance[2];
  }
  return valeurs;
}

function echouer(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error('Usage : npm run console:creer-operateur -- --email=... --nom="..." --motdepasse=...');
  process.exit(1);
}

async function main() {
  const { email, nom, motdepasse } = lireArguments();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) echouer('--email manquant ou invalide.');
  if (!nom?.trim()) echouer('--nom manquant.');
  if (!motdepasse || motdepasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    echouer(`--motdepasse manquant ou trop court (${LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum).`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const emailNormalise = email.toLowerCase();
    const existant = await prisma.operateur.findUnique({ where: { email: emailNormalise } });
    // Jamais d'écrasement silencieux d'un opérateur existant.
    if (existant) echouer(`un opérateur existe déjà avec l'adresse ${emailNormalise}.`);

    const operateur = await prisma.operateur.create({
      data: { email: emailNormalise, nom: nom.trim(), passwordHash: await argon2.hash(motdepasse) },
    });
    console.log(`Opérateur créé : ${operateur.nom} <${operateur.email}> (id ${operateur.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erreur: unknown) => {
  console.error(erreur);
  process.exit(1);
});
