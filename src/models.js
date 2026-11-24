// Procedural low-poly models. Everything is built from primitives so the
// game needs no external assets.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const gradient = (() => {
  const data = new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const matCache = new Map();

/** Shared cel-shaded material for a color. */
export function toon(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }));
  }
  return matCache.get(key);
}

export function glow(color, intensity = 1) {
  return toon(color, { emissive: color, emissiveIntensity: intensity });
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function shadowy(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || toon(color));
  m.position.set(x, y, z);
  return shadowy(m);
}

export function sphere(r, color, x = 0, y = 0, z = 0, seg = 14, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), mat || toon(color));
  m.position.set(x, y, z);
  return shadowy(m);
}

export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 14, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat || toon(color));
  m.position.set(x, y, z);
  return shadowy(m);
}

function cone(r, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), toon(color));
  m.position.set(x, y, z);
  return shadowy(m);
}

function textTexture(lines, { w = 512, h = 256, bg = null, color = '#fff', font = 'bold 64px sans-serif', stroke = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font;
  const lh = h / (lines.length + 0.5);
  lines.forEach((line, i) => {
    const y = lh * (i + 0.75);
    if (stroke) {
      g.lineWidth = 12;
      g.strokeStyle = stroke;
      g.strokeText(line, w / 2, y);
    }
    g.fillStyle = color;
    g.fillText(line, w / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Steve the raccoon
// ---------------------------------------------------------------------------

const FUR = 0x8b9096;
const FUR_DARK = 0x3a3d42;
const CREAM = 0xf4efe6;

/**
 * Builds Steve. Returns { group, head, tail: [segments], armL, armR, eyes }.
 * Origin is at Steve's seat; he faces +z.
 */
export function makeRaccoon() {
  const group = new THREE.Group();

  // Body + safety vest
  const body = sphere(0.5, FUR, 0, 0.45, 0);
  body.scale.set(1, 1.1, 0.9);
  group.add(body);
  const vest = cyl(0.5, 0.55, 0.5, 0xff7a1a, 0, 0.42, 0);
  vest.scale.set(1, 1, 0.92);
  group.add(vest);
  const stripe = cyl(0.515, 0.535, 0.08, 0xf9f871, 0, 0.42, 0);
  stripe.scale.set(1, 1, 0.92);
  group.add(stripe);
  const belly = sphere(0.33, CREAM, 0, 0.75, 0.3);
  belly.scale.set(1, 0.7, 0.5);
  group.add(belly);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.02);
  group.add(head);
  const skull = sphere(0.46, FUR, 0, 0, 0, 18);
  skull.scale.set(1.08, 0.95, 0.95);
  head.add(skull);
  const cheekL = sphere(0.2, CREAM, 0.3, -0.12, 0.18);
  const cheekR = sphere(0.2, CREAM, -0.3, -0.12, 0.18);
  head.add(cheekL, cheekR);
  const muzzle = sphere(0.22, CREAM, 0, -0.1, 0.38);
  muzzle.scale.set(1, 0.8, 1.1);
  head.add(muzzle);
  head.add(sphere(0.08, 0x1b1b1f, 0, -0.04, 0.62, 10));
  // Bandit mask
  const mask = sphere(0.3, FUR_DARK, 0, 0.06, 0.25, 16);
  mask.scale.set(1.55, 0.42, 0.7);
  head.add(mask);
  const brow = sphere(0.24, CREAM, 0, 0.2, 0.3);
  brow.scale.set(1.5, 0.25, 0.5);
  head.add(brow);
  // Eyes (big and shiny)
  const eyes = [];
  for (const side of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(0.17 * side, 0.07, 0.44);
    eye.add(sphere(0.095, 0xffffff, 0, 0, 0, 12));
    eye.add(sphere(0.065, 0x111111, 0, 0, 0.045, 10));
    eye.add(sphere(0.022, 0xffffff, 0.02 * side, 0.03, 0.1, 6));
    head.add(eye);
    eyes.push(eye);
    // Ears
    const ear = cone(0.16, 0.3, FUR, 0.3 * side, 0.4, -0.02, 8);
    ear.rotation.z = -0.35 * side;
    head.add(ear);
    const earIn = cone(0.09, 0.18, FUR_DARK, 0.3 * side, 0.38, 0.06, 8);
    earIn.rotation.z = -0.35 * side;
    head.add(earIn);
  }
  // Tiny hard hat, because safety first
  const hat = sphere(0.36, 0xffd23f, 0, 0.3, -0.02, 16);
  hat.scale.set(1, 0.55, 1);
  head.add(hat);
  const brim = cyl(0.44, 0.44, 0.04, 0xffd23f, 0, 0.27, 0.05, 18);
  head.add(brim);

  // Arms (reach forward for the wheel)
  const arms = [];
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.42 * side, 0.75, 0.1);
    const upper = cyl(0.1, 0.09, 0.5, FUR, 0, -0.2, 0);
    arm.add(upper);
    const paw = sphere(0.11, FUR_DARK, 0, -0.45, 0);
    arm.add(paw);
    arm.rotation.x = -1.1;
    group.add(arm);
    arms.push(arm);
  }

  // Ringed tail: a chain of segments that gets animated
  const tail = [];
  let parent = group;
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0.25, -0.4);
  group.add(tailRoot);
  parent = tailRoot;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    const r = 0.24 - i * 0.008;
    const piece = sphere(r, i % 2 ? FUR : FUR_DARK, 0, 0, -0.12, 10);
    piece.scale.set(1, 1, 1.25);
    seg.add(piece);
    seg.position.z = i === 0 ? 0 : -0.24;
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }
  // tip
  parent.add(sphere(0.17, FUR_DARK, 0, 0, -0.3, 10));

  return { group, head, tail, arms, eyes };
}

// ---------------------------------------------------------------------------
// The trash truck
// ---------------------------------------------------------------------------

const TRUCK_GREEN = 0x3fb26b;
const TRUCK_WHITE = 0xf4f4ef;
const DARK = 0x2b2d33;

/**
 * Returns { group (moves with physics), body (bounces / squashes), wheels,
 * frontWheels, arm, beacon, steve, hopperLocal }.
 * Faces +z. Right side is -x.
 */
export function makeTruck() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Chassis
  body.add(box(2.4, 0.5, 7.2, DARK, 0, 0.95, 0));
  // Bumpers
  body.add(box(2.9, 0.45, 0.35, 0xc9ccd3, 0, 0.95, 3.75));
  body.add(box(2.9, 0.45, 0.35, 0xc9ccd3, 0, 0.95, -3.7));

  // --- Cab (open-top-ish: Steve pokes out of a big sunroof) ---
  const cabZ = 2.45;
  body.add(box(2.7, 0.9, 1.9, TRUCK_WHITE, 0, 1.6, cabZ)); // lower cab
  body.add(box(2.72, 0.12, 1.92, TRUCK_GREEN, 0, 2.08, cabZ)); // stripe
  // Pillars
  for (const sx of [1.28, -1.28]) {
    body.add(box(0.14, 1.0, 0.14, TRUCK_WHITE, sx, 2.6, cabZ + 0.9));
    body.add(box(0.14, 1.0, 0.14, TRUCK_WHITE, sx, 2.6, cabZ - 0.9));
  }
  // Roof ring (sunroof hole in the middle)
  body.add(box(2.7, 0.16, 0.45, TRUCK_WHITE, 0, 3.15, cabZ + 0.75));
  body.add(box(2.7, 0.16, 0.35, TRUCK_WHITE, 0, 3.15, cabZ - 0.8));
  body.add(box(0.5, 0.16, 1.9, TRUCK_WHITE, 1.1, 3.15, cabZ));
  body.add(box(0.5, 0.16, 1.9, TRUCK_WHITE, -1.1, 3.15, cabZ));
  // Windshield
  const glass = new THREE.MeshToonMaterial({
    color: 0xaee6ff,
    gradientMap: gradient,
    transparent: true,
    opacity: 0.35,
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 1.0), glass);
  ws.position.set(0, 2.6, cabZ + 0.93);
  body.add(ws);
  // Hood/grille
  body.add(box(2.5, 0.7, 0.6, TRUCK_WHITE, 0, 1.45, 3.55));
  const grille = box(1.6, 0.45, 0.05, 0x55585f, 0, 1.45, 3.86);
  body.add(grille);
  for (const sx of [0.95, -0.95]) {
    const hl = box(0.4, 0.3, 0.08, 0, sx, 1.5, 3.86, glow(0xfff4c2, 0.8));
    body.add(hl);
  }
  // Cute headlight "eyebrows"
  for (const sx of [0.95, -0.95]) body.add(box(0.5, 0.08, 0.1, DARK, sx, 1.72, 3.86));
  // Steering wheel
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), toon(DARK));
  wheel.position.set(0.2, 2.35, cabZ + 0.6);
  wheel.rotation.x = -0.9;
  body.add(wheel);

  // Beacon
  const beaconMat = new THREE.MeshToonMaterial({ color: 0xffa31a, emissive: 0xff8c00, emissiveIntensity: 1, gradientMap: gradient });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 10), beaconMat);
  beacon.position.set(-0.9, 3.38, cabZ - 0.8);
  body.add(beacon);

  // Exhaust stack
  body.add(cyl(0.12, 0.12, 2.2, 0x9aa0a8, 1.25, 2.6, cabZ - 1.15, 8));
  body.add(cyl(0.16, 0.12, 0.2, 0x55585f, 1.25, 3.75, cabZ - 1.15, 8));

  // --- Compactor body ---
  const compZ = -1.25;
  const comp = box(2.9, 1.9, 4.4, TRUCK_GREEN, 0, 2.15, compZ);
  body.add(comp);
  // Rounded top
  const roundTop = cyl(1.45, 1.45, 4.4, TRUCK_GREEN, 0, 3.1, compZ, 18);
  roundTop.rotation.x = Math.PI / 2;
  roundTop.scale.set(1, 1, 0.28);
  body.add(roundTop);
  body.add(box(2.95, 0.25, 4.45, 0xf9d849, 0, 1.6, compZ)); // yellow stripe
  // Rear hopper (open, dark mouth)
  body.add(box(2.7, 1.4, 0.6, 0x2f8f55, 0, 2.2, -3.65));
  body.add(box(2.1, 0.9, 0.62, 0x1a1c20, 0, 2.55, -3.66));
  // Rear lights
  for (const sx of [1.2, -1.2]) body.add(box(0.25, 0.3, 0.1, 0, sx, 1.2, -3.9, glow(0xff3b3b, 0.6)));

  // Logo decal on both sides
  const logoTex = textTexture(["STEVE'S", 'TRASH CO.'], {
    font: 'bold 92px "Trebuchet MS", sans-serif',
    color: '#fff9e6',
    stroke: '#1d5e37',
  });
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true });
  for (const side of [1, -1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.6), logoMat);
    logo.position.set(1.47 * side, 2.3, compZ);
    logo.rotation.y = (Math.PI / 2) * side;
    body.add(logo);
  }

  // Grabber arm (right side = -x)
  const arm = new THREE.Group();
  arm.position.set(-1.55, 1.9, 0.3);
  const armUpper = new THREE.Group();
  arm.add(armUpper);
  armUpper.add(box(0.25, 0.25, 1.6, 0xffc93c, 0, 0, -0.6));
  const elbow = new THREE.Group();
  elbow.position.set(0, 0, -1.4);
  armUpper.add(elbow);
  elbow.add(box(0.22, 1.2, 0.22, 0xffc93c, 0, -0.55, 0));
  const claw = new THREE.Group();
  claw.position.set(0, -1.15, 0);
  elbow.add(claw);
  claw.add(box(0.15, 0.15, 0.9, 0x55585f, -0.25, 0, 0));
  claw.add(box(0.5, 0.15, 0.15, 0x55585f, -0.1, 0, 0.4));
  claw.add(box(0.5, 0.15, 0.15, 0x55585f, -0.1, 0, -0.4));
  body.add(arm);

  // Wheels
  const wheels = [];
  const frontWheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.52, 8);
  hubGeo.rotateZ(Math.PI / 2);
  for (const [z, front] of [[2.4, true], [-1.6, false], [-2.9, false]]) {
    for (const sx of [1.3, -1.3]) {
      const steer = new THREE.Group();
      steer.position.set(sx, 0.62, z);
      const spin = new THREE.Group();
      spin.add(shadowy(new THREE.Mesh(wheelGeo, toon(0x222222))));
      spin.add(shadowy(new THREE.Mesh(hubGeo, toon(0xd8dbe0))));
      // a spoke so you can see it spin
      spin.add(box(0.53, 0.12, 0.5, 0x888888));
      steer.add(spin);
      group.add(steer);
      wheels.push(spin);
      if (front) frontWheels.push(steer);
    }
  }

  // Steve rides in the cab with his head out the sunroof
  const steve = makeRaccoon();
  steve.group.position.set(0.2, 2.35, cabZ - 0.05);
  steve.group.scale.setScalar(1.3);
  body.add(steve.group);
  // Steve's tail dangles out the left window
  steve.tail[0].parent.position.set(0.4, 0.15, -0.1);
  steve.tail[0].parent.rotation.set(0.0, -1.7, -0.75, 'ZYX');

  // A tiny air freshener shaped like a pine tree (ironic)
  const fresh = cone(0.08, 0.2, 0x2ecc71, 0, 2.85, cabZ + 0.75, 6);
  body.add(fresh);

  const hopperLocal = new THREE.Vector3(0, 4.0, -3.4);

  return { group, body, wheels, frontWheels, arm, armUpper, elbow, beacon, beaconMat, steve, hopperLocal };
}

// ---------------------------------------------------------------------------
// Neighborhood stuff
// ---------------------------------------------------------------------------

const HOUSE_COLORS = [0xffb3c1, 0xa7d8ff, 0xfff1a8, 0xc5f0c0, 0xe3c8ff, 0xffd3a5, 0xb8f2e6, 0xf7c6d9];
const ROOF_COLORS = [0xd9534f, 0x6c5ce7, 0x3d7ea6, 0x8e5b3d, 0x2d936c, 0xe17055];

function gableRoof(w, h, d, color) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return shadowy(new THREE.Mesh(geo, toon(color)));
}

/** A cute house facing +z, centered on origin. */
export function makeHouse(rand) {
  const g = new THREE.Group();
  const w = 8 + rand() * 2;
  const d = 6.5 + rand() * 1;
  const h = 3.6 + rand() * 1.2;
  const col = HOUSE_COLORS[(rand() * HOUSE_COLORS.length) | 0];
  const roofCol = ROOF_COLORS[(rand() * ROOF_COLORS.length) | 0];
  g.add(box(w, h, d, col, 0, h / 2, 0));
  const roof = gableRoof(w + 0.8, 2.4 + rand(), d + 0.8, roofCol);
  roof.position.y = h;
  g.add(roof);
  // Door
  g.add(box(1.2, 2.1, 0.15, 0x8e5b3d, 0, 1.05, d / 2 + 0.05));
  g.add(sphere(0.08, 0xffd23f, 0.4, 1.0, d / 2 + 0.15, 6));
  // Windows
  const winMat = glow(0xcfefff, 0.25);
  for (const sx of [-w / 3.2, w / 3.2]) {
    g.add(box(1.5, 1.2, 0.12, 0xffffff, sx, h * 0.55, d / 2 + 0.03));
    g.add(box(1.25, 0.95, 0.14, 0, sx, h * 0.55, d / 2 + 0.05, winMat));
    // flower box
    g.add(box(1.5, 0.25, 0.3, 0x8e5b3d, sx, h * 0.55 - 0.72, d / 2 + 0.15));
    for (let i = 0; i < 3; i++) {
      const fc = [0xff6b9d, 0xffd23f, 0xff8c42][(rand() * 3) | 0];
      g.add(sphere(0.13, fc, sx - 0.5 + i * 0.5, h * 0.55 - 0.52, d / 2 + 0.18, 6));
    }
  }
  // Chimney
  if (rand() < 0.6) g.add(box(0.7, 1.8, 0.7, 0xb55d4c, w / 4, h + 1.4, -d / 6));
  return { group: g, w, d };
}

export function makeTree(rand, scale = 1) {
  const g = new THREE.Group();
  const trunkH = 1.6 + rand();
  g.add(cyl(0.22, 0.32, trunkH, 0x8e5b3d, 0, trunkH / 2, 0, 7));
  const greens = [0x5cc96b, 0x48b85a, 0x7bd67a, 0x3fa65a];
  const n = 2 + ((rand() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const r = 1.3 - i * 0.25 + rand() * 0.3;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(greens[(rand() * greens.length) | 0]));
    m.position.set((rand() - 0.5) * 0.6, trunkH + 0.4 + i * 0.95, (rand() - 0.5) * 0.6);
    m.rotation.set(rand() * 3, rand() * 3, 0);
    g.add(shadowy(m));
  }
  g.scale.setScalar(scale);
  return g;
}

export function makeBush(rand) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + rand() * 0.3, 0), toon(0x4fbf63));
    m.position.set((i - 1) * 0.6, 0.45, (rand() - 0.5) * 0.3);
    g.add(shadowy(m));
  }
  return g;
}

/** Trash can. Returns { group, lid, glowRing }. */
export function makeTrashCan(golden = false) {
  const g = new THREE.Group();
  const col = golden ? 0xffd23f : 0x4a6fa5;
  const can = cyl(0.55, 0.45, 1.3, col, 0, 0.65, 0, 12);
  g.add(can);
  for (const y of [0.35, 0.95]) g.add(cyl(0.57, 0.57, 0.08, golden ? 0xffb300 : 0x3a5a88, 0, y, 0, 12));
  const lid = new THREE.Group();
  lid.position.set(0, 1.32, 0);
  lid.add(cyl(0.62, 0.6, 0.12, golden ? 0xffb300 : 0x3a5a88, 0, 0, 0, 12));
  lid.add(box(0.4, 0.1, 0.12, 0x222222, 0, 0.1, 0));
  g.add(lid);
  // Bulging trash peeking out
  g.add(sphere(0.3, 0x2b2b2b, 0.15, 1.3, 0.1, 8));
  g.add(sphere(0.18, 0x8fd16a, -0.2, 1.33, -0.05, 6));
  return { group: g, lid };
}

/** Floating marker above an active can. */
export function makeMarker(golden = false) {
  const g = new THREE.Group();
  const col = golden ? 0xffd23f : 0x7cf3a0;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.8, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 4), glow(col, 0.6));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 3;
  g.add(arrow);
  return { group: g, ring, arrow };
}

export function makeMailbox(rand) {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.08, 1.1, 0x8e5b3d, 0, 0.55, 0, 6));
  const col = [0x4a6fa5, 0xd9534f, 0x2d936c, 0x333333][(rand() * 4) | 0];
  g.add(box(0.45, 0.45, 0.8, col, 0, 1.25, 0));
  const top = cyl(0.225, 0.225, 0.8, col, 0, 1.47, 0, 10);
  top.rotation.x = Math.PI / 2;
  g.add(top);
  g.add(box(0.05, 0.35, 0.12, 0xff4444, 0.25, 1.5, -0.2));
  return g;
}

export function makeHydrant() {
  const g = new THREE.Group();
  g.add(cyl(0.28, 0.32, 0.9, 0xe63946, 0, 0.45, 0, 10));
  g.add(sphere(0.3, 0xe63946, 0, 0.95, 0, 10));
  for (const s of [1, -1]) {
    const n = cyl(0.12, 0.12, 0.3, 0xffd23f, 0.3 * s, 0.6, 0, 8);
    n.rotation.z = Math.PI / 2;
    g.add(n);
  }
  g.add(cyl(0.1, 0.12, 0.15, 0xffd23f, 0, 1.25, 0, 8));
  return g;
}

export function makeCone() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.1, 0.8, 0xff7a1a, 0, 0.05, 0));
  g.add(cone(0.32, 1.0, 0xff7a1a, 0, 0.55, 0, 12));
  g.add(cyl(0.2, 0.25, 0.15, 0xffffff, 0, 0.6, 0, 12));
  return g;
}

/** Little cat. Returns { group, tail, body }. */
export function makeCat(rand) {
  const g = new THREE.Group();
  const col = [0xff9f43, 0x2d3436, 0xdfe6e9, 0x9c7a5b][(rand() * 4) | 0];
  const body = new THREE.Group();
  g.add(body);
  const torso = sphere(0.35, col, 0, 0.45, 0, 10);
  torso.scale.set(0.8, 0.8, 1.3);
  body.add(torso);
  const head = sphere(0.3, col, 0, 0.75, 0.45, 10);
  body.add(head);
  for (const s of [1, -1]) {
    const e = cone(0.1, 0.2, col, 0.17 * s, 1.02, 0.45, 4);
    body.add(e);
    body.add(sphere(0.05, 0x111111, 0.11 * s, 0.8, 0.72, 6));
    body.add(sphere(0.1, col, 0.15 * s, 0.12, 0.3, 6));
    body.add(sphere(0.1, col, 0.15 * s, 0.12, -0.3, 6));
  }
  body.add(sphere(0.04, 0xff8fab, 0, 0.72, 0.75, 6));
  const tail = new THREE.Group();
  tail.position.set(0, 0.55, -0.4);
  const t = cyl(0.06, 0.08, 0.8, col, 0, 0.35, 0, 6);
  tail.add(t);
  tail.rotation.x = -0.5;
  body.add(tail);
  return { group: g, tail, body };
}

export function makeSeagull() {
  const g = new THREE.Group();
  const b = sphere(0.35, 0xffffff, 0, 0, 0, 8);
  b.scale.set(0.8, 0.8, 1.6);
  g.add(b);
  g.add(sphere(0.22, 0xffffff, 0, 0.15, 0.5, 8));
  const beak = cone(0.07, 0.3, 0xffb300, 0, 0.12, 0.8, 6);
  beak.rotation.x = Math.PI / 2;
  g.add(beak);
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(0.2 * s, 0.1, 0);
    w.add(box(1.2, 0.06, 0.5, 0xdfe6e9, 0.6 * s, 0, 0));
    w.add(box(0.3, 0.07, 0.5, 0x2d3436, 1.15 * s, 0, 0));
    g.add(w);
    wings.push(w);
  }
  return { group: g, wings };
}

/** Lumpy heap of garbage for the dump. */
export function makeTrashPile(rand, radius = 7) {
  const g = new THREE.Group();
  const cols = [0x6d6d6d, 0x8d6e63, 0x4caf50, 0x3f51b5, 0xb0bec5, 0x795548, 0xff7043, 0x546e7a];
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const h = (1 - r / radius) * 5;
    const s = 0.8 + rand() * 1.6;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), toon(cols[(rand() * cols.length) | 0]));
    m.position.set(Math.cos(a) * r, h * 0.8, Math.sin(a) * r);
    m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    g.add(shadowy(m));
  }
  // A crown jewel: an abandoned couch on top
  const couch = new THREE.Group();
  couch.add(box(2.6, 0.6, 1.1, 0x9b59b6, 0, 0.3, 0));
  couch.add(box(2.6, 0.9, 0.3, 0x8e44ad, 0, 0.75, -0.45));
  couch.add(box(0.3, 0.7, 1.1, 0x8e44ad, 1.3, 0.55, 0));
  couch.add(box(0.3, 0.7, 1.1, 0x8e44ad, -1.3, 0.55, 0));
  couch.position.set(0, 4.6, 0);
  couch.rotation.set(0.2, 0.7, -0.15);
  g.add(couch);
  return g;
}

export function makeSign(lines, bg = '#2d936c', w = 6, h = 2.2) {
  const g = new THREE.Group();
  const tex = textTexture(lines, { bg, color: '#fffbe8', font: 'bold 110px "Trebuchet MS", sans-serif', w: 768, h: 288 });
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), [toon(0x55585f), toon(0x55585f), toon(0x55585f), toon(0x55585f), mat, mat]);
  board.position.y = 3.2;
  board.castShadow = true;
  g.add(board);
  for (const s of [1, -1]) g.add(cyl(0.12, 0.12, 2.6, 0x55585f, (w / 2 - 0.4) * s, 1.1, 0, 6));
  return g;
}

export function makeRamp(w, len, h) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(len, 0);
  s.lineTo(len, h);
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  // Shape is in XY (x = along ramp). Map so the ramp runs along +z.
  geo.translate(0, 0, -w / 2);
  geo.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, toon(0xf9d849));
  shadowy(m);
  const g = new THREE.Group();
  g.add(m);
  // chevrons
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.7) / 3.5;
    const stripe = box(w * 0.9, 0.06, 0.5, 0xe17055, 0, t * h + 0.05, t * len);
    stripe.rotation.x = -Math.atan2(h, len);
    g.add(stripe);
  }
  return g;
}
