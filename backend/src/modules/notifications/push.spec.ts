import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import webpush from 'web-push';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { contactVapid, endpointAutorise, problemeClesVapid, PushService } from './push.service.js';
import { AlerteNotificationService } from '../alertes/alerte-notification.service.js';

describe('Notifications push — règles', () => {
  it('n’accepte que les services push des navigateurs, en https', () => {
    expect(endpointAutorise('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(endpointAutorise('https://web.push.apple.com/QGx')).toBe(true);
    expect(endpointAutorise('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(endpointAutorise('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(endpointAutorise('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(endpointAutorise('https://fcm.googleapis.com.attaquant.com/x')).toBe(false);
    expect(endpointAutorise('https://169.254.169.254/latest')).toBe(false);
    expect(endpointAutorise('pas une adresse')).toBe(false);
  });

  it('déclare l’adresse d’expéditeur des emails comme contact', () => {
    expect(contactVapid('NimbaFlow <alertes@exemple.com>')).toBe('mailto:alertes@exemple.com');
    expect(contactVapid('alertes@exemple.com')).toBe('mailto:alertes@exemple.com');
    expect(contactVapid('NimbaFlow')).toBeNull();
    expect(contactVapid(undefined)).toBeNull();
  });
});

describe('Notifications push — clés VAPID', () => {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();

  it('accepte un couple généré par web-push', () => {
    expect(problemeClesVapid(publicKey, privateKey)).toBeNull();
  });

  it('nomme l’erreur de saisie : guillemets, clés inversées, couple dépareillé', () => {
    expect(problemeClesVapid(`"${publicKey}"`, privateKey)).toMatch(/caractères inattendus/);
    expect(problemeClesVapid(`Public Key: ${publicKey}`, privateKey)).toMatch(/caractères inattendus/);
    expect(problemeClesVapid(privateKey, publicKey)).toMatch(/inversées/);
    expect(problemeClesVapid(publicKey, webpush.generateVAPIDKeys().privateKey)).toMatch(/même génération/);
    expect(problemeClesVapid(publicKey.slice(0, 40), privateKey)).toMatch(/VAPID_PUBLIC_KEY/);
  });

  it('désactive le push plutôt que de servir une clé invalide', () => {
    const avant = { ...process.env };
    try {
      Object.assign(process.env, { VAPID_PUBLIC_KEY: privateKey, VAPID_PRIVATE_KEY: publicKey, EMAIL_FROM: 'alertes@exemple.com' });
      expect(new PushService({} as PrismaService).clePublique).toBeNull();
      Object.assign(process.env, { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey });
      expect(new PushService({} as PrismaService).clePublique).toBe(publicKey);
    } finally {
      process.env = avant;
    }
  });
});

describe('Notifications push — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let push: PushService;
  let alertes: AlerteNotificationService;
  const entrepriseIds: string[] = [];
  const environnement = { ...process.env };
  const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/appareil-test';
  // Clés d'un vrai appareil : le chiffrement du contenu les exige valides.
  const appareil = webpush.generateVAPIDKeys();
  const cles = { p256dh: appareil.publicKey, auth: 'c2VjcmV0LWF1dGgtMTZv' };

  beforeAll(async () => {
    const vapid = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
    process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
    process.env.EMAIL_FROM = 'NimbaFlow <alertes@exemple.com>';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    push = moduleRef.get(PushService);
    alertes = moduleRef.get(AlerteNotificationService);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await nettoyer(prisma, entrepriseIds.splice(0), []);
  });

  afterAll(async () => {
    await app.close();
    process.env = environnement;
  });

  async function connecte(nom: string) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, nom);
    entrepriseIds.push(entreprise.id);
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const http = (methode: 'get' | 'post' | 'delete', url: string) =>
      request(app.getHttpServer())[methode](url).set('Authorization', `Bearer ${jeton}`);
    return { entreprise, utilisateur, http };
  }

  /** Attend la fin des envois partis en arrière-plan. */
  async function envoisTermines() {
    await vi.waitFor(() => expect(push.nombreEnCours).toBe(0));
  }

  it('abonne puis désabonne l’appareil ; refuse une adresse hors services push', async () => {
    const { utilisateur, http } = await connecte('Push abonnement');
    expect((await http('get', '/notifications/push/cle')).body.clePublique).toBe(process.env.VAPID_PUBLIC_KEY);

    // Corps exact de PushSubscription.toJSON() : expirationTime y figure, souvent null.
    await http('post', '/notifications/push/abonnement').send({ endpoint: ENDPOINT, expirationTime: null, keys: cles }).expect(204);
    expect(await prisma.abonnementPush.count({ where: { utilisateurId: utilisateur.id } })).toBe(1);

    await http('post', '/notifications/push/abonnement')
      .send({ endpoint: 'https://interne.local/push', keys: cles })
      .expect(400);

    await http('delete', '/notifications/push/abonnement').send({ endpoint: ENDPOINT }).expect(204);
    expect(await prisma.abonnementPush.count({ where: { utilisateurId: utilisateur.id } })).toBe(0);
  });

  it('une alerte de stock part en notification push, en plus de l’email', async () => {
    const { entreprise, http } = await connecte('Push alerte');
    await http('post', '/notifications/push/abonnement').send({ endpoint: ENDPOINT, keys: cles }).expect(204);
    const envoi = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });

    await alertes.notifierAlerte(entreprise.id, 'Riz parfumé 25 kg', 'RUPTURE', 0);
    await envoisTermines();
    expect(JSON.parse(envoi.mock.calls[0][1] as string)).toMatchObject({
      titre: 'Rupture de stock',
      corps: 'Riz parfumé 25 kg est en rupture de stock.',
      url: '/alertes',
    });
  });

  it('notifie les personnes connectées, pas celles déconnectées, et retire un abonnement expiré', async () => {
    const { entreprise, utilisateur, http } = await connecte('Push envoi');
    await http('post', '/notifications/push/abonnement').send({ endpoint: ENDPOINT, keys: cles }).expect(204);
    const envoi = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const notification = { titre: 'Rupture de stock', corps: 'Riz 25 kg est en rupture de stock.', url: '/alertes', etiquette: 'e' };

    await push.envoyer(entreprise.id, notification);
    await envoisTermines();
    expect(envoi).toHaveBeenCalledTimes(1);
    expect(envoi.mock.calls[0][2]).toMatchObject({ urgency: 'high' });
    expect(JSON.parse(envoi.mock.calls[0][1] as string)).toEqual(notification);

    // Le service push déclare l'abonnement expiré (410) : retiré.
    envoi.mockRejectedValueOnce(new webpush.WebPushError('Expiré', 410, {}, '', ENDPOINT));
    await push.envoyer(entreprise.id, notification);
    await envoisTermines();
    expect(await prisma.abonnementPush.count({ where: { utilisateurId: utilisateur.id } })).toBe(0);

    // Plus aucune session valable (déconnectée partout) : rien n'est envoyé.
    await http('post', '/notifications/push/abonnement').send({ endpoint: ENDPOINT, keys: cles }).expect(204);
    await prisma.refreshToken.updateMany({ where: { utilisateurId: utilisateur.id }, data: { revokedAt: new Date() } });
    envoi.mockClear();
    await push.envoyer(entreprise.id, notification);
    await envoisTermines();
    expect(envoi).not.toHaveBeenCalled();
  });
});
