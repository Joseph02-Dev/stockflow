export type TypeRapport = 'stock' | 'mouvements' | 'client' | 'pertes';
export type Periode = '7' | '30' | '90' | 'perso';

export interface ParametresRapport {
  type: TypeRapport;
  periode: Periode;
  debut: string;
  fin: string;
  emplacementId: string;
  categorieId: string;
  clientId: string;
  typeMouvement: string;
  detail: boolean;
  graphiques: boolean;
  signature: boolean;
}

export interface ApercuRapport {
  pdf: Blob;
  pages: number;
  nomFichier: string;
}
