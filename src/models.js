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
  // Shrink the font until the widest line fits
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > w * 0.9) {
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
    g.font = font.replace(/\d+(?:\.\d+)?px/, `${Math.floor((size * w * 0.9) / widest)}px`);
  }
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
  // Safety vest: a shell over the torso and shoulders, open down the front,
  // with a reflective band and shoulder straps.
  const shell = (r, phiStart, phiLen, thStart, thLen, color) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 28, 18, phiStart, phiLen, thStart, thLen),
      toon(color, { side: THREE.DoubleSide }),
    );
    m.position.set(0, 0.45, 0);
    m.scale.set(1, 1.1, 0.9);
    m.userData.noOutline = true;
    group.add(shadowy(m));
    return m;
  };
  const GAP = 0.32; // half-width of the open front, in radians
  const FRONT = Math.PI / 2;
  shell(0.53, FRONT + GAP, Math.PI * 2 - GAP * 2, 0.5, 1.78, 0xff7a1a);
  shell(0.537, FRONT + GAP, Math.PI * 2 - GAP * 2, 1.72, 0.2, 0xf9f871); // reflective band
  for (const start of [FRONT + GAP, FRONT - GAP - 0.17, FRONT + Math.PI - 0.42, FRONT + Math.PI + 0.25]) {
    shell(0.537, start, 0.17, 0.5, 1.22, 0xf9f871); // straps over the shoulders
  }
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
  // Fluffy cheek tufts
  for (const side of [1, -1]) {
    const cheek = sphere(0.16, CREAM, 0.33 * side, -0.1, 0.16);
    cheek.scale.set(1.3, 0.85, 0.9);
    cheek.rotation.z = 0.3 * side;
    head.add(cheek);
  }
  const muzzle = sphere(0.19, CREAM, 0, -0.12, 0.4);
  muzzle.scale.set(1.1, 0.78, 1.1);
  head.add(muzzle);
  head.add(sphere(0.075, 0x1b1b1f, 0, -0.06, 0.6, 10));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 4, 12, Math.PI), toon(0x1b1b1f));
  smile.position.set(0, -0.15, 0.585);
  smile.rotation.set(-0.3, 0, Math.PI);
  head.add(smile);
  // Bandit mask
  const mask = sphere(0.3, FUR_DARK, 0, 0.06, 0.25, 16);
  mask.scale.set(1.6, 0.45, 0.75);
  head.add(mask);
  // Little cream eyebrow tufts
  for (const side of [1, -1]) {
    const brow = sphere(0.09, CREAM, 0.17 * side, 0.21, 0.37, 10);
    brow.scale.set(1.6, 0.55, 0.6);
    brow.rotation.z = -0.25 * side;
    head.add(brow);
  }
  // Eyes (big and shiny)
  const eyes = [];
  for (const side of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(0.17 * side, 0.07, 0.44);
    eye.add(sphere(0.095, 0xffffff, 0, 0, 0, 12));
    eye.add(sphere(0.062, 0x111111, 0, 0, 0.045, 12));
    eye.add(sphere(0.024, 0xffffff, 0.022 * side, 0.032, 0.1, 6));
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

  addOutline(group);
  return { group, head, tail, arms, eyes };
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x24262b, side: THREE.BackSide });

/** Cartoon ink outline: inverted-hull copies of round meshes. */
export function addOutline(root, width = 0.022, mat = outlineMat) {
  const targets = [];
  root.traverse((m) => {
    if (!m.isMesh || m.userData.outline || m.userData.noOutline) return;
    const p = m.geometry.parameters || {};
    const r = p.radius ?? p.radiusBottom ?? p.radiusTop;
    if (!r || r < 0.1) return;
    if (!(m.geometry.type === 'SphereGeometry' || m.geometry.type === 'CylinderGeometry' || m.geometry.type === 'ConeGeometry')) return;
    targets.push([m, r]);
  });
  for (const [m, r] of targets) {
    const o = new THREE.Mesh(m.geometry, mat);
    o.userData.outline = true;
    o.scale.setScalar(1 + width / r);
    m.add(o);
  }
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
 * Faces +z. Right side is -x, left (driver) side is +x.
 */
export function makeTruck() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const GREEN_DARK = 0x2f8f55;
  const CHROME = 0xd5d9df;

  // Chassis + bumpers
  body.add(box(2.3, 0.45, 7.0, DARK, 0, 0.95, -0.05));
  body.add(box(2.9, 0.4, 0.3, CHROME, 0, 0.95, 3.78));
  body.add(box(2.9, 0.4, 0.3, CHROME, 0, 0.95, -3.98));
  // Side skirts between the wheels
  for (const sx of [1.22, -1.22]) {
    body.add(box(0.12, 0.35, 2.2, GREEN_DARK, sx, 1.0, 0.25));
  }

  // --- Cab: open doorways on both sides, like a side-loader. Steve drives
  // from the right (-x); the passenger seat is taken by a pizza box.
  const cabZ = 2.45;
  const INTERIOR = 0x3a3d45;
  body.add(box(2.7, 0.12, 1.9, INTERIOR, 0, 1.21, cabZ)); // cab floor
  body.add(box(0.5, 0.75, 1.5, INTERIOR, 0, 1.6, cabZ + 0.1)); // engine hump / console
  body.add(box(2.7, 1.0, 0.12, TRUCK_WHITE, 0, 1.65, cabZ + 0.89)); // front wall
  body.add(box(2.7, 1.95, 0.1, TRUCK_WHITE, 0, 2.15, cabZ - 0.92)); // back wall
  body.add(box(2.3, 0.25, 0.35, INTERIOR, 0, 2.3, cabZ + 0.72)); // dashboard
  body.add(box(2.74, 0.14, 0.04, TRUCK_GREEN, 0, 1.95, cabZ + 0.96)); // waistline stripe
  for (const sx of [1, -1]) {
    // Full-height pillars with green trim around each doorway
    body.add(box(0.14, 1.95, 0.14, TRUCK_WHITE, sx * 1.29, 2.13, cabZ + 0.89));
    body.add(box(0.14, 1.95, 0.14, TRUCK_WHITE, sx * 1.29, 2.13, cabZ - 0.89));
    body.add(box(0.05, 1.95, 0.05, TRUCK_GREEN, sx * 1.36, 2.13, cabZ + 0.84));
    body.add(box(0.05, 1.95, 0.05, TRUCK_GREEN, sx * 1.36, 2.13, cabZ - 0.84));
    // Grab handle and a step up into the doorway
    body.add(cyl(0.04, 0.04, 0.9, CHROME, sx * 1.38, 2.2, cabZ - 0.72, 6));
    // step sits just behind the front wheel, clear of the tire
    body.add(box(0.36, 0.08, 0.5, CHROME, sx * 1.44, 0.82, 1.32));
    body.add(box(0.06, 0.34, 0.06, CHROME, sx * 1.36, 0.98, 1.12));
    body.add(box(0.06, 0.34, 0.06, CHROME, sx * 1.36, 0.98, 1.52));
  }
  // Passenger seat with its passenger: a pizza box, seatbelt on
  body.add(box(0.9, 0.3, 0.8, 0x8e5b3d, 0.75, 1.42, cabZ - 0.3));
  body.add(box(0.9, 1.05, 0.22, 0x8e5b3d, 0.75, 2.05, cabZ - 0.75));
  const pizza = box(0.75, 0.1, 0.75, 0xf4f4ef, 0.75, 1.63, cabZ - 0.25);
  pizza.rotation.y = 0.25;
  body.add(pizza);
  const pizzaLogo = cyl(0.22, 0.22, 0.02, 0xd9534f, 0.75, 1.69, cabZ - 0.25, 12);
  body.add(pizzaLogo);
  const belt = box(0.06, 0.02, 1.05, 0x2b2d33, 0.75, 1.72, cabZ - 0.45);
  belt.rotation.y = 0.6;
  body.add(belt);
  // Roof with a little visor over the windshield
  body.add(box(2.76, 0.16, 1.96, TRUCK_WHITE, 0, 3.17, cabZ));
  body.add(box(2.6, 0.08, 0.3, TRUCK_GREEN, 0, 3.08, cabZ + 1.05));
  // Glass: windshield only (both doorways are open)
  const glass = new THREE.MeshToonMaterial({ color: 0xbfeaff, gradientMap: gradient, transparent: true, opacity: 0.3, depthWrite: false });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 0.92), glass);
  ws.position.set(0, 2.62, cabZ + 0.9);
  body.add(ws);
  // Mirrors on the front fenders, so they don't block Steve's view (or ours)
  for (const sx of [1, -1]) {
    body.add(cyl(0.03, 0.03, 0.5, DARK, sx * 1.25, 2.1, 3.55, 6));
    body.add(box(0.26, 0.3, 0.08, DARK, sx * 1.25, 2.4, 3.55));
    body.add(box(0.2, 0.24, 0.02, 0, sx * 1.25, 2.4, 3.5, toon(0xcfefff, { emissive: 0x8fbfd8, emissiveIntensity: 0.3 })));
  }
  // Driver's seat
  body.add(box(0.9, 0.3, 0.8, 0x8e5b3d, -0.75, 1.42, cabZ - 0.3));
  body.add(box(0.9, 1.05, 0.22, 0x8e5b3d, -0.75, 2.05, cabZ - 0.75));
  body.add(box(0.12, 0.3, 0.12, INTERIOR, -0.75, 1.42, cabZ + 0.55)); // pedals

  // Hood, grille, headlights
  body.add(box(2.5, 0.75, 0.7, TRUCK_WHITE, 0, 1.5, 3.55));
  body.add(box(2.52, 0.08, 0.72, TRUCK_GREEN, 0, 1.9, 3.55));
  body.add(box(1.4, 0.5, 0.05, 0x4a4d55, 0, 1.45, 3.92));
  for (let i = 0; i < 3; i++) body.add(box(1.3, 0.05, 0.06, CHROME, 0, 1.3 + i * 0.15, 3.94));
  const lampMat = glow(0xfff4c2, 0.9);
  for (const sx of [0.95, -0.95]) {
    const rim = cyl(0.22, 0.22, 0.08, CHROME, sx, 1.5, 3.9, 14);
    rim.rotation.x = Math.PI / 2;
    body.add(rim);
    const hl = cyl(0.17, 0.17, 0.1, 0, sx, 1.5, 3.92, 14, lampMat);
    hl.rotation.x = Math.PI / 2;
    body.add(hl);
    // cute headlight "eyebrows"
    const brow = box(0.42, 0.07, 0.08, DARK, sx, 1.78, 3.9);
    brow.rotation.z = sx > 0 ? -0.15 : 0.15;
    body.add(brow);
    // amber corner lights
    body.add(box(0.12, 0.18, 0.08, 0, sx * 1.27, 1.5, 3.88, glow(0xffa31a, 0.5)));
  }

  // Beacon
  const beaconMat = new THREE.MeshToonMaterial({ color: 0xffa31a, emissive: 0xff8c00, emissiveIntensity: 1, gradientMap: gradient });
  body.add(cyl(0.24, 0.24, 0.08, DARK, -0.95, 3.27, cabZ - 0.8, 10));
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.28, 10), beaconMat);
  beacon.position.set(-0.95, 3.45, cabZ - 0.8);
  body.add(beacon);

  // Exhaust stack (behind the cab on the driver side)
  body.add(cyl(0.11, 0.11, 2.3, 0xaab0b8, 0.85, 2.55, cabZ - 1.12, 10));
  body.add(cyl(0.15, 0.11, 0.18, 0x55585f, 0.85, 3.75, cabZ - 1.12, 10));
  body.add(box(0.3, 0.6, 0.06, 0x55585f, 0.85, 2.2, cabZ - 1.0));

  // --- Compactor body: open hopper up front, closed dome at the back ---
  const compZ = -1.25;
  const HOP_Z = 0.3; // hopper center, lined up with the arm
  const HOP_FRONT = 0.95;
  const HOP_BACK = -0.35;
  const REAR_LEN = HOP_BACK - -3.45;
  const REAR_Z = HOP_BACK - REAR_LEN / 2;
  const LINER = 0x2a2c31;
  body.add(box(2.9, 1.0, 4.4, TRUCK_GREEN, 0, 1.7, compZ)); // lower body, full length
  body.add(box(2.9, 0.9, REAR_LEN, TRUCK_GREEN, 0, 2.65, REAR_Z)); // rear upper
  const roundTop = cyl(1.45, 1.45, REAR_LEN, TRUCK_GREEN, 0, 3.1, REAR_Z, 20);
  roundTop.rotation.x = Math.PI / 2;
  roundTop.scale.set(1, 1, 0.28);
  body.add(roundTop);
  body.add(box(2.95, 0.25, 4.45, 0xf9d849, 0, 1.6, compZ)); // yellow stripe
  // Hopper walls, dark liner, rim
  const hopLen = HOP_FRONT - HOP_BACK;
  for (const sx of [1, -1]) {
    body.add(box(0.12, 1.1, hopLen, TRUCK_GREEN, sx * 1.39, 2.75, HOP_Z));
    body.add(box(0.04, 1.0, hopLen - 0.1, LINER, sx * 1.31, 2.7, HOP_Z));
    body.add(box(0.2, 0.1, hopLen + 0.05, 0xf9d849, sx * 1.39, 3.33, HOP_Z));
  }
  body.add(box(2.9, 1.1, 0.12, TRUCK_GREEN, 0, 2.75, HOP_FRONT - 0.06));
  body.add(box(2.66, 1.0, 0.04, LINER, 0, 2.7, HOP_FRONT - 0.14));
  body.add(box(2.66, 1.0, 0.04, LINER, 0, 2.7, HOP_BACK + 0.04));
  body.add(box(3.0, 0.1, 0.2, 0xf9d849, 0, 3.33, HOP_FRONT - 0.06));
  body.add(box(2.66, 0.05, hopLen - 0.1, LINER, 0, 2.22, HOP_Z)); // hopper floor
  // Trash fill inside the hopper; main.js raises it as the load grows
  const fill = new THREE.Group();
  fill.add(box(2.6, 0.1, hopLen - 0.2, 0x3b3530, 0, 0, 0));
  const lumpCols = [0x2b2b2b, 0x8fd16a, 0xffd23f, 0x3d7ea6, 0xc49a6c, 0xe17055];
  for (let i = 0; i < 9; i++) {
    const lump = sphere(0.18 + (i % 3) * 0.06, lumpCols[i % lumpCols.length], -1.05 + (i % 5) * 0.5, 0.06, -0.35 + ((i * 7) % 4) * 0.22, 6);
    lump.scale.y = 0.6;
    fill.add(lump);
  }
  fill.position.set(0, 2.25, HOP_Z);
  body.add(fill);
  // Reinforcement ribs: front of hopper, hopper/dome joint, rear
  body.add(box(2.98, 2.1, 0.14, GREEN_DARK, 0, 2.25, HOP_FRONT - 0.02));
  for (const z of [HOP_BACK, -3.38]) {
    body.add(box(2.98, 1.9, 0.14, GREEN_DARK, 0, 2.15, z));
    const rib = cyl(1.49, 1.49, 0.14, GREEN_DARK, 0, 3.1, z, 20);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1, 1, 0.29);
    body.add(rib);
  }
  // Ladder on the back right corner
  for (const sx of [-1.25, -0.85]) body.add(box(0.06, 1.8, 0.06, CHROME, sx, 2.3, -3.62));
  for (let i = 0; i < 4; i++) body.add(box(0.46, 0.05, 0.06, CHROME, -1.05, 1.6 + i * 0.4, -3.62));

  // Rear hopper with a framed mouth and some trash peeking out
  body.add(box(2.8, 1.75, 0.75, GREEN_DARK, 0, 2.25, -3.75));
  body.add(box(2.3, 0.95, 0.1, 0xf9d849, 0, 2.55, -4.12)); // mouth frame
  body.add(box(2.05, 0.75, 0.12, 0x2a2c31, 0, 2.55, -4.13)); // mouth
  body.add(sphere(0.25, 0x2b2b2b, -0.5, 2.85, -4.0, 8)); // trash bag
  body.add(sphere(0.18, 0x8fd16a, 0.3, 2.8, -4.05, 8)); // lettuce?
  const banana = cyl(0.06, 0.06, 0.5, 0xffd23f, 0.65, 2.85, -4.08, 6);
  banana.rotation.z = 1.1;
  body.add(banana);
  // Hazard stripes under the mouth
  const hazard = textTexture([''], { w: 256, h: 32, bg: '#ffd23f' });
  {
    const g = hazard.image.getContext('2d');
    g.fillStyle = '#2b2d33';
    for (let x = -32; x < 256; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 32);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 0);
      g.fill();
    }
    hazard.needsUpdate = true;
  }
  const hz = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ map: hazard }));
  hz.position.set(0, 1.55, -4.135);
  hz.rotation.y = Math.PI;
  body.add(hz);
  // License plate
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.4),
    new THREE.MeshBasicMaterial({ map: textTexture(['STEVE 1'], { w: 256, h: 128, bg: '#fffbe8', color: '#1d5e37', font: 'bold 58px "Trebuchet MS", sans-serif' }) }),
  );
  plate.position.set(0, 0.95, -4.14);
  plate.rotation.y = Math.PI;
  body.add(plate);
  // Rear lights
  for (const sx of [1.15, -1.15]) {
    body.add(box(0.36, 0.42, 0.1, 0x3a3d45, sx, 1.22, -4.15));
    body.add(box(0.26, 0.15, 0.08, 0, sx, 1.3, -4.2, glow(0xff3b3b, 0.7)));
    body.add(box(0.26, 0.12, 0.08, 0, sx, 1.12, -4.2, glow(0xffa31a, 0.5)));
  }

  // Logo decal on both sides, above the yellow stripe
  const logoTex = textTexture(["STEVE'S", 'TRASH CO.'], {
    font: 'bold 96px "Trebuchet MS", sans-serif',
    color: '#fff9e6',
    stroke: '#1d5e37',
  });
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true });
  for (const side of [1, -1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 1.15), logoMat);
    logo.position.set(1.475 * side, 2.42, REAR_Z);
    logo.rotation.y = (Math.PI / 2) * side;
    body.add(logo);
  }

  // Automated side-loader arms, one per side, level with the hopper. Each is
  // built on the right (-x); the left one lives in a mirrored group.
  const buildArm = (P) => {
    const ARM = { R: 2.1, GRIP: 0.62, MAX_EXT: 6.4 };
    const ARM_YELLOW = 0xffc93c;
    const STEEL = 0x55585f;
    P.add(box(0.35, 0.5, 0.7, STEEL, -1.6, 2.9, HOP_Z)); // mount on the hopper wall
    const armBase = new THREE.Group();
    armBase.position.set(-1.85, 2.9, HOP_Z);
    P.add(armBase);
    armBase.add(box(0.7, 0.34, 0.34, STEEL, -0.1, 0, 0)); // sleeve
    const boomGeo = new THREE.BoxGeometry(1, 0.24, 0.24);
    boomGeo.translate(-0.5, 0, 0);
    const boom = new THREE.Mesh(boomGeo, toon(0xd5d9df));
    boom.castShadow = true;
    armBase.add(boom);
    const slide = new THREE.Group();
    armBase.add(slide);
    const pin = (parent, r = 0.17) => {
      const j = cyl(r, r, 0.46, STEEL, 0, 0, 0, 12);
      j.rotation.x = Math.PI / 2;
      parent.add(j);
    };
    pin(slide, 0.2);
    const lever = new THREE.Group();
    slide.add(lever);
    lever.add(box(0.22, ARM.R, 0.26, ARM_YELLOW, 0, -ARM.R / 2, 0));
    lever.add(box(0.06, ARM.R * 0.7, 0.28, 0x2b2d33, 0.09, -ARM.R / 2, 0)); // hydraulic line
    const wrist = new THREE.Group();
    wrist.position.y = -ARM.R;
    lever.add(wrist);
    pin(wrist, 0.15);
    // Palm plate facing outward and two fingers that close around the can
    wrist.add(box(0.12, 0.6, 0.9, STEEL, -0.08, 0, 0));
    const fingers = [];
    for (const side of [1, -1]) {
      const f = new THREE.Group();
      f.position.set(-0.12, 0, side * 0.42);
      f.add(box(0.75, 0.16, 0.1, STEEL, -0.37, 0, 0));
      f.add(box(0.1, 0.16, 0.3, STEEL, -0.72, 0, -side * 0.12));
      f.userData.side = side;
      wrist.add(f);
      fingers.push(f);
    }
    return { base: armBase, boom, slide, lever, wrist, gripper: wrist, fingers, ...ARM };

  };
  const arms = [buildArm(body)];
  const mirror = new THREE.Group();
  mirror.scale.x = -1;
  body.add(mirror);
  arms.push(buildArm(mirror));
  arms[0].side = 'right';
  arms[1].side = 'left';

  // Wheels + fenders
  const wheels = [];
  const frontWheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.52, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const capGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.56, 8);
  capGeo.rotateZ(Math.PI / 2);
  const lugGeo = new THREE.BoxGeometry(0.54, 0.06, 0.5);
  // Solid wheel arches: a thick half-ring for the front wheels (in the
  // truck's white), and one flat mudguard over the rear tandem pair.
  const arch = new THREE.Shape();
  arch.absarc(0, 0, 0.86, 0, Math.PI, false);
  arch.lineTo(-0.72, 0);
  arch.absarc(0, 0, 0.72, Math.PI, 0, true);
  arch.lineTo(0.86, 0);
  const archGeo = new THREE.ExtrudeGeometry(arch, { depth: 0.6, bevelEnabled: false, curveSegments: 16 });
  archGeo.translate(0, 0, -0.3);
  archGeo.rotateY(Math.PI / 2);
  for (const sx of [1.3, -1.3]) {
    const a = shadowy(new THREE.Mesh(archGeo, toon(TRUCK_WHITE)));
    a.position.set(sx, 0.66, 2.4);
    body.add(a);
    // rear mudguard + flaps
    body.add(box(0.64, 0.1, 2.75, 0x3a3d45, sx, 1.33, -2.25));
    body.add(box(0.64, 0.24, 0.1, 0x3a3d45, sx, 1.22, -0.92));
    body.add(box(0.58, 0.6, 0.05, 0x2b2d33, sx, 0.72, -3.62));
  }
  for (const [z, front] of [[2.4, true], [-1.6, false], [-2.9, false]]) {
    for (const sx of [1.3, -1.3]) {
      const steer = new THREE.Group();
      steer.position.set(sx, 0.62, z);
      const spin = new THREE.Group();
      spin.add(shadowy(new THREE.Mesh(wheelGeo, toon(0x2a2a2e))));
      spin.add(shadowy(new THREE.Mesh(hubGeo, toon(CHROME))));
      spin.add(new THREE.Mesh(capGeo, toon(0x8a8f98)));
      for (let k = 0; k < 3; k++) {
        const lug = new THREE.Mesh(lugGeo, toon(0x8a8f98));
        lug.rotation.x = (k / 3) * Math.PI;
        spin.add(lug);
      }
      steer.add(spin);
      group.add(steer);
      wheels.push(spin);
      if (front) frontWheels.push(steer);
    }
  }

  // Steve sits in the driver's seat by the open doorway, feet on the pedals,
  // leaning a little toward the door to enjoy the breeze.
  const steve = makeRaccoon();
  steve.group.position.set(-0.75, 1.52, cabZ - 0.2);
  steve.group.scale.setScalar(0.95);
  steve.group.userData.baseY = 1.52;
  steve.group.userData.baseX = -0.75;
  steve.head.position.set(-0.22, 1.12, 0.04);
  steve.head.userData.baseTilt = 0.08;
  const legs = new THREE.Group();
  for (const side of [1, -1]) {
    const thigh = cyl(0.13, 0.12, 0.5, 0x8b9096, 0.2 * side, 0.12, 0.3, 10);
    thigh.rotation.x = Math.PI / 2;
    legs.add(thigh);
    legs.add(cyl(0.1, 0.1, 0.35, 0x8b9096, 0.2 * side, -0.05, 0.55, 10));
    const foot = sphere(0.13, 0x3a3d42, 0.2 * side, -0.24, 0.62, 10);
    foot.scale.set(1, 0.7, 1.4);
    legs.add(foot);
  }
  addOutline(legs);
  steve.group.add(legs);
  // Tail: small, draped over the outer edge of the seat beside him
  const tailRoot = steve.tail[0].parent;
  tailRoot.position.set(-0.3, 0.12, -0.3);
  tailRoot.rotation.set(0, Math.PI / 2 - 0.35, 0);
  tailRoot.scale.setScalar(0.6);
  steve.tailRest = steve.tail.map((_, i) => ({ x: i === 0 ? 0 : -0.38, y: 0 }));
  steve.tailWag = 0.05;
  body.add(steve.group);

  // Steering wheel with column
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 18), toon(DARK));
  wheel.position.set(-0.75, 2.5, cabZ + 0.5);
  wheel.rotation.x = -1.0;
  body.add(wheel);
  const column = cyl(0.05, 0.05, 0.4, DARK, -0.75, 2.4, cabZ + 0.62, 6);
  column.rotation.x = 0.6;
  body.add(column);
  const steeringWheel = [wheel, column];

  // A tiny air freshener shaped like a pine tree (ironic)
  body.add(cone(0.08, 0.2, 0x2ecc71, 0.3, 2.95, cabZ + 0.75, 6));

  // Front loader: two telescoping arms pivoting behind the cab, with forks
  // that slide into a dumpster's sleeves and lift it over the cab into the
  // hopper. Truly the most capable of trucks.
  const LOADER_P = new THREE.Vector3(0, 3.5, 1.2);
  const loaderPivot = new THREE.Group();
  loaderPivot.position.copy(LOADER_P);
  body.add(loaderPivot);
  const sliderGeo = new THREE.BoxGeometry(0.16, 0.22, 1);
  sliderGeo.translate(0, 0, 0.5);
  const sliders = [];
  for (const s of [1, -1]) {
    body.add(box(0.3, 2.7, 0.4, 0x55585f, s * 1.62, 2.2, LOADER_P.z)); // post
    const pinMesh = cyl(0.2, 0.2, 0.3, 0x55585f, s * 1.75, 0, 0, 12);
    pinMesh.rotation.z = Math.PI / 2;
    loaderPivot.add(pinMesh);
    loaderPivot.add(box(0.24, 0.32, 2.4, 0xffc93c, s * 1.75, 0, 1.1)); // outer sleeve
    const sl = new THREE.Mesh(sliderGeo, toon(0xd5d9df));
    sl.position.set(s * 1.75, 0, 2.2);
    sl.castShadow = true;
    loaderPivot.add(sl);
    sliders.push(sl);
  }
  const forks = new THREE.Group();
  loaderPivot.add(forks);
  for (const s of [1, -1]) {
    forks.add(box(0.3, 0.5, 0.3, 0x55585f, s * 1.75, 0, 0));
    forks.add(box(0.16, 0.18, 1.3, 0x2b2d33, s * 1.7, 0, 0.65)); // prong
  }
  const loader = { pivot: loaderPivot, sliders, forks, P: LOADER_P, sliderStart: 2.2 };

  const hopperLocal = new THREE.Vector3(0, 3.4, HOP_Z); // mouth of the open hopper
  const rearLocal = new THREE.Vector3(0, 2.5, -4.2); // rear door, for unloading

  return { group, body, wheels, frontWheels, arms, loader, steeringWheel, beacon, beaconMat, steve, hopperLocal, rearLocal, fill, lampMat };
}

// ---------------------------------------------------------------------------
// Neighborhood stuff
// ---------------------------------------------------------------------------

const HOUSE_COLORS = [0xffb3c1, 0xa7d8ff, 0xfff1a8, 0xc5f0c0, 0xe3c8ff, 0xffd3a5, 0xb8f2e6, 0xf7c6d9];
const ROOF_COLORS = [0xd9534f, 0x6c5ce7, 0x3d7ea6, 0x8e5b3d, 0x2d936c, 0xe17055];


/** Shared materials that light up as the sun goes down. */
export const nightMats = {
  windows: new THREE.MeshToonMaterial({ color: 0xd4f1ff, emissive: 0xffd27a, emissiveIntensity: 0, gradientMap: gradient }),
  lamps: new THREE.MeshToonMaterial({ color: 0xfff1c4, emissive: 0xffc861, emissiveIntensity: 0.15, gradientMap: gradient }),
};

const DOOR_COLORS = [0xd9534f, 0x2d936c, 0x3d7ea6, 0xffb300, 0x8e5b3d, 0x6c5ce7];
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

function houseWindow(g, x, y, z, rotY, shutterCol, rand, flowers = true) {
  const win = new THREE.Group();
  win.add(box(1.5, 1.25, 0.12, 0xffffff, 0, 0, 0));
  win.add(box(1.24, 1.0, 0.14, 0, 0, 0, 0.01, nightMats.windows));
  win.add(box(0.07, 1.0, 0.16, 0xffffff, 0, 0, 0.02));
  win.add(box(1.24, 0.07, 0.16, 0xffffff, 0, 0, 0.02));
  if (shutterCol !== null) {
    for (const s of [-1, 1]) win.add(box(0.42, 1.25, 0.1, shutterCol, s * 0.99, 0, 0.02));
  }
  if (flowers) {
    win.add(box(1.5, 0.24, 0.32, 0x8e5b3d, 0, -0.74, 0.12));
    for (let i = 0; i < 4; i++) {
      const fc = [0xff6b9d, 0xffd23f, 0xff8c42, 0xffffff][(rand() * 4) | 0];
      win.add(sphere(0.12, fc, -0.54 + i * 0.36, -0.56, 0.14, 6));
    }
  }
  win.position.set(x, y, z);
  win.rotation.y = rotY;
  g.add(win);
}

/** A cute house facing +z, centered on origin. */
export function makeHouse(rand) {
  const g = new THREE.Group();
  const w = 8 + rand() * 2;
  const d = 6.5 + rand() * 1;
  const h = 3.4 + rand() * 1.0;
  const col = HOUSE_COLORS[(rand() * HOUSE_COLORS.length) | 0];
  const roofCol = ROOF_COLORS[(rand() * ROOF_COLORS.length) | 0];
  const doorCol = DOOR_COLORS[(rand() * DOOR_COLORS.length) | 0];
  const shutterCol = rand() < 0.75 ? shade(roofCol, 0.85) : null;
  const base = 0.35;

  // Foundation, walls and corner trim
  g.add(box(w + 0.2, base, d + 0.2, 0xb9b2a4, 0, base / 2, 0));
  g.add(box(w, h, d, col, 0, base + h / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.2, h, 0.2, 0xffffff, sx * (w / 2), base + h / 2, sz * (d / 2)));
  const top = base + h;
  g.add(box(w + 0.1, 0.18, d + 0.1, 0xffffff, 0, top - 0.09, 0)); // frieze board

  // Roof: two slabs with overhang, a wall-colored gable, and a ridge cap
  const rh = 2.0 + rand() * 1.0;
  const a = Math.atan2(rh, w / 2);
  const run = w / 2 + 0.6;
  const L = run / Math.cos(a);
  const eaveY = top - (run - w / 2) * Math.tan(a);
  for (const side of [-1, 1]) {
    const slab = box(L, 0.28, d + 1.1, roofCol);
    const cx = (side * run) / 2;
    const cy = (eaveY + top + rh) / 2;
    slab.position.set(cx + side * Math.sin(a) * 0.14, cy + Math.cos(a) * 0.14, 0);
    slab.rotation.z = -side * a;
    g.add(slab);
    // shingle lines
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const line = box(0.06, 0.06, d + 1.12, shade(roofCol, 0.82));
      line.position.set(side * run * (1 - t), eaveY + (top + rh - eaveY) * t + 0.28 / Math.cos(a), 0);
      g.add(line);
    }
  }
  g.add(box(0.36, 0.22, d + 1.15, shade(roofCol, 0.75), 0, top + rh + 0.12, 0));
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0);
  tri.lineTo(w / 2, 0);
  tri.lineTo(0, rh);
  tri.lineTo(-w / 2, 0);
  const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
  gableGeo.translate(0, 0, -d / 2);
  const gable = shadowy(new THREE.Mesh(gableGeo, toon(col)));
  gable.position.y = top;
  g.add(gable);
  // Round attic window
  const attic = cyl(0.42, 0.42, 0.1, 0xffffff, 0, top + rh * 0.38, d / 2 + 0.03, 16);
  attic.rotation.x = Math.PI / 2;
  g.add(attic);
  const atticGlass = cyl(0.32, 0.32, 0.12, 0, 0, top + rh * 0.38, d / 2 + 0.04, 16, nightMats.windows);
  atticGlass.rotation.x = Math.PI / 2;
  g.add(atticGlass);

  // Front door with frame, little window, canopy, step and porch light
  const fz = d / 2;
  g.add(box(1.55, 2.4, 0.12, 0xffffff, 0, base + 1.18, fz + 0.02));
  g.add(box(1.2, 2.15, 0.14, doorCol, 0, base + 1.07, fz + 0.04));
  g.add(box(0.5, 0.5, 0.16, 0, 0, base + 1.6, fz + 0.05, nightMats.windows));
  g.add(sphere(0.08, 0xffd23f, 0.4, base + 1.0, fz + 0.15, 6));
  g.add(box(2.1, 0.14, 1.0, shade(roofCol, 0.9), 0, base + 2.65, fz + 0.5));
  for (const s of [-1, 1]) g.add(box(0.1, 0.4, 0.5, 0xffffff, s * 0.95, base + 2.42, fz + 0.25));
  g.add(box(2.1, base, 1.0, 0xc9c2b4, 0, base / 2, fz + 0.6));
  g.add(sphere(0.12, 0, 1.05, base + 2.0, fz + 0.12, 8, nightMats.lamps));

  // Windows on every wall so the house works from any angle
  const wy = base + h * 0.55;
  for (const sx of [-w / 3.3, w / 3.3]) houseWindow(g, sx, wy, fz + 0.06, 0, shutterCol, rand, true);
  houseWindow(g, w / 4, wy, -fz - 0.06, Math.PI, shutterCol, rand, false);
  houseWindow(g, -w / 4, wy, -fz - 0.06, Math.PI, shutterCol, rand, false);
  houseWindow(g, w / 2 + 0.06, wy, 0, Math.PI / 2, null, rand, false);
  houseWindow(g, -w / 2 - 0.06, wy, 0, -Math.PI / 2, null, rand, false);

  // Chimney sitting on the roof slope
  if (rand() < 0.65) {
    const cx = w / 4;
    const ch = rh + 0.7;
    g.add(box(0.75, ch, 0.75, 0xb55d4c, cx, top + ch / 2, -d / 5));
    g.add(box(0.95, 0.18, 0.95, 0x8e4b3f, cx, top + ch, -d / 5));
  }
  return { group: g, w, d, col, roofCol };
}

export function makeTree(rand, scale = 1) {
  const g = new THREE.Group();
  if (rand() < 0.25) {
    // Pine
    g.add(cyl(0.2, 0.28, 1.4, 0x8e5b3d, 0, 0.7, 0, 7));
    const pine = [0x2f9e5b, 0x3aae63, 0x268a4f][(rand() * 3) | 0];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.4, 1.8, 7), toon(pine));
      c.position.y = 1.6 + i * 1.0;
      c.rotation.y = rand() * 3;
      g.add(shadowy(c));
    }
    g.scale.setScalar(scale);
    return g;
  }
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
  addOutline(g, 0.02);
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
  const H = 4.2;
  // Dirt mound underneath
  const mound = new THREE.Mesh(new THREE.ConeGeometry(radius, H, 10, 2), toon(0x8d6e4f));
  mound.position.y = H / 2;
  g.add(shadowy(mound));
  const surf = (r) => (1 - r / radius) * H;
  const place = (obj, rMin, rMax) => {
    const a = rand() * Math.PI * 2;
    const r = rMin + rand() * (rMax - rMin);
    obj.position.set(Math.cos(a) * r, surf(r) - 0.25, Math.sin(a) * r);
    obj.rotation.y = rand() * 6;
    g.add(obj);
    return obj;
  };
  for (let i = 0; i < 30; i++) place(makeTrashBag(rand), 1, radius - 0.5).scale.setScalar(0.9 + rand() * 0.6);
  for (let i = 0; i < 5; i++) {
    const t = place(makeTire(), 1.5, radius - 1);
    t.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.8, 0, rand() * 3);
    t.position.y += 0.3;
  }
  const boxCols = [0xc49a6c, 0xb5895c, 0xd4ab7c];
  for (let i = 0; i < 10; i++) {
    const b = box(0.8 + rand() * 0.6, 0.6 + rand() * 0.5, 0.8 + rand() * 0.5, boxCols[(rand() * 3) | 0]);
    place(b, 1, radius - 0.5).rotation.set(rand() * 0.6, rand() * 3, rand() * 0.6);
  }
  const fridge = place(makeFridge(), 3, 3.5);
  fridge.rotation.z = 0.5;
  const ducky = box(0.5, 0.5, 0.6, 0xffd23f);
  place(ducky, 0.5, 1).position.y += 0.6;
  // A crown jewel: an abandoned couch on top
  const couch = new THREE.Group();
  couch.add(box(2.6, 0.6, 1.1, 0x9b59b6, 0, 0.3, 0));
  couch.add(box(2.6, 0.9, 0.3, 0x8e44ad, 0, 0.75, -0.45));
  couch.add(box(0.3, 0.7, 1.1, 0x8e44ad, 1.3, 0.55, 0));
  couch.add(box(0.3, 0.7, 1.1, 0x8e44ad, -1.3, 0.55, 0));
  couch.position.set(0, 4.1, 0);
  couch.rotation.set(0.2, 0.7, -0.15);
  g.add(couch);
  return g;
}

export function makeSign(lines, bg = '#2d936c', w = 6, h = 2.2) {
  const g = new THREE.Group();
  const tex = textTexture(lines, { bg, color: '#fffbe8', font: 'bold 110px "Trebuchet MS", sans-serif', w: 768, h: Math.round((768 * h) / w) });
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const frameMat = toon(0xfffbe8);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), [frameMat, frameMat, frameMat, frameMat, mat, mat]);
  board.position.y = 3.2;
  board.castShadow = true;
  g.add(board);
  g.add(box(w + 0.3, h + 0.3, 0.14, 0xfffbe8, 0, 3.2, 0));
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
  const g = new THREE.Group();
  g.add(shadowy(new THREE.Mesh(geo, toon(0xc98b4f))));
  const slope = Math.atan2(h, len);
  const deck = Math.hypot(len, h);
  // Plank deck
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    const plank = box(w - 0.1, 0.08, deck / 9 - 0.08, i % 2 ? 0xe0a565 : 0xd59a5a, 0, t * h + 0.04, t * len);
    plank.rotation.x = -slope;
    g.add(plank);
  }
  // Painted chevrons
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    for (const sd of [-1, 1]) {
      const c = box(w * 0.36, 0.1, 0.35, 0xffd23f, sd * w * 0.17, t * h + 0.09, t * len - 0.35);
      c.rotation.set(-slope, sd * 0.6, 0, 'YXZ');
      g.add(c);
    }
  }
  // Side rails + lip
  for (const sd of [-1, 1]) {
    const rail = box(0.2, 0.25, deck, 0xe17055, sd * (w / 2 - 0.1), h / 2 + 0.15, len / 2);
    rail.rotation.x = -slope;
    g.add(rail);
  }
  g.add(box(w, 0.2, 0.25, 0xe17055, 0, h + 0.05, len - 0.12));
  return g;
}

export function makeLampPost() {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.28, 0.3, 0x2f4f4f, 0, 0.15, 0, 8));
  g.add(cyl(0.09, 0.11, 4.6, 0x2f4f4f, 0, 2.45, 0, 8));
  g.add(cyl(0.3, 0.16, 0.25, 0x2f4f4f, 0, 4.85, 0, 8));
  g.add(sphere(0.3, 0, 0, 5.15, 0, 10, nightMats.lamps));
  g.add(cone(0.36, 0.35, 0x2f4f4f, 0, 5.5, 0, 8));
  return g;
}

export function makeBench() {
  const g = new THREE.Group();
  const wood = 0xc98b4f;
  for (let i = 0; i < 3; i++) g.add(box(2.2, 0.08, 0.18, wood, 0, 0.55, -0.2 + i * 0.2));
  for (let i = 0; i < 2; i++) g.add(box(2.2, 0.16, 0.06, wood, 0, 0.85 + i * 0.25, -0.35));
  for (const s of [-1, 1]) {
    g.add(box(0.08, 0.55, 0.5, 0x2f4f4f, s * 0.95, 0.28, -0.1));
    g.add(box(0.08, 0.7, 0.08, 0x2f4f4f, s * 0.95, 0.9, -0.38));
  }
  return g;
}

export function makeFlowerBed(rand, r = 2) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.35, 0xb9b2a4, 0, 0.18, 0, 18));
  g.add(cyl(r - 0.15, r - 0.15, 0.37, 0x7a5236, 0, 0.19, 0, 18));
  const cols = [0xff6b9d, 0xffd23f, 0xff8c42, 0xffffff, 0xc77dff];
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (r - 0.45);
    g.add(cyl(0.03, 0.03, 0.35, 0x3fa65a, Math.cos(a) * d, 0.5, Math.sin(a) * d, 4));
    g.add(sphere(0.16, cols[(rand() * cols.length) | 0], Math.cos(a) * d, 0.7, Math.sin(a) * d, 6));
  }
  return g;
}

export function makePicnicTable() {
  const g = new THREE.Group();
  const wood = 0xb5763e;
  g.add(box(2.4, 0.1, 1.0, wood, 0, 0.85, 0));
  for (const s of [-1, 1]) {
    g.add(box(2.4, 0.08, 0.35, wood, 0, 0.5, s * 0.8));
    const leg = box(0.1, 1.0, 0.1, wood, 0, 0.45, 0);
    for (const x of [-0.9, 0.9]) {
      const l = leg.clone();
      l.position.set(x, 0.45, s * 0.3);
      l.rotation.x = s * 0.45;
      g.add(l);
    }
  }
  // gingham cloth
  g.add(box(1.2, 0.02, 1.02, 0xe63946, 0, 0.91, 0));
  return g;
}

export function makeTrashBag(rand) {
  const g = new THREE.Group();
  const col = [0x2b2b2b, 0x3a3d45, 0x2d5f8a, 0x40704a][(rand() * 4) | 0];
  const b = sphere(0.6, col, 0, 0.5, 0, 10);
  b.scale.set(1, 0.85, 0.9);
  g.add(b);
  g.add(cone(0.18, 0.35, col, 0, 1.05, 0, 6));
  g.add(sphere(0.08, 0xffd23f, 0, 0.92, 0, 6));
  return g;
}

export function makeTire() {
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.25, 8, 16), toon(0x2a2a2e));
  return shadowy(t);
}

export function makeFridge() {
  const g = new THREE.Group();
  g.add(box(1.1, 2.0, 1.0, 0xe8f1f2, 0, 1, 0));
  g.add(box(1.12, 0.04, 1.02, 0xb0bec5, 0, 1.35, 0));
  g.add(box(0.06, 0.5, 0.08, 0xb0bec5, 0.4, 1.65, 0.52));
  g.add(box(0.06, 0.6, 0.08, 0xb0bec5, 0.4, 0.95, 0.52));
  return g;
}

export function makeDumpster(color = 0x3d7ea6) {
  const g = new THREE.Group();
  g.add(box(3.2, 1.5, 1.8, color, 0, 0.85, 0));
  g.add(box(3.3, 0.12, 1.9, shade(color, 0.8), 0, 1.66, 0));
  const lid = box(1.55, 0.1, 1.9, shade(color, 0.7), -0.8, 1.9, -0.2);
  lid.rotation.x = -0.4;
  g.add(lid);
  g.add(box(1.55, 0.1, 1.9, shade(color, 0.7), 0.8, 1.74, 0));
  for (const s of [-1.3, 1.3]) for (const z of [-0.7, 0.7]) g.add(cyl(0.12, 0.12, 0.12, 0x2b2d33, s, 0.1, z, 8));
  g.add(sphere(0.35, 0x2b2b2b, -0.9, 1.75, 0.2, 8));
  // Fork sleeves on both ends, for front-loader trucks
  for (const s of [-1.68, 1.68]) g.add(box(0.2, 0.26, 1.95, 0x2b2d33, s, 0.95, 0));
  return g;
}

export function makeBooth() {
  const g = new THREE.Group();
  g.add(box(3, 2.6, 2.6, 0xf4f4ef, 0, 1.3, 0));
  g.add(box(3.4, 0.25, 3.0, 0xe17055, 0, 2.72, 0));
  g.add(box(2.2, 1.0, 0.1, 0, 0, 1.75, 1.31, nightMats.windows));
  g.add(box(2.4, 0.12, 0.3, 0xffffff, 0, 1.2, 1.4));
  return g;
}

/** Puffy low-poly cloud. */
export function makeCloud(rand, mat) {
  const g = new THREE.Group();
  const n = 4 + ((rand() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const r = 5 + rand() * 6;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    m.position.set((i - n / 2) * 7 + rand() * 3, rand() * 3, (rand() - 0.5) * 6);
    m.scale.y = 0.6;
    g.add(m);
  }
  return g;
}

/** A stone statue of a heroic raccoon holding a trash can lid aloft. */
export function makeStatue() {
  const stoneMat = toon(0xc9c3b5);
  const r = makeRaccoon();
  r.group.traverse((m) => {
    if (m.isMesh && !m.userData.outline) m.material = stoneMat;
  });
  r.arms[0].rotation.set(-2.9, 0, 0.3);
  r.arms[1].rotation.set(-0.9, 0, -0.2);
  r.tail.forEach((seg, i) => (seg.rotation.x = i < 3 ? 0.35 : -0.25));
  const lid = cyl(0.55, 0.5, 0.1, 0, 0, 0, 0, 14, stoneMat);
  lid.position.set(0, -0.55, 0.0);
  r.arms[0].add(lid);
  r.group.scale.setScalar(2.4);
  return r.group;
}

/** A shiny lost treasure: a spinning gem with a halo and a beam of light. */
export function makeTreasure(color) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glow(color, 0.7));
  gem.scale.y = 1.4;
  spin.add(shadowy(gem));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 24), glow(0xffffff, 1));
  halo.rotation.x = Math.PI / 2;
  spin.add(halo);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 20;
  g.add(beam);
  return { group: g, spin, beam };
}

// ---------------------------------------------------------------------------
// Playful yard props (all built with their origin on the ground)
// ---------------------------------------------------------------------------

export function makeFlamingo() {
  const g = new THREE.Group();
  const PINK = 0xff7eb6;
  for (const s of [-0.08, 0.08]) g.add(cyl(0.025, 0.025, 0.9, 0x2b2d33, s, 0.45, 0, 4));
  const body = sphere(0.28, PINK, 0, 1.05, 0, 10);
  body.scale.set(0.8, 0.75, 1.3);
  g.add(body);
  const neck = cyl(0.05, 0.06, 0.6, PINK, 0, 1.45, 0.28, 6);
  neck.rotation.x = 0.35;
  g.add(neck);
  g.add(sphere(0.12, PINK, 0, 1.78, 0.38, 8));
  const beak = cone(0.05, 0.18, 0x2b2d33, 0, 1.74, 0.52, 6);
  beak.rotation.x = Math.PI / 2 + 0.4;
  g.add(beak);
  return g;
}

export function makeGnome() {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.28, 0.45, 0x3d7ea6, 0, 0.23, 0, 10)); // coat
  g.add(cyl(0.29, 0.29, 0.06, 0x2b2d33, 0, 0.05, 0, 10)); // boots
  g.add(sphere(0.17, 0xf1c9a5, 0, 0.6, 0.02, 10)); // face
  g.add(sphere(0.06, 0xff9e9e, 0, 0.6, 0.18, 6)); // nose
  const beard = cone(0.17, 0.32, 0xffffff, 0, 0.44, 0.08, 10);
  beard.rotation.x = Math.PI;
  g.add(beard);
  g.add(cone(0.2, 0.5, 0xd9534f, 0, 0.92, 0, 10)); // hat
  return g;
}

/** One 2.4-wide section of white picket fence, running along x. */
export function makePicketFence() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const x = -1.0 + i * 0.4;
    g.add(box(0.16, 0.85, 0.06, 0xfdfdf8, x, 0.42, 0));
    const tip = cone(0.12, 0.18, 0xfdfdf8, x, 0.93, 0, 4);
    tip.rotation.y = Math.PI / 4;
    g.add(tip);
  }
  for (const y of [0.25, 0.65]) g.add(box(2.4, 0.08, 0.05, 0xfdfdf8, 0, y, -0.05));
  return g;
}

export function makeBeachBall() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const ctx = c.getContext('2d');
  const cols = ['#ff6b6b', '#fffbe8', '#ffd23f', '#fffbe8', '#6ec6ff', '#fffbe8'];
  cols.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect((i * 256) / cols.length, 0, 256 / cols.length + 1, 16);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient }));
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return { group: g, ball: m };
}

export function makePigeon() {
  const g = new THREE.Group();
  const body = sphere(0.22, 0x8a8f9c, 0, 0.25, 0, 8);
  body.scale.set(0.8, 0.8, 1.2);
  g.add(body);
  g.add(sphere(0.12, 0x6b7080, 0, 0.45, 0.2, 8));
  g.add(sphere(0.09, 0x7fb59a, 0, 0.36, 0.17, 6)); // shiny neck
  const beak = cone(0.03, 0.1, 0x2b2d33, 0, 0.44, 0.33, 4);
  beak.rotation.x = Math.PI / 2;
  g.add(beak);
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(0.15 * s, 0.32, 0);
    w.add(box(0.45, 0.04, 0.3, 0x6b7080, 0.22 * s, 0, 0));
    g.add(w);
    wings.push(w);
  }
  return { group: g, wings };
}

// ---------------------------------------------------------------------------
// Citizens: chibi critters with big heads and shiny eyes
// ---------------------------------------------------------------------------

const CRITTER_SPECIES = {
  kitten: { colors: [0xffa65c, 0x8a8f99, 0x3a3d45, 0xf4efe6, 0xd9a06b], word: ['MEOW!', 'MRRROW!', 'HISS!'] },
  puppy: { colors: [0xd9a06b, 0x8d5b3a, 0xf4efe6, 0xc49a6c], word: ['ARF!', 'WOOF!', 'YIP!'] },
  dalmatian: { colors: [0xfafaf6], word: ['ARF!', 'WOOF!'] },
  bunny: { colors: [0xfafaf6, 0xc9a37f, 0xa8a8b0], word: ['EEP!', 'BOING!'] },
  hedgehog: { colors: [0xe8cfa8], word: ['HUFF!', 'SNORT!'] },
  squirrel: { colors: [0xd0783a, 0x9a6a4a], word: ['CHITTER!', 'NUTS!'] },
  // Townsfolk: upright, dressed, and with places to be
  bear: { folk: true, colors: [0x9a6440], word: ['HEY!', 'OOF!', 'MY HAT!'] },
  fox: { folk: true, colors: [0xff8a3c], word: ['WHOA!', 'MY TIME!', 'YIKES!'] },
  bunnylady: { folk: true, colors: [0xfafaf6, 0xd8c3a8], word: ['GOODNESS!', 'OH MY!', 'EEK!'] },
  frog: { folk: true, colors: [0x7cc95a], word: ['RIBBIT!', 'WHEEE!', 'AGAIN!'] },
  badger: { folk: true, colors: [0x8a8f99], word: ['YOUNG MAN!', 'WELL I NEVER!', 'HMPH!'] },
  mole: { folk: true, colors: [0x6b6470], word: ['MY MAIL!', 'SIGN HERE!', 'OOF!'] },
  pig: { folk: true, colors: [0xffb3c1], word: ['MY BUNS!', 'OINK!', 'HEY!'] },
};
export const CRITTER_WORDS = Object.fromEntries(Object.entries(CRITTER_SPECIES).map(([k, v]) => [k, v.word]));

function cuteEyes(head, r, spread, y, z, scale = 1) {
  for (const s of [1, -1]) {
    const eye = sphere(0.085 * scale, 0x1b1b22, spread * s, y, z, 12);
    eye.scale.set(1, 1.25, 0.7);
    head.add(eye);
    head.add(sphere(0.032 * scale, 0xffffff, spread * s + 0.02 * s * scale, y + 0.04 * scale, z + 0.05 * scale, 6));
    head.add(sphere(0.016 * scale, 0xffffff, spread * s - 0.02 * s * scale, y - 0.03 * scale, z + 0.055 * scale, 6));
    const blush = sphere(0.06 * scale, 0xff9fb5, (spread + 0.09 * scale) * s, y - 0.1 * scale, z - 0.03, 8);
    blush.scale.set(1.2, 0.6, 0.4);
    head.add(blush);
  }
}

/** Big shiny eyes in blinkable groups. Returns the two eye groups. */
function blinkEyes(head, spread, y, z, scale = 1) {
  const eyes = [];
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(spread * s, y, z);
    const ball = sphere(0.085 * scale, 0x1b1b22, 0, 0, 0, 12);
    ball.scale.set(1, 1.25, 0.7);
    eye.add(ball);
    eye.add(sphere(0.032 * scale, 0xffffff, 0.02 * s * scale, 0.04 * scale, 0.05 * scale, 6));
    eye.add(sphere(0.016 * scale, 0xffffff, -0.02 * s * scale, -0.03 * scale, 0.055 * scale, 6));
    head.add(eye);
    eyes.push(eye);
    const blush = sphere(0.06 * scale, 0xff9fb5, (spread + 0.09 * scale) * s, y - 0.1 * scale, z - 0.03, 8);
    blush.scale.set(1.2, 0.6, 0.4);
    head.add(blush);
  }
  return eyes;
}

/**
 * A cute critter. Returns { group, body, head, tail, tailSegs, legs, ears, eyes, species }.
 * Faces +z. body is the posture pivot (hips-ish), legs hang from it.
 */
export function makeCritter(species, rand) {
  const spec = CRITTER_SPECIES[species];
  if (spec.folk) return makeTownsfolk(species, rand);
  const col = spec.colors[(rand() * spec.colors.length) | 0];
  const light = species === 'kitten' && col === 0x3a3d45 ? 0xf4efe6 : shade(col, 1.15);
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.36;
  g.add(body);
  const hedgehog = species === 'hedgehog';
  const squirrel = species === 'squirrel';

  // Torso: longer than it is tall, with a lighter chest
  const torso = sphere(0.27, hedgehog ? 0xe8cfa8 : col, 0, 0.06, -0.02, 16);
  torso.scale.set(0.95, 0.85, 1.3);
  body.add(torso);
  if (!hedgehog) {
    const chest = sphere(0.19, light, 0, 0.12, 0.2, 12);
    chest.scale.set(1, 1.1, 0.8);
    body.add(chest);
  }

  // Legs on hip/shoulder pivots so they can swing
  const legs = [];
  const legLen = hedgehog ? 0.16 : 0.26;
  const legCol = hedgehog ? 0x8d6a4a : col;
  for (const [x, z] of [[0.14, 0.18], [-0.14, 0.18], [0.14, -0.2], [-0.14, -0.2]]) {
    const leg = new THREE.Group();
    leg.position.set(x, -0.02, z);
    leg.add(cyl(0.06, 0.055, legLen, legCol, 0, -legLen / 2, 0, 8));
    const paw = sphere(0.068, shade(legCol, species === 'dalmatian' ? 1 : 1.08), 0, -legLen, 0.02, 8);
    paw.scale.set(1, 0.75, 1.25);
    leg.add(paw);
    body.add(leg);
    legs.push(leg);
  }
  body.position.y = legLen + 0.07;

  // Head on a neck pivot
  const head = new THREE.Group();
  head.position.set(0, hedgehog ? 0.08 : 0.36, hedgehog ? 0.36 : 0.3);
  body.add(head);
  const skull = sphere(0.3, hedgehog ? 0xe8cfa8 : col, 0, 0, 0, 18);
  skull.scale.set(1.05, 0.95, 0.95);
  head.add(skull);
  const eyes = blinkEyes(head, 0.12, 0.03, 0.25);
  const noseCol = ['puppy', 'dalmatian', 'hedgehog'].includes(species) ? 0x2b2b30 : 0xff7f9e;
  const ears = [];
  let tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.36);
  body.add(tail);
  const tailSegs = [];
  // a chain of segments that curves; each segment is a child of the last
  const chain = (n, r0, r1, len, color, bend) => {
    let parent = tail;
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : len;
      seg.rotation.x = bend;
      const r = r0 + (r1 - r0) * (i / Math.max(1, n - 1));
      const m = sphere(r, color, 0, len / 2, 0, 10);
      m.scale.set(1, (len / (2 * r)) * 1.25, 1);
      seg.add(m);
      parent.add(seg);
      tailSegs.push(seg);
      parent = seg;
    }
    return parent;
  };

  if (species === 'kitten') {
    head.add(sphere(0.035, noseCol, 0, -0.07, 0.29, 8));
    const muzzle = sphere(0.1, light, 0, -0.1, 0.22, 10);
    muzzle.scale.set(1.3, 0.75, 0.8);
    head.add(muzzle);
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.17 * s, 0.22, -0.02);
      ear.rotation.z = -0.3 * s;
      const outer = cone(0.13, 0.26, col, 0, 0.1, 0, 4);
      outer.rotation.y = Math.PI / 4;
      ear.add(outer);
      const inner = cone(0.07, 0.15, 0xff9fb5, 0, 0.07, 0.05, 4);
      inner.rotation.y = Math.PI / 4;
      ear.add(inner);
      head.add(ear);
      ears.push(ear);
      for (const k of [-1, 1]) {
        const w = cyl(0.006, 0.006, 0.22, 0xffffff, s * 0.2, -0.09 + k * 0.025, 0.22, 3);
        w.rotation.z = Math.PI / 2 + k * 0.15 * s;
        head.add(w);
      }
    }
    if (col === 0xffa65c) for (const z of [-0.12, 0.02]) body.add(box(0.36, 0.05, 0.06, 0xe07b2c, 0, 0.29, z)); // tabby stripes
    tail.position.set(0, 0.16, -0.36);
    tail.rotation.x = -0.9;
    chain(5, 0.05, 0.045, 0.13, col, 0.32);
  } else if (species === 'puppy' || species === 'dalmatian') {
    const muzzle = sphere(0.13, species === 'dalmatian' ? 0xfafaf6 : light, 0, -0.08, 0.22, 10);
    muzzle.scale.set(1.2, 0.8, 0.9);
    head.add(muzzle);
    head.add(sphere(0.045, noseCol, 0, -0.04, 0.34, 8));
    const tongue = sphere(0.04, 0xff7f9e, 0, -0.17, 0.27, 6);
    tongue.scale.set(1, 0.5, 1);
    head.add(tongue);
    const earCol = species === 'dalmatian' ? 0x2b2b30 : shade(col, 0.72);
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.25 * s, 0.12, -0.02);
      const flap = sphere(0.1, earCol, 0, -0.1, 0, 10);
      flap.scale.set(0.45, 1.25, 0.85);
      ear.add(flap);
      ear.rotation.z = 0.25 * s;
      head.add(ear);
      ears.push(ear);
    }
    tail.position.set(0, 0.16, -0.36);
    tail.rotation.x = -0.5;
    chain(2, 0.05, 0.04, 0.14, col, 0.25);
    if (species === 'dalmatian') {
      for (const [x, y, z, r] of [[0.16, 0.22, -0.1, 0.07], [-0.14, 0.2, -0.24, 0.06], [0.05, 0.3, 0.04, 0.05], [-0.2, 0.08, 0.08, 0.05], [0.2, 0.0, -0.25, 0.05]]) body.add(sphere(r, 0x2b2b30, x, y, z, 6));
      head.add(sphere(0.055, 0x2b2b30, 0.15, 0.18, 0.18, 6));
      const collar = cyl(0.17, 0.17, 0.05, 0xe63946, 0, 0.27, 0.22, 14);
      collar.rotation.x = 0.5;
      body.add(collar);
      const tag = cyl(0.04, 0.04, 0.02, 0xffd23f, 0, 0.17, 0.36, 8);
      tag.rotation.x = Math.PI / 2;
      body.add(tag);
    }
  } else if (species === 'bunny') {
    head.add(sphere(0.03, noseCol, 0, -0.06, 0.29, 8));
    const muzzle = sphere(0.09, light, 0, -0.1, 0.23, 10);
    muzzle.scale.set(1.3, 0.75, 0.8);
    head.add(muzzle);
    head.add(box(0.06, 0.05, 0.02, 0xffffff, 0, -0.17, 0.28)); // buck teeth
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.1 * s, 0.24, -0.04);
      ear.rotation.z = -0.15 * s;
      const outer = sphere(0.085, col, 0, 0.2, 0, 10);
      outer.scale.set(0.75, 2.6, 0.5);
      ear.add(outer);
      const inner = sphere(0.05, 0xff9fb5, 0, 0.2, 0.03, 8);
      inner.scale.set(0.6, 2.5, 0.3);
      ear.add(inner);
      head.add(ear);
      ears.push(ear);
    }
    tail.add(sphere(0.11, 0xffffff, 0, 0, -0.03, 10));
    // big back feet
    for (const l of legs.slice(2)) l.children[1].scale.set(1.2, 0.75, 1.8);
  } else if (hedgehog) {
    // spiky dome over the back
    const spikeCol = 0x6b4a2f;
    const dome = sphere(0.3, spikeCol, 0, 0.12, -0.06, 14);
    dome.scale.set(1.05, 0.9, 1.3);
    body.add(dome);
    const ico = new THREE.IcosahedronGeometry(1, 1);
    const pos = ico.attributes.position;
    const seen = new Set();
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const key = v.toArray().map((n) => n.toFixed(2)).join();
      if (seen.has(key) || v.y < -0.15 || v.z > 0.75) continue;
      seen.add(key);
      const sp = cone(0.07, 0.24, i % 3 ? spikeCol : 0xd9c3a0, 0, 0, 0, 4);
      sp.position.set(v.x * 0.3, 0.12 + v.y * 0.27, -0.06 + v.z * 0.38);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
      body.add(sp);
    }
    // pointy snout with a button nose
    head.scale.setScalar(0.72);
    const snout = cone(0.15, 0.32, 0xe8cfa8, 0, -0.06, 0.32, 10);
    snout.rotation.x = Math.PI / 2;
    head.add(snout);
    head.add(sphere(0.06, noseCol, 0, -0.06, 0.48, 8));
    for (const s of [1, -1]) head.add(sphere(0.07, 0xd9b48a, 0.19 * s, 0.2, -0.04, 8));
  } else if (squirrel) {
    head.add(sphere(0.03, noseCol, 0, -0.06, 0.29, 8));
    const muzzle = sphere(0.1, light, 0, -0.1, 0.22, 10);
    muzzle.scale.set(1.3, 0.75, 0.8);
    head.add(muzzle);
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.16 * s, 0.24, -0.04);
      ear.add(cone(0.07, 0.17, col, 0, 0.08, 0, 6));
      ear.add(cone(0.02, 0.08, shade(col, 0.8), 0, 0.2, 0, 4)); // tufts
      head.add(ear);
      ears.push(ear);
    }
    // a big smooth bushy plume curling up behind
    tail.position.set(0, 0.06, -0.38);
    tail.rotation.x = -1.15;
    chain(7, 0.13, 0.17, 0.12, shade(col, 1.08), 0.32);
    // holding an acorn
    body.add(sphere(0.07, 0x9a6a4a, 0, 0.1, 0.36, 8));
    body.add(sphere(0.06, 0x5a3a20, 0, 0.15, 0.36, 8));
  }
  const S = hedgehog ? 0.85 : squirrel ? 0.8 : 1;
  g.scale.setScalar(S * 1.1);
  addOutline(g, 0.02);
  return { group: g, body, head, tail, tailSegs, legs, ears, eyes, species, baseY: body.position.y };
}

/** A cute (but deeply unbothered) goose. Returns { group, neck, body }. */
export function makeGoose() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const WHITE = 0xfbfbf6;
  const ORANGE = 0xff9a2a;
  const torso = sphere(0.45, WHITE, 0, 0.62, -0.05, 16);
  torso.scale.set(0.95, 0.85, 1.15);
  body.add(torso);
  const tail = cone(0.2, 0.3, WHITE, 0, 0.78, -0.55, 8);
  tail.rotation.x = -2.0;
  body.add(tail);
  for (const s of [1, -1]) {
    const wing = sphere(0.3, 0xe9e9e0, 0.36 * s, 0.68, -0.08, 10);
    wing.scale.set(0.35, 0.65, 1.1);
    wing.rotation.x = 0.2;
    body.add(wing);
    // little orange legs and webbed feet
    body.add(cyl(0.035, 0.035, 0.28, ORANGE, 0.14 * s, 0.15, 0, 6));
    const foot = sphere(0.1, ORANGE, 0.14 * s, 0.02, 0.07, 8);
    foot.scale.set(1, 0.3, 1.3);
    body.add(foot);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 0.85, 0.3);
  body.add(neck);
  neck.add(cyl(0.12, 0.15, 0.45, WHITE, 0, 0.2, 0, 10));
  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.04);
  neck.add(head);
  head.add(sphere(0.25, WHITE, 0, 0, 0, 16));
  // round beak with a nostril
  const beak = sphere(0.11, ORANGE, 0, -0.04, 0.24, 10);
  beak.scale.set(1.1, 0.65, 1.4);
  head.add(beak);
  head.add(sphere(0.02, 0xc96a10, 0.04, 0.0, 0.33, 4));
  cuteEyes(head, 0.25, 0.11, 0.06, 0.19, 0.85);
  // grumpy eyebrows: the attitude stays
  for (const s of [1, -1]) {
    const brow = box(0.11, 0.025, 0.03, 0x1b1b22, 0.1 * s, 0.17, 0.2);
    brow.rotation.z = 0.45 * s;
    head.add(brow);
  }
  // fluffy tuft
  head.add(sphere(0.06, WHITE, 0, 0.25, -0.02, 6));
  addOutline(g, 0.02);
  return { group: g, neck, body };
}

// ---------------------------------------------------------------------------
// Buildings for the special blocks
// ---------------------------------------------------------------------------

function signPlane(lines, w, h, opts) {
  const tex = textTexture(lines, { w: 1024, h: Math.round((1024 * h) / w), ...opts });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: !opts.bg }));
}

function windowRow(g, n, x0, dx, y, z, w = 1.4, h = 1.3) {
  for (let i = 0; i < n; i++) {
    g.add(box(w + 0.2, h + 0.2, 0.12, 0xffffff, x0 + i * dx, y, z));
    g.add(box(w, h, 0.14, 0, x0 + i * dx, y, z + 0.01, nightMats.windows));
  }
}

/** The Rusty Lid: the neighborhood bar. Faces +z. Footprint 16 x 10. */
export function makeBar() {
  const g = new THREE.Group();
  const BRICK = 0xb5543c;
  g.add(box(16, 5.2, 10, BRICK, 0, 2.6, 0));
  for (let y = 0.6; y < 5; y += 0.6) g.add(box(16.04, 0.05, 10.04, shade(BRICK, 0.85), 0, y, 0)); // brick courses
  g.add(box(16.6, 0.5, 10.6, 0x6b3a2c, 0, 5.4, 0)); // parapet cap
  // Door, windows, striped awning
  g.add(box(1.8, 2.8, 0.15, 0x3a2a20, 0, 1.4, 5.05));
  g.add(sphere(0.09, 0xffd23f, 0.6, 1.4, 5.15, 6));
  windowRow(g, 2, -5.2, 2.4, 2.0, 5.02, 1.8, 1.6);
  windowRow(g, 2, 2.8, 2.4, 2.0, 5.02, 1.8, 1.6);
  for (let i = 0; i < 8; i++) {
    const stripe = box(2.0, 0.08, 1.6, i % 2 ? 0xfffbe8 : 0x2d936c, -7 + i * 2, 3.35, 5.75);
    stripe.rotation.x = 0.35;
    g.add(stripe);
  }
  // Neon sign on the roof
  const neon = signPlane(['THE RUSTY LID'], 9, 1.6, { color: '#ffe066', stroke: '#ff4f9a', font: 'bold 150px "Trebuchet MS", sans-serif' });
  neon.position.set(0, 6.8, 2);
  g.add(neon);
  g.add(box(9.4, 2.0, 0.2, 0x2b2d33, 0, 6.8, 1.88));
  for (const s of [-4, 4]) g.add(box(0.15, 1.4, 0.15, 0x2b2d33, s, 5.9, 1.9));
  // A giant tipped-over beer mug... of root beer, obviously
  const mug = cyl(0.7, 0.7, 1.5, 0xc98b2c, 7, 6.4, -2, 12);
  g.add(mug);
  g.add(cyl(0.74, 0.74, 0.35, 0xfffbe8, 7, 7.25, -2, 12));
  // String lights over the patio
  for (let i = 0; i < 9; i++) g.add(sphere(0.12, 0, -7 + i * 1.75, 4.2 - Math.sin((i / 8) * Math.PI) * 0.4, 7.5, 6, nightMats.lamps));
  for (const s of [-7.5, 7.5]) g.add(cyl(0.07, 0.07, 4.3, 0x2b2d33, s, 2.15, 7.5, 6));
  return g;
}

/** Binsville Elementary. Faces +z. Footprint 22 x 9. */
export function makeSchool() {
  const g = new THREE.Group();
  const WALL = 0xf2d17e;
  g.add(box(22, 7.4, 9, WALL, 0, 3.7, 0));
  g.add(box(22.4, 0.4, 9.4, 0xd9534f, 0, 7.6, 0));
  windowRow(g, 6, -9, 3.6, 2.0, 4.52, 2.0, 1.6);
  windowRow(g, 6, -9, 3.6, 5.3, 4.52, 2.0, 1.6);
  // Entrance with steps and doors
  g.add(box(5, 4.2, 1.2, 0xe8c36a, 0, 2.1, 5.0));
  g.add(box(3, 2.6, 0.15, 0x3d7ea6, 0, 1.3, 5.62));
  g.add(box(0.06, 2.6, 0.17, 0xffffff, 0, 1.3, 5.64));
  g.add(box(6, 0.3, 1.5, 0xd9d4c7, 0, 0.15, 6.2));
  const sign = signPlane(['BINSVILLE', 'ELEMENTARY'], 5, 1.4, { bg: '#2d936c', color: '#fffbe8', font: 'bold 150px "Trebuchet MS", sans-serif' });
  sign.position.set(0, 3.5, 5.62);
  g.add(sign);
  // Bell tower with a clock
  g.add(box(3, 3, 3, 0xe8c36a, 0, 9.3, 0));
  g.add(box(1.8, 1.6, 0.1, 0x2b2d33, 0, 9.4, 1.52));
  const roof = cone(2.5, 2.4, 0xd9534f, 0, 12.0, 0, 4);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const clock = cyl(0.9, 0.9, 0.1, 0xfffbe8, 0, 9.3, 1.55, 20);
  clock.rotation.x = Math.PI / 2;
  g.add(clock);
  g.add(box(0.08, 0.6, 0.05, 0x2b2d33, 0, 9.5, 1.62));
  g.add(box(0.45, 0.08, 0.05, 0x2b2d33, 0.2, 9.3, 1.62));
  return g;
}

export function makeFlagpole() {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.1, 9, 0xd5d9df, 0, 4.5, 0, 8));
  g.add(sphere(0.18, 0xffd23f, 0, 9.1, 0, 8));
  const flag = new THREE.Group();
  flag.position.set(0, 8.2, 0);
  const tex = textTexture(['🦝'], { w: 256, h: 160, bg: '#3d7ea6', color: '#fff', font: '110px sans-serif' });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  f.position.x = 1.1;
  flag.add(f);
  g.add(flag);
  g.userData.flag = flag;
  return g;
}

export function makeSchoolBus() {
  const g = new THREE.Group();
  const Y = 0xffc21a;
  g.add(box(2.6, 2.4, 8.5, Y, 0, 1.75, 0));
  g.add(box(2.4, 1.2, 1.4, Y, 0, 1.15, 4.9));
  g.add(box(2.62, 0.12, 8.52, 0x2b2d33, 0, 1.4, 0));
  for (let i = 0; i < 6; i++) for (const s of [1.31, -1.31]) {
    const w = box(0.04, 0.8, 1.0, 0, s, 2.35, -3.3 + i * 1.25, nightMats.windows);
    g.add(w);
  }
  g.add(box(2.2, 0.9, 0.05, 0, 0, 2.4, 4.26, nightMats.windows));
  g.add(signPlane(['SCHOOL BUS'], 2.2, 0.4, { bg: '#ffc21a', color: '#2b2d33', font: 'bold 110px sans-serif' }));
  g.children[g.children.length - 1].position.set(0, 3.15, 4.27);
  for (const z of [3.2, -2.8]) for (const s of [1.25, -1.25]) {
    const w = cyl(0.55, 0.55, 0.4, 0x2a2a2e, s, 0.55, z, 14);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  for (const s of [0.8, -0.8]) g.add(cyl(0.18, 0.18, 0.1, 0, s, 1.2, 5.62, 10, glow(0xfff4c2, 0.8)));
  g.children.slice(-2).forEach((m) => (m.rotation.x = Math.PI / 2));
  return g;
}

export function makePlayground() {
  const g = new THREE.Group();
  // slide
  g.add(box(1.6, 0.15, 1.6, 0xd9534f, 0, 2.4, 0));
  for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) g.add(cyl(0.07, 0.07, 2.4, 0x3d7ea6, x, 1.2, z, 6));
  const slide = box(0.9, 0.1, 3.6, 0xffc21a, 0, 1.25, 2.3);
  slide.rotation.x = 0.68;
  g.add(slide);
  for (let i = 0; i < 5; i++) g.add(box(0.8, 0.06, 0.12, 0x3d7ea6, 0, 0.4 + i * 0.45, -0.85));
  // swings
  const sx = 4.5;
  for (const s of [-1.6, 1.6]) {
    const leg = cyl(0.08, 0.08, 3.4, 0x2d936c, sx + s, 1.6, 0, 6);
    leg.rotation.z = s > 0 ? -0.12 : 0.12;
    g.add(leg);
  }
  g.add(cyl(0.08, 0.08, 3.4, 0x2d936c, sx, 3.25, 0, 6));
  g.children[g.children.length - 1].rotation.z = Math.PI / 2;
  for (const s of [-0.7, 0.7]) {
    g.add(cyl(0.02, 0.02, 2.3, 0x9aa0a8, sx + s - 0.25, 2.1, 0, 4));
    g.add(cyl(0.02, 0.02, 2.3, 0x9aa0a8, sx + s + 0.25, 2.1, 0, 4));
    g.add(box(0.7, 0.08, 0.35, 0xff7a1a, sx + s, 0.95, 0));
  }
  // sandbox
  g.add(box(3, 0.3, 3, 0xc98b4f, -4.5, 0.15, 0));
  g.add(box(2.7, 0.32, 2.7, 0xf2dca2, -4.5, 0.16, 0));
  return g;
}

/** Fire Station 9. Faces +z. Footprint 16 x 11, plus a hose tower. */
export function makeFirehouse() {
  const g = new THREE.Group();
  const RED = 0xc8402e;
  g.add(box(16, 7, 11, RED, 0, 3.5, 0));
  g.add(box(16.4, 0.4, 11.4, 0xfffbe8, 0, 7.2, 0));
  for (let y = 0.7; y < 7; y += 0.7) g.add(box(16.04, 0.05, 11.04, shade(RED, 0.85), 0, y, 0));
  // Two big garage doors: left one open with the engine peeking out
  for (const x of [-4, 4]) g.add(box(6.2, 5, 0.12, 0xfffbe8, x, 2.5, 5.52));
  g.add(box(5.6, 4.6, 0.1, 0x2a2c31, -4, 2.3, 5.56));
  const door = box(5.6, 4.6, 0.12, 0xd9d4c7, 4, 2.3, 5.58);
  g.add(door);
  for (let i = 1; i < 6; i++) g.add(box(5.6, 0.05, 0.14, 0xb9b2a4, 4, i * 0.78, 5.6));
  windowRow(g, 3, -5.5, 5.5, 5.95, 5.52, 1.6, 0.9);
  const sign = signPlane(['FIRE STATION 9'], 9, 1.0, { bg: '#fffbe8', color: '#c8402e', font: 'bold 130px "Trebuchet MS", sans-serif' });
  sign.position.set(0, 6.6, 5.6);
  g.add(sign);
  // Hose-drying tower and siren
  g.add(box(3, 12, 3, shade(RED, 0.9), 9.5, 6, -3.5));
  g.add(box(3.4, 0.4, 3.4, 0xfffbe8, 9.5, 12.2, -3.5));
  g.add(cone(2.2, 1.6, 0x2b2d33, 9.5, 13.2, -3.5, 4));
  g.children[g.children.length - 1].rotation.y = Math.PI / 4;
  g.add(cyl(0.45, 0.5, 0.6, 0xe0e3e8, -6, 7.7, -2, 12));
  return g;
}

export function makeFireEngine() {
  const g = new THREE.Group();
  const RED = 0xe23b2e;
  g.add(box(2.6, 1.8, 6, RED, 0, 1.6, 0));
  g.add(box(2.6, 2.2, 1.8, RED, 0, 1.8, 2.9));
  g.add(box(2.4, 1.0, 0.05, 0, 0, 2.4, 3.82, nightMats.windows));
  g.add(box(2.7, 0.4, 0.3, 0xd5d9df, 0, 0.75, 3.9));
  g.add(box(2.62, 0.2, 6.02, 0xfffbe8, 0, 1.5, 0));
  g.add(box(0.6, 0.3, 0.6, 0, -0.6, 3.05, 2.9, glow(0xff3b3b, 1)));
  g.add(box(0.6, 0.3, 0.6, 0, 0.6, 3.05, 2.9, glow(0x3b8bff, 1)));
  // ladder on top
  for (const s of [-0.5, 0.5]) g.add(box(0.1, 0.1, 5, 0xd5d9df, s, 2.7, -0.6));
  for (let i = 0; i < 9; i++) g.add(box(1.0, 0.08, 0.08, 0xd5d9df, 0, 2.7, -3 + i * 0.6));
  for (const z of [2.6, -1.8]) for (const s of [1.25, -1.25]) {
    const w = cyl(0.55, 0.55, 0.4, 0x2a2a2e, s, 0.55, z, 14);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  return g;
}

export function makeShed() {
  const g = new THREE.Group();
  g.add(box(4, 2.8, 3, 0x8e5b3d, 0, 1.4, 0));
  for (let x = -1.8; x <= 1.8; x += 0.45) g.add(box(0.05, 2.8, 3.04, 0x6b4430, x, 1.4, 0));
  const r = box(4.6, 0.2, 3.6, 0x2d936c, 0, 3.0, 0);
  r.rotation.x = 0.15;
  g.add(r);
  g.add(box(1.2, 2.0, 0.1, 0x5a3a28, 0, 1.0, 1.52));
  g.add(signPlane(['COMMUNITY', 'GARDEN'], 3.4, 1.0, { bg: '#fffbe8', color: '#2d936c', font: 'bold 120px "Trebuchet MS", sans-serif' }));
  g.children[g.children.length - 1].position.set(0, 2.4, 1.56);
  return g;
}

export function makeScarecrow() {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.08, 3.0, 0x8e5b3d, 0, 1.5, 0, 6));
  const arms = cyl(0.06, 0.06, 2.4, 0x8e5b3d, 0, 2.3, 0, 6);
  arms.rotation.z = Math.PI / 2;
  g.add(arms);
  g.add(box(1.0, 1.0, 0.5, 0x3d7ea6, 0, 2.0, 0)); // shirt
  for (const s of [-1, 1]) g.add(cone(0.12, 0.3, 0xf2d17e, s * 1.25, 2.3, 0, 6));
  g.add(sphere(0.38, 0xe8cf9a, 0, 2.85, 0, 10));
  for (const s of [-0.12, 0.12]) g.add(box(0.08, 0.08, 0.05, 0x2b2d33, s, 2.92, 0.36));
  g.add(cyl(0.6, 0.6, 0.06, 0xc9a35a, 0, 3.15, 0, 14));
  g.add(cone(0.32, 0.45, 0xc9a35a, 0, 3.4, 0, 10));
  return g;
}

export function makeCabbage() {
  const g = new THREE.Group();
  g.scale.setScalar(1.5);
  g.add(sphere(0.32, 0x9fd86b, 0, 0.3, 0, 10));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = sphere(0.28, 0x6fbf4a, Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22, 8);
    leaf.scale.set(1, 0.45, 1);
    leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    g.add(leaf);
  }
  return g;
}

export function makePumpkin() {
  const g = new THREE.Group();
  g.scale.setScalar(1.5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lobe = sphere(0.3, 0xff8c2a, Math.cos(a) * 0.14, 0.3, Math.sin(a) * 0.14, 10);
    lobe.scale.set(0.8, 0.85, 0.8);
    g.add(lobe);
  }
  g.add(cyl(0.05, 0.07, 0.22, 0x5a7a2a, 0, 0.62, 0, 6));
  return g;
}

export function makeSunflower() {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.07, 2.4, 0x4f9a3a, 0, 1.2, 0, 6));
  for (const s of [-1, 1]) {
    const leaf = sphere(0.22, 0x4f9a3a, s * 0.22, 1.0, 0, 6);
    leaf.scale.set(1.2, 0.3, 0.6);
    g.add(leaf);
  }
  const headG = new THREE.Group();
  headG.position.set(0, 2.45, 0.05);
  headG.rotation.x = -0.35;
  const petals = cyl(0.55, 0.55, 0.06, 0xffd23f, 0, 0, 0, 14);
  petals.rotation.x = Math.PI / 2;
  headG.add(petals);
  const disk = cyl(0.3, 0.3, 0.1, 0x6b4430, 0, 0, 0.03, 14);
  disk.rotation.x = Math.PI / 2;
  headG.add(disk);
  g.add(headG);
  return g;
}

export function makeCarrots() {
  const g = new THREE.Group();
  for (const x of [-0.3, 0.3]) {
    // the carrot pokes out of the soil, with a big leafy top
    const c = cone(0.16, 0.5, 0xff8c2a, x, 0.12, 0, 10);
    c.rotation.x = Math.PI;
    g.add(c);
    for (let i = 0; i < 4; i++) {
      const top = cone(0.07, 0.6, 0x5cb84a, x + (i - 1.5) * 0.05, 0.62, 0, 5);
      top.rotation.z = (i - 1.5) * 0.35;
      g.add(top);
    }
  }
  return g;
}

let chainTex = null;
/** One 3-wide section of chain-link fence (runs along x), with a post at -x. */
export function makeChainFence() {
  if (!chainTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#d5d9df';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(64, 64);
    g.moveTo(64, 0);
    g.lineTo(0, 64);
    g.stroke();
    chainTex = new THREE.CanvasTexture(c);
    chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping;
    chainTex.repeat.set(6, 3.6);
    chainTex.anisotropy = 4;
  }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 1.8),
    new THREE.MeshToonMaterial({ map: chainTex, gradientMap: gradient, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xc9ccd3 }),
  );
  mesh.position.y = 1.1;
  g.add(mesh);
  g.add(cyl(0.09, 0.09, 2.2, 0x9aa0a8, -1.5, 1.1, 0, 8));
  const rail = cyl(0.05, 0.05, 3, 0x9aa0a8, 0, 2.02, 0, 6);
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  const bottom = cyl(0.03, 0.03, 3, 0x9aa0a8, 0, 0.2, 0, 6);
  bottom.rotation.z = Math.PI / 2;
  g.add(bottom);
  return g;
}

// ---------------------------------------------------------------------------
// Townsfolk: anthropomorphic neighbors on two legs. Faces +z, feet at y = 0.
// Returns the same shape as makeCritter plus { arms, biped: true }.
// ---------------------------------------------------------------------------
const FOLK = {
  bear: { top: 0x3d7ea6, pants: 0x3d7ea6, shoe: 0x5a3a28, light: 0xe8c9a0, girth: 1.18, height: 1.08 },
  fox: { top: 0x6c5ce7, pants: 0x6c5ce7, shoe: 0xfafaf6, light: 0xfafaf6, girth: 0.9, height: 1.0 },
  bunnylady: { top: 0xffb3c1, pants: null, shoe: 0xd9534f, light: 0xfff4f0, girth: 0.95, height: 0.98 },
  frog: { top: 0xffd23f, pants: 0x3d7ea6, shoe: 0xd9534f, light: 0xd8f0b8, girth: 0.9, height: 0.8 },
  badger: { top: 0xb5543c, pants: 0x55585f, shoe: 0x2b2d33, light: 0xfafaf6, girth: 1.0, height: 0.92 },
  mole: { top: 0x3d6fa5, pants: 0x2f4f7a, shoe: 0x2b2d33, light: 0xffb3c1, girth: 1.02, height: 0.9 },
  pig: { top: 0xfafaf6, pants: 0x8a8f99, shoe: 0x5a3a28, light: 0xff9fb5, girth: 1.12, height: 1.0 },
};

export function makeTownsfolk(kind, rand) {
  const spec = CRITTER_SPECIES[kind];
  const F = FOLK[kind];
  const fur = spec.colors[(rand() * spec.colors.length) | 0];
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  g.add(body);
  const G = F.girth;

  // Legs from the hips, with shoes
  const legs = [];
  for (const s of [1, -1]) {
    const leg = new THREE.Group();
    leg.position.set(0.13 * G * s, 0, 0);
    leg.add(cyl(0.085, 0.08, 0.5, F.pants ?? fur, 0, -0.25, 0, 10));
    const shoe = sphere(0.1, F.shoe, 0, -0.55, 0.05, 10);
    shoe.scale.set(1, 0.65, 1.5);
    leg.add(shoe);
    body.add(leg);
    legs.push(leg);
  }
  // Torso in clothes
  const torso = cyl(0.27 * G, 0.33 * G, 0.6, F.top, 0, 0.3, 0, 16);
  body.add(torso);
  const shoulders = sphere(0.27 * G, F.top, 0, 0.6, 0, 14);
  shoulders.scale.set(1, 0.55, 0.9);
  body.add(shoulders);
  if (kind === 'bunnylady') {
    const skirt = cone(0.42, 0.55, F.top, 0, 0.02, 0, 16);
    body.add(skirt);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      body.add(sphere(0.045, 0xffffff, Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3, 6)); // polka dots
    }
  }
  // Arms from the shoulders, with paws
  const arms = [];
  for (const s of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(0.31 * G * s, 0.56, 0);
    arm.rotation.z = 0.12 * s;
    const sleeve = kind === 'bear' || kind === 'pig' || kind === 'frog' ? fur : F.top; // short sleeves show fur
    arm.add(cyl(0.075, 0.07, 0.46, sleeve, 0, -0.23, 0, 8));
    arm.add(sphere(0.085, fur, 0, -0.48, 0, 8));
    body.add(arm);
    arms.push(arm);
  }

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.03, 0.02);
  head.scale.setScalar(1.22); // big heads, like everyone else in Binsville
  body.add(head);
  const frog = kind === 'frog';
  const skull = sphere(0.33, fur, 0, 0, 0, 18);
  skull.scale.set(frog ? 1.25 : 1.05, frog ? 0.8 : 0.95, 0.95);
  head.add(skull);
  const ears = [];
  let eyes;
  const muzzle = (col, z = 0.24, w = 1.25) => {
    const m = sphere(0.12, col, 0, -0.1, z, 10);
    m.scale.set(w, 0.78, 0.9);
    head.add(m);
  };
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.3);
  body.add(tail);
  const tailSegs = [];

  if (kind === 'bear') {
    muzzle(F.light);
    head.add(sphere(0.05, 0x2b2b30, 0, -0.06, 0.34, 8));
    eyes = blinkEyes(head, 0.13, 0.05, 0.26);
    for (const s of [1, -1]) {
      const ear = sphere(0.1, fur, 0.24 * s, 0.24, -0.02, 10);
      ear.scale.z = 0.6;
      head.add(ear);
      ears.push(ear);
    }
    // overalls straps + straw hat
    for (const s of [1, -1]) body.add(box(0.07, 0.4, 0.05, 0x2f5f86, 0.14 * s, 0.5, 0.3 * G));
    body.add(box(0.36, 0.26, 0.06, 0x3d7ea6, 0, 0.3, 0.31 * G));
    head.add(cyl(0.48, 0.48, 0.04, 0xf2d17e, 0, 0.24, 0, 18));
    head.add(cyl(0.24, 0.28, 0.22, 0xf2d17e, 0, 0.36, 0, 14));
    head.add(cyl(0.285, 0.285, 0.06, 0xd9534f, 0, 0.29, 0, 14));
    tail.add(sphere(0.08, fur, 0, 0, -0.02, 8));
  } else if (kind === 'fox') {
    const snout = cone(0.13, 0.3, F.light, 0, -0.08, 0.32, 10);
    snout.rotation.x = Math.PI / 2;
    head.add(snout);
    head.add(sphere(0.045, 0x2b2b30, 0, -0.08, 0.47, 8));
    eyes = blinkEyes(head, 0.13, 0.05, 0.25);
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.17 * s, 0.25, -0.02);
      ear.rotation.z = -0.25 * s;
      ear.add(cone(0.12, 0.3, fur, 0, 0.12, 0, 4));
      ear.add(cone(0.06, 0.16, 0x2b2b30, 0, 0.21, 0.02, 4));
      head.add(ear);
      ears.push(ear);
    }
    head.add(cyl(0.34, 0.34, 0.07, 0xff6b9d, 0, 0.14, 0, 16)); // sweatband
    body.add(box(0.04, 0.55, 0.02, 0xfafaf6, 0.27 * G, 0.3, 0)); // tracksuit stripes
    body.add(box(0.04, 0.55, 0.02, 0xfafaf6, -0.27 * G, 0.3, 0));
    tail.rotation.x = -0.9;
    let parent = tail;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.y = i ? 0.14 : 0;
      seg.rotation.x = 0.2;
      const m = sphere(0.1 + i * 0.015, i === 3 ? 0xfafaf6 : fur, 0, 0.08, 0, 10);
      m.scale.y = 1.2;
      seg.add(m);
      parent.add(seg);
      tailSegs.push(seg);
      parent = seg;
    }
  } else if (kind === 'bunnylady') {
    muzzle(F.light, 0.24, 1.2);
    head.add(sphere(0.035, 0xff7f9e, 0, -0.06, 0.32, 8));
    eyes = blinkEyes(head, 0.12, 0.04, 0.26);
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.1 * s, 0.26, -0.04);
      ear.rotation.z = -0.15 * s;
      const o = sphere(0.085, fur, 0, 0.22, 0, 10);
      o.scale.set(0.75, 2.7, 0.5);
      ear.add(o);
      const inn = sphere(0.05, 0xff9fb5, 0, 0.22, 0.03, 8);
      inn.scale.set(0.6, 2.6, 0.3);
      ear.add(inn);
      head.add(ear);
      ears.push(ear);
    }
    // bow between the ears, and a handbag
    head.add(sphere(0.06, 0xd9534f, 0, 0.3, 0.05, 8));
    for (const s of [1, -1]) {
      const lobe = sphere(0.08, 0xd9534f, 0.09 * s, 0.3, 0.05, 8);
      lobe.scale.set(1.2, 0.8, 0.6);
      head.add(lobe);
    }
    arms[1].add(box(0.2, 0.18, 0.1, 0xd9534f, 0, -0.62, 0.04));
    arms[1].add(cyl(0.015, 0.015, 0.16, 0x2b2d33, 0, -0.5, 0.04, 4));
    tail.add(sphere(0.1, 0xffffff, 0, -0.1, -0.06, 8));
  } else if (frog) {
    // big mouth, eyes on top, cap, backpack
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 4, 16, Math.PI), toon(0x2b2b30));
    mouth.position.set(0, -0.06, 0.29);
    mouth.rotation.set(-0.2, 0, Math.PI);
    head.add(mouth);
    for (const s of [1, -1]) head.add(sphere(0.13, fur, 0.17 * s, 0.24, 0.08, 10));
    eyes = blinkEyes(head, 0.17, 0.27, 0.19, 0.95);
    const cap = sphere(0.31, 0xd9534f, 0, 0.14, -0.08, 14);
    cap.scale.set(1, 0.45, 1);
    head.add(cap);
    const brim = cyl(0.22, 0.22, 0.03, 0xd9534f, 0, 0.12, 0.28, 14);
    brim.scale.z = 0.6;
    head.add(brim);
    body.add(box(0.34, 0.4, 0.18, 0x2d936c, 0, 0.38, -0.32));
    body.add(box(0.26, 0.14, 0.04, 0x247a59, 0, 0.3, -0.42));
  } else if (kind === 'badger') {
    muzzle(F.light, 0.25, 1.1);
    head.add(sphere(0.045, 0x2b2b30, 0, -0.07, 0.35, 8));
    // the stripes: white blaze down the middle, dark bands over the eyes
    for (const s of [1, -1]) {
      const band = sphere(0.14, 0x2b2b30, 0.15 * s, 0.07, 0.17, 10);
      band.scale.set(0.7, 1.6, 0.7);
      head.add(band);
    }
    const blaze = sphere(0.1, 0xfafaf6, 0, 0.13, 0.2, 10);
    blaze.scale.set(0.7, 1.9, 0.9);
    head.add(blaze);
    eyes = blinkEyes(head, 0.13, 0.04, 0.27);
    for (const s of [1, -1]) {
      const ear = sphere(0.07, 0xfafaf6, 0.25 * s, 0.2, -0.04, 8);
      head.add(ear);
      ears.push(ear);
      // reading glasses
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 4, 14), toon(0xc9a35a));
      lens.position.set(0.13 * s, 0.04, 0.32);
      head.add(lens);
    }
    // grey bun, cardigan buttons, and a cane
    head.add(sphere(0.12, 0xd5d9df, 0, 0.3, -0.12, 10));
    for (let i = 0; i < 3; i++) body.add(sphere(0.025, 0xffd23f, 0, 0.5 - i * 0.15, 0.32, 6));
    arms[0].add(cyl(0.025, 0.025, 0.85, 0x8e5b3d, 0, -0.85, 0.08, 6));
    tail.add(sphere(0.08, fur, 0, 0, -0.02, 8));
  } else if (kind === 'mole') {
    // pink star nose, tiny eyes, mail cap and bag
    head.add(sphere(0.09, 0xff9fb5, 0, -0.06, 0.33, 10));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      head.add(sphere(0.035, 0xff9fb5, Math.cos(a) * 0.08, -0.06 + Math.sin(a) * 0.08, 0.36, 6));
    }
    eyes = blinkEyes(head, 0.14, 0.09, 0.26, 0.75);
    head.add(cyl(0.3, 0.32, 0.18, 0x2f4f7a, 0, 0.27, -0.02, 14));
    const brim = cyl(0.2, 0.2, 0.03, 0x2b2d33, 0, 0.2, 0.22, 12);
    brim.scale.z = 0.6;
    head.add(brim);
    head.add(box(0.1, 0.07, 0.02, 0xffd23f, 0, 0.29, 0.3));
    const bag = box(0.34, 0.3, 0.14, 0x8e5b3d, 0.33 * G, 0.22, 0.05);
    body.add(bag);
    const strap = box(0.05, 0.85, 0.04, 0x6b4430, 0.05, 0.42, 0.3 * G);
    strap.rotation.z = 0.7;
    body.add(strap);
    for (const s of [1, -1]) arms[s > 0 ? 0 : 1].children[1].scale.set(1.5, 0.8, 1.2); // digging paws
  } else if (kind === 'pig') {
    const snout = cyl(0.11, 0.12, 0.08, F.light, 0, -0.06, 0.32, 14);
    snout.rotation.x = Math.PI / 2;
    head.add(snout);
    for (const s of [1, -1]) head.add(sphere(0.025, 0xc45d74, 0.04 * s, -0.06, 0.37, 6));
    eyes = blinkEyes(head, 0.14, 0.08, 0.25);
    for (const s of [1, -1]) {
      const ear = cone(0.09, 0.17, fur, 0.21 * s, 0.25, 0, 4);
      ear.rotation.set(0.5, 0, -0.4 * s);
      head.add(ear);
      ears.push(ear);
    }
    // chef's hat, apron, a baguette under one arm
    head.add(cyl(0.22, 0.2, 0.2, 0xffffff, 0, 0.34, -0.03, 14));
    const puff = sphere(0.28, 0xffffff, 0, 0.5, -0.03, 14);
    puff.scale.set(1, 0.6, 1);
    head.add(puff);
    body.add(box(0.42, 0.55, 0.04, 0xffffff, 0, 0.26, 0.32 * G));
    const bread = cyl(0.06, 0.06, 0.7, 0xd9a05b, 0, -0.35, 0.14, 8);
    bread.rotation.x = 1.2;
    arms[1].add(bread);
    // curly tail
    let parent = tail;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.y = i ? 0.06 : 0;
      seg.rotation.set(0.9, 0.6, 0);
      seg.add(sphere(0.035, fur, 0, 0.03, 0, 6));
      parent.add(seg);
      tailSegs.push(seg);
      parent = seg;
    }
  }
  g.scale.set(1.3 * G * 0.92, 1.3 * F.height, 1.3 * G * 0.92);
  addOutline(g, 0.018);
  return { group: g, body, head, tail, tailSegs, legs, arms, ears, eyes, species: kind, baseY: 0.62, biped: true };
}
