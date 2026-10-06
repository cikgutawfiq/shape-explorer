// Shape models. Each model describes a *folded* polyhedron (vertices + faces) plus
// a spanning "tree" that says how the faces are connected when the shape is cut open into a net.
// The unfold engine (unfold.js) turns this into an animated fold/unfold.
import * as THREE from 'three';

const SIDE_COLORS = ['#2aa392', '#7ac74f', '#f2c14e', '#ef7d6a', '#9b7be0', '#3cc0d8', '#e66fa0', '#8aa0b0'];
const BASE_COLOR = '#4f86e0';
const TOP_COLOR = '#f0a63a';
const CURVED_COLOR = '#2aa392';

const ORDINAL = ['', '', '', 'Triangular', 'Square', 'Pentagonal', 'Hexagonal', 'Heptagonal', 'Octagonal'];

const regularPolygon = (n, r) =>
  Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

/** Strip/fan tree: root face -> face `first`, then chain both ways round (used for cylinder & cone). */
function chainTree(first, count, rootFace) {
  // faces first .. first+count-1 are the lateral faces in order around the shape
  const tree = [{ face: first, parent: rootFace }];
  const half = Math.floor(count / 2);
  for (let k = 1; k <= half; k++) tree.push({ face: first + k, parent: first + k - 1 });
  for (let k = count - 1; k > half; k--) tree.push({ face: first + k, parent: first + ((k + 1) % count) });
  return tree;
}

/**
 * Prism-like solid: `poly` is a list of [x,z] points (counter-clockwise seen from above).
 * Faces: 0 = bottom, 1..n = sides, n+1 = top.
 */
function prismModel({ poly, height, strip = false }) {
  const n = poly.length;
  const V = [
    ...poly.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    ...poly.map(([x, z]) => new THREE.Vector3(x, height, z)),
  ];
  const faces = [{ idx: [...Array(n).keys()].reverse(), color: BASE_COLOR, role: 'base' }];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({
      idx: [i, j, n + j, n + i],
      color: strip ? CURVED_COLOR : SIDE_COLORS[i % SIDE_COLORS.length],
      role: 'side',
      curved: strip,
    });
  }
  faces.push({ idx: [...Array(n).keys()].map((i) => n + i), color: TOP_COLOR, role: 'top' });

  let tree;
  if (strip) {
    tree = chainTree(1, n, 0);
    tree.push({ face: n + 1, parent: 1, delay: 0.55 });
  } else {
    tree = [];
    for (let i = 1; i <= n; i++) tree.push({ face: i, parent: 0 });
    tree.push({ face: n + 1, parent: 1, delay: 0.5 });
  }
  return { V, faces, tree, root: 0, n };
}

/** Pyramid-like solid. Faces: 0 = base, 1..n = triangular sides. Apex is vertex n. */
function pyramidModel({ poly, height, strip = false }) {
  const n = poly.length;
  const V = [...poly.map(([x, z]) => new THREE.Vector3(x, 0, z)), new THREE.Vector3(0, height, 0)];
  const faces = [{ idx: [...Array(n).keys()].reverse(), color: BASE_COLOR, role: 'base' }];
  for (let i = 0; i < n; i++) {
    faces.push({
      idx: [i, (i + 1) % n, n],
      color: strip ? CURVED_COLOR : SIDE_COLORS[i % SIDE_COLORS.length],
      role: 'side',
      curved: strip,
    });
  }
  let tree;
  if (strip) tree = chainTree(1, n, 0);
  else {
    tree = [];
    for (let i = 1; i <= n; i++) tree.push({ face: i, parent: 0 });
  }
  return { V, faces, tree, root: 0, n };
}

const pairs = (list) => list.map(([a, b]) => ({ pairs: [[a, b]] }));

/** Builds the full model (geometry + counting items) for a catalogue entry. */
export function buildModel(id, sides) {
  switch (id) {
    case 'cube':
    case 'cuboid': {
      const [w, d, h] = id === 'cube' ? [1.5, 1.5, 1.5] : [2.2, 1.3, 1.2];
      const poly = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]];
      return finishPolyhedron(prismModel({ poly, height: h }), { id });
    }
    case 'prism': {
      const n = sides;
      return finishPolyhedron(prismModel({ poly: regularPolygon(n, 0.95), height: 1.7 }), { id });
    }
    case 'pyramid': {
      const n = sides;
      return finishPolyhedron(pyramidModel({ poly: regularPolygon(n, 1.0), height: 1.9 }), { id });
    }
    case 'cylinder': {
      const N = 64;
      const m = prismModel({ poly: regularPolygon(N, 0.7), height: 1.6, strip: true });
      const cylRadial = (p) => new THREE.Vector3(p.x, 0, p.z).normalize();
      const rim = (y) => [...Array(N).keys()].map((i) => [N * y + i, N * y + ((i + 1) % N)]);
      return {
        ...m,
        id,
        smoothNormal: (p) => cylRadial(p),
        faceItems: [
          { faces: [0] },
          { faces: [N + 1] },
          { faces: [...Array(N).keys()].map((i) => i + 1), curved: true },
        ],
        edgeItems: [{ pairs: rim(0), curved: true }, { pairs: rim(1), curved: true }],
        vertexItems: [],
        seam: [[1 + N / 2, 2 + N / 2]],
      };
    }
    case 'cone': {
      const N = 64;
      const r = 0.8;
      const H = 1.8;
      const m = pyramidModel({ poly: regularPolygon(N, r), height: H, strip: true });
      return {
        ...m,
        id,
        smoothNormal: (p, faceCenter) => {
          // slanted surface normal; at the apex use the face's own direction
          const radial =
            Math.hypot(p.x, p.z) < 1e-6
              ? new THREE.Vector3(faceCenter.x, 0, faceCenter.z).normalize()
              : new THREE.Vector3(p.x, 0, p.z).normalize();
          return new THREE.Vector3(radial.x * H, r, radial.z * H).normalize();
        },
        faceItems: [{ faces: [0] }, { faces: [...Array(N).keys()].map((i) => i + 1), curved: true }],
        edgeItems: [{ pairs: [...Array(N).keys()].map((i) => [i, (i + 1) % N]), curved: true }],
        vertexItems: [N],
        seam: [[1 + N / 2, 2 + N / 2]],
      };
    }
    default:
      throw new Error('unknown shape ' + id);
  }
}

/** For ordinary polyhedra every face / edge / corner counts. */
function finishPolyhedron(m, extra) {
  const seen = new Set();
  const edges = [];
  m.faces.forEach(({ idx }) => {
    idx.forEach((a, i) => {
      const b = idx[(i + 1) % idx.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    });
  });
  return {
    ...m,
    ...extra,
    faceItems: m.faces.map((_, i) => ({ faces: [i] })),
    edgeItems: pairs(edges),
    vertexItems: m.V.map((_, i) => i),
  };
}

export function countsOf(model) {
  if (model.sphere) return { faces: 0, curved: 1, edges: 0, vertices: 0 };
  return {
    faces: model.faceItems.filter((f) => !f.curved).length,
    curved: model.faceItems.filter((f) => f.curved).length,
    edges: model.edgeItems.length,
    vertices: model.vertexItems.length,
  };
}

export const SPHERE_MODEL = { id: 'sphere', sphere: true };

/* ------------------------------------------------------------------ catalogue ---- */

export const SHAPES = [
  {
    id: 'cube', icon: '🎲', name: () => 'Cube', hasSides: false,
    blurb: 'A cube has square faces that are all the same size, and all of its edges are the same length.',
    examples: [['🎲', 'Dice'], ['🧊', 'Ice cube'], ['🎁', 'Gift box'], ['🧩', 'Building block']],
    fact: 'A cube can be unfolded in 11 different ways. The cross shape is the best known one!',
    net: 'Squares joined together',
  },
  {
    id: 'cuboid', icon: '📦', name: () => 'Cuboid', hasSides: false,
    blurb: 'A cuboid (rectangular prism) has rectangle faces. Faces that face each other are the same size.',
    examples: [['📦', 'Cardboard box'], ['📚', 'Book'], ['🧱', 'Brick'], ['📱', 'Phone']],
    fact: 'Look around the room: bricks, books and boxes are all cuboids!',
    net: 'Rectangles joined together',
  },
  {
    id: 'prism', icon: '🍫', name: (n) => `${ORDINAL[n]} prism`, hasSides: true, sides: [3, 8], defaultSides: 3,
    blurb: 'A prism has two matching flat ends joined by rectangle sides. The ends decide its name.',
    examples: [['⛺', 'Tent'], ['🍫', 'Toblerone box'], ['🌈', 'Glass prism'], ['🏠', 'Roof of a house']],
    fact: 'Slice a prism anywhere parallel to its ends and you always get the same shape!',
    net: 'Two matching ends and rectangle sides',
  },
  {
    id: 'pyramid', icon: '🔺', name: (n) => `${ORDINAL[n]} pyramid`, hasSides: true, sides: [3, 8], defaultSides: 4,
    blurb: 'A pyramid has one flat base. Its triangle faces all meet at a point on top called the apex.',
    examples: [['🏜️', 'Pyramid of Giza'], ['🏛️', 'Glass pyramid, Louvre'], ['🔺', 'Warning sign shape'], ['🎪', 'Circus tent top']],
    fact: 'The Great Pyramid of Giza in Egypt is more than 4,500 years old!',
    net: 'A base with triangles around it',
  },
  {
    id: 'cylinder', icon: '🥫', name: () => 'Cylinder', hasSides: false,
    blurb: 'A cylinder has flat circle ends and a curved surface. It can roll and it can stack!',
    examples: [['🥫', 'Tin can'], ['🔋', 'Battery'], ['🪵', 'Log'], ['🧻', 'Tissue roll']],
    fact: 'Unroll the curved part of a cylinder and it becomes a rectangle!',
    net: 'A rectangle with a circle at each end',
  },
  {
    id: 'cone', icon: '🍦', name: () => 'Cone', hasSides: false,
    blurb: 'A cone has a flat circle, a curved surface and a pointy tip called the apex.',
    examples: [['🍦', 'Ice-cream cone'], ['🎉', 'Party hat'], ['🚧', 'Traffic cone'], ['🥕', 'Carrot (nearly!)']],
    fact: 'Unroll the curved part of a cone and it becomes a slice of pizza shape!',
    net: 'One circle and a pizza-slice shape',
  },
  {
    id: 'sphere', icon: '⚽', name: () => 'Sphere', hasSides: false, noUnfold: true,
    blurb: 'A sphere is perfectly round, like a ball. Can you find any flat faces, edges or corners on it?',
    examples: [['⚽', 'Football'], ['🏀', 'Basketball'], ['🌍', 'Earth'], ['🫐', 'Blueberry']],
    fact: 'You cannot flatten a sphere without stretching or tearing it. That is why world maps are always a bit squashed!',
    net: 'No flat net: it is curved everywhere',
  },
];

export const byId = (id) => SHAPES.find((s) => s.id === id);

/* ---------------------------------------------------------------- 2D catalogue ---- */

export const SHAPES_2D = [
  { id: 'triangle', name: 'Triangle', n: 3, sides: 3, corners: 3, right: 0, sym: 3, icon: '🔺',
    blurb: 'A triangle is made of straight sides that meet at corners. It is the strongest shape for building bridges!',
    examples: [['🚸', 'Road sign'], ['🍕', 'Pizza slice'], ['⛰️', 'Mountain'], ['🎵', 'Triangle instrument']],
    in3d: [['pyramid', 'Pyramids have triangle faces'], ['prism', 'Triangular prisms have triangle ends']] },
  { id: 'square', name: 'Square', n: 4, sides: 4, corners: 4, right: 4, sym: 4, icon: '🟦',
    blurb: 'A square has equal sides and square corners (right angles), like a floor tile.',
    examples: [['🖼️', 'Picture frame'], ['🧇', 'Waffle'], ['🍫', 'Chocolate square'], ['📐', 'Floor tile']],
    in3d: [['cube', 'A cube has square faces'], ['pyramid', 'A square pyramid has a square base']] },
  { id: 'rectangle', name: 'Rectangle', n: 4, rect: true, sides: 4, corners: 4, right: 4, sym: 2, icon: '▬',
    blurb: 'A rectangle has square corners (right angles). Opposite sides are equal.',
    examples: [['🚪', 'Door'], ['📱', 'Phone screen'], ['📘', 'Book cover'], ['🛏️', 'Mattress']],
    in3d: [['cuboid', 'A cuboid has rectangle faces'], ['prism', 'Prisms have rectangle sides']] },
  { id: 'pentagon', name: 'Pentagon', n: 5, sides: 5, corners: 5, right: 0, sym: 5, icon: '⬟',
    blurb: 'The Pentagon, a famous building in the USA, is shaped like this.',
    examples: [['🏛️', 'The Pentagon building'], ['⚽', 'Football patches'], ['🏠', 'Home-plate shape'], ['🌸', 'Okra slice']],
    in3d: [['prism', 'Pentagonal prisms have pentagon ends'], ['pyramid', 'Pentagonal pyramids have a pentagon base']] },
  { id: 'hexagon', name: 'Hexagon', n: 6, sides: 6, corners: 6, right: 0, sym: 6, icon: '⬢',
    blurb: 'Bees build their honeycomb out of hexagons.',
    examples: [['🐝', 'Honeycomb'], ['🔩', 'Nut'], ['❄️', 'Snowflake'], ['⬢', 'Pencil end']],
    in3d: [['prism', 'Hexagonal prisms have hexagon ends'], ['pyramid', 'Hexagonal pyramids have a hexagon base']] },
  { id: 'octagon', name: 'Octagon', n: 8, sides: 8, corners: 8, right: 0, sym: 8, icon: '🛑',
    blurb: 'A stop sign is an octagon.',
    examples: [['🛑', 'Stop sign'], ['☂️', 'Umbrella from above'], ['🪟', 'Some windows'], ['🧿', 'Fancy tile']],
    in3d: [['prism', 'Octagonal prisms have octagon ends'], ['pyramid', 'Octagonal pyramids have an octagon base']] },
  { id: 'circle', name: 'Circle', n: 0, circle: true, sides: 1, corners: 0, right: 0, sym: '∞', icon: '🔴',
    blurb: 'A circle is perfectly round. Its side is curved and it has no corners.',
    examples: [['🕐', 'Clock'], ['🪙', 'Coin'], ['🍪', 'Cookie'], ['🛞', 'Wheel']],
    in3d: [['cylinder', 'A cylinder has circle faces'], ['cone', 'A cone has a circle base'], ['sphere', 'A sphere is a 3D circle!']] },
];
