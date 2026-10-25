import { Type } from 'class-transformer';
import { IsString, Matches, MaxLength, Validate, ValidateNested, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { endpointAutorise } from '../push.service.js';

@ValidatorConstraint({ name: 'endpointPush' })
class EndpointPush implements ValidatorConstraintInterface {
  validate(valeur: unknown) {
    return typeof valeur === 'string' && endpointAutorise(valeur);
  }
  defaultMessage() {
    return 'Adresse de notification non reconnue.';
  }
}

/** Clés de chiffrement de l'appareil (base64url). */
class ClesAbonnement {
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+=*$/)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+=*$/)
  auth!: string;
}

export class DesabonnementPushDto {
  @IsString()
  @MaxLength(1000)
  @Validate(EndpointPush)
  endpoint!: string;
}

/** Abonnement tel que le renvoie PushSubscription.toJSON() dans le navigateur. */
export class AbonnementPushDto extends DesabonnementPushDto {
  @ValidateNested()
  @Type(() => ClesAbonnement)
  keys!: ClesAbonnement;
}
