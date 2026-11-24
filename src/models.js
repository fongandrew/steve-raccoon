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
    if (!m.isMesh || m.userData.outline) return;
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
  // Side skirts between the wheels, with a little step
  for (const sx of [1.22, -1.22]) {
    body.add(box(0.12, 0.35, 2.2, GREEN_DARK, sx, 1.0, 0.25));
    body.add(box(0.35, 0.08, 0.6, CHROME, sx * 1.1, 0.85, 1.35));
  }

  // --- Cab: Steve leans out of the driver's window ---
  const cabZ = 2.45;
  body.add(box(2.7, 1.0, 1.9, TRUCK_WHITE, 0, 1.65, cabZ)); // lower cab
  body.add(box(2.74, 0.14, 1.94, TRUCK_GREEN, 0, 1.95, cabZ)); // green waistline stripe
  body.add(box(2.56, 0.03, 1.76, 0x3a3d45, 0, 2.16, cabZ)); // dark interior floor / dash
  body.add(box(2.3, 0.25, 0.35, 0x3a3d45, 0, 2.3, cabZ + 0.72)); // dashboard
  // Door seams + handles
  for (const sx of [1.356, -1.356]) {
    body.add(box(0.01, 0.85, 0.04, 0xb9bcc2, sx, 1.62, cabZ - 0.55));
    body.add(box(0.04, 0.06, 0.25, CHROME, sx * 1.01, 1.85, cabZ - 0.3));
  }
  // Pillars and back wall
  for (const sx of [1.29, -1.29]) {
    body.add(box(0.12, 0.98, 0.12, TRUCK_WHITE, sx, 2.64, cabZ + 0.89));
    body.add(box(0.12, 0.98, 0.12, TRUCK_WHITE, sx, 2.64, cabZ - 0.89));
  }
  body.add(box(2.7, 0.98, 0.1, TRUCK_WHITE, 0, 2.64, cabZ - 0.92));
  // Roof with a little visor over the windshield
  body.add(box(2.76, 0.16, 1.96, TRUCK_WHITE, 0, 3.17, cabZ));
  body.add(box(2.6, 0.08, 0.3, TRUCK_GREEN, 0, 3.08, cabZ + 1.05));
  // Glass: windshield only. Both side windows are rolled down: Steve hangs out
  // the driver's side and his tail flops out the passenger side.
  const glass = new THREE.MeshToonMaterial({ color: 0xbfeaff, gradientMap: gradient, transparent: true, opacity: 0.3, depthWrite: false });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 0.92), glass);
  ws.position.set(0, 2.62, cabZ + 0.9);
  body.add(ws);
  // Window sills
  for (const sx of [1.33, -1.33]) body.add(box(0.14, 0.08, 1.7, 0xd5d9df, sx, 2.18, cabZ));
  // Mirrors on the front fenders, so they don't block Steve's view (or ours)
  for (const sx of [1, -1]) {
    body.add(cyl(0.03, 0.03, 0.5, DARK, sx * 1.25, 2.1, 3.55, 6));
    body.add(box(0.26, 0.3, 0.08, DARK, sx * 1.25, 2.4, 3.55));
    body.add(box(0.2, 0.24, 0.02, 0, sx * 1.25, 2.4, 3.5, toon(0xcfefff, { emissive: 0x8fbfd8, emissiveIntensity: 0.3 })));
  }
  // Seat behind Steve
  body.add(box(1.0, 1.0, 0.25, 0x8e5b3d, 0.6, 2.3, cabZ - 0.75));

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
  body.add(cyl(0.11, 0.11, 2.3, 0xaab0b8, 1.22, 2.55, cabZ - 1.15, 10));
  body.add(cyl(0.15, 0.11, 0.18, 0x55585f, 1.22, 3.75, cabZ - 1.15, 10));
  body.add(box(0.06, 0.6, 0.3, 0x55585f, 1.36, 2.2, cabZ - 1.15));

  // --- Compactor body ---
  const compZ = -1.25;
  body.add(box(2.9, 1.9, 4.4, TRUCK_GREEN, 0, 2.15, compZ));
  const roundTop = cyl(1.45, 1.45, 4.4, TRUCK_GREEN, 0, 3.1, compZ, 20);
  roundTop.rotation.x = Math.PI / 2;
  roundTop.scale.set(1, 1, 0.28);
  body.add(roundTop);
  body.add(box(2.95, 0.25, 4.45, 0xf9d849, 0, 1.6, compZ)); // yellow stripe
  // Reinforcement ribs at both ends
  for (const z of [compZ + 2.12, compZ - 2.12]) {
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
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.3), logoMat);
    logo.position.set(1.475 * side, 2.43, compZ);
    logo.rotation.y = (Math.PI / 2) * side;
    body.add(logo);
  }

  // Grabber arm (right side = -x), mounted low under the logo. At rest the
  // claw hangs by the skirt; when grabbing it swings out to the curb.
  const arm = new THREE.Group();
  arm.position.set(-1.6, 1.3, 0.75);
  body.add(box(0.3, 0.3, 0.3, 0x55585f, -1.5, 1.3, 0.75)); // mount
  const armUpper = new THREE.Group();
  arm.add(armUpper);
  armUpper.add(box(0.22, 0.22, 1.5, 0xffc93c, 0, 0, -0.65));
  const elbow = new THREE.Group();
  elbow.position.set(0, 0, -1.35);
  armUpper.add(elbow);
  const joint = cyl(0.15, 0.15, 0.3, 0x55585f, 0, 0, 0, 10);
  joint.rotation.z = Math.PI / 2;
  elbow.add(joint);
  elbow.add(box(0.2, 0.75, 0.2, 0xffc93c, 0, -0.4, 0));
  const claw = new THREE.Group();
  claw.position.set(0, -0.8, 0);
  elbow.add(claw);
  claw.add(box(0.12, 0.12, 0.8, 0x55585f, -0.12, 0, 0));
  for (const z of [0.36, -0.36]) {
    claw.add(box(0.4, 0.12, 0.12, 0x55585f, -0.3, 0, z));
    claw.add(box(0.12, 0.25, 0.12, 0x55585f, -0.48, 0.1, z));
  }
  body.add(arm);

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
  const fenderGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.66, 16, 1, true, -Math.PI / 2, Math.PI);
  fenderGeo.rotateZ(Math.PI / 2);
  const fenderMat = toon(0x3a3d45, { side: THREE.DoubleSide });
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
      const fender = new THREE.Mesh(fenderGeo, fenderMat);
      fender.position.set(sx, 0.7, z);
      fender.castShadow = true;
      body.add(fender);
    }
  }

  // Steve sits in the driver's seat (left, +x) and leans out the window:
  // body inside, a stretched neck, head and one arm outside in the breeze.
  const steve = makeRaccoon();
  const lean = 0.4;
  steve.group.position.set(0.65, 1.62, cabZ - 0.1);
  steve.group.rotation.z = -lean;
  steve.group.scale.setScalar(1.05);
  steve.group.userData.baseY = 1.62;
  steve.head.position.set(0.85, 1.35, 0.05);
  steve.head.userData.baseTilt = lean * 0.7;
  const neck = sphere(0.3, 0x8b9096, 0.42, 0.9, 0.02, 12);
  steve.group.add(neck);
  addOutline(neck);
  body.add(steve.group);
  // Tail flops out the passenger window
  steve.tail[0].parent.position.set(-0.4, 0.55, -0.2);
  steve.tail[0].parent.rotation.set(0.0, 1.57, 0.3, 'ZYX');
  steve.tail[0].parent.scale.setScalar(1.3);

  // Steering wheel with column
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 18), toon(DARK));
  wheel.position.set(0.55, 2.5, cabZ + 0.5);
  wheel.rotation.x = -1.0;
  body.add(wheel);
  const column = cyl(0.05, 0.05, 0.4, DARK, 0.55, 2.4, cabZ + 0.62, 6);
  column.rotation.x = 0.6;
  body.add(column);

  // A tiny air freshener shaped like a pine tree (ironic)
  body.add(cone(0.08, 0.2, 0x2ecc71, -0.3, 2.95, cabZ + 0.75, 6));

  const hopperLocal = new THREE.Vector3(0, 3.8, -3.5);

  return { group, body, wheels, frontWheels, arm, armUpper, elbow, beacon, beaconMat, steve, hopperLocal, lampMat };
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
