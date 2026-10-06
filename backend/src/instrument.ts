import * as Sentry from '@sentry/nestjs';
import { optionsSentry } from './config/surveillance.js';

// Importé en premier par main.ts : le SDK doit être prêt avant l'application.
const options = optionsSentry();
if (options) Sentry.init(options);
