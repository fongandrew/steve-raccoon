import * as THREE from 'three';
import {
  buildWorld, groundHeight, isOnLawn, surfaceHeight, HALF, N, BLOCK, PITCH, ROAD, ROAD_Y, LAWN_Y, roadCenter, blockCenter, rng,
} from './world.js';
import { makeTruck, makeCat, makeCloud, nightMats, toon, glow } from './models.js';
import { Audio } from './audio.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const SHIFT = 180; // seconds per shift
const CAPACITY = 12;
const MAX_SPEED = 24;
const ACTIVE_CANS = 7;
const GRAVITY = 30;
const STAR_SCORES = [250, 550, 900];

const SNACKS = [
  { h: 40, msg: 'Half a burrito. Still warm-ish.' },
  { h: 25, fx: 'zoom', msg: 'Coffee grounds! Steve is VIBRATING.' },
  { h: 20, fx: 'hiccups', msg: 'Flat soda. Oh no. Hiccups.' },
  { h: 45, msg: 'Fish bones! A delicacy.' },
  { h: 5, msg: '...that was a sock, Steve.' },
  { h: 35, msg: 'Pizza crust. The best part.' },
  { h: 50, fx: 'zoom', msg: 'Birthday cake! Happy birthday, Steve!' },
  { h: 25, msg: 'A banana peel. Vintage.' },
  { h: 30, fx: 'hiccups', msg: 'Mystery leftovers. Bold choice.' },
  { h: 30, msg: 'Cold french fries. Perfection.' },
  { h: 15, msg: 'A single grape. Steve savors it.' },
];

const QUIPS = [
  'Steve thinks this is the best job in the world.',
  "One raccoon's trash is... also this raccoon's treasure.",
  'Steve has been told, again, not to eat on the job.',
  'Steve waves at a pigeon. The pigeon does not wave back.',
  'Fun fact: Steve has never passed a driving test.',
  'Steve is humming the trash truck song. There is no trash truck song.',
  'Steve would like to remind you that the claw is not a toy. (It is.)',
  "Steve's mom would be so proud. She lives in a dumpster.",
];

const RANKS = [
  [0, 'Trash Intern'],
  [200, 'Garbage Gremlin'],
  [450, 'Bin Bandit'],
  [750, 'Dumpster Duke'],
  [1100, 'Supreme Trash Panda'],
];

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x9ed8ff); // horizon color, shared with fog
scene.fog = new THREE.Fog(skyColor, 110, 320);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 900);

// Gradient sky dome with a soft sun
const skyUniforms = {
  top: { value: new THREE.Color(0x5fb4f2) },
  horizon: { value: skyColor },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunCol: { value: new THREE.Color(0xfff2c8) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, top, smoothstep(0.0, 0.5, d.y));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (smoothstep(0.9985, 0.9992, s) * 0.9 + pow(s, 14.0) * 0.22);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// Puffy clouds drifting overhead and low hills on the horizon. These use
// unlit materials with baked "faux light" vertex colors so they don't pick up
// the green bounce light from the ground.
function fauxShade(geo, lo, hi) {
  const n = geo.attributes.normal;
  const col = new Float32Array(n.count * 3);
  const L = new THREE.Vector3(0.4, 1, 0.3).normalize();
  for (let i = 0; i < n.count; i++) {
    const k = lo + (hi - lo) * Math.max(0, n.getX(i) * L.x + n.getY(i) * L.y + n.getZ(i) * L.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
const clouds = new THREE.Group();
{
  const r = rng(99);
  for (let i = 0; i < 16; i++) {
    const c = makeCloud(r, cloudMat);
    c.traverse((m) => m.isMesh && fauxShade(m.geometry, 0.86, 1.0));
    const a = (i / 16) * Math.PI * 2 + r() * 0.3;
    const d = 140 + r() * 260;
    c.position.set(Math.cos(a) * d, 70 + r() * 50, Math.sin(a) * d);
    c.rotation.y = r() * 6;
    c.scale.setScalar(0.9 + r() * 0.8);
    clouds.add(c);
  }
}
scene.add(clouds);
const hillMat = new THREE.MeshBasicMaterial({ color: 0x79c46a, vertexColors: true, fog: false });
const hillBase = new THREE.Color(0x6fbf62);
{
  const r = rng(7);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + r() * 0.2;
    const d = 430 + r() * 60;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    fauxShade(geo, 0.78, 1.0);
    const hill = new THREE.Mesh(geo, hillMat);
    hill.scale.set(60 + r() * 60, 18 + r() * 24, 60 + r() * 60);
    hill.position.set(Math.cos(a) * d, -6, Math.sin(a) * d);
    hill.rotation.y = r() * 6;
    scene.add(hill);
  }
}

const hemi = new THREE.HemisphereLight(0xffffff, 0x9cc27a, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 260 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const world = buildWorld(scene);
const audio = new Audio();

// ---------------------------------------------------------------------------
// Truck
// ---------------------------------------------------------------------------
const truck = makeTruck();
scene.add(truck.group);
const steve = truck.steve;

const T = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  heading: 0,
  y: 0,
  vy: 0,
  grounded: true,
  airTime: 0,
  steer: 0,
  fwd: 0,
  lat: 0,
  squash: 0,
  squashV: 0,
  pitch: 0,
  roll: 0,
};

// Guide arrow floating above the truck: a chunky chevron with an ink outline
const guide = new THREE.Group();
const guideMat = toon(0x7cf3a0, { emissive: 0x7cf3a0, emissiveIntensity: 0.45 });
{
  const sh = new THREE.Shape();
  sh.moveTo(0, 1.3);
  sh.lineTo(1.1, 0.1);
  sh.lineTo(0.45, 0.1);
  sh.lineTo(0.45, -1.0);
  sh.lineTo(-0.45, -1.0);
  sh.lineTo(-0.45, 0.1);
  sh.lineTo(-1.1, 0.1);
  sh.lineTo(0, 1.3);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, guideMat);
  guide.add(m);
  guide.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x24262b })));
  guide.scale.setScalar(0.8);
}
scene.add(guide);

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------
const cats = [];
for (let i = 0; i < 7; i++) {
  const c = makeCat(Math.random);
  scene.add(c.group);
  const stars = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), glow(0xffd23f, 0.8));
    s.position.set(Math.cos((k / 3) * Math.PI * 2) * 0.5, 0, Math.sin((k / 3) * Math.PI * 2) * 0.5);
    stars.add(s);
  }
  stars.position.y = 1.4;
  stars.visible = false;
  c.group.add(stars);
  cats.push({ ...c, stars, x: 0, z: 0, y: 0, h: 0, state: 'walk', t: 0, vx: 0, vz: 0, vy: 0, spin: 0, brave: false });
}

function placeCat(cat) {
  const bx = (Math.random() * N) | 0;
  const bz = (Math.random() * N) | 0;
  const side = (Math.random() * 4) | 0;
  const off = (Math.random() - 0.5) * (BLOCK - 4);
  const e = BLOCK / 2 - 0.8;
  const cx = blockCenter(bx);
  const cz = blockCenter(bz);
  const spots = [[cx + off, cz + e, Math.PI / 2], [cx + off, cz - e, -Math.PI / 2], [cx + e, cz + off, 0], [cx - e, cz + off, Math.PI]];
  const [x, z, h] = spots[side];
  Object.assign(cat, { x, z, y: surfaceHeight(x, z), h, state: 'walk', t: Math.random() * 4, brave: Math.random() < 0.4 });
  if (Math.hypot(x - T.pos.x, z - T.pos.z) < 30) cat.x += 60 * (x > 0 ? -1 : 1);
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
const particles = [];
const pGeoBox = new THREE.BoxGeometry(1, 1, 1);
const pGeoSphere = new THREE.IcosahedronGeometry(0.5, 1);
const TRASH_COLORS = [0x6d6d6d, 0x8d6e63, 0x4caf50, 0x3f51b5, 0xff7043, 0xffd23f, 0xb0bec5];

function spawnParticle({ pos, vel, color = 0xffffff, size = 0.3, life = 1, grav = 0, grow = 0, sphere = false, drag = 0, alpha = 1 }) {
  let p = particles.find((q) => q.life <= 0);
  if (!p) {
    if (particles.length > 400) return;
    const mesh = new THREE.Mesh(pGeoBox, new THREE.MeshBasicMaterial({ transparent: true }));
    scene.add(mesh);
    p = { mesh, vel: new THREE.Vector3(), life: 0 };
    particles.push(p);
  }
  p.mesh.geometry = sphere ? pGeoSphere : pGeoBox;
  p.mesh.material.color.setHex(color);
  p.mesh.material.opacity = 1;
  p.mesh.position.copy(pos);
  p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  p.mesh.scale.setScalar(size);
  p.mesh.visible = true;
  p.vel.copy(vel);
  Object.assign(p, { life, maxLife: life, grav, grow, size, drag, alpha });
}

function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vel.y -= p.grav * dt;
    if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.2 && p.grav > 0) {
      p.mesh.position.y = 0.2;
      p.vel.set(p.vel.x * 0.5, Math.abs(p.vel.y) * 0.3, p.vel.z * 0.5);
    }
    p.mesh.rotation.x += dt * 4;
    const k = p.life / p.maxLife;
    p.mesh.scale.setScalar(p.size * (1 + p.grow * (1 - k)));
    p.mesh.material.opacity = Math.min(1, k * 2) * p.alpha;
  }
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

function burst(pos, n, opts) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (opts.speed || 6) * (0.5 + Math.random() * 0.7);
    spawnParticle({
      ...opts,
      pos,
      color: opts.colors ? opts.colors[(Math.random() * opts.colors.length) | 0] : opts.color,
      vel: new THREE.Vector3(Math.cos(a) * s * 0.6, (opts.up || 6) * (0.6 + Math.random() * 0.6), Math.sin(a) * s * 0.6),
    });
  }
}

// ---------------------------------------------------------------------------
// HUD helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = {
  score: $('score'), clock: $('clock'), loadText: $('loadText'), loadBar: $('loadBar'),
  hungerText: $('hungerText'), hungerBar: $('hungerBar'), status: $('status'), toast: $('toast'), popups: $('popups'),
};
const popups = [];

function popup(text, anchor, cls = '', yOff = 0) {
  // Anchor is kept by reference, so popups on the truck ride along with it.
  const el = document.createElement('div');
  el.className = `popup ${cls}`;
  el.textContent = text;
  hud.popups.appendChild(el);
  popups.push({ el, anchor, yOff: 2 + yOff, t: 0, life: 1.4 });
}

function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt;
    tmpV.copy(p.anchor);
    tmpV.y += p.yOff + p.t * 2.5;
    tmpV.project(camera);
    if (p.t > p.life || tmpV.z > 1) {
      p.el.remove();
      popups.splice(i, 1);
      continue;
    }
    p.el.style.left = `${((tmpV.x + 1) / 2) * window.innerWidth}px`;
    p.el.style.top = `${((1 - tmpV.y) / 2) * window.innerHeight}px`;
    p.el.style.opacity = String(Math.min(1, (p.life - p.t) * 3));
  }
}

function toast(msg, dur = 3.2) {
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  hud.toast.appendChild(el);
  while (hud.toast.children.length > 3) hud.toast.firstChild.remove();
  setTimeout(() => (el.style.opacity = '0'), dur * 1000);
  setTimeout(() => el.remove(), dur * 1000 + 500);
}

// Minimap
const mini = $('minimap');
const mctx = mini.getContext('2d');
const MAP_R = HALF + 6;
const toMap = (x, z) => [((-x + MAP_R) / (2 * MAP_R)) * mini.width, ((-z + MAP_R) / (2 * MAP_R)) * mini.height];
const MK = mini.width / 200; // minimap pixel scale (canvas is drawn at 2x)
const mapBg = document.createElement('canvas');
mapBg.width = mini.width;
mapBg.height = mini.height;
(() => {
  const g = mapBg.getContext('2d');
  const s = mapBg.width / (2 * MAP_R);
  g.fillStyle = '#8fd16a';
  g.fillRect(0, 0, mapBg.width, mapBg.height);
  // Asphalt everywhere inside town, then blocks on top
  const [ax, ay] = toMap(HALF + ROAD / 2, HALF + ROAD / 2);
  g.fillStyle = '#5f6470';
  g.fillRect(ax, ay, (2 * HALF + ROAD) * s, (2 * HALF + ROAD) * s);
  g.strokeStyle = 'rgba(255, 243, 176, 0.7)';
  g.lineWidth = MK;
  g.setLineDash([3 * MK, 3 * MK]);
  for (let i = 0; i <= N; i++) {
    const c = roadCenter(i);
    const [x] = toMap(c, 0);
    const [, y] = toMap(0, c);
    g.beginPath();
    g.moveTo(x, ay);
    g.lineTo(x, ay + (2 * HALF + ROAD) * s);
    g.moveTo(ax, y);
    g.lineTo(ax + (2 * HALF + ROAD) * s, y);
    g.stroke();
  }
  g.setLineDash([]);
  const lawn = { houses: '#8fd16a', park: '#7cc85c', plaza: '#e8dcc0', dump: '#b39a72' };
  const rect = (x0, z0, x1, z1, col) => {
    const [px0, py0] = toMap(x1, z1);
    const [px1, py1] = toMap(x0, z0);
    g.fillStyle = col;
    g.fillRect(px0, py0, px1 - px0, py1 - py0);
  };
  const dot = (x, z, r, col) => {
    const [px, py] = toMap(x, z);
    g.fillStyle = col;
    g.beginPath();
    g.arc(px, py, r * s, 0, Math.PI * 2);
    g.fill();
  };
  for (const b of world.blocks) {
    rect(b.cx - BLOCK / 2, b.cz - BLOCK / 2, b.cx + BLOCK / 2, b.cz + BLOCK / 2, '#d9d4c7');
    rect(b.cx - BLOCK / 2 + 1.5, b.cz - BLOCK / 2 + 1.5, b.cx + BLOCK / 2 - 1.5, b.cz + BLOCK / 2 - 1.5, lawn[b.type]);
    if (b.type === 'houses') dot(b.cx, b.cz, 2.2, '#4fa95a');
    if (b.type === 'plaza') {
      dot(b.cx, b.cz, 5, '#bcb3a0');
      dot(b.cx, b.cz, 4, '#6ec6ff');
    }
    if (b.type === 'dump') dot(b.cx + 6, b.cz - 6, 7, '#8d6e4f');
  }
  for (const r of world.ramps) {
    const ex = r.x + r.dirX * r.len;
    const ez = r.z + r.dirZ * r.len;
    rect(Math.min(r.x, ex) - (r.dirZ ? r.w / 2 : 0), Math.min(r.z, ez) - (r.dirX ? r.w / 2 : 0),
      Math.max(r.x, ex) + (r.dirZ ? r.w / 2 : 0), Math.max(r.z, ez) + (r.dirX ? r.w / 2 : 0), '#e0a565');
  }
  for (const h of world.houses) {
    const [px, py] = toMap(h.x, h.z);
    g.save();
    g.translate(px, py);
    g.rotate(-h.facing);
    g.fillStyle = '#' + new THREE.Color(h.roofCol).getHexString();
    g.fillRect(-4.5 * s, -3.6 * s, 9 * s, 7.2 * s);
    g.restore();
  }
})();

function drawMinimap(time) {
  mctx.drawImage(mapBg, 0, 0);
  // dump
  const [dx, dy] = toMap(world.dump.x, world.dump.z);
  mctx.fillStyle = state.load >= CAPACITY ? (Math.sin(time * 8) > 0 ? '#ff7a1a' : '#ffd23f') : '#ff7a1a';
  mctx.beginPath();
  mctx.arc(dx, dy, 6 * MK, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = '#2b2d33';
  mctx.lineWidth = 1.5 * MK;
  mctx.stroke();
  mctx.fillStyle = '#fff';
  mctx.font = `bold ${9 * MK}px sans-serif`;
  mctx.textAlign = 'center';
  mctx.lineWidth = 3 * MK;
  mctx.strokeText('DUMP', dx, dy - 9 * MK);
  mctx.fillText('DUMP', dx, dy - 9 * MK);
  // cans
  for (const h of world.houses) {
    if (h.state !== 'out') continue;
    const [x, y] = toMap(h.canX, h.canZ);
    mctx.fillStyle = h.golden ? '#ffd23f' : '#2ecc71';
    mctx.strokeStyle = '#2b2d33';
    mctx.lineWidth = 1.5 * MK;
    mctx.beginPath();
    mctx.arc(x, y, (h.golden ? 5 : 4) * MK, 0, Math.PI * 2);
    mctx.fill();
    mctx.stroke();
  }
  // truck
  const [tx, ty] = toMap(T.pos.x, T.pos.z);
  mctx.save();
  mctx.translate(tx, ty);
  mctx.rotate(-T.heading);
  mctx.scale(MK, MK);
  mctx.fillStyle = '#fff';
  mctx.strokeStyle = '#2b2d33';
  mctx.lineWidth = 2;
  mctx.beginPath();
  mctx.moveTo(0, -8);
  mctx.lineTo(6, 6);
  mctx.lineTo(0, 3);
  mctx.lineTo(-6, 6);
  mctx.closePath();
  mctx.fill();
  mctx.stroke();
  mctx.restore();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set();
const pressed = new Set(); // edge-triggered this frame
const KEYMAP = {
  KeyW: 'gas', ArrowUp: 'gas', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'drift', ShiftLeft: 'drift', KeyE: 'snack', KeyH: 'honk', KeyR: 'reset', KeyP: 'pause', Escape: 'pause', KeyM: 'mute', Enter: 'enter',
};
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
  audio.init();
  audio.resume();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) keys.delete(k);
});
for (const btn of document.querySelectorAll('#touch button')) {
  const k = btn.dataset.key;
  const down = (e) => {
    e.preventDefault();
    audio.init();
    audio.resume();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    btn.classList.add('on');
  };
  const up = (e) => {
    e.preventDefault();
    keys.delete(k);
    btn.classList.remove('on');
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const state = {
  mode: 'title', // title | playing | paused | results
  time: 0,
  score: 0,
  load: 0,
  hunger: 100,
  hangry: false,
  zoomT: 0,
  hicT: 0,
  hicNext: 0,
  chompT: 0,
  snackCd: 0,
  honkCd: 0,
  grab: null,
  spawnT: 0,
  streak: 0,
  lastCollect: -99,
  dumping: null,
  quipT: 20,
  beepT: 0,
  shake: 0,
  celebrateT: 0,
  warned: false,
  stats: null,
};

function resetGame() {
  T.pos.set(roadCenter(3), 0, blockCenter(2));
  T.vel.set(0, 0, 0);
  T.heading = 0;
  T.y = ROAD_Y;
  T.vy = 0;
  T.grounded = true;
  T.steer = 0;
  camHeading = 0;
  Object.assign(state, {
    time: 0, score: 0, load: 0, hunger: 100, hangry: false, zoomT: 0, hicT: 0, chompT: 0, snackCd: 0, honkCd: 0,
    grab: null, spawnT: 0, streak: 0, lastCollect: -99, dumping: null, quipT: 18, shake: 0, celebrateT: 0, warned: false,
    stats: { cans: 0, golden: 0, bags: 0, snacks: 0, bonks: 0, cats: 0, air: 0, loads: 0 },
  });
  for (const h of world.houses) {
    h.state = 'idle';
    h.cooldown = 0;
    h.golden = false;
    for (const o of [h.can.group, h.goldCan.group, h.marker.group, h.goldMarker.group]) o.visible = false;
  }
  for (const p of world.props) resetProp(p);
  for (const c of cats) placeCat(c);
  for (let i = 0; i < ACTIVE_CANS; i++) spawnCan(true);
}

function resetProp(p) {
  p.knocked = false;
  p.mesh.position.copy(p.home);
  p.mesh.rotation.set(0, p.homeRot, 0);
  p.geyser = 0;
}

// ---------------------------------------------------------------------------
// Trash cans
// ---------------------------------------------------------------------------
function spawnCan(silent = false) {
  const candidates = world.houses.filter(
    (h) => h.state === 'idle' && h.cooldown <= 0 && Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z) > 30,
  );
  if (!candidates.length) return;
  const h = candidates[(Math.random() * candidates.length) | 0];
  h.state = 'out';
  h.golden = Math.random() < 0.13;
  const can = h.golden ? h.goldCan : h.can;
  can.group.visible = true;
  can.group.position.set(h.canX, 0.2, h.canZ);
  can.group.rotation.set(0, Math.random() * 6, 0);
  can.lid.rotation.set(0, 0, 0);
  (h.golden ? h.goldMarker : h.marker).group.visible = true;
  if (!silent) {
    if (h.golden) toast(`✨ ${cap(h.name)} on ${h.street} put out a GOLDEN can! ✨`);
    else if (Math.random() < 0.3) toast(`${cap(h.name)} on ${h.street} put their trash out.`);
  }
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function canFor(h) {
  return h.golden ? h.goldCan : h.can;
}

function startGrab(h) {
  h.state = 'grabbing';
  h.marker.group.visible = false;
  h.goldMarker.group.visible = false;
  state.grab = { h, t: 0, added: false, from: new THREE.Vector3(h.canX, 0.2, h.canZ) };
  audio.grab();
}

function updateGrab(dt) {
  const g = state.grab;
  if (!g) {
    // relax arm
    truck.armUpper.rotation.z += (0 - truck.armUpper.rotation.z) * Math.min(1, dt * 6);
    truck.elbow.rotation.x += (0 - truck.elbow.rotation.x) * Math.min(1, dt * 6);
    return;
  }
  g.t += dt;
  const can = canFor(g.h);
  const hop = truck.group.localToWorld(tmpV.copy(truck.hopperLocal));
  const ease = (x) => x * x * (3 - 2 * x);
  let armLift = 0;
  if (g.t < 0.55) {
    const s = ease(g.t / 0.55);
    can.group.position.lerpVectors(g.from, hop, s);
    can.group.position.y += Math.sin(s * Math.PI) * 3.5;
    can.group.rotation.x = s * Math.PI * 0.9;
    can.group.rotation.z = Math.sin(s * Math.PI) * 0.6;
    armLift = s;
  } else if (g.t < 1.1) {
    can.group.position.copy(hop);
    can.group.position.x += Math.sin(g.t * 50) * 0.15;
    can.group.rotation.x = Math.PI * 0.9 + Math.sin(g.t * 40) * 0.15;
    can.lid.rotation.x = -1.8;
    armLift = 1;
    if (Math.random() < 0.6) {
      spawnParticle({
        pos: hop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.4, (Math.random() - 0.5) * 0.6)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2),
        color: TRASH_COLORS[(Math.random() * TRASH_COLORS.length) | 0],
        size: 0.25 + Math.random() * 0.2, life: 0.5, grav: 15,
      });
    }
    if (!g.added && g.t > 0.8) {
      g.added = true;
      collectBags(g.h);
    }
  } else if (g.t < 1.6) {
    const s = ease((g.t - 1.1) / 0.5);
    can.group.position.lerpVectors(hop, g.from, s);
    can.group.position.y += Math.sin(s * Math.PI) * 2;
    can.group.rotation.x = (1 - s) * Math.PI * 0.9;
    can.group.rotation.z = 0;
    armLift = 1 - s;
  } else {
    can.group.position.copy(g.from);
    can.group.rotation.set(0, can.group.rotation.y, 0);
    can.lid.rotation.x = -0.6; // left ajar, as is tradition
    g.h.state = 'done';
    g.h.hideT = 4;
    state.grab = null;
  }
  truck.armUpper.rotation.z = -armLift * 1.2;
  truck.elbow.rotation.x = Math.sin(armLift * Math.PI) * 0.8;
}

function collectBags(h) {
  const n = h.golden ? 5 : 1 + ((Math.random() * 3) | 0);
  const got = Math.min(n, CAPACITY - state.load);
  state.load += got;
  state.stats.cans++;
  state.stats.bags += got;
  const pos = truck.group.position;
  if (state.time - state.lastCollect < 14) state.streak++;
  else state.streak = 1;
  state.lastCollect = state.time;
  let pts = 5;
  if (state.streak > 1) pts += 5 * (state.streak - 1);
  if (h.golden) {
    pts += 50;
    state.stats.golden++;
    audio.golden();
    popup(`GOLDEN! +${got} bags`, pos, 'gold', 4);
    burst(pos.clone().add(new THREE.Vector3(0, 4, 0)), 25, { colors: [0xffd23f, 0xffffff, 0xffb300], size: 0.25, life: 1, grav: 12, speed: 10, up: 9 });
  } else {
    audio.collect(got);
    popup(`+${got} bag${got > 1 ? 's' : ''}`, pos, 'good', 4);
  }
  addScore(pts);
  if (state.streak > 1) {
    setTimeout(() => popup(`STREAK x${state.streak}!`, truck.group.position, 'fun', 2), 250);
  }
  if (got < n) toast("Truck's stuffed! Some trash fell on the lawn. Oops.");
  if (state.load >= CAPACITY) toast('🚛 Truck is FULL! Head to The Dump (orange on the map).');
}

function addScore(n) {
  state.score = Math.max(0, state.score + n);
}

// ---------------------------------------------------------------------------
// Truck physics
// ---------------------------------------------------------------------------
let camHeading = 0;
const prevPos = new THREE.Vector3();

function updateTruck(dt) {
  const playing = state.mode === 'playing';
  const gas = playing && keys.has('gas') ? 1 : 0;
  const brake = playing && keys.has('brake') ? 1 : 0;
  const steerIn = playing ? (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0) : 0;
  const drift = playing && keys.has('drift');

  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  const rx = -fz;
  const rz = fx;
  let fwd = T.vel.x * fx + T.vel.z * fz;
  let lat = T.vel.x * rx + T.vel.z * rz;

  const lawn = isOnLawn(world, T.pos.x, T.pos.z);
  let maxSpeed = MAX_SPEED;
  let accel = 17;
  if (state.zoomT > 0) {
    maxSpeed *= 1.45;
    accel *= 1.6;
  }
  if (state.hangry) {
    maxSpeed *= 0.65;
    accel *= 0.6;
  }
  if (lawn) maxSpeed *= 0.5;

  if (T.grounded) {
    const throttle = gas - brake;
    if (throttle > 0) {
      if (fwd < maxSpeed) fwd = Math.min(maxSpeed, fwd + accel * dt * (fwd < 0 ? 2.5 : 1));
    } else if (throttle < 0) {
      if (fwd > 0.5) fwd -= 38 * dt;
      else fwd = Math.max(-9, fwd - 14 * dt);
    } else {
      fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), (3 + Math.abs(fwd) * 0.35) * dt);
    }
    if (fwd > maxSpeed) fwd -= (fwd - maxSpeed) * Math.min(1, 2.5 * dt);
    if (drift) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 4 * dt);
    const grip = drift ? 1.6 : 9;
    lat *= Math.exp(-grip * dt);
  }

  // Steering
  const steerMax = 0.6 / (1 + Math.abs(fwd) / 14);
  let target = steerIn * steerMax;
  if (state.hangry) target += Math.sin(state.time * 2.7) * 0.18 + Math.sin(state.time * 7.1) * 0.08;
  T.steer += (target - T.steer) * Math.min(1, dt * 8);
  const yawRate = (fwd * Math.tan(T.steer)) / 3.8 * (drift ? 1.45 : 1) * (T.grounded ? 1 : 0.3);
  T.heading += yawRate * dt;

  const nfx = Math.sin(T.heading);
  const nfz = Math.cos(T.heading);
  T.vel.set(nfx * fwd - nfz * lat, 0, nfz * fwd + nfx * lat);
  T.fwd = fwd;
  T.lat = lat;

  prevPos.copy(T.pos);
  T.pos.addScaledVector(T.vel, dt);

  // Vertical: ramps & air time
  const gh = groundHeight(world, T.pos.x, T.pos.z);
  if (gh - T.y > 0.9) {
    // Hit the side of a ramp: treat as wall
    T.pos.copy(prevPos);
    T.vel.multiplyScalar(-0.3);
    bonk(8);
  } else if (T.grounded) {
    if (gh >= T.y - 0.25) {
      T.vy = (gh - T.y) / Math.max(dt, 1e-3);
      T.y = gh;
    } else {
      T.grounded = false;
      T.airTime = 0;
    }
  }
  if (!T.grounded) {
    T.vy -= GRAVITY * dt;
    T.y += T.vy * dt;
    T.airTime += dt;
    if (T.y <= gh) {
      const impact = -T.vy;
      T.y = gh;
      T.grounded = true;
      T.squashV -= Math.min(6, impact * 0.25);
      if (impact > 6) {
        audio.bonk(0.6);
        burst(truck.group.position, 12, { color: 0xd9c9a3, size: 0.5, life: 0.7, grav: 6, speed: 8, up: 3, sphere: true, grow: 1.5 });
        state.shake = Math.max(state.shake, 0.4);
      }
      if (T.airTime > 0.45 && playing) {
        const pts = Math.round(T.airTime * 50);
        addScore(pts);
        state.stats.air = Math.max(state.stats.air, T.airTime);
        audio.boing();
        popup(`AIR TIME! +${pts}`, truck.group.position, 'fun');
        if (T.airTime > 0.9) toast(['Steve has achieved liftoff.', 'The neighbors are filming.', 'Trash truck physics: optional.'][(Math.random() * 3) | 0]);
      }
      T.vy = 0;
    }
  }

  // Static collisions (two circles along the truck body)
  let maxImpact = 0;
  for (const off of [1.9, -1.9]) {
    const c = tmpV2.set(T.pos.x + nfx * off, 0, T.pos.z + nfz * off);
    const r = 1.6;
    for (const b of world.boxes) {
      if (c.x < b.minX - r || c.x > b.maxX + r || c.z < b.minZ - r || c.z > b.maxZ + r) continue;
      const qx = Math.max(b.minX, Math.min(c.x, b.maxX));
      const qz = Math.max(b.minZ, Math.min(c.z, b.maxZ));
      let nx = c.x - qx;
      let nz = c.z - qz;
      let d = Math.hypot(nx, nz);
      let pen;
      if (d < 1e-4) {
        // center inside box: push out along the shallowest axis
        const dl = c.x - b.minX;
        const dr = b.maxX - c.x;
        const dd = c.z - b.minZ;
        const du = b.maxZ - c.z;
        const m = Math.min(dl, dr, dd, du);
        nx = m === dl ? -1 : m === dr ? 1 : 0;
        nz = m === dd ? -1 : m === du ? 1 : 0;
        pen = m + r;
      } else {
        if (d >= r) continue;
        nx /= d;
        nz /= d;
        pen = r - d;
      }
      maxImpact = Math.max(maxImpact, resolve(c, nx, nz, pen));
    }
    for (const s of world.circles) {
      const dx = c.x - s.x;
      const dz = c.z - s.z;
      const d = Math.hypot(dx, dz);
      const rr = r + s.r;
      if (d >= rr || d < 1e-4) continue;
      maxImpact = Math.max(maxImpact, resolve(c, dx / d, dz / d, rr - d));
    }
  }
  if (maxImpact > 7) bonk(maxImpact);
}

function resolve(c, nx, nz, pen) {
  T.pos.x += nx * pen;
  T.pos.z += nz * pen;
  c.x += nx * pen;
  c.z += nz * pen;
  const vn = T.vel.x * nx + T.vel.z * nz;
  if (vn < 0) {
    T.vel.x -= 1.35 * vn * nx;
    T.vel.z -= 1.35 * vn * nz;
    return -vn;
  }
  return 0;
}

let lastBonk = 0;
function bonk(strength) {
  if (state.time - lastBonk < 0.4) return;
  lastBonk = state.time;
  audio.bonk(Math.min(1, strength / 15));
  T.squashV -= Math.min(5, strength * 0.25);
  state.shake = Math.max(state.shake, Math.min(0.8, strength * 0.04));
  if (strength > 10 && state.mode === 'playing') {
    popup(['BONK!', 'OOF!', 'WHOMP!', 'CLONK!'][(Math.random() * 4) | 0], truck.group.position, 'bad');
  }
}

// ---------------------------------------------------------------------------
// Props (cones, mailboxes, hydrants)
// ---------------------------------------------------------------------------
function updateProps(dt) {
  const speed = Math.hypot(T.vel.x, T.vel.z);
  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  for (const p of world.props) {
    if (!p.knocked) {
      if (T.y > 2) continue;
      for (const off of [1.9, -1.9]) {
        const cx = T.pos.x + fx * off;
        const cz = T.pos.z + fz * off;
        const dx = p.home.x - cx;
        const dz = p.home.z - cz;
        const d = Math.hypot(dx, dz);
        if (d < 1.7 + p.r) {
          knockProp(p, dx / (d || 1), dz / (d || 1), speed);
          break;
        }
      }
      continue;
    }
    // flying / resting
    p.timer += dt;
    const floor = p.home.y;
    if (p.mesh.position.y > floor || p.vel.y > 0) {
      p.vel.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (p.mesh.position.y <= floor) {
        p.mesh.position.y = floor;
        if (Math.abs(p.vel.y) > 4) {
          p.vel.y = -p.vel.y * 0.35;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        } else {
          p.vel.set(0, 0, 0);
          p.mesh.rotation.x = Math.PI / 2;
          p.mesh.rotation.z = 0;
        }
      }
    }
    if (p.geyser > 0) {
      p.geyser -= dt;
      for (let i = 0; i < 3; i++) {
        spawnParticle({
          pos: p.home.clone().add(new THREE.Vector3(0, 0.5, 0)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, 11 + Math.random() * 4, (Math.random() - 0.5) * 2.5),
          color: Math.random() < 0.5 ? 0x6ec6ff : 0xc8ecff, size: 0.3, life: 1.4, grav: 18, sphere: true,
        });
      }
      if (!p.washed && Math.hypot(T.pos.x - p.home.x, T.pos.z - p.home.z) < 3.5) {
        p.washed = true;
        addScore(10);
        popup('FREE CAR WASH! +10', truck.group.position, 'fun');
        audio.splash();
      }
    }
    if (p.timer > 25 && Math.hypot(T.pos.x - p.home.x, T.pos.z - p.home.z) > 40) resetProp(p);
  }
}

function knockProp(p, nx, nz, speed) {
  p.knocked = true;
  p.timer = 0;
  const power = Math.max(4, speed);
  p.vel.set(T.vel.x * 0.9 + nx * power * 0.4, 4 + power * 0.35, T.vel.z * 0.9 + nz * power * 0.4);
  p.spin.set((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20);
  p.mesh.position.y = p.home.y + 0.05;
  if (state.mode !== 'playing') return;
  const pos = p.mesh.position.clone();
  if (p.kind === 'cone') {
    addScore(2);
    audio.boing();
    popup('boop! +2', pos, 'fun');
  } else if (p.kind === 'mailbox') {
    addScore(-10);
    state.stats.bonks++;
    audio.bonk(0.7);
    popup('MAILBOX! -10', pos, 'bad');
    burst(pos.add(new THREE.Vector3(0, 1, 0)), 10, { color: 0xffffff, size: 0.35, life: 2, grav: 2, speed: 5, up: 5, drag: 1.5 });
    if (Math.random() < 0.4) toast(['Steve did not see that mailbox. Steve sees very little.', 'That was a federal offense. Probably.', 'Somebody\'s birthday card is now airborne.'][(Math.random() * 3) | 0]);
  } else if (p.kind === 'hydrant') {
    addScore(-15);
    state.stats.bonks++;
    audio.bonk(1);
    audio.splash();
    p.geyser = 7;
    p.washed = false;
    popup('HYDRANT! -15', pos, 'bad');
  }
}

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------
function catBlocked(x, z) {
  for (const b of world.boxes) if (x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5) return true;
  for (const s of world.circles) if (Math.hypot(x - s.x, z - s.z) < s.r + 0.5) return true;
  return Math.abs(x) > HALF + 3 || Math.abs(z) > HALF + 3;
}

function scareCat(c, strength = 1) {
  if (c.state === 'fly' || c.state === 'jump') return;
  const dx = c.x - T.pos.x;
  const dz = c.z - T.pos.z;
  // leap perpendicular to the truck's path, away from it
  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  let sx = -fz;
  let sz = fx;
  if (sx * dx + sz * dz < 0) {
    sx = -sx;
    sz = -sz;
  }
  c.state = 'jump';
  c.vx = sx * 9 * strength;
  c.vz = sz * 9 * strength;
  c.vy = 9;
  c.h = Math.atan2(sx, sz);
  c.brave = Math.random() < 0.35;
  if (Math.random() < 0.5) popup(['nope!', 'eep!', 'hiss!', '!!!'][(Math.random() * 4) | 0], c.group.position, 'fun');
}

function updateCats(dt, time) {
  const speed = Math.hypot(T.vel.x, T.vel.z);
  for (const c of cats) {
    c.t -= dt;
    const dist = Math.hypot(c.x - T.pos.x, c.z - T.pos.z);
    if (c.state === 'walk' || c.state === 'sit') {
      if (c.t <= 0) {
        if (c.state === 'walk' && Math.random() < 0.35) {
          c.state = 'sit';
          c.t = 2 + Math.random() * 3;
        } else {
          c.state = 'walk';
          c.h += (Math.random() - 0.5) * 2.5;
          c.t = 2 + Math.random() * 4;
        }
      }
      if (c.state === 'walk') {
        const nx = c.x + Math.sin(c.h) * 2.2 * dt;
        const nz = c.z + Math.cos(c.h) * 2.2 * dt;
        if (catBlocked(nx, nz)) c.h += Math.PI * (0.5 + Math.random());
        else {
          c.x = nx;
          c.z = nz;
          c.y = surfaceHeight(nx, nz);
        }
      }
      // Truck approaching?
      const approaching = (c.x - T.pos.x) * T.vel.x + (c.z - T.pos.z) * T.vel.z > 0;
      if (dist < 9 && speed > 5 && approaching && !c.brave && T.y < 1) scareCat(c);
      // Collision
      if (dist < 3.4 && T.y < 1.5) {
        for (const off of [1.9, -1.9]) {
          const d = Math.hypot(c.x - (T.pos.x + Math.sin(T.heading) * off), c.z - (T.pos.z + Math.cos(T.heading) * off));
          if (d < 2.1) {
            if (speed > 3) {
              c.state = 'fly';
              c.vx = T.vel.x * 0.8 + (c.x - T.pos.x) * 1.5;
              c.vz = T.vel.z * 0.8 + (c.z - T.pos.z) * 1.5;
              c.vy = 12;
              c.spin = 14;
              audio.meow();
              if (state.mode === 'playing') {
                addScore(-15);
                state.stats.cats++;
                popup('MRRROW! -15', c.group.position.clone(), 'bad');
                if (state.stats.cats === 1) toast('The cat is fine. The cat is FURIOUS, but fine.');
              }
            } else {
              // nudge
              c.x += (c.x - T.pos.x) * 0.1;
              c.z += (c.z - T.pos.z) * 0.1;
            }
            break;
          }
        }
      }
    } else if (c.state === 'jump' || c.state === 'fly') {
      c.vy -= GRAVITY * 0.8 * dt;
      const nx = c.x + c.vx * dt;
      const nz = c.z + c.vz * dt;
      if (!catBlocked(nx, nz)) {
        c.x = nx;
        c.z = nz;
      } else {
        c.vx *= -0.4;
        c.vz *= -0.4;
      }
      c.y += c.vy * dt;
      if (c.state === 'fly') c.body.rotation.x += c.spin * dt;
      const floor = surfaceHeight(c.x, c.z);
      if (c.y <= floor) {
        c.y = floor;
        c.body.rotation.x = 0;
        if (c.state === 'fly') {
          c.state = 'dazed';
          c.t = 3;
          c.stars.visible = true;
        } else {
          c.state = 'walk';
          c.t = 1 + Math.random() * 2;
        }
      }
    } else if (c.state === 'dazed') {
      c.stars.rotation.y += dt * 5;
      if (c.t <= 0) {
        c.state = 'walk';
        c.stars.visible = false;
        c.h += Math.PI;
        c.t = 3;
      }
    }
    c.group.position.set(c.x, c.y, c.z);
    c.group.rotation.y = c.h;
    const walkBob = c.state === 'walk' ? Math.abs(Math.sin(time * 12 + c.x)) * 0.08 : 0;
    c.body.position.y = walkBob;
    c.body.scale.y = c.state === 'sit' ? 0.85 : 1;
    c.tail.rotation.z = Math.sin(time * 3 + c.z) * 0.5;
  }
}

// ---------------------------------------------------------------------------
// Steve's animation & truck visuals
// ---------------------------------------------------------------------------
let blinkT = 2;

function animateTruck(dt, time) {
  // Spring squash
  T.squashV += (-90 * T.squash - 9 * T.squashV) * dt;
  T.squash += T.squashV * dt;
  T.squash = Math.max(-0.25, Math.min(0.25, T.squash));

  truck.group.position.set(T.pos.x, T.y, T.pos.z);
  truck.group.rotation.y = T.heading;

  // Pitch: from ramp slope when grounded, nose-down in the air
  let targetPitch = 0;
  if (T.grounded) {
    const fx = Math.sin(T.heading);
    const fz = Math.cos(T.heading);
    const hf = groundHeight(world, T.pos.x + fx * 2.5, T.pos.z + fz * 2.5);
    const hb = groundHeight(world, T.pos.x - fx * 2.5, T.pos.z - fz * 2.5);
    targetPitch = -Math.atan2(hf - hb, 5);
  } else {
    targetPitch = Math.max(-0.5, Math.min(0.4, -T.vy * 0.03));
  }
  T.pitch += (targetPitch - T.pitch) * Math.min(1, dt * 10);
  const targetRoll = Math.max(-0.12, Math.min(0.12, T.fwd * T.steer * 0.012)) + T.lat * 0.01;
  T.roll += (targetRoll - T.roll) * Math.min(1, dt * 6);
  truck.body.rotation.set(T.pitch, 0, T.roll);
  const idle = Math.sin(time * 30) * 0.008 * (state.mode === 'playing' ? 1 : 0.5);
  truck.body.scale.set(1 - T.squash * 0.4, 1 + T.squash + idle, 1 - T.squash * 0.4);
  truck.body.position.y = idle * 2;

  for (const w of truck.wheels) w.rotation.x += (T.fwd / 0.62) * dt;
  for (const w of truck.frontWheels) w.rotation.y = T.steer * 1.2;

  // Beacon blinks
  const on = Math.sin(time * 9) > 0;
  truck.beaconMat.emissiveIntensity = on ? 1.6 : 0.15;
  truck.beacon.rotation.y += dt * 6;

  // Exhaust puffs
  const throttle = keys.has('gas') && state.mode === 'playing' ? 1 : 0;
  if (Math.random() < (0.15 + throttle * 0.5) * dt * 60 * 0.25) {
    const p = truck.group.localToWorld(tmpV.set(1.25, 3.9, 1.3));
    spawnParticle({
      pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 2.5, (Math.random() - 0.5) * 0.5).add(T.vel.clone().multiplyScalar(0.3)),
      color: state.zoomT > 0 ? 0xffd23f : 0xe4e7eb, size: 0.22, life: 1.0, grow: 3.2, sphere: true, alpha: 0.6,
    });
  }
  // Drift dust
  if (T.grounded && Math.abs(T.lat) > 3.5) {
    for (const sx of [1.3, -1.3]) {
      const p = truck.group.localToWorld(tmpV.set(sx, 0.3, -2.9));
      spawnParticle({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5), 1.2, (Math.random() - 0.5)), color: 0xe9e4d7, size: 0.5, life: 0.7, grow: 2, sphere: true, alpha: 0.5 });
    }
  }

  // --- Steve ---
  const head = steve.head;
  let headY = 0;
  let headX = 0;
  let headZ = 0;
  if (state.chompT > 0) {
    headX = Math.abs(Math.sin(state.chompT * 18)) * 0.35;
    headY = Math.sin(state.chompT * 9) * 0.1;
  } else if (state.hangry) {
    headZ = Math.sin(time * 25) * 0.12;
    headY = -T.steer * 0.8;
  } else {
    headY = T.steer * 0.9 + Math.sin(time * 0.7) * 0.1;
    headX = -0.05 + (T.grounded ? 0 : -0.3);
  }
  head.rotation.x += (headX - head.rotation.x) * Math.min(1, dt * 12);
  head.rotation.y += (headY - head.rotation.y) * Math.min(1, dt * 8);
  head.rotation.z = (head.userData.baseTilt || 0) + headZ;
  const cele = state.celebrateT > 0 ? Math.abs(Math.sin(state.celebrateT * 12)) * 0.25 : 0;
  steve.group.position.y = steve.group.userData.baseY + cele + (T.grounded ? 0 : 0.1);
  // Outer arm rests on the sill and waves when celebrating; inner arm steers
  const wave = cele ? 1.2 + Math.sin(state.celebrateT * 20) * 0.5 : Math.sin(time * 1.3) * 0.08;
  steve.arms[0].rotation.set(-0.2, 0, 0.75 + wave);
  steve.arms[1].rotation.set(-1.1, 0, -0.2 + T.steer * 0.6);
  // Tail wags, faster at speed
  const sp = Math.abs(T.fwd);
  steve.tail.forEach((seg, i) => {
    seg.rotation.y = Math.sin(time * (3 + sp * 0.2) - i * 0.6) * (0.18 + sp * 0.006);
    seg.rotation.x = Math.sin(time * 2.1 - i * 0.5) * 0.08 + (i < 4 ? -0.12 : 0.22);
  });
  // Blink
  blinkT -= dt;
  const blink = blinkT < 0.12;
  if (blinkT < 0) blinkT = 2 + Math.random() * 3;
  for (const e of steve.eyes) e.scale.y = blink ? 0.15 : state.hangry ? 0.55 : 1;
}

// ---------------------------------------------------------------------------
// Gameplay update
// ---------------------------------------------------------------------------
function updateGameplay(dt) {
  state.time += dt;
  const pos = truck.group.position;
  const speed = Math.hypot(T.vel.x, T.vel.z);

  // Edge-triggered actions
  if (pressed.has('honk') && state.honkCd <= 0) {
    state.honkCd = 0.7;
    audio.honk();
    popup('HONK!', truck.group.position, 'fun', 4);
    for (const c of cats) if (Math.hypot(c.x - T.pos.x, c.z - T.pos.z) < 24) scareCat(c, 1.1);
  }
  if (pressed.has('snack')) snack();
  if (pressed.has('reset')) unstick();

  state.honkCd -= dt;
  state.snackCd -= dt;
  state.chompT = Math.max(0, state.chompT - dt);
  state.celebrateT = Math.max(0, state.celebrateT - dt);

  // Hunger
  const wasHangry = state.hangry;
  state.hunger = Math.max(0, state.hunger - dt * 1.45);
  state.hangry = state.hunger <= 0;
  if (state.hangry && !wasHangry) {
    toast('😾 STEVE IS HANGRY. Steering is now more of a suggestion. Press E to snack!', 4);
    audio.burp();
  }

  // Snack effects
  if (state.zoomT > 0) {
    state.zoomT -= dt;
    if (state.zoomT <= 0) toast('The coffee wore off. Steve is just a raccoon again.');
  }
  if (state.hicT > 0) {
    state.hicT -= dt;
    state.hicNext -= dt;
    if (state.hicNext <= 0) {
      state.hicNext = 0.7 + Math.random() * 0.4;
      if (T.grounded) {
        T.grounded = false;
        T.vy = 6;
        T.airTime = -1; // hiccups don't count as air time
        audio.hiccup();
        popup('hic!', pos, 'fun');
      }
    }
  }

  // Cans: spawning, markers, grabbing
  state.spawnT -= dt;
  const outCount = world.houses.filter((h) => h.state === 'out').length;
  if (outCount < ACTIVE_CANS && state.spawnT <= 0) {
    spawnCan();
    state.spawnT = 2;
  }
  for (const h of world.houses) {
    if (h.cooldown > 0) h.cooldown -= dt;
    if (h.state === 'out') {
      const m = h.golden ? h.goldMarker : h.marker;
      m.arrow.position.y = 3 + Math.sin(state.time * 4 + h.x) * 0.3;
      m.arrow.rotation.y += dt * 3;
      m.ring.scale.setScalar(1 + Math.sin(state.time * 5) * 0.08);
      if (!state.grab && T.grounded && Math.abs(T.fwd) < 5) {
        const d = Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z);
        if (d < 6.5) {
          if (state.load >= CAPACITY) {
            if (!h.fullWarned) {
              h.fullWarned = true;
              popup('TRUCK FULL!', pos, 'bad');
              toast('No room! Empty the truck at The Dump first.');
            }
          } else startGrab(h);
        } else h.fullWarned = false;
      }
    } else if (h.state === 'done') {
      h.hideT -= dt;
      if (h.hideT <= 0) {
        canFor(h).group.visible = false;
        h.state = 'idle';
        h.cooldown = 20 + Math.random() * 20;
      }
    }
  }
  updateGrab(dt);

  // Dump
  const dd = Math.hypot(world.dump.x - T.pos.x, world.dump.z - T.pos.z);
  world.dump.padRing.scale.setScalar(1 + Math.sin(state.time * 4) * 0.04);
  if (dd < world.dump.r && speed < 8 && T.grounded) {
    if (!state.dumping && state.load > 0) {
      state.dumping = { start: state.load, n: 0, tick: 0 };
      toast(['Steve backs it up. beep. beep. beep.', 'Dumping! The seagulls are thrilled.', 'Steve whispers goodbye to each bag.'][(Math.random() * 3) | 0]);
    }
  }
  if (state.dumping) {
    const D = state.dumping;
    D.tick -= dt;
    const inZone = dd < world.dump.r + 1;
    if (inZone && state.load > 0 && D.tick <= 0) {
      D.tick = 0.13;
      state.load--;
      D.n++;
      addScore(10);
      audio.dumpTick();
      const hop = truck.group.localToWorld(tmpV.copy(truck.hopperLocal));
      const toPile = new THREE.Vector3(world.dump.x + 13 - hop.x, 6, world.dump.z - 13 - hop.z).multiplyScalar(0.6);
      toPile.y = 8;
      for (let i = 0; i < 3; i++) {
        spawnParticle({
          pos: hop, vel: toPile.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3)),
          color: TRASH_COLORS[(Math.random() * TRASH_COLORS.length) | 0], size: 0.45, life: 1.6, grav: 14,
        });
      }
    }
    if (state.load === 0 || !inZone) {
      let bonus = 0;
      let label = '';
      if (D.start >= CAPACITY && D.n >= CAPACITY) {
        bonus = 100;
        label = 'FULL LOAD BONUS!';
      } else if (D.n >= 8) {
        bonus = 30;
        label = 'Big load bonus!';
      }
      if (D.n > 0) {
        state.stats.loads++;
        addScore(bonus);
        audio.cash();
        state.celebrateT = 1.2;
        popup(`+${D.n * 10 + bonus}${bonus ? ' ' + label : ''}`, truck.group.position, bonus >= 100 ? 'gold' : 'good', 3);
        if (bonus >= 100) audio.fanfare();
      }
      state.dumping = null;
    }
  }

  // Reverse beeper
  if (T.fwd < -0.5) {
    state.beepT -= dt;
    if (state.beepT <= 0) {
      state.beepT = 0.45;
      audio.beep();
    }
  }

  // Quips
  state.quipT -= dt;
  if (state.quipT <= 0) {
    state.quipT = 22 + Math.random() * 15;
    toast(QUIPS[(Math.random() * QUIPS.length) | 0]);
  }

  // Time
  const left = SHIFT - state.time;
  if (!state.warned && left < 30) {
    state.warned = true;
    toast("🌇 The sun's going down! 30 seconds left in Steve's shift!");
    audio.whistle();
  }
  if (left <= 0) endShift();
}

function snack() {
  if (state.snackCd > 0) return;
  if (state.load <= 0) {
    toast('Nothing in the truck to snack on! Steve pats his empty tummy.');
    state.snackCd = 1;
    return;
  }
  if (state.hunger > 92) {
    popup('not hungry', truck.group.position, 'fun');
    state.snackCd = 0.6;
    return;
  }
  state.snackCd = 1.2;
  state.load--;
  state.stats.snacks++;
  const s = SNACKS[(Math.random() * SNACKS.length) | 0];
  state.hunger = Math.min(100, state.hunger + s.h);
  state.chompT = 1;
  audio.chomp();
  toast(`🍽️ ${s.msg}`);
  popup('CHOMP!', truck.group.position, 'good', 2);
  if (s.fx === 'zoom') state.zoomT = 7;
  if (s.fx === 'hiccups') {
    state.hicT = 5;
    state.hicNext = 0.5;
  }
  if (state.hunger >= 100) setTimeout(() => {
    audio.burp();
    popup('*BURP*', truck.group.position, 'fun');
  }, 1100);
}

function unstick() {
  // Snap onto the nearest road
  const snap = (v) => roadCenter(Math.round((v + HALF) / PITCH));
  const sx = snap(T.pos.x);
  const sz = snap(T.pos.z);
  if (Math.abs(sx - T.pos.x) < Math.abs(sz - T.pos.z)) T.pos.x = sx;
  else T.pos.z = sz;
  T.vel.set(0, 0, 0);
  T.y = groundHeight(world, T.pos.x, T.pos.z);
  T.vy = 0;
  T.grounded = true;
  popup('*poof*', truck.group.position, 'fun');
}

// ---------------------------------------------------------------------------
// Sky / day cycle
// ---------------------------------------------------------------------------
// [t, sky top, horizon, sunlight color, sun intensity]
const SKY_KEYS = [
  [0, 0x7fb6e8, 0xffd2a8, 0xffd8b0, 1.5],
  [0.15, 0x5aaeef, 0xc4e6fb, 0xfff6e6, 2.2],
  [0.6, 0x4ea6ec, 0xbfe3fa, 0xffffff, 2.3],
  [0.82, 0x6f9fd8, 0xffcf9f, 0xffd9a8, 1.9],
  [1, 0x6a6fb8, 0xff9e7a, 0xff9f70, 1.25],
].map(([t, top, hor, light, k]) => [t, new THREE.Color(top), new THREE.Color(hor), new THREE.Color(light), k]);
const sunCol = new THREE.Color();
const topCol = new THREE.Color();
const cloudDay = new THREE.Color(0xffffff);
const cloudDusk = new THREE.Color(0xffc6b0);

function updateSky(t) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && t > SKY_KEYS[i + 1][0]) i++;
  const [t0, top0, hor0, l0, k0] = SKY_KEYS[i];
  const [t1, top1, hor1, l1, k1] = SKY_KEYS[i + 1];
  const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  skyColor.copy(hor0).lerp(hor1, f);
  topCol.copy(top0).lerp(top1, f);
  skyUniforms.top.value.copy(topCol);
  scene.fog.color.copy(skyColor);
  sunCol.copy(l0).lerp(l1, f);
  sun.color.copy(sunCol);
  sun.intensity = k0 + (k1 - k0) * f;
  hemi.color.copy(topCol).lerp(new THREE.Color(0xffffff), 0.6);
  // sun arcs from east to west
  const a = Math.PI * (0.12 + 0.76 * t);
  const dir = tmpV.set(Math.cos(a) * 0.8, Math.sin(a) * 0.9 + 0.25, 0.45).normalize();
  skyUniforms.sunDir.value.copy(dir);
  skyUniforms.sunCol.value.copy(sunCol);
  sun.position.set(T.pos.x + dir.x * 120, dir.y * 120, T.pos.z + dir.z * 120);
  sun.target.position.set(T.pos.x, 0, T.pos.z);
  sky.position.copy(camera.position);
  // Distant scenery picks up the haze; clouds blush at sunset
  hillMat.color.copy(hillBase).lerp(topCol, 0.25).lerp(skyColor, 0.25);
  const dusk = Math.max(0, Math.min(1, (t - 0.7) / 0.3));
  cloudMat.color.copy(cloudDay).lerp(cloudDusk, dusk);
  // Windows and street lamps switch on as evening comes
  const night = Math.max(0, Math.min(1, (t - 0.72) / 0.22));
  nightMats.windows.emissiveIntensity = night * 0.85;
  nightMats.lamps.emissiveIntensity = 0.15 + night * 1.5;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const camLook = new THREE.Vector3();
function updateCamera(dt, time) {
  const o = window.__camOverride;
  if (o) {
    // Debug / photo-mode camera used by screenshot scripts
    camera.position.set(...o.pos);
    camera.lookAt(...o.look);
    if (o.fov && camera.fov !== o.fov) {
      camera.fov = o.fov;
      camera.updateProjectionMatrix();
    }
    return;
  }
  if (state.mode === 'title') {
    const a = time * 0.25;
    camera.position.set(T.pos.x + Math.sin(a) * 13, 6.5, T.pos.z + Math.cos(a) * 13);
    camLook.set(T.pos.x, 2.8, T.pos.z);
    camera.lookAt(camLook);
    return;
  }
  let dh = T.heading - camHeading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  // when reversing, don't swing around
  camHeading += dh * Math.min(1, dt * 3.5);
  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  const speed = Math.hypot(T.vel.x, T.vel.z);
  const back = 12.5 + speed * 0.12;
  const desired = tmpV.set(T.pos.x - fx * back, 9.5 + T.y * 0.6, T.pos.z - fz * back);
  camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
  const look = tmpV2.set(T.pos.x + fx * 6, 2.2 + T.y * 0.8, T.pos.z + fz * 6);
  camLook.lerp(look, 1 - Math.exp(-10 * dt));
  camera.lookAt(camLook);
  if (state.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake;
    state.shake = Math.max(0, state.shake - dt * 2);
  }
  const fov = 60 + speed * 0.35 + (state.zoomT > 0 ? 6 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
// Ambient life
// ---------------------------------------------------------------------------
let fountainT = 0;
function updateAmbient(dt, time) {
  clouds.rotation.y = time * 0.004;
  fountainT -= dt;
  if (fountainT <= 0) {
    fountainT = 0.05;
    for (const f of world.fountains) {
      if (Math.hypot(f.x - camera.position.x, f.z - camera.position.z) > 110) continue;
      const a = Math.random() * Math.PI * 2;
      spawnParticle({
        pos: tmpV.set(f.x + Math.cos(a) * 1.4, f.y, f.z + Math.sin(a) * 1.4),
        vel: new THREE.Vector3(Math.cos(a) * 2.2, 3 + Math.random(), Math.sin(a) * 2.2),
        color: Math.random() < 0.5 ? 0x8fd3ff : 0xd4f1ff, size: 0.2, life: 0.75, grav: 12, sphere: true, alpha: 0.8,
      });
    }
  }
  for (const g of world.seagulls) {
    const u = g.group.userData;
    const a = time * u.speed + u.phase;
    g.group.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(time * 1.3 + u.phase) * 0.6, u.cz + Math.sin(a) * u.r);
    g.group.rotation.y = -a;
    g.group.rotation.z = 0.25;
    const flap = Math.sin(time * 10 + u.phase) * 0.5;
    g.wings[0].rotation.z = flap;
    g.wings[1].rotation.z = -flap;
  }
  for (const d of world.ducks || []) {
    const u = d.userData.duck;
    const a = time * 0.4;
    d.position.set(u.cx + Math.cos(a) * 2.2, LAWN_Y + 0.1 + Math.sin(time * 3) * 0.05, u.cz + Math.sin(a) * 2.2);
    d.rotation.y = -a;
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function fmtClock(t) {
  const minutes = 6 * 60 + (t / SHIFT) * 12 * 60;
  let h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60 / 5) * 5;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function updateHud() {
  hud.score.textContent = state.score;
  hud.clock.textContent = fmtClock(Math.min(SHIFT, state.time));
  hud.clock.style.color = SHIFT - state.time < 30 ? '#e17055' : '';
  hud.loadText.textContent = `${state.load}/${CAPACITY}`;
  hud.loadBar.style.width = `${(state.load / CAPACITY) * 100}%`;
  hud.loadBar.classList.toggle('full', state.load >= CAPACITY);
  hud.hungerBar.style.width = `${state.hunger}%`;
  hud.hungerBar.style.backgroundPosition = `${-(100 - state.hunger) * 0}px 0`;
  hud.hungerText.textContent = state.hunger > 60 ? 'happy' : state.hunger > 25 ? 'peckish' : state.hunger > 0 ? 'HUNGRY' : 'HANGRY';
  const st = [];
  if (state.hangry) st.push('😾 HANGRY! Press E');
  if (state.zoomT > 0) st.push('☕ ZOOMIES');
  if (state.hicT > 0) st.push('🫧 hiccups');
  if (state.streak > 1 && state.time - state.lastCollect < 14) st.push(`🔥 streak x${state.streak}`);
  if (state.load >= CAPACITY) st.push('🚛 FULL → Dump!');
  hud.status.textContent = st.join(' · ');
}

function updateGuide(time) {
  let tx;
  let tz;
  let col = 0x7cf3a0;
  if (state.load >= CAPACITY || (state.load >= 8 && Math.hypot(world.dump.x - T.pos.x, world.dump.z - T.pos.z) < 70)) {
    tx = world.dump.x;
    tz = world.dump.z;
    col = 0xff7a1a;
  } else {
    let best = Infinity;
    for (const h of world.houses) {
      if (h.state !== 'out') continue;
      const d = Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z) * (h.golden ? 0.6 : 1);
      if (d < best) {
        best = d;
        tx = h.canX;
        tz = h.canZ;
        col = h.golden ? 0xffd23f : 0x7cf3a0;
      }
    }
  }
  if (tx === undefined || state.mode !== 'playing' || Math.hypot(tx - T.pos.x, tz - T.pos.z) < 12) {
    guide.visible = false;
    return;
  }
  guide.visible = true;
  guideMat.color.setHex(col);
  guideMat.emissive.setHex(col);
  // Float ahead of the cab, toward the target, so it never hides Steve
  const ang = Math.atan2(tx - T.pos.x, tz - T.pos.z);
  guide.position.set(
    T.pos.x + Math.sin(T.heading) * 3.5 + Math.sin(ang) * 1.5,
    T.y + 6.6 + Math.sin(time * 4) * 0.2,
    T.pos.z + Math.cos(T.heading) * 3.5 + Math.cos(ang) * 1.5,
  );
  guide.rotation.y = ang;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
const BEST_KEY = 'steveRaccoonBest';
const getBest = () => +(localStorage.getItem(BEST_KEY) || 0);
function showBest() {
  const b = getBest();
  $('best').textContent = b ? `Personal best: ${b}` : 'Tip: full loads pay a big bonus.';
}
showBest();

function startShift() {
  audio.init();
  audio.resume();
  resetGame();
  state.mode = 'playing';
  $('title').classList.add('hidden');
  $('results').classList.add('hidden');
  $('hud').classList.remove('hidden');
  hud.toast.innerHTML = '';
  toast("☀️ Good morning, Steve! Grab the glowing trash cans. Shift ends at 6 PM.", 4);
}

function endShift() {
  state.mode = 'results';
  audio.fanfare();
  const s = state.score;
  const stars = STAR_SCORES.filter((x) => s >= x).length;
  $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  let rank = RANKS[0][1];
  for (const [min, name] of RANKS) if (s >= min) rank = name;
  $('rank').textContent = rank;
  const st = state.stats;
  const rows = [
    ['Final score', s],
    ['Cans grabbed', `${st.cans}${st.golden ? ` (${st.golden} golden)` : ''}`],
    ['Loads dumped', st.loads],
    ['Snacks eaten', st.snacks],
    ['Longest air', `${st.air.toFixed(1)}s`],
    ['Mailboxes & hydrants', st.bonks],
    ['Cats offended', st.cats],
  ];
  $('resultTable').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  const isBest = s > getBest();
  if (isBest) localStorage.setItem(BEST_KEY, String(s));
  $('newBest').classList.toggle('hidden', !isBest);
  $('results').classList.remove('hidden');
  showBest();
}

function setPaused(p) {
  if (p && state.mode === 'playing') {
    state.mode = 'paused';
    $('pause').classList.remove('hidden');
  } else if (!p && state.mode === 'paused') {
    state.mode = 'playing';
    $('pause').classList.add('hidden');
  }
}

$('startBtn').addEventListener('click', startShift);
$('againBtn').addEventListener('click', startShift);
$('resumeBtn').addEventListener('click', () => setPaused(false));
window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => document.hidden && setPaused(true));

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
resetGame();
state.mode = 'title';
let lastNow = performance.now();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 1 / 30);
  lastNow = now;
  elapsed += dt;

  // global keys
  if (pressed.has('mute')) {
    const m = audio.toggleMute();
    toast(m ? '🔇 Muted' : '🔊 Sound on', 1.5);
  }
  if (pressed.has('pause')) setPaused(state.mode === 'playing');
  if (pressed.has('enter') && (state.mode === 'title' || state.mode === 'results')) startShift();
  else if (pressed.has('enter') && state.mode === 'paused') setPaused(false);

  if (state.mode === 'playing') {
    updateTruck(dt);
    updateGameplay(dt);
    updateProps(dt);
    updateCats(dt, elapsed);
  } else if (state.mode === 'title' || state.mode === 'results') {
    updateCats(dt, elapsed);
    updateProps(dt);
    T.steer = Math.sin(elapsed * 0.8) * 0.3;
  }
  if (state.mode !== 'paused') {
    updateParticles(dt);
    animateTruck(dt, elapsed);
    updateAmbient(dt, elapsed);
  }
  // On the title screen, shift the view so Steve shows beside the menu card
  if (state.mode === 'title' && window.innerWidth > 900) {
    camera.setViewOffset(window.innerWidth, window.innerHeight, -window.innerWidth * 0.2, 0, window.innerWidth, window.innerHeight);
  } else if (camera.view && camera.view.enabled) {
    camera.clearViewOffset();
  }
  updateSky(state.mode === 'title' ? 0.3 : Math.min(1, state.time / SHIFT));
  updateCamera(dt, elapsed);
  updateGuide(elapsed);
  updatePopups(dt);
  if (state.mode === 'playing' || state.mode === 'paused') {
    updateHud();
    drawMinimap(elapsed);
  }
  audio.setEngine(T.fwd, keys.has('gas') ? 1 : 0, state.mode === 'playing');
  audio.updateMusic(state.mode === 'playing');
  pressed.clear();
  renderer.render(scene, camera);
}
frame();

// Handy for debugging / automated screenshots
window.__steve = { state, T, keys, startShift, world, renderer };
