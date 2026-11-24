// Low-poly model builders. Everything is built facing +Z with its origin on the ground.
import * as THREE from 'three';

const geoCache = new Map();
const matCache = new Map();

function G(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

export function M(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, color && color.isMaterial ? color : M(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = mesh(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), color, opts);
  m.position.set(x, y, z);
  return m;
}

export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10, opts) {
  const m = mesh(G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), color, opts);
  m.position.set(x, y, z);
  return m;
}

export function ball(r, color, x = 0, y = 0, z = 0, opts) {
  const m = mesh(G(`s${r}`, () => new THREE.IcosahedronGeometry(r, 2)), color, opts);
  m.position.set(x, y, z);
  return m;
}

export function cone(r, h, color, x = 0, y = 0, z = 0, seg = 8, opts) {
  const m = mesh(G(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), color, opts);
  m.position.set(x, y, z);
  return m;
}

const FONT = '900 %dpx "Arial Rounded MT Bold", "Trebuchet MS", "Verdana", sans-serif';

export function textTexture(lines, { w = 512, h = 256, bg = '#ffffff', fg = '#222222', size = 80, border = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border; g.lineWidth = 16;
    g.strokeRect(8, 8, w - 16, h - 16);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines = [].concat(lines);
  lines.forEach((line, i) => {
    const text = typeof line === 'string' ? line : line.text;
    const s = (line.size || size);
    g.font = FONT.replace('%d', s);
    g.fillStyle = line.color || fg;
    g.fillText(text, w / 2, h * (i + 1) / (lines.length + 1) + (line.dy || 0), w - 40);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function sign(lines, w, h, opts) {
  const tex = textTexture(lines, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- Steve

export function makeSteve() {
  const fur = 0x8f96a0, dark = 0x33363d, light = 0xe4e7ea, pink = 0xf2a0b5;
  const g = new THREE.Group();

  // Hi-vis vest: safety first, snacks second.
  g.add(cyl(0.48, 0.62, 0.9, 0xff7a1a, 0, 0.45, 0));
  g.add(cyl(0.535, 0.6, 0.14, 0xfff06a, 0, 0.52, 0));

  const head = new THREE.Group();
  head.position.set(0, 1.32, 0);
  const skull = ball(0.62, fur);
  skull.scale.set(1.2, 0.95, 1);
  head.add(skull);

  for (const s of [-1, 1]) {
    // cheek fluff
    const cheek = cone(0.26, 0.5, light, s * 0.74, -0.14, 0.08, 6);
    cheek.rotation.z = -s * Math.PI / 2;
    head.add(cheek);
    // bandit mask
    const mask = ball(0.25, dark, s * 0.28, 0.05, 0.47);
    mask.scale.set(1.3, 0.85, 0.5);
    mask.rotation.z = s * 0.25;
    head.add(mask);
    // brows
    const brow = ball(0.2, light, s * 0.28, 0.3, 0.42);
    brow.scale.set(1.2, 0.45, 0.5);
    head.add(brow);
    // eyes
    head.add(ball(0.12, 0xffffff, s * 0.26, 0.07, 0.56, { flatShading: false, roughness: 0.3 }));
    head.add(ball(0.065, 0x111111, s * 0.25, 0.07, 0.66, { flatShading: false, roughness: 0.2 }));
    // ears
    const ear = new THREE.Group();
    ear.position.set(s * 0.5, 0.48, 0);
    ear.add(cone(0.24, 0.46, fur, 0, 0.2, 0, 6));
    ear.add(cone(0.14, 0.3, pink, 0, 0.17, 0.08, 6));
    ear.rotation.z = -s * 0.3;
    head.add(ear);
    head.userData[s < 0 ? 'earR' : 'earL'] = ear;
  }
  const muzzle = ball(0.3, light, 0, -0.18, 0.47);
  muzzle.scale.set(1.15, 0.8, 1);
  head.add(muzzle);
  head.add(ball(0.11, 0x15161a, 0, -0.1, 0.78, { flatShading: false, roughness: 0.3 }));
  // forehead stripe
  const stripe = ball(0.14, dark, 0, 0.36, 0.42);
  stripe.scale.set(0.6, 1.3, 0.6);
  head.add(stripe);
  g.add(head);

  // little arms resting on the sunroof edge
  for (const s of [-1, 1]) {
    const arm = cyl(0.13, 0.13, 0.7, fur, s * 0.55, 0.42, 0.35, 6);
    arm.rotation.x = 1.1;
    arm.rotation.z = -s * 0.3;
    g.add(arm);
    g.add(ball(0.16, dark, s * 0.62, 0.22, 0.66));
  }

  g.userData.head = head;
  return g;
}

export function makeTail() {
  const g = new THREE.Group();
  let parent = g;
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0 : 0.34;
    const r = 0.2 + Math.sin((i / 6) * Math.PI) * 0.2;
    const b = ball(0.4, i % 2 ? 0x33363d : 0x9aa1ab);
    b.scale.set(r / 0.4 * 1.2, 0.55, r / 0.4 * 1.2);
    seg.add(b);
    parent.add(seg);
    parent = seg;
    segs.push(seg);
  }
  g.userData.segs = segs;
  return g;
}

// ---------------------------------------------------------------- Truck

export function makeTruck() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const CAB = 0xffc94a, HOP = 0x3fc6a0, HOPD = 0x2a9c7c, GREY = 0x555a66, GLASS = 0x8fd6ff;

  body.add(box(2.8, 0.5, 7.4, 0x3a3d45, 0, 0.95, 0));

  // cab
  body.add(box(3.0, 2.2, 2.3, CAB, 0, 2.3, 2.45));
  body.add(box(2.7, 0.95, 0.12, GLASS, 0, 2.75, 3.6, { roughness: 0.2, flatShading: false }));
  for (const s of [-1, 1]) {
    body.add(box(0.12, 0.85, 1.3, GLASS, s * 1.5, 2.8, 2.5, { roughness: 0.2 }));
    // big friendly headlights
    body.add(ball(0.3, 0xfff6c9, s * 0.95, 1.65, 3.58, { emissive: 0xffe9a0, emissiveIntensity: 0.7, flatShading: false }));
    // mirrors
    body.add(box(0.5, 0.12, 0.12, GREY, s * 1.75, 3.0, 3.4));
    body.add(box(0.12, 0.5, 0.3, GREY, s * 2.0, 3.0, 3.4));
    // tail lights
    body.add(box(0.4, 0.4, 0.1, 0xff4a4a, s * 1.2, 1.5, -3.76, { emissive: 0xff2222, emissiveIntensity: 0.4 }));
  }
  // smile grille
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.09, 6, 12, Math.PI), M(0x3a3d45));
  smile.position.set(0, 1.75, 3.62);
  smile.rotation.z = Math.PI;
  body.add(smile);
  body.add(box(3.3, 0.45, 0.45, GREY, 0, 1.0, 3.7));
  // sunroof rim
  body.add(box(1.7, 0.12, 1.5, 0xe0a52c, 0, 3.44, 2.4));

  // hopper
  body.add(box(3.1, 2.9, 4.9, HOP, 0, 2.65, -1.3));
  body.add(box(3.2, 0.3, 5.0, HOPD, 0, 4.1, -1.3));
  body.add(box(2.6, 0.1, 4.3, 0x1f2a2a, 0, 4.22, -1.3));
  body.add(box(3.2, 0.35, 5.0, 0xffffff, 0, 1.75, -1.3));
  const gate = box(3.0, 2.6, 0.4, HOPD, 0, 2.6, -3.75);
  gate.rotation.x = 0.18;
  body.add(gate);

  for (const s of [-1, 1]) {
    const sg = sign(
      [{ text: "STEVE'S", size: 110, color: '#1d7a5f' }, { text: 'TRASH & TREASURE', size: 54, color: '#e2543d' }],
      4.2, 1.5, { w: 512, h: 192, bg: '#fffbe9', border: '#1d7a5f' });
    sg.position.set(s * 1.56, 3.0, -1.3);
    sg.rotation.y = s * Math.PI / 2;
    body.add(sg);
  }
  const plate = sign('TR4SH PNDA', 1.3, 0.4, { w: 256, h: 80, bg: '#ffffff', fg: '#27408b', size: 44, border: '#27408b' });
  plate.position.set(0, 1.0, -3.74);
  plate.rotation.y = Math.PI;
  body.add(plate);

  // trash heap that rises as the truck fills
  const heap = new THREE.Group();
  heap.position.set(0, 4.2, -1.3);
  const heapColors = [0x2d2f36, 0x5a6b3a, 0xc9b58a, 0x2d2f36, 0x7b8a99, 0xd96c4a, 0x2d2f36];
  heapColors.forEach((c, i) => {
    const b = ball(0.55 + (i % 3) * 0.12, c, ((i * 37) % 10 - 5) * 0.18, 0.35 + (i % 2) * 0.25, ((i * 53) % 10 - 5) * 0.32);
    heap.add(b);
  });
  heap.scale.set(1, 0.01, 1);
  body.add(heap);

  // wheels
  const wheels = [];
  const wheelGeo = G('wheel', () => new THREE.CylinderGeometry(0.78, 0.78, 0.6, 14).rotateZ(Math.PI / 2));
  const hubGeo = G('hub', () => new THREE.CylinderGeometry(0.35, 0.35, 0.64, 8).rotateZ(Math.PI / 2));
  const steerPivots = [];
  for (const z of [2.5, -1.5, -3.0]) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 1.45, 0.78, z);
      const w = new THREE.Group();
      w.add(mesh(wheelGeo, 0x25262b));
      w.add(mesh(hubGeo, 0xfff3d6));
      const nub = box(0.66, 0.16, 0.16, 0xe2543d, 0, 0.2, 0);
      w.add(nub);
      pivot.add(w);
      body.add(pivot);
      wheels.push(w);
      if (z > 0) steerPivots.push(pivot);
    }
  }

  // exhaust
  body.add(cyl(0.14, 0.14, 1.6, GREY, -1.25, 4.3, 1.15, 8));

  // Steve, poking out of the sunroof like a tiny furry tank commander
  const steve = makeSteve();
  steve.scale.setScalar(1.3);
  steve.position.set(0, 3.3, 2.4);
  body.add(steve);

  const tail = makeTail();
  tail.position.set(1.5, 2.7, 2.2);
  tail.rotation.z = -0.75;
  tail.scale.setScalar(1.4);
  body.add(tail);

  return { group, body, wheels, steerPivots, steve, head: steve.userData.head, tail, heap };
}

// ---------------------------------------------------------------- Bins

export function makeBin(type) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  let lid, trash, eyes = [];
  const eye = (x, y, z, r) => {
    const e = new THREE.Group();
    e.position.set(x, y, z);
    e.add(ball(r, 0xffffff, 0, 0, 0, { flatShading: false, roughness: 0.3 }));
    e.add(ball(r * 0.5, 0x111111, 0, 0, r * 0.68, { flatShading: false, roughness: 0.2 }));
    inner.add(e);
    eyes.push(e);
  };

  if (type === 'dumpster') {
    inner.add(box(3.4, 1.7, 2.0, 0x4a78d6, 0, 1.05, 0));
    inner.add(box(3.6, 0.2, 2.2, 0x345bb0, 0, 1.95, 0));
    for (const s of [-1, 1]) inner.add(box(0.3, 0.3, 0.5, 0x25262b, s * 1.3, 0.15, 0));
    lid = new THREE.Group();
    lid.position.set(0, 2.05, -1.1);
    lid.add(box(3.6, 0.14, 2.2, 0x2b4c96, 0, 0, 1.1));
    trash = new THREE.Group();
    trash.add(ball(0.6, 0x2d2f36, -0.8, 2.1, 0.1), ball(0.55, 0x2d2f36, 0.7, 2.15, -0.2), box(0.9, 0.2, 0.9, 0xd9b77e, 0, 2.2, 0.3));
    eye(-0.6, 1.25, 1.0, 0.3); eye(0.6, 1.25, 1.0, 0.3);
  } else {
    const col = type === 'recycle' ? 0x4aa3f0 : 0x5dbb4f;
    const dk = type === 'recycle' ? 0x2f7fc8 : 0x3f9636;
    inner.add(cyl(0.75, 0.58, 1.6, col, 0, 0.95, 0, 8));
    for (const s of [-1, 1]) {
      const w = cyl(0.2, 0.2, 0.15, 0x25262b, s * 0.5, 0.2, -0.45, 8);
      w.rotation.z = Math.PI / 2;
      inner.add(w);
    }
    lid = new THREE.Group();
    lid.position.set(0, 1.78, -0.75);
    lid.add(cyl(0.82, 0.82, 0.14, dk, 0, 0, 0.75, 8));
    trash = new THREE.Group();
    trash.add(ball(0.5, 0x2d2f36, 0.05, 1.85, 0));
    trash.add(box(0.4, 0.5, 0.1, type === 'recycle' ? 0xf5f1e3 : 0xd9b77e, -0.3, 1.95, 0.2));
    eye(-0.27, 1.2, 0.62, 0.2); eye(0.27, 1.2, 0.62, 0.2);
  }
  inner.add(lid, trash);
  g.userData = { lid, trash, eyes, inner };
  return g;
}

export function makeBag() {
  const g = new THREE.Group();
  const b = ball(0.6, 0x2d2f36);
  b.scale.set(1, 0.85, 1);
  b.position.y = 0.5;
  g.add(b);
  g.add(cone(0.2, 0.35, 0x2d2f36, 0, 1.1, 0, 5));
  g.add(box(0.3, 0.06, 0.06, 0xffd34d, 0, 0.98, 0));
  return g;
}

export function makePizza() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(box(1.8, 0.22, 1.8, 0xe8c58c, 0, 0, 0));
  inner.add(cyl(0.7, 0.7, 0.06, 0xf7d154, 0, 0.14, 0, 12));
  for (const [x, z] of [[0.3, 0.2], [-0.3, 0.1], [0, -0.35]]) inner.add(cyl(0.15, 0.15, 0.05, 0xd8402f, x, 0.18, z, 8));
  inner.rotation.x = 0.5;
  inner.position.y = 1.6;
  g.add(inner);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 6, 20), M(0xffe066, { emissive: 0xffc400, emissiveIntensity: 0.9 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  g.userData.inner = inner;
  return g;
}

// ---------------------------------------------------------------- Town bits

const roofGeo = () => G('roof', () => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4));
const WALLS = [0xffd6a5, 0xfdffb6, 0xcaffbf, 0x9bf6ff, 0xa0c4ff, 0xbdb2ff, 0xffc6ff, 0xffadad, 0xfff1e6];
const ROOFS = [0xd8574a, 0x7a5ea8, 0x3f7fb5, 0xb5653a, 0x4b9a78, 0x5c6470];

export function makeHouse(rng, w, d, h) {
  const g = new THREE.Group();
  const wall = WALLS[Math.floor(rng() * WALLS.length)];
  const roofC = ROOFS[Math.floor(rng() * ROOFS.length)];
  g.add(box(w, h, d, wall, 0, h / 2 + 0.3, 0));
  const roofH = 2.6 + rng() * 1.2;
  const roof = mesh(roofGeo(), roofC);
  roof.scale.set(w / Math.SQRT2 * 1.15, roofH, d / Math.SQRT2 * 1.15);
  roof.position.y = h + 0.3 + roofH / 2;
  g.add(roof);
  // door + step
  const doorX = (rng() - 0.5) * (w - 6);
  g.add(box(1.3, 2.3, 0.15, roofC, doorX, 1.45, d / 2 + 0.05));
  g.add(ball(0.09, 0xffe066, doorX + 0.4, 1.4, d / 2 + 0.15));
  g.add(box(1.9, 0.2, 0.9, 0xcfc8b8, doorX, 0.4, d / 2 + 0.45));
  // windows
  for (const s of [-1, 1]) {
    const wx = doorX + s * 2.9;
    if (Math.abs(wx) > w / 2 - 1) continue;
    g.add(box(1.5, 1.4, 0.12, 0xfff6c2, wx, 2.6, d / 2 + 0.03, { emissive: 0xffe9a0, emissiveIntensity: 0.25 }));
    g.add(box(1.8, 0.16, 0.3, 0xffffff, wx, 1.82, d / 2 + 0.1));
  }
  g.add(box(0.9, 2.2, 0.9, 0xb5653a, w * 0.28, h + roofH * 0.55, -d * 0.15));
  return g;
}

export function makeTree(rng, s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.45, 2.4, 0x8a5a3a, 0, 1.2, 0, 6));
  const greens = [0x4fae5a, 0x63c26a, 0x3f9a55, 0x7fce6e];
  const c = greens[Math.floor(rng() * greens.length)];
  if (rng() < 0.3) {
    g.add(cone(1.9, 2.6, c, 0, 3.2, 0, 7), cone(1.5, 2.2, c, 0, 4.6, 0, 7), cone(1.0, 1.8, c, 0, 5.8, 0, 7));
  } else {
    const m = (r, x, y, z) => { const b = mesh(G(`leaf${r}`, () => new THREE.IcosahedronGeometry(r, 1)), c); b.position.set(x, y, z); return b; };
    g.add(m(1.9, 0, 3.6, 0), m(1.3, 1.1, 3.0, 0.4), m(1.2, -0.9, 3.2, -0.6));
  }
  g.scale.setScalar(s);
  g.rotation.y = rng() * 6.28;
  return g;
}

export function makeMailbox() {
  const g = new THREE.Group();
  g.add(box(0.16, 1.3, 0.16, 0x9a6b45, 0, 0.65, 0));
  g.add(box(0.5, 0.45, 0.85, 0x5b8def, 0, 1.45, 0));
  g.add(box(0.06, 0.4, 0.1, 0xe2543d, 0.29, 1.65, 0.2));
  return g;
}

export function makeFlamingo() {
  const g = new THREE.Group();
  const pink = 0xff7eb6;
  g.add(cyl(0.04, 0.04, 1.1, 0x33363d, 0, 0.55, 0, 5));
  const b = ball(0.4, pink, 0, 1.25, 0);
  b.scale.set(0.8, 0.75, 1.2);
  g.add(b);
  const n1 = cyl(0.08, 0.1, 0.8, pink, 0, 1.7, 0.42, 6); n1.rotation.x = 0.35;
  g.add(n1);
  g.add(ball(0.16, pink, 0, 2.1, 0.6));
  const beak = cone(0.08, 0.3, 0x33363d, 0, 2.03, 0.8, 5); beak.rotation.x = 2.0;
  g.add(beak);
  return g;
}

export function makeGnome() {
  const g = new THREE.Group();
  g.add(cyl(0.28, 0.34, 0.6, 0x4a78d6, 0, 0.3, 0, 8));
  g.add(ball(0.26, 0xffd2b0, 0, 0.75, 0));
  const beard = cone(0.24, 0.45, 0xffffff, 0, 0.55, 0.16, 6); beard.rotation.x = Math.PI;
  g.add(beard);
  g.add(cone(0.3, 0.75, 0xe2543d, 0, 1.25, 0, 8));
  return g;
}

export function makeHydrant() {
  const g = new THREE.Group();
  g.add(cyl(0.3, 0.36, 0.9, 0xe2543d, 0, 0.45, 0, 8));
  g.add(ball(0.32, 0xe2543d, 0, 0.92, 0));
  g.add(cyl(0.1, 0.1, 0.2, 0xffd34d, 0, 1.28, 0, 6));
  const side = cyl(0.13, 0.13, 0.9, 0xffd34d, 0, 0.6, 0, 6); side.rotation.z = Math.PI / 2;
  g.add(side);
  return g;
}

export function makeBench() {
  const g = new THREE.Group();
  g.add(box(2.6, 0.15, 0.8, 0xb5793f, 0, 0.7, 0), box(2.6, 0.7, 0.12, 0xb5793f, 0, 1.2, -0.38));
  for (const s of [-1, 1]) g.add(box(0.15, 0.7, 0.7, 0x555a66, s * 1.1, 0.35, 0));
  return g;
}

export function makeGoose() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const white = 0xfdfdf8, orange = 0xff9a2e;
  const b = ball(0.7, white, 0, 1.15, 0);
  b.scale.set(0.9, 0.85, 1.4);
  inner.add(b);
  const tail = cone(0.35, 0.7, white, 0, 1.4, -1.0, 5); tail.rotation.x = -1.1;
  inner.add(tail);
  const neck = new THREE.Group();
  neck.position.set(0, 1.4, 0.65);
  neck.add(cyl(0.17, 0.22, 1.4, white, 0, 0.6, 0, 7));
  neck.add(ball(0.27, white, 0, 1.35, 0.05));
  const beak = cone(0.14, 0.5, orange, 0, 1.32, 0.45, 5); beak.rotation.x = Math.PI / 2;
  neck.add(beak);
  for (const s of [-1, 1]) {
    neck.add(ball(0.055, 0x111111, s * 0.2, 1.42, 0.17));
    // angry little eyebrows
    const brow = box(0.2, 0.05, 0.05, 0x111111, s * 0.17, 1.53, 0.2); brow.rotation.z = s * 0.5;
    neck.add(brow);
  }
  neck.rotation.x = 0.15;
  inner.add(neck);
  const feet = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.3, 0.6, 0);
    leg.add(cyl(0.06, 0.06, 0.6, orange, 0, -0.3, 0, 5));
    leg.add(box(0.34, 0.07, 0.5, orange, 0, -0.57, 0.14));
    inner.add(leg);
    feet.push(leg);
    const wing = ball(0.5, 0xeeeee6, s * 0.6, 1.2, -0.1);
    wing.scale.set(0.3, 0.7, 1.2);
    inner.add(wing);
  }
  g.userData = { inner, neck, feet };
  return g;
}

export function makeGull() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.25, 0.9, 0xffffff));
  const wings = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.add(box(1.3, 0.06, 0.45, 0xf2f2f2, s * 0.65, 0, 0));
    g.add(p);
    wings.push(p);
  }
  g.userData.wings = wings;
  return g;
}

export function makeCloud(rng) {
  const g = new THREE.Group();
  const mat = M(0xffffff, { flatShading: true, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(G('cloud', () => new THREE.IcosahedronGeometry(1, 1)), mat);
    const r = 5 + rng() * 5;
    m.scale.set(r, r * 0.6, r * 0.8);
    m.position.set((i - 2) * 6 + rng() * 2, rng() * 2, rng() * 4);
    g.add(m);
  }
  return g;
}

export function makeArrow() {
  const g = new THREE.Group();
  const mat = M(0xff5a3c, { emissive: 0xff3c1a, emissiveIntensity: 0.6 });
  const tip = cone(0.7, 1.3, mat, 0, 0, 1.2, 4);
  tip.rotation.x = Math.PI / 2;
  g.add(tip, box(0.5, 0.3, 1.4, mat, 0, 0, 0));
  g.traverse(o => { o.castShadow = false; });
  return g;
}
