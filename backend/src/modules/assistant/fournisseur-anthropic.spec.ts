import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { FournisseurAnthropic, MODELE_PAR_DEFAUT, motifErreur, type ClientMessages } from './fournisseur-anthropic.js';
import { ErreurFournisseurIA } from './fournisseur-ia.js';
import { OUTILS, outilsDisponibles } from './outils-assistant.js';

/** Réponse minimale de l'API Messages. */
const message = (content: unknown[], stop_reason: string) =>
  ({ content, stop_reason, usage: { input_tokens: 1200, output_tokens: 80 } }) as unknown as Anthropic.Beta.BetaMessage;

function fournisseur(reponses: Anthropic.Beta.BetaMessage[] | Error) {
  // Copie de chaque requête : le fournisseur complète ensuite le même historique.
  const requetes: Record<string, unknown>[] = [];
  const create = vi.fn(async (requete: Record<string, unknown>) => {
    requetes.push(structuredClone(requete));
    if (reponses instanceof Error) throw reponses;
    return reponses.shift()!;
  });
  const instance = new FournisseurAnthropic({ client: { create } as unknown as ClientMessages });
  const session = instance.demarrer({
    systeme: 'Consignes',
    contexte: 'Date du jour : 2026-10-13',
    outils: outilsDisponibles({ lots: true }),
    historique: [{ role: 'user', contenu: 'Stock du riz ?' }],
  });
  return { requetes, session };
}

describe('FournisseurAnthropic (client simulé, sans réseau)', () => {
  it('sans clé : indisponible', () => {
    expect(new FournisseurAnthropic({}).disponible).toBe(false);
    expect(new FournisseurAnthropic({ cle: 'sk-test' }).disponible).toBe(true);
  });

  it('requête : modèle, outils stricts, repli serveur, consignes mises en cache', async () => {
    const { requetes, session } = fournisseur([message([{ type: 'text', text: 'Bonjour' }], 'end_turn')]);

    expect(await session.tour()).toEqual({ fin: 'reponse', texte: 'Bonjour', appels: [], jetons: { entree: 1200, sortie: 80 } });
    const requete = requetes[0];
    expect(requete).toMatchObject({
      model: MODELE_PAR_DEFAUT,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: 'Consignes', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Date du jour : 2026-10-13' },
      ],
      messages: [{ role: 'user', content: 'Stock du riz ?' }],
    });
    const outils = requete.tools as Anthropic.Beta.BetaTool[];
    expect(outils.map((o) => o.name)).toEqual(Object.keys(OUTILS));
    for (const outil of outils) {
      expect(outil.strict).toBe(true);
      expect(outil.input_schema).toMatchObject({ type: 'object', additionalProperties: false });
      // Aucun schéma n'expose l'entreprise : elle vient du contexte authentifié.
      expect(JSON.stringify(outil.input_schema)).not.toMatch(/entreprise/i);
    }
  });

  it('boucle d’outils : appels transmis, historique complet (réflexion comprise) renvoyé à l’API', async () => {
    const reflexion = { type: 'thinking', thinking: '', signature: 'sig' };
    const appel = { type: 'tool_use', id: 'toolu_1', name: 'rechercher_produits', input: { texte: 'riz' } };
    const { requetes, session } = fournisseur([
      message([reflexion, appel], 'tool_use'),
      message([{ type: 'text', text: '42 sacs.' }], 'end_turn'),
    ]);

    expect(await session.tour()).toMatchObject({ fin: 'outils', appels: [{ id: 'toolu_1', nom: 'rechercher_produits', arguments: { texte: 'riz' } }] });
    expect(await session.tour([{ appelId: 'toolu_1', contenu: '{"produits":[]}', erreur: false }])).toMatchObject({ fin: 'reponse', texte: '42 sacs.' });

    const messages = requetes[1].messages as Anthropic.Beta.BetaMessageParam[];
    expect(messages.slice(1)).toEqual([
      { role: 'assistant', content: [reflexion, appel] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"produits":[]}', is_error: false }] },
    ]);
  });

  it('fins de tour : refus, réponse coupée, demande d’outil sans appel', async () => {
    const { session } = fournisseur([
      message([], 'refusal'),
      message([{ type: 'text', text: 'Début' }], 'max_tokens'),
      message([{ type: 'text', text: '…' }], 'tool_use'),
    ]);
    expect((await session.tour()).fin).toBe('refus');
    expect((await session.tour()).fin).toBe('tronque');
    expect((await session.tour()).fin).toBe('tronque');
  });

  it('panne : erreur du fournisseur traduite en motif court', async () => {
    const { session } = fournisseur(new Anthropic.APIConnectionError({ message: 'socket hang up' }));
    await expect(session.tour()).rejects.toThrow(ErreurFournisseurIA);
    await expect(session.tour()).rejects.toMatchObject({ motif: 'reseau' });

    expect(motifErreur(new Anthropic.APIConnectionTimeoutError())).toBe('delai_depasse');
    expect(motifErreur(new Error('autre'))).toBe('inconnu');
  });
});
