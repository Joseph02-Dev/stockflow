import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../config/prisma.service.js';
import { TypeMouvement } from '../../generated/prisma/enums.js';
import { extremites, sensParDefaut } from './sens-mouvement.js';

describe('Double entrée — sens des mouvements', () => {
  const prisma = new PrismaService();
  afterAll(() => prisma.$disconnect());

  it('chaque type touche le stock interne d’au moins un côté', () => {
    for (const type of Object.values(TypeMouvement)) {
      for (const quantite of [5, -5]) {
        const { origine, destination } = sensParDefaut(type, quantite);
        expect(origine === 'INTERNE' || destination === 'INTERNE').toBe(true);
      }
    }
    expect(sensParDefaut('AJUSTEMENT', 3)).toEqual({ origine: 'INVENTAIRE', destination: 'INTERNE' });
    expect(sensParDefaut('AJUSTEMENT', -3)).toEqual({ origine: 'INTERNE', destination: 'INVENTAIRE' });
    expect(sensParDefaut('CASSE', 1)).toEqual({ origine: 'INTERNE', destination: 'REBUT' });
  });

  it('même règle que le déclencheur SQL appliqué aux anciennes versions de l’API', async () => {
    for (const type of Object.values(TypeMouvement)) {
      for (const quantite of [5, -5]) {
        const [sql] = await prisma.$queryRaw<{ origine: string; destination: string }[]>`
          SELECT mouvement_origine_par_defaut(${type}::"TypeMouvement", ${quantite}::int)::text AS origine,
                 mouvement_destination_par_defaut(${type}::"TypeMouvement", ${quantite}::int)::text AS destination`;
        expect(sql, `${type} ${quantite}`).toEqual(sensParDefaut(type, quantite));
      }
    }
  });

  it('extrémités : le côté interne d’un transfert arrive à emplacementDestinationId', () => {
    expect(
      extremites({ origine: 'INTERNE', destination: 'INTERNE', emplacementId: 'a', emplacementDestinationId: 'b' }),
    ).toEqual({
      source: { nature: 'INTERNE', emplacementId: 'a' },
      destination: { nature: 'INTERNE', emplacementId: 'b' },
    });
    expect(
      extremites({ origine: 'FOURNISSEUR', destination: 'INTERNE', emplacementId: 'a', emplacementDestinationId: null }),
    ).toEqual({
      source: { nature: 'FOURNISSEUR', emplacementId: null },
      destination: { nature: 'INTERNE', emplacementId: 'a' },
    });
  });
});
