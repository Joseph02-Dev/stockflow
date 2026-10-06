import { SetMetadata } from '@nestjs/common';
import type { Fonctionnalite as NomFonctionnalite } from '../../config/fonctionnalites.js';

export const FONCTIONNALITE_KEY = 'fonctionnalite';

/**
 * Rattache une route (ou un controller) à un interrupteur global :
 * FonctionnaliteGuard répond 503 FONCTIONNALITE_SUSPENDUE quand elle est
 * listée dans FONCTIONNALITES_DESACTIVEES.
 */
export const Fonctionnalite = (nom: NomFonctionnalite) => SetMetadata(FONCTIONNALITE_KEY, nom);
