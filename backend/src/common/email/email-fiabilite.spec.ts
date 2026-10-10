import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendEmailService, masquerAdresse } from './resend-email.service.js';
import { EnvoiEnArrierePlan } from './envoi-arriere-plan.js';
import { optionsSentry } from '../../config/surveillance.js';
import { EMAIL_SERVICE, type EmailMessage, type EmailService } from './email.service.js';
import { EmailModule } from './email.module.js';
import { DevEmailService } from './dev-email.service.js';

const MESSAGE: EmailMessage = { to: 'aissatou.diallo@exemple.gn', subject: 'Invitation', body: 'Jeton : SECRET-JETON' };
type Reponse = { data: unknown; error: { name: string; message: string; statusCode: number | null } | null };
const ok: Reponse = { data: { id: 'e1' }, error: null };
const erreur = (statusCode: number | null, name = 'application_error'): Reponse => ({ data: null, error: { name, message: 'échec', statusCode } });

function client(...reponses: Reponse[]) {
  const send = vi.fn(async () => reponses.shift() ?? ok);
  return { send, transport: new ResendEmailService({ emails: { send } } as never, [0, 0]) };
}

describe('Envoi par Resend : délai, nouvelles tentatives, signalement', () => {
  const evenements: ErrorEvent[] = [];
  beforeAll(() => {
    // Configuration réelle de production (collecte minimale), envoi intercepté.
    const options = optionsSentry({ SENTRY_DSN: 'https://cle@o1.ingest.exemple.invalid/1', NODE_ENV: 'production' })!;
    Sentry.init({ ...options, beforeSend: (e, indice) => (evenements.push(options.beforeSend!(e, indice) as ErrorEvent), null) });
  });
  beforeEach(() => {
    evenements.length = 0;
  });
  afterAll(() => Sentry.close());

  it('succès du premier coup : un seul appel, avec délai et clé d’idempotence', async () => {
    const { send, transport } = client(ok);
    await transport.send(MESSAGE);
    expect(send).toHaveBeenCalledTimes(1);
    const [, options] = send.mock.calls[0] as unknown as [unknown, { idempotencyKey: string; signal: AbortSignal }];
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(send.mock.calls[0]).toEqual([expect.not.objectContaining({ html: expect.anything() }), expect.anything()]);
  });

  it('transmet la version HTML avec la version texte', async () => {
    const { send, transport } = client(ok);
    await transport.send({ ...MESSAGE, html: '<p>Bonjour</p>' });
    expect(send.mock.calls[0]).toEqual([
      expect.objectContaining({ text: MESSAGE.body, html: '<p>Bonjour</p>' }),
      expect.anything(),
    ]);
  });

  it('panne passagère du fournisseur puis succès : nouvelle tentative avec la MÊME clé (jamais de doublon)', async () => {
    const { send, transport } = client(erreur(503), erreur(429), ok);
    await transport.send(MESSAGE);
    expect(send).toHaveBeenCalledTimes(3);
    const cles = send.mock.calls.map((appel) => (appel as unknown as [unknown, { idempotencyKey: string }])[1].idempotencyKey);
    expect(new Set(cles).size).toBe(1);
    await Sentry.flush(1000);
    expect(evenements).toEqual([]);
  });

  it('adresse refusée (4xx) : pas de nouvelle tentative, échec signalé', async () => {
    const { send, transport } = client(erreur(422, 'validation_error'));
    await transport.send(MESSAGE);
    expect(send).toHaveBeenCalledTimes(1);
    await Sentry.flush(1000);
    expect(evenements).toHaveLength(1);
    expect(evenements[0].tags).toMatchObject({ fournisseur: 'resend', motif: 'validation_error', statut: '422' });
  });

  it('réseau coupé à chaque tentative : 3 essais puis signalement, sans l’adresse ni le contenu', async () => {
    const { send, transport } = client(erreur(null), erreur(null), erreur(null));
    await expect(transport.send(MESSAGE)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(3);
    await Sentry.flush(1000);
    expect(evenements).toHaveLength(1);
    // Les extraits de code source joints par Sentry (lignes autour de l'appel)
    // sont du code, pas des données : seules les données sont contrôlées.
    const CODE_SOURCE = new Set(['pre_context', 'context_line', 'post_context']);
    const donnees = JSON.stringify(evenements[0], (cle, valeur) => (CODE_SOURCE.has(cle) ? undefined : valeur));
    expect(donnees).not.toMatch(/aissatou|SECRET-JETON/);
  });

  it('exception levée par le SDK : traitée comme une panne passagère, jamais propagée', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(ok);
    await new ResendEmailService({ emails: { send } } as never, [0, 0]).send(MESSAGE);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('adresse masquée dans les journaux', () => {
    expect(masquerAdresse('aissatou.diallo@exemple.gn')).toBe('a***@exemple.gn');
  });
});

describe('Envoi en arrière-plan', () => {
  it('la requête n’attend pas le fournisseur ; l’arrêt du service attend les envois en cours', async () => {
    let terminer!: () => void;
    const transport: EmailService = { send: vi.fn(() => new Promise<void>((r) => (terminer = r))) };
    const envoi = new EnvoiEnArrierePlan(transport);
    await envoi.send(MESSAGE); // rend la main immédiatement
    expect(transport.send).toHaveBeenCalledWith(MESSAGE);
    expect(envoi.nombreEnCours).toBe(1);
    let arrete = false;
    const arret = envoi.onModuleDestroy().then(() => (arrete = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(arrete).toBe(false);
    terminer();
    await arret;
    expect(envoi.nombreEnCours).toBe(0);
  });

  it('une erreur du transport ne remonte jamais à l’appelant', async () => {
    const envoi = new EnvoiEnArrierePlan({ send: () => Promise.reject(new Error('panne')) });
    await expect(envoi.send(MESSAGE)).resolves.toBeUndefined();
    await envoi.onModuleDestroy();
    expect(envoi.nombreEnCours).toBe(0);
  });
});

describe('Module email', () => {
  it('le service injecté envoie en arrière-plan, et l’arrêt de l’application attend les envois en cours', async () => {
    const module = await Test.createTestingModule({ imports: [EmailModule] }).compile();
    const service = module.get<EnvoiEnArrierePlan>(EMAIL_SERVICE);
    expect(service).toBeInstanceOf(EnvoiEnArrierePlan);
    const vidage = vi.spyOn(service, 'onModuleDestroy');
    await service.send(MESSAGE);
    expect(module.get(DevEmailService).getSentEmails()).toContainEqual(MESSAGE);
    await module.close();
    expect(vidage).toHaveBeenCalled();
  });
});
