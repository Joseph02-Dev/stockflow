/**
 * Mini-moteur 3D pour le fond animé des pages publiques (accueil,
 * authentification) : cartons, piles, palettes, diables et chariots en
 * volumes ombrés, qui dérivent lentement dans toutes les directions.
 *
 * Volontairement minimal et sans dépendance : tout objet est un assemblage
 * de pavés et de cylindres (polygones convexes), projetés en perspective,
 * triés du plus lointain au plus proche (algorithme du peintre) et ombrés
 * par une lumière fixe. Quelques centaines de faces par image : le coût
 * reste négligeable, même sur téléphone.
 */

type Vec = [number, number, number];

interface Face {
  points: Vec[];
  /** Centre du volume d'origine : oriente la normale vers l'extérieur. */
  centreVolume: Vec;
  couleur: string;
}

export interface Palette {
  carton: string;
  scotch: string;
  bois: string;
  metal: string;
  metalSombre: string;
  roue: string;
}

/** Couleurs par fond : kraft, bois et acier du thème, plus clairs sur l'encre. */
export const PALETTES: Record<'clair' | 'sombre', Palette> = {
  clair: {
    carton: '#c39463',
    scotch: '#e6d2ad',
    bois: '#a77b4f',
    metal: '#c2561b',
    metalSombre: '#4b5565',
    roue: '#1f2733',
  },
  sombre: {
    carton: '#f2c48f',
    scotch: '#fff3dc',
    bois: '#e0b07c',
    metal: '#f6a46f',
    metalSombre: '#cfd6e2',
    roue: '#6b7790',
  },
};

// ——— Primitives ———

function pave(cx: number, cy: number, cz: number, l: number, h: number, p: number, couleur: string): Face[] {
  const [x0, x1, y0, y1, z0, z1] = [cx - l / 2, cx + l / 2, cy - h / 2, cy + h / 2, cz - p / 2, cz + p / 2];
  const centreVolume: Vec = [cx, cy, cz];
  const faces: Vec[][] = [
    [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]],
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]],
  ];
  return faces.map((points) => ({ points, centreVolume, couleur }));
}

/** Cylindre (roue) d'axe x, approché par un prisme à `cotes` faces. */
function roue(cx: number, cy: number, cz: number, rayon: number, epaisseur: number, couleur: string, cotes = 10): Face[] {
  const centreVolume: Vec = [cx, cy, cz];
  const cercle = (x: number) =>
    Array.from({ length: cotes }, (_, i): Vec => {
      const a = (i / cotes) * Math.PI * 2;
      return [x, cy + Math.sin(a) * rayon, cz + Math.cos(a) * rayon];
    });
  const gauche = cercle(cx - epaisseur / 2);
  const droite = cercle(cx + epaisseur / 2);
  const faces: Face[] = [
    { points: gauche, centreVolume, couleur },
    { points: [...droite].reverse(), centreVolume, couleur },
  ];
  for (let i = 0; i < cotes; i++) {
    const j = (i + 1) % cotes;
    faces.push({ points: [gauche[i], gauche[j], droite[j], droite[i]], centreVolume, couleur });
  }
  return faces;
}

// ——— Modèles (origine au centre, y vers le bas) ———

function carton(c: Palette, l = 70, h = 56, p = 56, dx = 0, dy = 0, dz = 0): Face[] {
  return [
    ...pave(dx, dy, dz, l, h, p, c.carton),
    // Bande de scotch sur le dessus et sur la face avant.
    ...pave(dx, dy - h / 2 - 0.8, dz, l * 0.18, 1.6, p + 0.4, c.scotch),
    ...pave(dx, dy - h * 0.3, dz - p / 2 - 0.8, l * 0.18, h * 0.42, 1.6, c.scotch),
  ];
}

function pileDeCartons(c: Palette): Face[] {
  return [...carton(c, 80, 50, 60, 0, 30, 0), ...carton(c, 66, 44, 52, 6, -17, -2), ...carton(c, 50, 34, 40, -4, -56, 3)];
}

function palette(c: Palette): Face[] {
  const faces: Face[] = [];
  for (const z of [-34, 0, 34]) faces.push(...pave(0, -12, z, 120, 6, 18, c.bois));
  for (const x of [-48, 0, 48]) for (const z of [-34, 34]) faces.push(...pave(x, 0, z, 16, 14, 16, c.bois));
  faces.push(...carton(c, 54, 44, 50, -28, -37, 0), ...carton(c, 48, 40, 46, 30, -35, 4));
  return faces;
}

function diable(c: Palette): Face[] {
  const faces: Face[] = [];
  for (const x of [-20, 20]) faces.push(...pave(x, -6, 10, 5, 112, 5, c.metal));
  for (const y of [-58, -20, 18]) faces.push(...pave(0, y, 10, 42, 4, 4, c.metal));
  faces.push(...pave(0, 50, -4, 46, 4, 30, c.metalSombre));
  for (const x of [-26, 26]) faces.push(...roue(x, 46, 14, 12, 7, c.roue));
  faces.push(...carton(c, 40, 38, 30, 0, 27, -6));
  return faces;
}

function chariot(c: Palette): Face[] {
  const faces: Face[] = [...pave(0, 18, 0, 116, 7, 62, c.metal)];
  for (const z of [-27, 27]) faces.push(...pave(-56, -16, z, 5, 64, 5, c.metalSombre));
  faces.push(...pave(-56, -48, 0, 5, 5, 59, c.metalSombre));
  for (const x of [-44, 44]) for (const z of [-24, 24]) faces.push(...roue(x, 30, z, 7, 5, c.roue, 8));
  faces.push(...carton(c, 48, 40, 44, -10, -6, 0), ...carton(c, 38, 30, 34, 34, -1, 4));
  return faces;
}

const MODELES = [
  { poids: 0.42, fabrique: (c: Palette) => carton(c) },
  { poids: 0.18, fabrique: pileDeCartons },
  { poids: 0.14, fabrique: palette },
  { poids: 0.13, fabrique: diable },
  { poids: 0.13, fabrique: chariot },
];

// ——— Scène ———

interface Objet {
  faces: Face[];
  position: Vec;
  vitesse: Vec;
  angles: Vec;
  rotation: Vec;
  echelle: number;
}

export interface Scene {
  objets: Objet[];
  largeur: number;
  hauteur: number;
}

/** Distance focale : plus elle est courte, plus la perspective est marquée. */
const FOCALE = 900;
const PROFONDEUR = 700;
const MARGE = 160;

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même scène à chaque visite. */
function aleatoire(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nombre d'objets selon la surface : discret sur téléphone, plus riche sur grand écran. */
export function nombreObjets(largeur: number, hauteur: number) {
  return Math.max(5, Math.min(14, Math.round((largeur * hauteur) / 110_000)));
}

export function creerScene(largeur: number, hauteur: number, palette: Palette, graine = 7): Scene {
  const hasard = aleatoire(graine);
  const entre = (min: number, max: number) => min + hasard() * (max - min);
  const signe = () => (hasard() < 0.5 ? -1 : 1);
  const total = nombreObjets(largeur, hauteur);
  const objets: Objet[] = [];
  for (let i = 0; i < total; i++) {
    let tirage = hasard();
    const modele = MODELES.find((m) => (tirage -= m.poids) < 0) ?? MODELES[0];
    // Direction quelconque, vitesse lente (pixels par seconde au premier plan).
    const cap = entre(0, Math.PI * 2);
    const vitesse = entre(10, 24);
    objets.push({
      faces: modele.fabrique(palette),
      position: [entre(-largeur / 2, largeur / 2), entre(-hauteur / 2, hauteur / 2), entre(0, PROFONDEUR)],
      vitesse: [Math.cos(cap) * vitesse, Math.sin(cap) * vitesse, entre(-8, 8)],
      angles: [entre(0, Math.PI * 2), entre(0, Math.PI * 2), entre(0, Math.PI * 2)],
      rotation: [signe() * entre(0.05, 0.22), signe() * entre(0.08, 0.3), signe() * entre(0.03, 0.15)],
      echelle: largeur < 640 ? entre(0.55, 0.8) : entre(0.75, 1.15),
    });
  }
  return { objets, largeur, hauteur };
}

/** Fait avancer la scène de `dt` secondes ; un objet sorti réapparaît du côté opposé. */
export function avancer(scene: Scene, dt: number) {
  const demiL = scene.largeur / 2 + MARGE;
  const demiH = scene.hauteur / 2 + MARGE;
  const boucler = (v: number, min: number, max: number) => (v < min ? max : v > max ? min : v);
  for (const o of scene.objets) {
    for (let k = 0; k < 3; k++) {
      o.position[k] += o.vitesse[k] * dt;
      o.angles[k] += o.rotation[k] * dt;
    }
    o.position[0] = boucler(o.position[0], -demiL, demiL);
    o.position[1] = boucler(o.position[1], -demiH, demiH);
    o.position[2] = boucler(o.position[2], -60, PROFONDEUR);
  }
}

// ——— Rendu ———

function tourner([x, y, z]: Vec, [ax, ay, az]: Vec): Vec {
  // Rotations successives autour de x, y puis z.
  let [cy, sy] = [Math.cos(ax), Math.sin(ax)];
  [y, z] = [y * cy - z * sy, y * sy + z * cy];
  [cy, sy] = [Math.cos(ay), Math.sin(ay)];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [cy, sy] = [Math.cos(az), Math.sin(az)];
  [x, y] = [x * cy - y * sy, x * sy + y * cy];
  return [x, y, z];
}

const LUMIERE: Vec = (() => {
  const v: Vec = [-0.45, -0.75, -0.5];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

const couleursRgb = new Map<string, [number, number, number]>();
function rgb(hex: string) {
  let c = couleursRgb.get(hex);
  if (!c) {
    const n = Number.parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    couleursRgb.set(hex, c);
  }
  return c;
}

interface FaceProjetee {
  ecran: [number, number][];
  profondeur: number;
  remplissage: string;
  contour: string;
}

/**
 * Dessine la scène en volumes opaques : la discrétion derrière les textes
 * vient de l'opacité du calque entier (CSS), pas de chaque face — sinon
 * les volumes d'un même objet se verraient les uns à travers les autres.
 */
export function dessiner(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { largeur, hauteur } = scene;
  const camera: Vec = [0, 0, -FOCALE];
  const visibles: FaceProjetee[] = [];

  for (const o of scene.objets) {
    const placer = (p: Vec): Vec => {
      const r = tourner([p[0] * o.echelle, p[1] * o.echelle, p[2] * o.echelle], o.angles);
      return [r[0] + o.position[0], r[1] + o.position[1], r[2] + o.position[2]];
    };
    const centreObjet = placer([0, 0, 0]);
    // Objet derrière la caméra ou trop proche : rien à dessiner.
    if (centreObjet[2] < -FOCALE * 0.6) continue;
    for (const face of o.faces) {
      const pts = face.points.map(placer);
      const n = pts.length;
      const c: Vec = [0, 0, 0];
      for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / n;
      // Normale du polygone, orientée vers l'extérieur du volume.
      const [a, b, d] = [pts[0], pts[1], pts[2]];
      const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vec = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let normale: Vec = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const longueur = Math.hypot(...normale) || 1;
      normale = [normale[0] / longueur, normale[1] / longueur, normale[2] / longueur];
      const centreVolume = placer(face.centreVolume);
      const versExterieur = (c[0] - centreVolume[0]) * normale[0] + (c[1] - centreVolume[1]) * normale[1] + (c[2] - centreVolume[2]) * normale[2];
      if (versExterieur < 0) normale = [-normale[0], -normale[1], -normale[2]];
      // Face tournée vers l'arrière : invisible.
      const versCamera: Vec = [c[0] - camera[0], c[1] - camera[1], c[2] - camera[2]];
      if (normale[0] * versCamera[0] + normale[1] * versCamera[1] + normale[2] * versCamera[2] >= 0) continue;

      const eclairage = 0.58 + 0.42 * Math.max(0, normale[0] * LUMIERE[0] + normale[1] * LUMIERE[1] + normale[2] * LUMIERE[2]);
      const [r, g, bl] = rgb(face.couleur);
      const teinte = (f: number) => `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(bl * f)})`;
      visibles.push({
        ecran: pts.map((p) => {
          const s = FOCALE / Math.max(1, FOCALE + p[2]);
          return [largeur / 2 + p[0] * s, hauteur / 2 + p[1] * s];
        }),
        profondeur: Math.hypot(...versCamera),
        remplissage: teinte(eclairage),
        contour: teinte(eclairage * 0.78),
      });
    }
  }

  visibles.sort((x, y) => y.profondeur - x.profondeur);
  ctx.clearRect(0, 0, largeur, hauteur);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  for (const f of visibles) {
    ctx.beginPath();
    ctx.moveTo(f.ecran[0][0], f.ecran[0][1]);
    for (let i = 1; i < f.ecran.length; i++) ctx.lineTo(f.ecran[i][0], f.ecran[i][1]);
    ctx.closePath();
    ctx.fillStyle = f.remplissage;
    ctx.fill();
    ctx.strokeStyle = f.contour;
    ctx.stroke();
  }
}
