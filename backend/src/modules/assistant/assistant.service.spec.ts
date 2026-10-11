import { describe, expect, it } from 'vitest';
import { AssistantService } from './assistant.service.js';
import { FournisseurSimule } from './assistant-test.utils.js';
import { ErreurOutil, type OutilsAssistantService } from './outils-assistant.js';
import type { QuotaAssistant } from './quota-assistant.js';
import type { PrismaService } from '../../config/prisma.service.js';

describe('AssistantService — erreurs des outils', () => {
  function service(executer: OutilsAssistantService['executer']) {
    const fournisseur = new FournisseurSimule();
    fournisseur.script = [{ outils: [{ nom: 'produits_sous_seuil', arguments: {} }] }, { reponse: 'Désolé.' }];
    const prisma = { entreprise: { findUniqueOrThrow: async () => ({ moduleLots: false }) } } as unknown as PrismaService;
    const quota = { consommer: async () => undefined } as unknown as QuotaAssistant;
    const assistant = new AssistantService(fournisseur, { executer } as OutilsAssistantService, quota, prisma);
    const contexte = { entrepriseId: 'e1', utilisateurId: 'u1', role: 'GESTIONNAIRE' as const };
    return { fournisseur, discuter: () => assistant.discuter(contexte, { messages: [{ role: 'user', contenu: 'Alertes ?' }] }) };
  }

  it('panne inattendue (base indisponible) : détail jamais transmis au modèle, la question aboutit', async () => {
    const { fournisseur, discuter } = service(async () => {
      throw new Error('P1001: Can’t reach database server at db.interne:5432');
    });

    expect(await discuter()).toEqual({ reponse: 'Désolé.', sources: [] });
    expect(fournisseur.resultatsDecodes()).toEqual([{ erreur: 'Erreur interne : données momentanément indisponibles.' }]);
  });

  it('erreur métier : message explicite renvoyé au modèle', async () => {
    const { fournisseur, discuter } = service(async () => {
      throw new ErreurOutil('Produit introuvable.');
    });
    await discuter();
    expect(fournisseur.resultatsDecodes()).toEqual([{ erreur: 'Produit introuvable.' }]);
  });
});
