import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const MAX = 10_000_000;

export class CreerRegleReapproDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  /** Facultatif : sinon l'unique fournisseur associé au produit. */
  @IsOptional()
  @IsUUID('4', { message: 'fournisseurId doit être un identifiant valide.' })
  fournisseurId?: string;

  @IsInt({ message: 'Le stock minimum doit être un nombre entier.' })
  @Min(0, { message: 'Le stock minimum ne peut pas être négatif.' })
  @Max(MAX)
  stockMin!: number;

  @IsInt({ message: 'Le stock maximum doit être un nombre entier.' })
  @Min(1, { message: 'Le stock maximum doit être d’au moins 1.' })
  @Max(MAX)
  stockMax!: number;

  /** Commande par multiples (carton de 12…). */
  @IsOptional()
  @IsInt({ message: 'Le multiple de commande doit être un nombre entier.' })
  @Min(1, { message: 'Le multiple de commande est d’au moins 1.' })
  @Max(MAX)
  multiple?: number;
}

/** Produit et emplacement ne changent pas : supprimez la règle et recréez-la. */
export class ModifierRegleReapproDto {
  @IsOptional()
  @IsUUID('4', { message: 'fournisseurId doit être un identifiant valide.' })
  fournisseurId?: string | null;

  @IsOptional()
  @IsInt({ message: 'Le stock minimum doit être un nombre entier.' })
  @Min(0, { message: 'Le stock minimum ne peut pas être négatif.' })
  @Max(MAX)
  stockMin?: number;

  @IsOptional()
  @IsInt({ message: 'Le stock maximum doit être un nombre entier.' })
  @Min(1, { message: 'Le stock maximum doit être d’au moins 1.' })
  @Max(MAX)
  stockMax?: number;

  @IsOptional()
  @IsInt({ message: 'Le multiple de commande doit être un nombre entier.' })
  @Min(1, { message: 'Le multiple de commande est d’au moins 1.' })
  @Max(MAX)
  multiple?: number;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
