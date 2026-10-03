import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { LimitesService } from '../../common/limites/limites.service.js';
import { BOM_UTF8, ligneCsv } from '../../common/pagination/csv.js';
import {
  MouvementsService,
  type TransactionPrisma,
} from '../mouvements/mouvements.service.js';
import {
  CHAMPS_IMPORT,
  ENTETES_MODELE,
  cleNom,
  lireDate,
  lireEntier,
  lireTexte,
  montant,
  type ChampImport,
} from './normalisation.js';
import {
  LIGNES_MAX,
  type LotLignesDto,
  type OptionsImportDto,
} from './dto/import.dto.js';

export type Gravite = 'BLOQUANT' | 'A_VERIFIER';

export interface Probleme {
  gravite: Gravite;
  message: string;
  champ?: ChampImport;
  /** Doublon dans le fichier : valeur et toutes les lignes qui la portent. */
  doublon?: { valeur: string; lignes: number[]; conservee: number };
}

interface Valeurs {
  nom: string | null;
  reference: string | null;
  codeBarre: string | null;
  categorie: string | null;
  marque: string | null;
  uniteMesure: string | null;
  description: string | null;
  prixAchat: number | null;
  prixVente: number | null;
  prixDemiGros: number | null;
  prixGros: number | null;
  tauxTva: number | null;
  seuilAlerte: number | null;
  quantite: number | null;
  numeroLot: string | null;
  datePeremption: string | null;
}

interface LigneAnalysee {
  id: string;
  numero: number;
  action: 'CREER' | 'METTRE_A_JOUR' | 'BLOQUEE';
  produitExistant: { id: string; nom: string } | null;
  valeurs: Valeurs;
  problemes: Probleme[];
}

const CHAMPS_ENTIERS = [
  'prixAchat',
  'prixVente',
  'prixDemiGros',
  'prixGros',
  'tauxTva',
  'seuilAlerte',
  'quantite',
] as const;

const LONGUEURS_MAX: Partial<Record<ChampImport, number>> = {
  nom: 150,
  reference: 100,
  codeBarre: 64,
  categorie: 100,
  marque: 100,
  uniteMesure: 30,
  numeroLot: 60,
  description: 2000,
};

/** Délai pendant lequel un import exécuté peut être annulé. */
const DELAI_ANNULATION_MS = 24 * 60 * 60 * 1000;

const EXEMPLES: Partial<Record<ChampImport, string>>[] = [
  {
    nom: 'Ciment Portland 50 kg',
    reference: 'MAT-0001',
    categorie: 'Matériaux',
    marque: 'CIMAF',
    uniteMesure: 'Sac',
    prixAchat: '82 000',
    prixVente: '95 000',
    prixGros: '90 000',
    tauxTva: '18',
    seuilAlerte: '50',
    quantite: '400',
  },
  {
    nom: 'Fer à béton 12 mm',
    reference: 'MAT-0002',
    categorie: 'Matériaux',
    uniteMesure: 'Barre',
    prixAchat: '126 000',
    prixVente: '148 000',
    tauxTva: '18',
    seuilAlerte: '40',
    quantite: '300',
  },
  {
    nom: 'Tôle ondulée 3 m',
    reference: 'MAT-0003',
    categorie: 'Toiture',
    uniteMesure: 'Feuille',
    prixAchat: '61 000',
    prixVente: '72 000',
    tauxTva: '18',
    seuilAlerte: '30',
    quantite: '200',
  },
  {
    nom: 'Riz parfumé 25 kg',
    reference: 'ALI-0001',
    categorie: 'Alimentation',
    uniteMesure: 'Sac',
    prixAchat: '285 000',
    prixVente: '320 000',
    seuilAlerte: '20',
    quantite: '60',
    numeroLot: 'LOT-2601-C',
    datePeremption: '04/01/2027',
  },
  {
    nom: 'Peinture blanche 20 L',
    reference: 'PEI-0001',
    codeBarre: '6111245000123',
    categorie: 'Peinture',
    marque: 'Seigneurie',
    uniteMesure: 'Seau',
    prixAchat: '165 000',
    prixVente: '195 000',
    tauxTva: '18',
    seuilAlerte: '10',
    quantite: '25',
    description: 'Peinture acrylique mate, intérieur et extérieur',
  },
];

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limites: LimitesService,
    private readonly mouvements: MouvementsService,
  ) {}

  async ouvrir(
    entrepriseId: string,
    utilisateurId: string,
    nomFichier: string,
  ) {
    const session = await this.prisma.importCatalogue.create({
      data: { entrepriseId, utilisateurId, nomFichier: nomFichier.trim() },
      select: { id: true, statut: true, nomFichier: true },
    });
    return session;
  }

  /**
   * Reçoit un lot de lignes (au plus 200 par requête : la limite de 1 Mo
   * du corps des requêtes reste inchangée). Un lot renvoyé après une
   * coupure réseau ne double rien : les numéros déjà reçus sont ignorés.
   */
  async ajouterLignes(
    entrepriseId: string,
    importId: string,
    dto: LotLignesDto,
  ) {
    const session = await this.trouver(entrepriseId, importId);
    if (session.statut !== 'EN_COURS' && session.statut !== 'VERIFIE') {
      throw new ConflictException(
        'Cet import est terminé : il ne reçoit plus de lignes.',
      );
    }
    const recues = await this.prisma.importLigne.count({ where: { importId } });
    if (recues + dto.lignes.length > LIGNES_MAX) {
      throw new BadRequestException(
        `Un import compte au plus ${LIGNES_MAX} lignes.`,
      );
    }
    await this.prisma.importLigne.createMany({
      data: dto.lignes.map((l) => ({
        importId,
        numero: l.numero,
        donnees: { ...l.valeurs },
      })),
      skipDuplicates: true,
    });
    const lignesTotal = await this.prisma.importLigne.count({
      where: { importId },
    });
    await this.prisma.importCatalogue.update({
      where: { id: importId },
      data: { lignesTotal, statut: 'EN_COURS' },
    });
    return { lignesTotal };
  }

  /** Valide l'ensemble des lignes reçues, sans rien écrire au catalogue. */
  async verifier(
    entrepriseId: string,
    importId: string,
    options: OptionsImportDto,
  ) {
    const session = await this.trouver(entrepriseId, importId);
    this.exigerModifiable(session.statut);
    const analyse = await this.analyser(entrepriseId, importId, options);
    await this.prisma.importCatalogue.update({
      where: { id: importId },
      data: { statut: 'VERIFIE' },
    });
    return this.rapport(importId, analyse);
  }

  /**
   * Écrit l'import en base, en UNE transaction : produits, catégories et
   * marques créées, mouvements d'entrée des quantités initiales. Une
   * erreur à n'importe quelle ligne annule tout.
   */
  async executer(
    entrepriseId: string,
    utilisateurId: string,
    importId: string,
    options: OptionsImportDto,
  ) {
    const session = await this.trouver(entrepriseId, importId);
    this.exigerModifiable(session.statut);
    const analyse = await this.analyser(entrepriseId, importId, options);
    if (analyse.erreursGlobales.length > 0) {
      throw new BadRequestException(analyse.erreursGlobales.join(' '));
    }
    const bloquees = analyse.lignes.filter((l) => l.action === 'BLOQUEE');
    if (bloquees.length > 0 && !options.ignorerBloquees) {
      throw new ConflictException(
        `${bloquees.length} ligne${bloquees.length > 1 ? 's sont bloquées' : ' est bloquée'} : corrigez le fichier ou choisissez de les ignorer.`,
      );
    }

    const debut = Date.now();
    const resultat = await this.prisma.$transaction(
      (tx) =>
        this.ecrire(
          tx,
          entrepriseId,
          utilisateurId,
          importId,
          analyse,
          options,
        ),
      // 400 produits avec leurs entrées tiennent en quelques secondes ;
      // la marge couvre les 5 000 lignes autorisées.
      { timeout: 120_000, maxWait: 10_000 },
    );
    return { ...resultat, dureeMs: Date.now() - debut };
  }

  /**
   * Annule un import des dernières 24 h : ses produits sont archivés (jamais
   * supprimés) et leur stock initial est retiré par des mouvements
   * d'ajustement. Refusé si l'un d'eux a connu un autre mouvement depuis.
   */
  async annuler(entrepriseId: string, utilisateurId: string, importId: string) {
    const session = await this.trouver(entrepriseId, importId);
    if (session.statut === 'ANNULE')
      throw new ConflictException('Cet import est déjà annulé.');
    if (session.statut !== 'EXECUTE' || !session.executeAt) {
      throw new ConflictException(
        'Cet import n’a pas été exécuté : rien à annuler.',
      );
    }
    if (Date.now() - session.executeAt.getTime() > DELAI_ANNULATION_MS) {
      throw new ConflictException(
        'Un import ne peut être annulé que dans les 24 heures qui suivent.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM import_catalogue WHERE id = ${importId} FOR UPDATE`;
        const actuel = await tx.importCatalogue.findUniqueOrThrow({
          where: { id: importId },
        });
        if (actuel.statut !== 'EXECUTE')
          throw new ConflictException('Cet import est déjà annulé.');

        const produits = await tx.produit.findMany({
          where: { importId, entrepriseId },
          select: { id: true, nom: true },
        });
        const ids = produits.map((p) => p.id);
        for (const id of ids) await this.mouvements.verrouillerProduit(tx, id);

        const mouvementsImport = await tx.importLigne.findMany({
          where: { importId, mouvementId: { not: null } },
          select: { mouvementId: true },
        });
        const autre = await tx.mouvement.findFirst({
          where: {
            produitId: { in: ids },
            id: { notIn: mouvementsImport.map((m) => m.mouvementId!) },
          },
          select: { produit: { select: { nom: true } }, type: true },
        });
        if (autre) {
          throw new ConflictException(
            `« ${autre.produit.nom} » a déjà servi depuis l’import (mouvement de stock) : l’import ne peut plus être annulé. Archivez les produits concernés un par un si nécessaire.`,
          );
        }

        // Stock initial retiré par ajustement (traçable), lot par lot.
        const lots = await tx.lot.findMany({
          where: { produitId: { in: ids }, quantite: { gt: 0 } },
        });
        for (const lot of lots) {
          await tx.lot.update({ where: { id: lot.id }, data: { quantite: 0 } });
          await tx.mouvement.create({
            data: {
              entrepriseId,
              produitId: lot.produitId,
              emplacementId: lot.emplacementId,
              type: 'AJUSTEMENT',
              quantite: -lot.quantite,
              utilisateurId,
              lotId: lot.id,
            },
          });
        }
        const stocks = await tx.stock.findMany({
          where: { produitId: { in: ids }, quantite: { not: 0 } },
        });
        for (const stock of stocks) {
          const dejaRetire = lots
            .filter(
              (l) =>
                l.produitId === stock.produitId &&
                l.emplacementId === stock.emplacementId,
            )
            .reduce((somme, l) => somme + l.quantite, 0);
          const reste = stock.quantite - dejaRetire;
          if (reste !== 0) {
            await tx.mouvement.create({
              data: {
                entrepriseId,
                produitId: stock.produitId,
                emplacementId: stock.emplacementId,
                type: 'AJUSTEMENT',
                quantite: -reste,
                utilisateurId,
              },
            });
          }
          await tx.stock.update({
            where: {
              produitId_emplacementId: {
                produitId: stock.produitId,
                emplacementId: stock.emplacementId,
              },
            },
            data: { quantite: 0 },
          });
        }

        await tx.produit.updateMany({
          where: { id: { in: ids } },
          data: { archive: true },
        });
        await tx.alerte.updateMany({
          where: { produitId: { in: ids }, statut: 'ACTIVE' },
          data: { statut: 'RESOLUE', resolvedAt: new Date() },
        });
        await tx.importCatalogue.update({
          where: { id: importId },
          data: { statut: 'ANNULE', annuleAt: new Date() },
        });
        return { produitsArchives: ids.length };
      },
      { timeout: 60_000 },
    );
  }

  /** Modèle CSV (séparateur « ; » et BOM : s'ouvre tel quel dans Excel en français). */
  async modele(entrepriseId: string, type: string) {
    const entetes = ligneCsv(
      CHAMPS_IMPORT.map((c) => ENTETES_MODELE[c]),
      ';',
    );
    if (type === 'vierge')
      return {
        nom: 'modele-import-stockflow.csv',
        contenu: BOM_UTF8 + entetes,
      };
    if (type === 'exemples') {
      const lignes = EXEMPLES.map((e) =>
        ligneCsv(
          CHAMPS_IMPORT.map((c) => e[c] ?? ''),
          ';',
        ),
      );
      return {
        nom: 'modele-import-exemples.csv',
        contenu: BOM_UTF8 + entetes + lignes.join(''),
      };
    }
    if (type === 'existant') {
      // Sans quantité : réimporter le fichier corrige les fiches, il
      // n'ajoute jamais de stock.
      const produits = await this.prisma.produit.findMany({
        where: { entrepriseId, archive: false },
        include: {
          categorie: { select: { nom: true } },
          marque: { select: { nom: true } },
        },
        orderBy: { nom: 'asc' },
      });
      const lignes = produits.map((p) => {
        const valeurs: Partial<Record<ChampImport, string | number>> = {
          nom: p.nom,
          reference: p.reference ?? '',
          codeBarre: p.codeBarre ?? '',
          categorie: p.categorie?.nom ?? '',
          marque: p.marque?.nom ?? '',
          uniteMesure: p.uniteMesure ?? '',
          prixAchat: p.prixAchat ?? '',
          prixVente: p.prixVente ?? '',
          prixDemiGros: p.prixDemiGros ?? '',
          prixGros: p.prixGros ?? '',
          tauxTva: p.tauxTva ?? '',
          seuilAlerte: p.seuilAlerte,
          description: p.description ?? '',
        };
        return ligneCsv(
          CHAMPS_IMPORT.map((c) => valeurs[c] ?? ''),
          ';',
        );
      });
      return {
        nom: 'catalogue-stockflow.csv',
        contenu: BOM_UTF8 + entetes + lignes.join(''),
      };
    }
    throw new BadRequestException(
      'Type de modèle inconnu : vierge, exemples ou existant.',
    );
  }

  // ─── Analyse ────────────────────────────────────────────────────────

  private async analyser(
    entrepriseId: string,
    importId: string,
    options: OptionsImportDto,
  ) {
    const brutes = await this.prisma.importLigne.findMany({
      where: { importId },
      orderBy: { numero: 'asc' },
      select: { id: true, numero: true, donnees: true },
    });
    if (brutes.length === 0)
      throw new BadRequestException('Aucune ligne reçue pour cet import.');

    const lignes: LigneAnalysee[] = [];
    for (const brute of brutes) {
      const ligne = this.lireLigne(
        brute.id,
        brute.numero,
        brute.donnees as Record<string, string>,
      );
      if (ligne) lignes.push(ligne);
    }

    this.marquerDoublons(lignes, options.conserver ?? []);
    await this.rapprocherProduits(entrepriseId, lignes);
    const categories = await this.resoudreReferentiel(
      entrepriseId,
      lignes,
      'categorie',
      options.categories ?? {},
    );
    const marques = await this.resoudreReferentiel(
      entrepriseId,
      lignes,
      'marque',
      options.marques ?? {},
    );

    for (const ligne of lignes) {
      if (ligne.problemes.some((p) => p.gravite === 'BLOQUANT'))
        ligne.action = 'BLOQUEE';
    }

    const erreursGlobales: string[] = [];
    const aCreer = lignes.filter((l) => l.action === 'CREER');
    const avecQuantite = aCreer.some((l) => (l.valeurs.quantite ?? 0) > 0);
    if (avecQuantite) {
      if (!options.emplacementId) {
        erreursGlobales.push(
          'Choisissez l’emplacement qui reçoit les quantités initiales.',
        );
      } else {
        const emplacement = await this.prisma.emplacement.findUnique({
          where: { id: options.emplacementId },
        });
        if (
          !emplacement ||
          emplacement.entrepriseId !== entrepriseId ||
          emplacement.archive
        ) {
          erreursGlobales.push(
            'Emplacement des quantités initiales introuvable ou archivé.',
          );
        }
      }
    }
    const limite = await this.placeRestante(entrepriseId);
    if (limite !== null && aCreer.length > limite.restant) {
      erreursGlobales.push(
        `Votre formule autorise ${limite.limite} références : l’import en créerait ${aCreer.length}, il en reste ${limite.restant} disponibles.`,
      );
    }

    return { lignes, categories, marques, erreursGlobales, avecQuantite };
  }

  /** Interprète une ligne brute ; null pour une ligne entièrement vide (ignorée sans bruit). */
  private lireLigne(
    id: string,
    numero: number,
    donnees: Record<string, string>,
  ): LigneAnalysee | null {
    if (CHAMPS_IMPORT.every((c) => lireTexte(donnees[c]) === null)) return null;
    const problemes: Probleme[] = [];
    const texte = (champ: ChampImport) => {
      const valeur = lireTexte(donnees[champ]);
      const max = LONGUEURS_MAX[champ];
      if (valeur !== null && max && valeur.length > max) {
        problemes.push({
          gravite: 'BLOQUANT',
          champ,
          message: `${ENTETES_MODELE[champ]} trop long (${valeur.length} caractères) — ${max} au maximum`,
        });
      }
      return valeur;
    };
    const valeurs = {
      nom: texte('nom'),
      reference: texte('reference'),
      codeBarre: texte('codeBarre'),
      categorie: texte('categorie'),
      marque: texte('marque'),
      uniteMesure: texte('uniteMesure'),
      description: texte('description'),
      numeroLot: texte('numeroLot'),
    } as Valeurs;

    for (const champ of CHAMPS_ENTIERS) {
      const lu = lireEntier(donnees[champ]);
      if (lu === 'illisible') {
        problemes.push({
          gravite: 'BLOQUANT',
          champ,
          message: `${ENTETES_MODELE[champ]} : valeur trouvée « ${lireTexte(donnees[champ])} » — attendu un nombre`,
        });
        valeurs[champ] = null;
      } else {
        valeurs[champ] = lu;
      }
    }
    if (valeurs.tauxTva !== null && valeurs.tauxTva > 100) {
      problemes.push({
        gravite: 'BLOQUANT',
        champ: 'tauxTva',
        message: `TVA de ${valeurs.tauxTva} % — attendu entre 0 et 100`,
      });
    }

    const date = lireDate(donnees.datePeremption);
    valeurs.datePeremption = null;
    if (date === 'illisible') {
      problemes.push({
        gravite: 'BLOQUANT',
        champ: 'datePeremption',
        message: `Valeur trouvée : ${lireTexte(donnees.datePeremption)} — attendu jj/mm/aaaa`,
      });
    } else if (date) {
      valeurs.datePeremption = date.iso;
      if (date.ambigue) {
        const [a, m, j] = date.iso.split('-').map(Number);
        const lue = new Date(Date.UTC(a, m - 1, j)).toLocaleDateString(
          'fr-FR',
          {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          },
        );
        problemes.push({
          gravite: 'A_VERIFIER',
          champ: 'datePeremption',
          message: `${lireTexte(donnees.datePeremption)} lue comme le ${lue} (format français) — vérifiez`,
        });
      }
    }

    if (valeurs.nom === null) {
      problemes.push({
        gravite: 'BLOQUANT',
        champ: 'nom',
        message:
          'Le nom est la seule colonne obligatoire — cette ligne sera ignorée',
      });
    }
    if (
      valeurs.prixAchat !== null &&
      valeurs.prixVente !== null &&
      valeurs.prixAchat > valeurs.prixVente
    ) {
      problemes.push({
        gravite: 'A_VERIFIER',
        champ: 'prixVente',
        message: `Achat ${montant(valeurs.prixAchat)} · Détail ${montant(valeurs.prixVente)} — vous vendriez à perte`,
      });
    }
    if (valeurs.numeroLot && !valeurs.datePeremption && date !== 'illisible') {
      problemes.push({
        gravite: 'A_VERIFIER',
        champ: 'numeroLot',
        message: 'Numéro de lot sans date de péremption — il sera ignoré',
      });
    }

    return {
      id,
      numero,
      action: 'CREER',
      produitExistant: null,
      valeurs,
      problemes,
    };
  }

  /**
   * Doublons à l'intérieur du fichier (référence, puis code-barre) : une
   * seule ligne est conservée — la première, ou celle choisie par
   * l'utilisateur — les autres sont bloquées.
   */
  private marquerDoublons(lignes: LigneAnalysee[], conserver: number[]) {
    const choisies = new Set(conserver);
    const exclues = new Set<number>();
    for (const champ of ['reference', 'codeBarre'] as const) {
      const groupes = new Map<string, LigneAnalysee[]>();
      for (const ligne of lignes) {
        const valeur = ligne.valeurs[champ];
        if (
          valeur === null ||
          ligne.valeurs.nom === null ||
          exclues.has(ligne.numero)
        )
          continue;
        const cle =
          champ === 'reference' ? valeur.toLocaleLowerCase('fr') : valeur;
        groupes.set(cle, [...(groupes.get(cle) ?? []), ligne]);
      }
      for (const groupe of groupes.values()) {
        if (groupe.length < 2) continue;
        const conservee =
          groupe.find((l) => choisies.has(l.numero)) ?? groupe[0];
        const numeros = groupe.map((l) => l.numero);
        const valeur = conservee.valeurs[champ]!;
        for (const ligne of groupe) {
          const doublon = {
            valeur,
            lignes: numeros,
            conservee: conservee.numero,
          };
          if (ligne === conservee) {
            const autres = numeros.filter((n) => n !== ligne.numero);
            ligne.problemes.push({
              gravite: 'A_VERIFIER',
              champ,
              doublon,
              message: `${valeur} apparaît aussi ligne${autres.length > 1 ? 's' : ''} ${autres.join(', ')} — c’est cette ligne qui sera conservée`,
            });
          } else {
            exclues.add(ligne.numero);
            ligne.problemes.push({
              gravite: 'BLOQUANT',
              champ,
              doublon,
              message: `${valeur} apparaît aussi ligne ${conservee.numero} — une seule sera conservée`,
            });
          }
        }
      }
    }
  }

  /** Produit existant (référence, puis code-barre) : mise à jour au lieu d'une création. */
  private async rapprocherProduits(
    entrepriseId: string,
    lignes: LigneAnalysee[],
  ) {
    const produits = await this.prisma.produit.findMany({
      where: { entrepriseId },
      select: {
        id: true,
        nom: true,
        reference: true,
        codeBarre: true,
        archive: true,
      },
    });
    const parReference = new Map<string, typeof produits>();
    const parCode = new Map<string, (typeof produits)[number]>();
    const parNom = new Map<string, (typeof produits)[number]>();
    for (const p of produits) {
      if (!p.archive) parNom.set(cleNom(p.nom), p);
      if (p.reference) {
        const cle = p.reference.trim().toLocaleLowerCase('fr');
        parReference.set(cle, [...(parReference.get(cle) ?? []), p]);
      }
      if (p.codeBarre) parCode.set(p.codeBarre, p);
    }

    for (const ligne of lignes) {
      const { reference, codeBarre } = ligne.valeurs;
      const parRef = reference
        ? (parReference.get(reference.toLocaleLowerCase('fr')) ?? [])
        : [];
      const parCb = codeBarre ? parCode.get(codeBarre) : undefined;
      if (parRef.length > 1) {
        ligne.problemes.push({
          gravite: 'BLOQUANT',
          champ: 'reference',
          message: `${reference} est portée par ${parRef.length} produits existants — impossible de savoir lequel mettre à jour`,
        });
        continue;
      }
      if (parRef[0] && parCb && parRef[0].id !== parCb.id) {
        ligne.problemes.push({
          gravite: 'BLOQUANT',
          champ: 'codeBarre',
          message: `Référence ${reference} (« ${parRef[0].nom} ») et code-barre ${codeBarre} (« ${parCb.nom} ») désignent deux produits différents`,
        });
        continue;
      }
      const existant = parRef[0] ?? parCb;
      if (!existant) {
        // Rapprochement par référence et code-barre seulement : un homonyme
        // saisi à la main sans référence donnerait un second produit.
        const homonyme = ligne.valeurs.nom
          ? parNom.get(cleNom(ligne.valeurs.nom))
          : undefined;
        if (homonyme) {
          ligne.problemes.push({
            gravite: 'A_VERIFIER',
            champ: 'nom',
            message: `« ${homonyme.nom} » existe déjà au catalogue sans référence ni code-barre commun — un second produit sera créé`,
          });
        }
        continue;
      }
      if (existant.archive) {
        ligne.problemes.push({
          gravite: 'BLOQUANT',
          message: `Correspond à « ${existant.nom} », archivé — désarchivez-le pour le mettre à jour`,
        });
        continue;
      }
      ligne.action = 'METTRE_A_JOUR';
      ligne.produitExistant = { id: existant.id, nom: existant.nom };
      if ((ligne.valeurs.quantite ?? 0) > 0) {
        ligne.problemes.push({
          gravite: 'A_VERIFIER',
          champ: 'quantite',
          message: `Produit existant « ${existant.nom} » : la quantité ${ligne.valeurs.quantite} ne sera pas ajoutée — passez par une entrée de stock`,
        });
      }
      if (ligne.valeurs.datePeremption) {
        ligne.problemes.push({
          gravite: 'A_VERIFIER',
          champ: 'datePeremption',
          message: `Produit existant « ${existant.nom} » : la date de péremption ne s’applique qu’à une réception de lot`,
        });
      }
    }
  }

  /**
   * Catégories (ou marques) du fichier : rattachées à l'existante de même
   * nom (casse et accents ignorés), à celle choisie par l'utilisateur, ou
   * créées à l'exécution — annoncé ligne par ligne.
   */
  private async resoudreReferentiel(
    entrepriseId: string,
    lignes: LigneAnalysee[],
    champ: 'categorie' | 'marque',
    choix: Record<string, string>,
  ) {
    const existants =
      champ === 'categorie'
        ? await this.prisma.categorie.findMany({
            where: { entrepriseId },
            select: { id: true, nom: true },
          })
        : await this.prisma.marque.findMany({
            where: { entrepriseId },
            select: { id: true, nom: true },
          });
    const parCle = new Map(existants.map((e) => [cleNom(e.nom), e.id]));
    const ids = new Set(existants.map((e) => e.id));
    for (const id of Object.values(choix)) {
      if (typeof id !== 'string' || !ids.has(id)) {
        throw new BadRequestException(
          `${champ === 'categorie' ? 'Catégorie' : 'Marque'} choisie introuvable.`,
        );
      }
    }
    const choixParCle = new Map(
      Object.entries(choix).map(([nom, id]) => [cleNom(nom), id]),
    );

    /** clé du nom → id existant, ou null = à créer (avec le nom tel qu'écrit la première fois). */
    const resolution = new Map<
      string,
      { id: string | null; nom: string; lignes: number }
    >();
    for (const ligne of lignes) {
      const nom = ligne.valeurs[champ];
      if (!nom) continue;
      const cle = cleNom(nom);
      const connue = resolution.get(cle);
      if (connue) {
        // Annoncée une seule fois, sur sa première ligne : le panneau des
        // catégories inconnues récapitule le reste.
        connue.lignes++;
        continue;
      }
      const id = choixParCle.get(cle) ?? parCle.get(cle) ?? null;
      resolution.set(cle, { id, nom, lignes: 1 });
      if (id === null) {
        ligne.problemes.push({
          gravite: 'A_VERIFIER',
          champ,
          message: `${champ === 'categorie' ? 'Catégorie' : 'Marque'} « ${nom} » inconnue — elle sera créée automatiquement, ou associez-la à une existante`,
        });
      }
    }
    return resolution;
  }

  private async placeRestante(entrepriseId: string) {
    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { limiteReferences: true },
    });
    if (entreprise.limiteReferences === null) return null;
    const { references } = await this.limites.usage(entrepriseId);
    return {
      limite: entreprise.limiteReferences,
      restant: Math.max(0, entreprise.limiteReferences - references),
    };
  }

  private rapport(
    importId: string,
    analyse: Awaited<ReturnType<ImportService['analyser']>>,
  ) {
    const { lignes } = analyse;
    const nonBloquees = lignes.filter((l) => l.action !== 'BLOQUEE');
    const inconnus = (resolution: typeof analyse.categories) =>
      [...resolution.values()]
        .filter((r) => r.id === null)
        .map((r) => ({ nom: r.nom, lignes: r.lignes }));
    return {
      id: importId,
      lignesAnalysees: lignes.length,
      compteurs: {
        aCreer: lignes.filter((l) => l.action === 'CREER').length,
        aMettreAJour: lignes.filter((l) => l.action === 'METTRE_A_JOUR').length,
        aCorriger: nonBloquees.filter((l) => l.problemes.length > 0).length,
        bloquees: lignes.length - nonBloquees.length,
      },
      avecQuantite: analyse.avecQuantite,
      suiviParLot: lignes.filter(
        (l) => l.action === 'CREER' && l.valeurs.datePeremption,
      ).length,
      erreursGlobales: analyse.erreursGlobales,
      categoriesInconnues: inconnus(analyse.categories),
      marquesInconnues: inconnus(analyse.marques),
      problemes: lignes
        .filter((l) => l.problemes.length > 0)
        .map((l) => ({
          numero: l.numero,
          nom: l.valeurs.nom,
          action: l.action,
          produitExistant: l.produitExistant,
          problemes: l.problemes,
        })),
    };
  }

  // ─── Écriture ───────────────────────────────────────────────────────

  private async ecrire(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    importId: string,
    analyse: Awaited<ReturnType<ImportService['analyser']>>,
    options: OptionsImportDto,
  ) {
    // Verrou de la session : deux exécutions simultanées sont impossibles.
    await tx.$queryRaw`SELECT 1 FROM import_catalogue WHERE id = ${importId} FOR UPDATE`;
    const session = await tx.importCatalogue.findUniqueOrThrow({
      where: { id: importId },
    });
    this.exigerModifiable(session.statut);

    const idsCategories = await this.creerReferentiel(
      tx,
      entrepriseId,
      'categorie',
      analyse.categories,
    );
    const idsMarques = await this.creerReferentiel(
      tx,
      entrepriseId,
      'marque',
      analyse.marques,
    );
    const idDe = (ids: Map<string, string>, nom: string | null) =>
      nom ? ids.get(cleNom(nom)) : undefined;

    const entreprise = await tx.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { tauxTvaParDefaut: true },
    });
    const aCreer = analyse.lignes.filter((l) => l.action === 'CREER');
    const aMettreAJour = analyse.lignes.filter(
      (l) => l.action === 'METTRE_A_JOUR',
    );
    const produitDe = new Map<string, string>();
    const mouvementDe = new Map<string, string>();

    // Une seule requête pour tous les produits créés.
    const nouveaux = aCreer.map((l) => {
      const v = l.valeurs;
      const id = randomUUID();
      produitDe.set(l.id, id);
      return {
        id,
        entrepriseId,
        importId,
        nom: v.nom!,
        reference: v.reference,
        codeBarre: v.codeBarre,
        categorieId: idDe(idsCategories, v.categorie),
        marqueId: idDe(idsMarques, v.marque),
        uniteMesure: v.uniteMesure,
        description: v.description,
        prixAchat: v.prixAchat,
        prixVente: v.prixVente,
        prixDemiGros: v.prixDemiGros,
        prixGros: v.prixGros,
        tauxTva: v.tauxTva ?? entreprise.tauxTvaParDefaut,
        seuilAlerte: v.seuilAlerte ?? 0,
        suiviParLot: v.datePeremption !== null,
      };
    });
    try {
      if (nouveaux.length > 0) await tx.produit.createMany({ data: nouveaux });
    } catch (erreur) {
      if ((erreur as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'Un code-barre du fichier vient d’être attribué à un autre produit : relancez la vérification.',
        );
      }
      throw erreur;
    }

    // Quantités initiales : une entrée de stock par produit, via le même
    // service que toute entrée (traçabilité, lots, alertes).
    const dateImport = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (const ligne of aCreer) {
      const v = ligne.valeurs;
      if (!v.quantite) continue;
      const mouvement = await this.mouvements.entreeDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        {
          produitId: produitDe.get(ligne.id)!,
          emplacementId: options.emplacementId!,
          quantite: v.quantite,
          ...(v.datePeremption
            ? {
                numeroLot: v.numeroLot ?? `IMPORT-${dateImport}`,
                datePeremption: v.datePeremption,
              }
            : {}),
        },
      );
      mouvementDe.set(ligne.id, mouvement.id);
    }

    // Mises à jour : seules les cellules renseignées remplacent la fiche.
    for (const ligne of aMettreAJour) {
      const v = ligne.valeurs;
      const data: Record<string, unknown> = {};
      for (const champ of [
        'nom',
        'reference',
        'codeBarre',
        'uniteMesure',
        'description',
        'prixAchat',
        'prixVente',
        'prixDemiGros',
        'prixGros',
        'tauxTva',
        'seuilAlerte',
      ] as const) {
        if (v[champ] !== null) data[champ] = v[champ];
      }
      const categorieId = idDe(idsCategories, v.categorie);
      const marqueId = idDe(idsMarques, v.marque);
      if (categorieId) data.categorieId = categorieId;
      if (marqueId) data.marqueId = marqueId;
      produitDe.set(ligne.id, ligne.produitExistant!.id);
      if (Object.keys(data).length > 0) {
        await tx.produit.update({
          where: { id: ligne.produitExistant!.id },
          data,
        });
      }
    }

    // Journal de l'import, en une requête.
    const ids = [...produitDe.keys()];
    if (ids.length > 0) {
      await tx.$executeRaw`
        UPDATE import_ligne AS l SET produit_id = v.produit_id, mouvement_id = v.mouvement_id
        FROM unnest(${ids}::text[], ${ids.map((id) => produitDe.get(id)!)}::text[], ${ids.map((id) => mouvementDe.get(id) ?? null)}::text[])
          AS v(id, produit_id, mouvement_id)
        WHERE l.id = v.id`;
    }

    const bilan = {
      lignesCreees: aCreer.length,
      lignesMisesAJour: aMettreAJour.length,
      lignesIgnorees:
        analyse.lignes.length - aCreer.length - aMettreAJour.length,
    };
    await tx.importCatalogue.update({
      where: { id: importId },
      data: { ...bilan, statut: 'EXECUTE', executeAt: new Date() },
    });
    return {
      id: importId,
      ...bilan,
      mouvementsCrees: mouvementDe.size,
      categoriesCreees: [...analyse.categories.values()]
        .filter((c) => c.id === null)
        .map((c) => c.nom),
      marquesCreees: [...analyse.marques.values()]
        .filter((m) => m.id === null)
        .map((m) => m.nom),
      suiviParLot: nouveaux.filter((p) => p.suiviParLot).length,
    };
  }

  /** Crée les catégories ou marques inconnues ; renvoie clé du nom → id. */
  private async creerReferentiel(
    tx: TransactionPrisma,
    entrepriseId: string,
    champ: 'categorie' | 'marque',
    resolution: Map<string, { id: string | null; nom: string }>,
  ) {
    const ids = new Map<string, string>();
    for (const [cle, { id, nom }] of resolution) {
      if (id) {
        ids.set(cle, id);
        continue;
      }
      const cree =
        champ === 'categorie'
          ? await tx.categorie.create({ data: { entrepriseId, nom } })
          : await tx.marque.create({ data: { entrepriseId, nom } });
      ids.set(cle, cree.id);
    }
    return ids;
  }

  private exigerModifiable(statut: string) {
    if (statut === 'EXECUTE')
      throw new ConflictException('Cet import a déjà été exécuté.');
    if (statut === 'ANNULE')
      throw new ConflictException('Cet import a été annulé.');
  }

  private async trouver(entrepriseId: string, importId: string) {
    const session = await this.prisma.importCatalogue.findUnique({
      where: { id: importId },
    });
    if (!session || session.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Import introuvable.');
    }
    return session;
  }
}
