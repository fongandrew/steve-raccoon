import * as THREE from 'three';
import {
  buildWorld, groundHeight, isOnLawn, surfaceHeight, HALF, N, BLOCK, PITCH, ROAD, ROAD_Y, LAWN_Y, WALK_Y, roadCenter, blockCenter, rng,
} from './world.js';
import { makeTruck, makeCritter, CRITTER_WORDS, makeCloud, makeTreasure, makeBeachBall, makePigeon, makeGoose, makeTrashBag, nightMats, toon, glow } from './models.js';
import { PropBatch } from './props.js';
import { Audio } from './audio.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const SHIFT = 240; // seconds per shift
const CAPACITY = 12;
const MAX_SPEED = 24;
const ACTIVE_CANS = 7;
const GRAVITY = 30;
const STAR_SCORES = [300, 650, 1100];

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

// The narrator: a detached, slightly ironic voice describing Steve's day.
const LINES = {
  ambient: [
    'Steve thinks this is the best job in the world.',
    "One raccoon's trash is... also this raccoon's treasure.",
    'Steve has been told, again, not to eat on the job.',
    'Steve waves at a pigeon. The pigeon does not wave back.',
    'Fun fact: Steve has never passed a driving test.',
    'Steve is humming the trash truck song. There is no trash truck song.',
    'Steve would like to remind you that the claw is not a toy. (It is.)',
    "Steve's mom would be so proud. She lives in a dumpster.",
    'A reminder that Steve technically has no license.',
  ],
  pickup: [
    'Steve declares the contents "vintage."',
    'Steve sniffs the can. Is that... lasagna?',
    "One man's trash is Steve's lunch.",
    'Steve whispers "jackpot." It is coffee grounds.',
    'Finders keepers, Steve reminds no one in particular.',
    'Still warm. Steve is delighted.',
  ],
  crash: [
    'Steve maintains the house came out of nowhere.',
    'Steve would describe the brakes as "more of a suggestion."',
    'Steve was parallel parking. Allegedly.',
    'Insurance, Steve notes, is a human concept.',
    'Steve meant to do that.',
  ],
  dump: [
    'Goodbye, beautiful garbage.',
    'Steve tells each bag to go be free.',
    "Another honest day's work, by raccoon standards.",
    'The trash mountain grows stronger. Steve feels a strange pride.',
  ],
  idle: [
    'Steve has stopped to smell the air. It smells like heaven (garbage).',
    'Steve washed his hands earlier. In a puddle.',
    'Steve wonders, briefly, whether this counts as a break.',
    'The trash will not collect itself, Steve. Well. Mostly not.',
  ],
  honk: [
    'Steve honks. It is mostly for his own enjoyment.',
    'Beep beep. Steve is coming through.',
    'Make way, says the horn, for garbage.',
  ],
  goose: [
    'Geese have the right of way. Always.',
    'The goose is fine. The goose is always fine.',
    'Steve apologizes to the goose. The goose does not accept.',
    'Please do not tell the other geese.',
    'Steve has learned nothing about geese.',
  ],
  critter: [
    'The citizen is fine. Furious, but fine.',
    'Steve would like to remind pedestrians that he has the right of way. He does not.',
    'Everyone in Binsville has learned to jump. It is a survival skill now.',
    'Steve waves an apology. It is not accepted.',
  ],
  timber: [
    'TIMBERRRRR! The tree had it coming. Probably.',
    'Steve is now also in the logging business.',
    'The squirrels will be filing a complaint.',
  ],
  garden: [
    'The community garden club will hear about this.',
    'Steve is harvesting. Aggressively.',
    'Those were prize-winning cabbages. Were.',
  ],
  frontload: [
    "Steve's truck also has a front loader. Truly the most capable of trucks.",
    'Up and over! Steve ducks. Steve always ducks.',
    'The dumpster goes over the cab. Steve does not look up.',
  ],
  prop: [
    'Steve insists that was like that already.',
    'Steve calls it "abstract landscaping."',
    'Nobody saw that. (Everybody saw that.)',
    'That mailbox, says Steve, had it coming.',
    "Steve has tiny hands. He'd like that noted.",
  ],
};
const pickLine = (kind) => LINES[kind][(Math.random() * LINES[kind].length) | 0];
let lastNarration = -99;
/** Narrate an event. Lines are rate-limited so the narrator doesn't babble. */
function narrate(kind, chance = 1, force = false) {
  if (state.mode !== 'playing' || Math.random() > chance) return;
  if (!force && state.time - lastNarration < 7) return;
  lastNarration = state.time;
  state.quipT = Math.max(state.quipT, 15);
  toast(pickLine(kind), 3.6);
}


const RANKS = [
  [0, 'Trash Intern'],
  [250, 'Garbage Gremlin'],
  [550, 'Bin Bandit'],
  [900, 'Dumpster Duke'],
  [1300, 'Supreme Trash Panda'],
];

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const SMALL_DEVICE = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 540;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, SMALL_DEVICE ? 1.5 : 2));
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
sun.shadow.mapSize.set(SMALL_DEVICE ? 2048 : 4096, SMALL_DEVICE ? 2048 : 4096);
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
// Citizens: a mix of critters out for a stroll. Most will get out of Steve's
// way, by running or leaping; the slow ones get bounced (gently, cartoonishly).
const SPECIES = {
  // townsfolk
  bear: { n: 2, speed: 1.7, dodge: 0.5, sound: 'oof' },
  fox: { n: 2, speed: 3.6, dodge: 0.85, sound: 'yip' },
  bunnylady: { n: 2, speed: 1.6, dodge: 0.6, sound: 'squeak' },
  frog: { n: 2, speed: 2.4, dodge: 0.7, sound: 'squeak' },
  badger: { n: 2, speed: 1.2, dodge: 0.45, sound: 'oof' },
  mole: { n: 2, speed: 1.9, dodge: 0.6, sound: 'oof' },
  pig: { n: 2, speed: 1.6, dodge: 0.5, sound: 'oof' },
  // pets
  kitten: { n: 2, speed: 2.2, dodge: 0.8, sound: 'meow' },
  puppy: { n: 1, speed: 2.6, dodge: 0.6, sound: 'yip' },
  bunny: { n: 0, speed: 2.4, dodge: 0.9, sound: 'squeak', hop: true },
  squirrel: { n: 2, speed: 3.2, dodge: 0.85, sound: 'squeak' },
  dalmatian: { n: 0, speed: 2.6, dodge: 0.6, sound: 'yip' },
};
const cats = []; // (all citizens, not just cats; the name stuck)
function addCritter(species, spot) {
  const c = makeCritter(species, Math.random);
  scene.add(c.group);
  const stars = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), glow(0xffd23f, 0.8));
    st.position.set(Math.cos((k / 3) * Math.PI * 2) * 0.5, 0, Math.sin((k / 3) * Math.PI * 2) * 0.5);
    stars.add(st);
  }
  stars.position.y = 1.5;
  stars.visible = false;
  c.group.add(stars);
  cats.push({ ...c, spec: SPECIES[species], spot, stars, x: 0, z: 0, y: 0, h: 0, state: 'walk', t: 0, vx: 0, vz: 0, vy: 0, spin: 0 });
}
for (const [sp, def] of Object.entries(SPECIES)) for (let i = 0; i < def.n; i++) addCritter(sp, null);
for (const spot of world.critterSpots) addCritter(spot.species, spot);

function placeCat(cat) {
  if (cat.spot) {
    Object.assign(cat, { x: cat.spot.x, z: cat.spot.z, y: surfaceHeight(cat.spot.x, cat.spot.z), h: Math.random() * 6, state: 'walk', t: 2 });
    return;
  }
  const bx = (Math.random() * N) | 0;
  const bz = (Math.random() * N) | 0;
  const side = (Math.random() * 4) | 0;
  const off = (Math.random() - 0.5) * (BLOCK - 4);
  const e = BLOCK / 2 - 0.8;
  const cx = blockCenter(bx);
  const cz = blockCenter(bz);
  const spots = [[cx + off, cz + e, Math.PI / 2], [cx + off, cz - e, -Math.PI / 2], [cx + e, cz + off, 0], [cx - e, cz + off, Math.PI]];
  const [x, z, h] = spots[side];
  Object.assign(cat, { x, z, y: surfaceHeight(x, z), h, state: 'walk', t: Math.random() * 4 });
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
  for (const b of world.bins) {
    if (b.state !== 'out') continue;
    const [x, y] = toMap(b.x, b.z);
    mctx.fillStyle = '#ffa31a';
    mctx.strokeStyle = '#2b2d33';
    mctx.lineWidth = 1.5 * MK;
    mctx.fillRect(x - 5 * MK, y - 4 * MK, 10 * MK, 8 * MK);
    mctx.strokeRect(x - 5 * MK, y - 4 * MK, 10 * MK, 8 * MK);
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
// --- Touch: a floating thumbstick on the left, DRIFT + HONK on the right,
// tap Steve's portrait to snack, pause button for everything else.
const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
function enableTouch() {
  if (!document.body.classList.contains('touch')) document.body.classList.add('touch');
}
if (window.matchMedia('(pointer: coarse)').matches) enableTouch();
window.addEventListener('touchstart', enableTouch, { passive: true });

for (const btn of document.querySelectorAll('#touch .tbtn')) {
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
{
  const zone = document.getElementById('stickZone');
  const ring = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const R = 50;
  const move = (e) => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      // drag the base along so the stick never feels stuck at the rim
      stick.ox += (dx / d) * (d - R);
      stick.oy += (dy / d) * (d - R);
      dx = (dx / d) * R;
      dy = (dy / d) * R;
      ring.style.left = `${stick.ox}px`;
      ring.style.top = `${stick.oy}px`;
    }
    stick.x = dx / R;
    stick.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.init();
    audio.resume();
    zone.setPointerCapture(e.pointerId);
    Object.assign(stick, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    knob.style.transform = '';
    ring.classList.add('on');
  });
  zone.addEventListener('pointermove', move);
  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    Object.assign(stick, { active: false, id: null, x: 0, y: 0 });
    ring.classList.remove('on');
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}
document.getElementById('portrait').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.init();
  pressed.add('snack');
});

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
  grabs: [],
  lift: null,
  binSpawnT: 0,
  driftCharge: 0,
  boostT: 0,
  goldenHour: false,
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
    grabs: [], driftCharge: 0, boostT: 0, goldenHour: false, spawnT: 0, streak: 0, lastCollect: -99, dumping: null, quipT: 18, shake: 0, celebrateT: 0, warned: false,
    stats: { cans: 0, golden: 0, dumpsters: 0, bags: 0, snacks: 0, bonks: 0, cats: 0, air: 0, loads: 0, doubles: 0, treasures: 0, boosts: 0, smashed: 0, geese: 0, dumped: 0, trees: 0 },
    chaos: 0, lastSmash: -9,
  });
  for (const h of world.houses) {
    for (const c of [h.can, h.goldCan]) {
      if (c.group.parent !== scene) scene.attach(c.group);
      c.group.scale.set(1, 1, 1);
    }
    h.state = 'idle';
    h.cooldown = 0;
    h.golden = false;
    for (const o of [h.can.group, h.goldCan.group, h.marker.group, h.goldMarker.group]) o.visible = false;
  }
  for (const p of world.props) resetProp(p);
  for (const c of cats) placeCat(c);
  resetTreasures();
  resetBalls();
  for (const pg of pigeons) placePigeon(pg);
  resetPile();
  resetBins();
  for (const g of geese) placeGoose(g);
  for (const b of spilled) scene.remove(b.mesh);
  spilled.length = 0;
  for (let i = 0; i < ACTIVE_CANS; i++) spawnCan(true);
}

function resetProp(p) {
  p.knocked = false;
  p.state = 'idle';
  p.pos.copy(p.home);
  p.quat.copy(p.homeQuat);
  p.geyser = 0;
  p.hidden = false;
  if (p.circle) {
    p.circle.off = false;
    p.circle.dmg = 0;
  }
  syncProp(p);
}

const _pm = new THREE.Matrix4();
const _ps = new THREE.Vector3();
function syncProp(p) {
  if (p.mesh) {
    p.mesh.visible = !p.hidden;
    p.mesh.position.copy(p.pos);
    p.mesh.quaternion.copy(p.quat);
  } else {
    _ps.setScalar(p.hidden ? 0 : p.scale || 1);
    p.batch.set(p.index, _pm.compose(p.pos, p.quat, _ps));
  }
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
  h.golden = false; // golden cans retired; the big prizes are dumpsters now
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

// ---------------------------------------------------------------------------
// Grabber arm: a side-loader with a telescoping boom (ext), a lever that
// swings from hanging straight down (lift = 0) up around the outside and over
// the hopper (lift = LIFT_MAX), and a wrist that sets the can's tilt (tilt = 0
// keeps it upright, DUMP_TILT tips it into the hopper).
// ---------------------------------------------------------------------------
const ARMS = truck.arms;
const ARM = ARMS[0]; // shared dimensions
const LIFT_MAX = (210 * Math.PI) / 180;
const DUMP_TILT = (-150 * Math.PI) / 180;
const REST = { ext: 0, yaw: 0, lift: 0, tilt: 0 };
for (const a of ARMS) a.pose = { ...REST, close: 0 };
const armTmp = new THREE.Vector3();

/** Boom extension + yaw needed to hold a can whose base is at world point p. */
function canToArm(arm, p) {
  arm.base.worldToLocal(armTmp.copy(p));
  // undo the base's own yaw so we get the yaw needed to face the can
  const c = Math.cos(arm.base.rotation.y);
  const sn = Math.sin(arm.base.rotation.y);
  const x = armTmp.x * c + armTmp.z * sn;
  const z = -armTmp.x * sn + armTmp.z * c;
  const horiz = Math.hypot(x, z);
  return { ext: horiz - ARM.GRIP, yaw: Math.atan2(z, -x), side: -x };
}

function applyArm(arm, pose) {
  const ext = Math.max(0, Math.min(arm.MAX_EXT, pose.ext));
  arm.base.rotation.y = pose.yaw;
  arm.boom.scale.x = Math.max(0.01, ext);
  arm.slide.position.x = -ext;
  arm.lever.rotation.z = -pose.lift;
  arm.wrist.rotation.z = pose.tilt + pose.lift; // tilt is relative to the truck, not the lever
  for (const f of arm.fingers) f.rotation.y = f.userData.side * (0.55 - pose.close * 0.62);
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerpPose = (a, b, k) => ({
  ext: a.ext + (b.ext - a.ext) * k, yaw: a.yaw + (b.yaw - a.yaw) * k,
  lift: a.lift + (b.lift - a.lift) * k, tilt: a.tilt + (b.tilt - a.tilt) * k,
});
/** Lift pose for 0..1 along the swing; the can stays upright until it clears the rim. */
const swing = (k) => {
  const lift = LIFT_MAX * k;
  const tip = Math.max(0, Math.min(1, (k - 0.6) / 0.4));
  return { ext: 0, yaw: 0, lift, tilt: DUMP_TILT * ease(tip) };
};

function startGrab(h, arm) {
  h.state = 'grabbing';
  h.marker.group.visible = false;
  h.goldMarker.group.visible = false;
  const can = canFor(h);
  can.group.position.y = WALK_Y; // stop fidgeting, you're being picked up
  can.group.rotation.z = 0;
  const g = { h, arm, t: 0, added: false, attached: false, released: false, home: can.group.position.clone(), rotY: can.group.rotation.y };
  // Grabbing on both sides at nearly the same time is a double grab
  const other = state.grabs.find((o) => o.arm !== arm);
  if (other && other.t < 0.6) {
    addScore(25);
    popup('DOUBLE GRAB! +25', truck.group.position, 'gold', 5);
    audio.golden();
    state.stats.doubles++;
  }
  state.grabs.push(g);
  audio.grab();
}

// Timeline (seconds). The truck holds still until the can is back down.
const G = { reach: 0.45, grip: 0.12, pull: 0.3, lift: 0.5, dump: 0.45, lower: 0.45, push: 0.3, release: 0.12, retract: 0.3 };
const GT = {};
{
  let t = 0;
  for (const k of Object.keys(G)) {
    GT[k] = [t, t + G[k]];
    t += G[k];
  }
}
const phase = (t, k) => Math.max(0, Math.min(1, (t - GT[k][0]) / G[k]));
for (const a of ARMS) applyArm(a, a.pose);

function updateGrabs(dt) {
  truck.body.updateMatrixWorld(true);
  for (const arm of ARMS) {
    if (state.grabs.some((g) => g.arm === arm)) continue;
    const k = 1 - Math.exp(-10 * dt);
    Object.assign(arm.pose, lerpPose(arm.pose, REST, k));
    arm.pose.close += (0 - arm.pose.close) * k;
    applyArm(arm, arm.pose);
  }
  for (const g of [...state.grabs]) updateGrab(g, dt);
}

function updateGrab(g, dt) {
  const arm = g.arm;
  g.t += dt;
  const t = g.t;
  const can = canFor(g.h);
  const grabPose = { ...canToArm(arm, g.home), lift: 0, tilt: 0 };
  const carry = { ...REST };
  let pose;
  let close = 0;
  if (t < GT.reach[1]) {
    pose = lerpPose(REST, grabPose, ease(phase(t, 'reach')));
  } else if (t < GT.grip[1]) {
    pose = grabPose;
    close = ease(phase(t, 'grip'));
  } else if (t < GT.dump[1]) {
    if (!g.attached) {
      g.attached = true;
      arm.gripper.attach(can.group);
    }
    close = 1;
    if (t < GT.pull[1]) pose = lerpPose(grabPose, carry, ease(phase(t, 'pull')));
    else if (t < GT.lift[1]) pose = swing(ease(phase(t, 'lift')));
    else {
      // Shake it out
      const k = phase(t, 'dump');
      pose = swing(1);
      pose.tilt += Math.sin(k * Math.PI * 6) * 0.12 * (1 - k);
      can.lid.rotation.x = -1.9 * Math.min(1, k * 4);
      if (Math.random() < 0.7) {
        const mouth = can.group.localToWorld(armTmp.set(0, 1.3, 0));
        spawnParticle({
          pos: mouth.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, -3, (Math.random() - 0.5) * 1.5),
          color: TRASH_COLORS[(Math.random() * TRASH_COLORS.length) | 0], size: 0.22 + Math.random() * 0.15, life: 0.35, grav: 20,
        });
      }
      if (!g.added && k > 0.35) {
        g.added = true;
        collectBags(g.h);
      }
    }
  } else if (t < GT.push[1]) {
    close = 1;
    if (t < GT.lower[1]) {
      pose = swing(1 - ease(phase(t, 'lower')));
      can.lid.rotation.x = -1.9 + 1.3 * phase(t, 'lower');
    } else pose = lerpPose(carry, grabPose, ease(phase(t, 'push')));
  } else if (t < GT.release[1]) {
    pose = grabPose;
    close = 1 - ease(phase(t, 'release'));
    if (!g.released) {
      g.released = true;
      scene.attach(can.group);
      can.group.position.copy(g.home);
      can.group.rotation.set(0, g.rotY, 0);
      can.group.scale.set(1, 1, 1);
      can.lid.rotation.x = -0.6; // left ajar, as is tradition
    }
  } else if (t < GT.retract[1]) {
    pose = lerpPose(grabPose, REST, ease(phase(t, 'retract')));
  } else {
    g.h.state = 'done';
    g.h.hideT = 4;
    state.grabs.splice(state.grabs.indexOf(g), 1);
    Object.assign(arm.pose, REST, { close: 0 });
    applyArm(arm, arm.pose);
    return;
  }
  g.hold = t < GT.release[1];
  Object.assign(arm.pose, pose, { close });
  applyArm(arm, arm.pose);
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
  else if (state.load < CAPACITY) narrate('pickup', 0.25);
  if (state.load >= CAPACITY) toast('🚛 Truck is FULL! Head to The Dump (orange on the map).');
}

function addScore(n) {
  if (n > 0 && state.goldenHour) n *= 2;
  state.score = Math.max(0, state.score + n);
}

// ---------------------------------------------------------------------------
// Truck physics
// ---------------------------------------------------------------------------
let camHeading = 0;
const prevPos = new THREE.Vector3();

function updateTruck(dt) {
  const playing = state.mode === 'playing';
  // Thumbstick: push any way but down to drive (steering by its sideways
  // amount), pull down to brake / reverse.
  const sMag = Math.hypot(stick.x, stick.y);
  const stickGas = stick.active && sMag > 0.3 && stick.y < 0.45;
  const stickBrake = stick.active && stick.y > 0.55;
  const gas = playing && (keys.has('gas') || stickGas) ? 1 : 0;
  const brake = playing && (keys.has('brake') || stickBrake) ? 1 : 0;
  let steerIn = playing ? (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0) : 0;
  if (playing && stick.active && Math.abs(stick.x) > 0.12) steerIn = -Math.max(-1, Math.min(1, stick.x * 1.25));
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
  if (state.boostT > 0) {
    maxSpeed *= 1.45;
    accel *= 2.5;
  }

  // Drift charging: hold drift while turning at speed; let go to boost
  const drifting = drift && T.grounded && Math.abs(fwd) > 8 && Math.abs(steerIn) > 0.3;
  if (drifting) {
    const before = boostLevel(state.driftCharge);
    state.driftCharge = Math.min(2.2, state.driftCharge + dt);
    const after = boostLevel(state.driftCharge);
    if (after > before) audio.chargeUp(after);
  } else if (!drift) {
    if (state.driftCharge > 0 && playing) releaseBoost();
    state.driftCharge = 0;
  }

  if (T.grounded) {
    const holding = state.grabs.some((g) => g.hold) || (state.lift && state.lift.hold);
    let throttle = holding ? 0 : gas - brake;
    if (state.boostT > 0 && !holding) throttle = 1;
    if (holding) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 25 * dt);
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
      if (b.off) continue;
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
      if (s.off) continue;
      const dx = c.x - s.x;
      const dz = c.z - s.z;
      const d = Math.hypot(dx, dz);
      const rr = r + s.r;
      if (d >= rr || d < 1e-4) continue;
      // Trees take damage: one big hit or a few smaller ones and down they go
      if (s.prop) {
        const vn = -(T.vel.x * dx + T.vel.z * dz) / d;
        if (vn > 2 && (vn > 15 || s.dmg + vn > 26)) {
          fellTree(s, -dx / d, -dz / d);
          continue;
        }
        if (vn > 3 && state.time - (s.shook || -9) > 0.4) s.dmg += vn;
      }
      const hit = resolve(c, dx / d, dz / d, rr - d);
      maxImpact = Math.max(maxImpact, hit);
      if (s.tree && hit > 3 && state.time - (s.shook || -9) > 0.8) {
        s.shook = state.time;
        leafBurst(s.x, s.z, 3.5, 14 + hit);
        if (s.prop && s.dmg > 8) popup(s.dmg > 18 ? 'creeeak...' : 'wobble', s.prop.home, 'fun', 3);
      }
    }
  }
  if (maxImpact > 7) bonk(maxImpact);
}

function boostLevel(charge) {
  return charge >= 1.9 ? 3 : charge >= 1.2 ? 2 : charge >= 0.6 ? 1 : 0;
}
const BOOST_COLORS = [0xffffff, 0x6ec6ff, 0xffa31a, 0xff6bd5];

function releaseBoost() {
  const level = boostLevel(state.driftCharge);
  if (!level) return;
  state.boostT = 0.5 + level * 0.45;
  state.stats.boosts++;
  const pts = [0, 5, 10, 20][level];
  addScore(pts);
  audio.boost(level);
  state.shake = Math.max(state.shake, 0.25 + level * 0.1);
  popup(`${['', 'BOOST!', 'SUPER BOOST!', 'ULTRA BOOST!'][level]} +${pts}`, truck.group.position, level === 3 ? 'gold' : 'fun', 2);
  // instant kick forward
  T.vel.x += Math.sin(T.heading) * 4 * level;
  T.vel.z += Math.cos(T.heading) * 4 * level;
}

function fellTree(circle, nx, nz) {
  circle.off = true;
  const p = circle.prop;
  T.vel.multiplyScalar(0.8);
  knockProp(p, nx, nz, Math.hypot(T.vel.x, T.vel.z));
  leafBurst(circle.x, circle.z, 3.5, 24);
  audio.timber();
  state.shake = Math.max(state.shake, 0.45);
  if (state.mode === 'playing') {
    state.stats.trees++;
    popup('TIMBERRRRR!', p.home, 'gold', 5);
    narrate('timber', state.stats.trees === 1 ? 1 : 0.4, state.stats.trees === 1);
  }
}

const LEAF_COLORS = [0x5cc96b, 0x48b85a, 0x7bd67a, 0x3fa65a];
function leafBurst(x, z, y, n) {
  for (let i = 0; i < n; i++) {
    spawnParticle({
      pos: new THREE.Vector3(x + (Math.random() - 0.5) * 2, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 2),
      vel: new THREE.Vector3((Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5),
      color: LEAF_COLORS[i % LEAF_COLORS.length], size: 0.22, life: 1.8, grav: 2.5, drag: 1.2,
    });
  }
  audio.rustle();
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
    narrate('crash', 0.5);
  }
}

// ---------------------------------------------------------------------------
// Props (cones, mailboxes, hydrants)
// ---------------------------------------------------------------------------
// How each kind of prop reacts to being hit.
//   style: fly (launched, tumbles, lands on its side), tip (falls over from
//   its base), shatter (bursts into debris)
//   slow: how much of the truck's speed survives the hit
const KINDS = {
  cone: { style: 'fly', pts: 2, slow: 0.98, text: 'boop!', sound: 'boing' },
  mailbox: { style: 'fly', pts: -10, slow: 0.95, text: 'MAILBOX!', sound: 'bonk', bad: true },
  hydrant: { style: 'fly', pts: -15, slow: 0.85, text: 'HYDRANT!', sound: 'bonk', bad: true },
  lamp: { style: 'tip', pts: 0, slow: 0.88, text: 'clang!', sound: 'clang' },
  sign: { style: 'tip', pts: 2, slow: 0.88, text: 'timber!', sound: 'crunch' },
  fence: { style: 'shatter', pts: 1, slow: 0.97, text: 'crunch!', sound: 'crunch', debris: [0xfdfdf8, 0xe8e4d8] },
  flamingo: { style: 'fly', pts: 3, slow: 0.99, text: 'flamingo!', sound: 'squeak', light: true },
  gnome: { style: 'fly', pts: 3, slow: 0.99, text: 'yeet!', sound: 'boing', light: true },
  bench: { style: 'fly', pts: 1, slow: 0.9, text: 'bench!', sound: 'crunch', heavy: true },
  table: { style: 'fly', pts: 1, slow: 0.9, text: 'picnic over!', sound: 'crunch', heavy: true },
  bag: { style: 'fly', pts: 1, slow: 0.97, text: 'splat!', sound: 'bonk', light: true, debris: TRASH_COLORS },
  tire: { style: 'fly', pts: 1, slow: 0.97, text: 'boing!', sound: 'boing', light: true },
  veggie: { style: 'fly', pts: 1, slow: 0.99, text: 'squish!', sound: 'crunch', light: true, debris: [0x6fbf4a, 0x9fd86b, 0xff8c2a] },
  sunflower: { style: 'tip', pts: 1, slow: 0.98, text: 'timber!', sound: 'crunch' },
  chainlink: { style: 'tip', pts: 2, slow: 0.9, text: 'clang!', sound: 'clang' },
  tree: { style: 'tip', pts: 5, slow: 0.8, text: 'TIMBER!', sound: 'crunch', quiet: true },
  scarecrow: { style: 'tip', pts: 3, slow: 0.95, text: 'scarecrow down!', sound: 'crunch' },
};

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _e = new THREE.Euler();

function updateProps(dt) {
  const speed = Math.hypot(T.vel.x, T.vel.z);
  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  for (const p of world.props) {
    if (!p.knocked) {
      if (p.kind === 'tree') continue; // trees only fall to real damage (see fellTree)
      if (T.y > p.home.y + 2) continue;
      // cheap reject before the per-circle test
      if (Math.abs(p.x - T.pos.x) > 6 || Math.abs(p.z - T.pos.z) > 6) continue;
      for (const off of [1.9, -1.9]) {
        const dx = p.home.x - (T.pos.x + fx * off);
        const dz = p.home.z - (T.pos.z + fz * off);
        const d = Math.hypot(dx, dz);
        if (d < 1.7 + p.r) {
          knockProp(p, dx / (d || 1), dz / (d || 1), speed);
          break;
        }
      }
      continue;
    }
    p.timer += dt;
    if (p.state === 'fly') {
      const floor = p.home.y;
      p.vel.y -= GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      _q.setFromEuler(_e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt));
      p.quat.premultiply(_q);
      if (p.pos.y <= floor) {
        p.pos.y = floor;
        if (Math.abs(p.vel.y) > 4) {
          p.vel.y = -p.vel.y * 0.35;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
          p.spin.multiplyScalar(0.6);
        } else {
          // come to rest lying on its side
          p.state = 'rest';
          _ax.set(Math.cos(p.restA), 0, Math.sin(p.restA));
          p.quat.copy(p.homeQuat).premultiply(_q.setFromAxisAngle(_ax, Math.PI / 2));
          p.pos.y = floor + (p.restLift || 0);
        }
      }
      syncProp(p);
    } else if (p.state === 'tip') {
      // falls over from its base like a felled tree, with a little bounce
      p.tipW += ((p.kind === 'tree' ? 4.5 : 9) * Math.sin(Math.max(0.05, p.tipA)) + 1) * dt;
      p.tipA += p.tipW * dt;
      if (p.tipA >= Math.PI / 2 - 0.02) {
        p.tipA = Math.PI / 2 - 0.02;
        if (p.tipW > 1.5) {
          p.tipW = -p.tipW * 0.25;
          if (!p.landed) {
            p.landed = true;
            audio.bonk(0.25);
            const tipEnd = p.home.clone().addScaledVector(_ax.copy(p.tipDir), p.kind === 'lamp' ? 5 : p.kind === 'tree' ? 4 : 3);
            if (p.kind === 'tree') {
              leafBurst(tipEnd.x, tipEnd.z, 0.8, 22);
              audio.bonk(0.8);
              state.shake = Math.max(state.shake, 0.35);
            }
            burst(tipEnd, 6, { color: 0xd9d4c7, size: 0.4, life: 0.6, grav: 4, speed: 4, up: 2, sphere: true, grow: 1.5, alpha: 0.6 });
          }
        } else {
          p.tipW = 0;
          p.state = 'rest';
        }
      }
      p.quat.copy(p.homeQuat).premultiply(_q.setFromAxisAngle(p.tipAxis, p.tipA));
      syncProp(p);
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
    if (p.timer > (p.kind === 'tree' ? 60 : 30) && Math.hypot(T.pos.x - p.home.x, T.pos.z - p.home.z) > 45) resetProp(p);
  }
}

function knockProp(p, nx, nz, speed) {
  const K = KINDS[p.kind] || KINDS.cone;
  p.knocked = true;
  p.timer = 0;
  p.landed = false;
  const power = Math.max(4, speed) * (K.heavy ? 0.55 : K.light ? 1.2 : 1);
  // Direction of travel of the hit: mostly the truck's motion
  let dx = T.vel.x * 0.8 + nx * 3;
  let dz = T.vel.z * 0.8 + nz * 3;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  if (K.style === 'tip' && (p.kind === 'chainlink' || p.kind === 'sign')) {
    // flat things fall face-first, away from the truck
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(p.homeQuat);
    const sgn = n.x * dx + n.z * dz >= 0 ? 1 : -1;
    dx = n.x * sgn;
    dz = n.z * sgn;
  }
  if (K.style === 'tip') {
    p.state = 'tip';
    p.tipDir = new THREE.Vector3(dx, 0, dz);
    p.tipAxis = new THREE.Vector3(dz, 0, -dx);
    p.tipA = 0.02;
    p.tipW = 0.6 + speed * 0.12;
  } else if (K.style === 'shatter') {
    p.state = 'gone';
    p.hidden = true;
    syncProp(p);
    const at = p.home.clone().add(new THREE.Vector3(0, 0.5, 0));
    for (let i = 0; i < 9; i++) {
      spawnParticle({
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 0.6, (Math.random() - 0.5) * 2)),
        vel: new THREE.Vector3(dx * power * 0.5 + (Math.random() - 0.5) * 5, 3 + Math.random() * 5, dz * power * 0.5 + (Math.random() - 0.5) * 5),
        color: K.debris[i % K.debris.length], size: 0.22 + Math.random() * 0.2, life: 1.6, grav: 22,
      });
    }
  } else {
    p.state = 'fly';
    p.vel.set(dx * power * 0.95, 4 + power * 0.35, dz * power * 0.95);
    p.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 18);
    p.restA = Math.random() * Math.PI * 2;
    p.restLift = p.kind === 'tire' ? 0 : 0.15;
    p.pos.y = p.home.y + 0.05;
    if (K.debris) burst(p.home.clone().add(new THREE.Vector3(0, 0.6, 0)), 8, { colors: K.debris, size: 0.25, life: 1, grav: 18, speed: 6, up: 6 });
  }
  // Knocking things over costs a little momentum
  T.vel.multiplyScalar(K.slow);
  if (state.mode !== 'playing') return;
  state.stats.smashed++;
  if (K.bad) state.stats.bonks++;
  if (K.pts) addScore(K.pts);
  // Mid-streak, only the combo popups show, so the screen doesn't drown in "+1"s
  const streaking = state.time - state.lastSmash < 1.5 && state.chaos >= 2;
  const label = K.pts ? `${K.text} ${K.pts > 0 ? '+' : ''}${K.pts}` : K.text;
  if ((!streaking || K.bad) && !K.quiet) popup(label, p.home, K.bad ? 'bad' : 'fun', 1);
  if (K.sound === 'boing') audio.boing();
  else if (K.sound === 'clang') audio.clang();
  else if (K.sound === 'crunch') audio.crunch();
  else if (K.sound === 'squeak') audio.squeak();
  else audio.bonk(0.6);
  state.shake = Math.max(state.shake, K.slow < 0.9 ? 0.25 : 0.08);
  if (p.kind === 'mailbox') {
    burst(p.home.clone().add(new THREE.Vector3(0, 1, 0)), 10, { color: 0xffffff, size: 0.35, life: 2, grav: 2, speed: 5, up: 5, drag: 1.5 });
    if (Math.random() < 0.4) narrate('prop', 1, true);
  } else if (p.kind === 'hydrant') {
    audio.splash();
    p.geyser = 7;
    p.washed = false;
  } else if (p.kind === 'lamp') {
    burst(p.home.clone().add(new THREE.Vector3(0, 1, 0)), 8, { colors: [0xffd23f, 0xffffff], size: 0.12, life: 0.4, grav: 20, speed: 8, up: 5 });
  }
  // Chaos combo: wreck lots of stuff in quick succession
  state.chaos = state.time - state.lastSmash < 1.5 ? state.chaos + 1 : 1;
  state.lastSmash = state.time;
  if (p.kind === 'veggie' || p.kind === 'sunflower' || p.kind === 'scarecrow') narrate('garden', 0.25);
  else if (state.chaos === 1) narrate('prop', 0.2);
  if (state.chaos > 0 && state.chaos % 5 === 0) {
    const bonus = state.chaos * 2;
    addScore(bonus);
    popup(`CHAOS x${state.chaos}! +${bonus}`, truck.group.position, 'gold', 4);
    audio.golden();
  }
}

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------
function catBlocked(x, z) {
  for (const b of world.boxes) if (!b.off && x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5) return true;
  for (const s of world.circles) if (!s.off && Math.hypot(x - s.x, z - s.z) < s.r + 0.5) return true;
  return Math.abs(x) > HALF + 3 || Math.abs(z) > HALF + 3;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Two-legged townsfolk: stroll, panic-run with flailing arms, wave, get bounced. */
function animateFolk(c, dt, time) {
  const moving = c.state === 'walk' || c.state === 'flee';
  const fleeing = c.state === 'flee';
  c.ph = (c.ph || Math.random() * 6) + dt * (moving ? (fleeing ? 16 : 7) * Math.max(0.8, c.spec.speed / 2) : 0);
  const k = (v, target, rate = 10) => v + (target - v) * Math.min(1, dt * rate);
  const B = c.body;
  const near = Math.hypot(c.x - T.pos.x, c.z - T.pos.z) < 16 && Math.hypot(T.vel.x, T.vel.z) < 6;
  let legA = 0;
  let armA = 0;
  let armLift = [0, 0];
  let pitch = 0;
  let roll = 0;
  let bob = 0;
  let headYaw = 0;
  let headPitch = 0;
  if (moving) {
    const sw = Math.sin(c.ph);
    legA = sw * (fleeing ? 0.9 : 0.55);
    armA = -sw * (fleeing ? 0.3 : 0.5);
    bob = Math.abs(Math.cos(c.ph)) * (fleeing ? 0.07 : 0.04);
    roll = Math.sin(c.ph) * 0.05;
    if (fleeing) {
      // arms up, flailing, running for it
      armLift = [2.6 + Math.sin(c.ph * 1.7) * 0.5, 2.6 + Math.cos(c.ph * 1.7) * 0.5];
      pitch = 0.2;
    }
  } else if (c.state === 'sit') {
    // standing about; looks around, and waves at Steve when he's nearby and polite
    headYaw = Math.sin(time * 0.6 + c.z) * 0.6;
    if (near) {
      const a = Math.atan2(T.pos.x - c.x, T.pos.z - c.z) - c.vh;
      headYaw = Math.max(-1, Math.min(1, wrapAngle(a)));
      armLift[0] = 2.5;
    }
  } else if (c.state === 'jump' || c.state === 'fly') {
    armLift = [2.8, 2.8];
    legA = 0.6;
    if (c.state === 'fly') roll = Math.sin(time * 25) * 0.4;
  } else if (c.state === 'dazed') {
    headYaw = Math.sin(time * 6) * 0.3;
    roll = Math.sin(time * 6) * 0.15;
  }
  c.legs[0].rotation.x = k(c.legs[0].rotation.x, legA, 18);
  c.legs[1].rotation.x = k(c.legs[1].rotation.x, -legA, 18);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const wave = c.state === 'sit' && near && i === 0 ? Math.sin(time * 12) * 0.35 : 0;
    const swingDir = i === 0 ? armA : -armA;
    c.arms[i].rotation.x = k(c.arms[i].rotation.x, armLift[i] ? -0.2 : swingDir, 14);
    c.arms[i].rotation.z = k(c.arms[i].rotation.z, side * (0.12 + armLift[i]) + wave, 14);
  }
  if (c.state !== 'fly') B.rotation.x = k(B.rotation.x, pitch);
  B.rotation.z = k(B.rotation.z, roll, 14);
  B.position.y = k(B.position.y, c.baseY + bob, 20);
  c.head.rotation.y = k(c.head.rotation.y, headYaw, 5);
  c.head.rotation.x = k(c.head.rotation.x, headPitch, 8);
  c.tail.rotation.z = Math.sin(time * 3 + c.x) * 0.3;
  c.tailSegs.forEach((sg, i) => (sg.rotation.z = Math.sin(time * 2 - i * 0.6) * 0.15));
  c.blinkT = (c.blinkT ?? Math.random() * 3) - dt;
  if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3;
  const closed = c.blinkT < 0 || c.state === 'dazed';
  for (const e of c.eyes) e.scale.y = closed ? 0.15 : 1;
}

/** Pose and animate a critter from its state. */
function animateCritter(c, dt, time) {
  c.vh = c.vh ?? c.h;
  c.vh += wrapAngle(c.h - c.vh) * Math.min(1, dt * (c.state === 'flee' ? 12 : 6)); // turn smoothly
  c.group.position.set(c.x, c.y, c.z);
  c.group.rotation.y = c.vh;
  if (c.biped) return animateFolk(c, dt, time);
  const moving = c.state === 'walk' || c.state === 'flee';
  const fleeing = c.state === 'flee';
  const airborne = c.state === 'jump' || c.state === 'fly';
  c.ph = (c.ph || Math.random() * 6) + dt * (moving ? (fleeing ? 22 : 11) * (c.spec.speed > 2.9 ? 1.2 : 1) : 0);
  const k = (v, target, rate = 10) => v + (target - v) * Math.min(1, dt * rate);
  const B = c.body;
  let bodyY = c.baseY;
  let pitch = 0;
  let roll = 0;
  let squash = 1;
  const legSwing = [0, 0, 0, 0];
  let headPitch = 0;
  let headYaw = 0;
  let earFlap = 0;

  if (c.spec.hop && moving) {
    // bunny: hop, squash on landing, stretch in the air, back feet kick
    const t = (c.ph * 0.45) % (Math.PI * 2);
    const air = Math.max(0, Math.sin(t));
    bodyY += air * 0.4;
    squash = air > 0.05 ? 1 + air * 0.12 : 0.85;
    pitch = Math.cos(t) * 0.25;
    legSwing[2] = legSwing[3] = -air * 0.9;
    legSwing[0] = legSwing[1] = air * 0.5;
    earFlap = -air * 0.5;
  } else if (moving) {
    // trot: diagonal leg pairs, a little bob and waddle
    const sw = Math.sin(c.ph) * (fleeing ? 0.9 : 0.65);
    legSwing[0] = legSwing[3] = sw;
    legSwing[1] = legSwing[2] = -sw;
    bodyY += Math.abs(Math.cos(c.ph)) * (fleeing ? 0.06 : 0.035);
    roll = Math.sin(c.ph) * 0.06;
    headPitch = Math.cos(c.ph * 2) * 0.06;
    pitch = fleeing ? 0.18 : 0; // lean into it
    earFlap = Math.sin(c.ph * 2) * 0.2 + (fleeing ? -0.4 : 0);
  } else if (c.state === 'sit') {
    // sit back on the haunches and look around
    pitch = -0.35;
    bodyY -= 0.06;
    legSwing[2] = legSwing[3] = -1.2;
    legSwing[0] = legSwing[1] = 0.3;
    headPitch = 0.28;
    headYaw = Math.sin(time * 0.7 + c.z) * 0.6;
    earFlap = Math.sin(time * 5 + c.x) > 0.96 ? 0.3 : 0; // ear twitch
  } else if (airborne) {
    // limbs out, ears up, wheee (or nope)
    legSwing[0] = legSwing[1] = -0.9;
    legSwing[2] = legSwing[3] = 0.9;
    squash = c.state === 'jump' ? 1.12 : 1;
    earFlap = -0.6;
    if (c.state === 'fly') roll = Math.sin(time * 30) * 0.3;
  } else if (c.state === 'dazed') {
    headYaw = Math.sin(time * 6) * 0.25;
    roll = Math.sin(time * 6) * 0.12;
    pitch = -0.1;
  }
  if (c.state !== 'fly') B.rotation.x = k(B.rotation.x, pitch);
  B.rotation.z = k(B.rotation.z, roll, 14);
  B.position.y = k(B.position.y, bodyY, 20);
  B.scale.set(1 / Math.sqrt(squash), k(B.scale.y, squash, 18), 1 / Math.sqrt(squash));
  c.legs.forEach((l, i) => (l.rotation.x = k(l.rotation.x, legSwing[i], 16)));
  c.head.rotation.x = k(c.head.rotation.x, headPitch, 8);
  c.head.rotation.y = k(c.head.rotation.y, headYaw, 4);
  c.ears.forEach((e, i) => (e.rotation.x = k(e.rotation.x, earFlap, 10)));
  // tail: wag (fast for happy dogs, swishy for cats), sway for the rest
  const wagRate = c.species === 'puppy' || c.species === 'dalmatian' ? 18 : c.species === 'kitten' ? 3 : 2;
  const wagAmt = c.species === 'puppy' || c.species === 'dalmatian' ? 0.5 : 0.25;
  c.tail.rotation.z = Math.sin(time * wagRate + c.x) * wagAmt;
  c.tailSegs.forEach((sg, i) => (sg.rotation.z = Math.sin(time * wagRate * 0.6 - i * 0.6 + c.z) * 0.12));
  // blink every few seconds
  c.blinkT = (c.blinkT ?? Math.random() * 3) - dt;
  if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3;
  const closed = c.blinkT < 0 || c.state === 'dazed';
  for (const e of c.eyes) e.scale.y = closed ? 0.15 : 1;
}

function critterSound(c) {
  const snd = c.spec.sound;
  if (snd === 'meow') audio.meow();
  else if (snd === 'yip') audio.yip();
  else if (snd === 'huff') audio.huff();
  else if (snd === 'oof') audio.oof();
  else audio.squeak();
}

/** Leap sideways out of the truck's path. */
function scareCat(c, strength = 1) {
  if (c.state === 'fly' || c.state === 'jump' || c.state === 'dazed') return;
  const dx = c.x - T.pos.x;
  const dz = c.z - T.pos.z;
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
  if (Math.random() < 0.5) popup(['nope!', 'eep!', '!!!', 'yikes!'][(Math.random() * 4) | 0], c.group.position, 'fun');
}

function updateCats(dt, time) {
  const speed = Math.hypot(T.vel.x, T.vel.z);
  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  for (const c of cats) {
    c.t -= dt;
    const dx = c.x - T.pos.x;
    const dz = c.z - T.pos.z;
    const dist = Math.hypot(dx, dz);
    // How squarely the truck is bearing down on this critter
    const approaching = (dx * T.vel.x + dz * T.vel.z) / ((dist || 1) * (speed || 1));
    const lateral = Math.abs(dx * -fz + dz * fx); // distance from the truck's path
    const ground = c.state === 'walk' || c.state === 'sit' || c.state === 'flee';
    if (ground) {
      // Truck coming? Scurry sideways out of its path.
      if (c.state !== 'flee' && dist < 18 && speed > 5 && approaching > 0.6 && lateral < 4 && T.y < 1) {
        c.state = 'flee';
        c.t = 1.4;
        let sx = -fz;
        let sz = fx;
        if (sx * dx + sz * dz < 0) {
          sx = -sx;
          sz = -sz;
        }
        c.h = Math.atan2(sx, sz);
        c.dodgeRoll = Math.random() < c.spec.dodge;
      }
      if (c.state === 'flee') {
        if (c.t <= 0) c.state = 'walk';
        if (dist < 7 && speed > 5 && approaching > 0.5 && c.dodgeRoll) scareCat(c);
      } else if (c.t <= 0) {
        if (c.state === 'walk' && Math.random() < 0.35) {
          c.state = 'sit';
          c.t = 2 + Math.random() * 3;
        } else {
          c.state = 'walk';
          c.h += (Math.random() - 0.5) * 2.5;
          c.t = 2 + Math.random() * 4;
        }
      }
      if (c.state === 'walk' || c.state === 'flee') {
        const v = c.spec.speed * (c.state === 'flee' ? 2.6 : 1);
        const nx = c.x + Math.sin(c.h) * v * dt;
        const nz = c.z + Math.cos(c.h) * v * dt;
        if (catBlocked(nx, nz)) c.h += Math.PI * (0.5 + Math.random());
        else {
          c.x = nx;
          c.z = nz;
          c.y = surfaceHeight(nx, nz);
        }
      }
      // Bounced!
      if (dist < 3.4 && T.y < 1.5 && c.state !== 'jump') {
        for (const off of [1.9, -1.9]) {
          const d = Math.hypot(c.x - (T.pos.x + fx * off), c.z - (T.pos.z + fz * off));
          if (d < 2.1) {
            if (speed > 3) {
              c.state = 'fly';
              const k = c.species === 'hedgehog' ? 1.4 : 1; // hedgehogs curl up and really go
              c.vx = (T.vel.x * 0.8 + dx * 1.5) * k;
              c.vz = (T.vel.z * 0.8 + dz * 1.5) * k;
              c.vy = 11 * k;
              c.spin = 14;
              critterSound(c);
              if (state.mode === 'playing') {
                addScore(-5);
                state.stats.cats++;
                const words = CRITTER_WORDS[c.species];
                popup(`${words[(Math.random() * words.length) | 0]} -5`, c.group.position.clone(), 'bad');
                if (state.stats.cats === 1) narrate('critter', 1, true);
                else narrate('critter', 0.3);
              }
            } else {
              c.x += dx * 0.1;
              c.z += dz * 0.1;
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
          c.t = 2.5;
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
    animateCritter(c, dt, time);
  }
}

// ---------------------------------------------------------------------------
// Steve's animation & truck visuals
// ---------------------------------------------------------------------------
let blinkT = 2;
let steveLean = 0;
let duckAmt = 0;

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
  const fillTarget = 2.25 + (state.load / CAPACITY) * 0.95;
  truck.fill.position.y += (fillTarget - truck.fill.position.y) * Math.min(1, dt * 4);
  truck.fill.visible = state.load > 0 || truck.fill.position.y > 2.3;
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
  // Drift sparks colored by charge level, and boost flames
  const lvl = boostLevel(state.driftCharge);
  if (state.driftCharge > 0.25) {
    for (const sx of [1.3, -1.3]) {
      if (Math.random() < 0.7) {
        const p = truck.group.localToWorld(tmpV.set(sx, 0.25, -2.9));
        spawnParticle({
          pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4),
          color: BOOST_COLORS[lvl], size: 0.14 + lvl * 0.04, life: 0.35, grav: 14,
        });
      }
    }
  }
  if (state.boostT > 0) {
    for (let i = 0; i < 2; i++) {
      const p = truck.group.localToWorld(tmpV.set(1.22, 3.95, 1.3));
      spawnParticle({
        pos: p, vel: new THREE.Vector3((Math.random() - 0.5), 3 + Math.random() * 2, (Math.random() - 0.5)),
        color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, size: 0.3, life: 0.35, grow: 1.5, sphere: true,
      });
    }
    const r = truck.group.localToWorld(tmpV.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, -4.2));
    spawnParticle({ pos: r, vel: new THREE.Vector3(-Math.sin(T.heading) * 6, 0.5, -Math.cos(T.heading) * 6), color: 0xffffff, size: 0.12, life: 0.25 });
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
  // Body lean: a little out the doorway when cruising, more into right turns (toward the door),
  // inward on left turns, and well out (looking back) when reversing.
  const reversing = T.fwd < -0.5;
  const cruising = Math.abs(T.fwd) > 0.5;
  let leanTarget;
  if (reversing) leanTarget = 0.46;
  else leanTarget = Math.max(-0.18, Math.min(0.4, (cruising ? 0.12 : 0.04) - T.steer * 0.5));
  steveLean += (leanTarget - steveLean) * Math.min(1, dt * 5);
  steve.group.rotation.z = steveLean; // doorway is on the right (-x)
  steve.group.position.x = steve.group.userData.baseX - Math.max(0, steveLean) * 0.6;
  if (state.chompT > 0) {
    headX = Math.abs(Math.sin(state.chompT * 18)) * 0.35;
    headY = Math.sin(state.chompT * 9) * 0.1;
  } else if (reversing) {
    // Look back over his shoulder, out the doorway
    headY = -2.2;
    headX = -0.1;
  } else if (state.hangry) {
    headZ = Math.sin(time * 25) * 0.12;
    headY = -T.steer * 0.8;
  } else {
    headY = -0.15 + T.steer * 0.7 + Math.sin(time * 0.7) * 0.1;
    headX = -0.05 + (T.grounded ? 0 : -0.3);
  }
  head.rotation.x += (headX - head.rotation.x) * Math.min(1, dt * 12);
  head.rotation.y += (headY - head.rotation.y) * Math.min(1, dt * 8);
  head.rotation.z = (head.userData.baseTilt || 0) + headZ;
  const cele = state.celebrateT > 0 ? Math.abs(Math.sin(state.celebrateT * 12)) * 0.08 : 0;
  const ducking = state.lift && state.lift.t > 0.55 && state.lift.t < LTT.lower[1];
  duckAmt += ((ducking ? 1 : 0) - duckAmt) * Math.min(1, dt * 10);
  steve.group.position.y = steve.group.userData.baseY + cele + (T.grounded ? 0 : 0.1) - duckAmt * 0.45;
  steve.head.position.y = 1.12 - duckAmt * 0.12;
  // Both paws on the wheel; the outer one waves out the doorway when celebrating
  const waving = state.celebrateT > 0;
  // arms[1] is his doorway-side (right) arm: it grabs the frame when reversing
  // and waves after a dump; arms[0] stays on the wheel
  steve.arms[0].rotation.set(-1.1, 0, 0.2 + T.steer * 0.6);
  if (reversing && !waving) steve.arms[1].rotation.set(-2.0, 0, -0.9);
  else steve.arms[1].rotation.set(waving ? -2.6 : -1.1, 0, -0.2 + T.steer * 0.6 - (waving ? 0.6 + Math.sin(state.celebrateT * 18) * 0.3 : 0));
  // Tail wags, faster at speed
  const sp = Math.abs(T.fwd);
  steve.tail.forEach((seg, i) => {
    const rest = steve.tailRest ? steve.tailRest[i] : { x: i < 4 ? -0.12 : 0.22, y: 0 };
    const wag = steve.tailWag ?? 0.18 + sp * 0.006;
    seg.rotation.y = rest.y + Math.sin(time * 2.2 - i * 0.6) * wag;
    seg.rotation.x = rest.x + Math.sin(time * 1.7 - i * 0.5) * wag * 0.4;
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
    // The geese honk back. Of course they do.
    for (const g of geese) if (Math.hypot(g.x - T.pos.x, g.z - T.pos.z) < 30) g.replyT = 0.3 + Math.random() * 0.5;
    narrate('honk', 0.25);
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
    toast(`😾 STEVE IS HANGRY. Steering is now more of a suggestion. ${document.body.classList.contains('touch') ? 'Tap his face' : 'Press E'} to snack!`, 4);
    audio.burp();
  }

  if (state.boostT > 0) state.boostT -= dt;
  updateTreasures(dt);

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
      // Full cans get nervous when the truck is near
      const cg = canFor(h).group;
      const near = Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z) < 22;
      const ph = h.x * 0.7;
      cg.position.y = WALK_Y + (near ? Math.abs(Math.sin(state.time * 9 + ph)) * 0.28 : 0);
      cg.rotation.z = near ? Math.sin(state.time * 18 + ph) * 0.07 : 0;
      if (T.grounded && Math.abs(T.fwd) < 5) {
        const d = Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z);
        // Whichever claw is free and on the can's side takes it
        let arm = null;
        if (d < 10) {
          for (const a of ARMS) {
            if (state.grabs.some((g) => g.arm === a)) continue;
            const r = canToArm(a, canFor(h).group.position);
            if (r.side > 0.3 && r.ext > 0.2 && r.ext < a.MAX_EXT && Math.abs(r.yaw) < 1.1) arm = a;
          }
        }
        if (arm) {
          if (state.load >= CAPACITY) {
            if (!h.fullWarned) {
              h.fullWarned = true;
              popup('TRUCK FULL!', pos, 'bad');
              toast('No room! Empty the truck at The Dump first.');
            }
          } else startGrab(h, arm);
        } else if (d > 10) h.fullWarned = false;
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
  updateGrabs(dt);
  updateBins(dt);

  // Dump
  const dd = Math.hypot(world.dump.x - T.pos.x, world.dump.z - T.pos.z);
  world.dump.padRing.scale.setScalar(1 + Math.sin(state.time * 4) * 0.04);
  if (dd < world.dump.r && speed < 8 && T.grounded) {
    if (!state.dumping && state.load > 0) {
      state.dumping = { start: state.load, n: 0, tick: 0 };
      narrate('dump', 1, true);
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
      state.stats.dumped++;
      addScore(10);
      audio.dumpTick();
      launchBagToPile(truck.group.localToWorld(tmpV.copy(truck.rearLocal)));
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

  // Standing around too long earns commentary
  state.idleT = speed < 1 && !state.dumping && !state.grabs.length ? (state.idleT || 0) + dt : 0;
  if (state.idleT > 7) {
    state.idleT = -20;
    narrate('idle', 1, true);
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
    narrate('ambient');
  }

  // Time
  const left = SHIFT - state.time;
  if (!state.warned && left < 30) {
    state.warned = true;
    state.goldenHour = true;
    toast("🌇 GOLDEN HOUR! 30 seconds left and every point counts DOUBLE!", 4);
    audio.fanfare();
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
  const fov = 60 + speed * 0.35 + (state.zoomT > 0 ? 6 : 0) + (state.boostT > 0 ? 8 : 0);
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
  for (const f of world.flags) f.rotation.y = Math.sin(time * 1.7) * 0.35;
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
function fmtCountdown(left) {
  const s = Math.max(0, Math.ceil(left));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

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
  hud.clock.textContent = fmtCountdown(SHIFT - state.time);
  hud.clock.style.color = SHIFT - state.time < 30 ? '#e17055' : '';
  hud.loadText.textContent = `${state.load}/${CAPACITY}`;
  hud.loadBar.style.width = `${(state.load / CAPACITY) * 100}%`;
  hud.loadBar.classList.toggle('full', state.load >= CAPACITY);
  hud.hungerBar.style.width = `${state.hunger}%`;
  hud.hungerBar.style.backgroundPosition = `${-(100 - state.hunger) * 0}px 0`;
  hud.hungerText.textContent = state.hunger > 60 ? 'happy' : state.hunger > 25 ? 'peckish' : state.hunger > 0 ? 'HUNGRY' : 'HANGRY';
  const st = [];
  if (state.hangry) st.push(document.body.classList.contains('touch') ? '😾 HANGRY! Tap Steve' : '😾 HANGRY! Press E');
  if (state.goldenHour) st.push('⭐ GOLDEN HOUR x2');
  if (state.boostT > 0) st.push('🔥 BOOST');
  else if (state.driftCharge > 0.6) st.push(['', '💙 boost ready', '🧡 SUPER boost', '💖 ULTRA boost'][boostLevel(state.driftCharge)]);
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
    for (const b of world.bins) {
      if (b.state !== 'out' || state.load > CAPACITY - DUMPSTER_BAGS) continue;
      const d = Math.hypot(b.x - T.pos.x, b.z - T.pos.z) * 0.6;
      if (d < best) {
        best = d;
        tx = b.x;
        tz = b.z;
        col = 0xffa31a;
      }
    }
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
// Dumpsters + the front loader: drive up to a full dumpster head-on and the
// forks lift it up and over the cab into the hopper.
// ---------------------------------------------------------------------------
const LOADER = truck.loader;
const LREST = { r: -0.14, L: 2.3, tilt: -0.05 }; // tucked over the cab, forks folded up
const LTOP = { r: -1.78, L: 4.4, tilt: -2.4 };
const loaderPose = { ...LREST };
const DUMPSTER_BAGS = 6;

function applyLoader(p) {
  LOADER.pivot.rotation.x = p.r;
  for (const s of LOADER.sliders) s.scale.z = Math.max(0.01, p.L - LOADER.sliderStart);
  LOADER.forks.position.z = p.L;
  LOADER.forks.rotation.x = p.tilt - p.r;
}
applyLoader(loaderPose);

const lerpL = (a, b, k) => ({ r: a.r + (b.r - a.r) * k, L: a.L + (b.L - a.L) * k, tilt: a.tilt + (b.tilt - a.tilt) * k });

/** Loader pose that puts the forks into the sleeves of a dumpster at world point p. */
function binToLoader(p) {
  truck.body.worldToLocal(armTmp.copy(p));
  armTmp.y += 0.95;
  armTmp.z -= 0.65;
  armTmp.x = 0;
  armTmp.sub(LOADER.P);
  return { r: Math.atan2(-armTmp.y, armTmp.z), L: Math.min(6.8, Math.max(3, armTmp.length())), tilt: 0 };
}
const loaderSwing = (from, k) => ({
  r: from.r + (LTOP.r - from.r) * k,
  L: from.L + (LTOP.L - from.L) * k,
  tilt: LTOP.tilt * ease(Math.max(0, Math.min(1, (k - 0.55) / 0.45))),
});

const LT = { reach: 0.5, grip: 0.15, lift: 0.95, dump: 0.6, lower: 0.85, release: 0.15, retract: 0.4 };
const LTT = {};
{
  let t = 0;
  for (const k of Object.keys(LT)) {
    LTT[k] = [t, t + LT[k]];
    t += LT[k];
  }
}
const lphase = (t, k) => Math.max(0, Math.min(1, (t - LTT[k][0]) / LT[k]));

function resetBins() {
  state.lift = null;
  Object.assign(loaderPose, LREST);
  applyLoader(loaderPose);
  for (const b of world.bins) {
    if (b.group.parent !== scene) scene.attach(b.group);
    b.group.position.copy(b.home);
    b.group.rotation.set(0, b.facing, 0);
    b.group.scale.set(1, 1, 1);
    b.collider.off = false;
    b.state = 'idle';
    b.cooldown = 0;
    b.marker.group.visible = false;
  }
  state.binSpawnT = 0;
  // one is waiting right from the start
  setBinFull(world.bins[(Math.random() * world.bins.length) | 0]);
}

function setBinFull(b) {
  b.state = 'out';
  b.marker.group.visible = true;
}

function updateBins(dt) {
  // Keep a couple of full dumpsters around town
  state.binSpawnT -= dt;
  if (state.binSpawnT <= 0) {
    state.binSpawnT = 18;
    const out = world.bins.filter((b) => b.state === 'out').length;
    const idle = world.bins.filter((b) => b.state === 'idle' && b.cooldown <= 0 && Math.hypot(b.x - T.pos.x, b.z - T.pos.z) > 40);
    if (out < 2 && idle.length) {
      setBinFull(idle[(Math.random() * idle.length) | 0]);
      if (state.mode === 'playing') toast('🗑️ A dumpster somewhere is overflowing. Steve can feel it.', 3);
    }
  }
  for (const b of world.bins) {
    if (b.cooldown > 0) b.cooldown -= dt;
    if (b.state !== 'out') continue;
    b.marker.arrow.position.y = 3 + Math.sin(state.time * 4) * 0.3;
    b.marker.arrow.rotation.y += dt * 3;
    // Full dumpsters rattle when the truck is near
    const near = Math.hypot(b.x - T.pos.x, b.z - T.pos.z) < 22;
    b.group.rotation.z = near ? Math.sin(state.time * 16 + b.x) * 0.025 : 0;
    if (state.lift || !T.grounded || Math.abs(T.fwd) > 4) continue;
    truck.group.worldToLocal(armTmp.copy(b.home));
    const lx = armTmp.x;
    const lz = armTmp.z;
    if (lz < 3 || lz > 11 || Math.abs(lx) > 5) continue;
    // Roughly facing it? The forks are forgiving: the dumpster gets pulled
    // into line as it's picked up.
    let dh = T.heading - (b.facing + Math.PI);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    if (lz > 3.8 && lz < 9.8 && Math.abs(lx) < 2.8 && Math.abs(dh) < 0.95) {
      startLift(b);
    } else if (!b.hinted && lz < 9) {
      b.hinted = true;
      popup('Line up head-on!', truck.group.position, 'fun', 4);
    }
  }
  updateLift(dt);
}

function startLift(b) {
  b.state = 'lifting';
  b.hinted = false;
  b.marker.group.visible = false;
  b.group.rotation.z = 0;
  // Where the dumpster sits once squared up with the forks (truck-local x = 0)
  truck.group.worldToLocal(armTmp.copy(b.home));
  const aligned = truck.group.localToWorld(new THREE.Vector3(0, 0, Math.min(8.2, Math.max(4.6, armTmp.z))));
  aligned.y = b.home.y;
  b.collider.off = true;
  state.lift = { b, t: 0, attached: false, added: false, released: false, hold: true, aligned, alignedRot: T.heading + Math.PI };
  audio.grab();
}

function updateLift(dt) {
  const L = state.lift;
  if (!L) {
    Object.assign(loaderPose, lerpL(loaderPose, LREST, 1 - Math.exp(-8 * dt)));
    applyLoader(loaderPose);
    return;
  }
  truck.body.updateMatrixWorld(true);
  L.t += dt;
  const t = L.t;
  const b = L.b;
  const grab = binToLoader(L.aligned);
  const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const slideBin = (k) => {
    // drag the dumpster between its spot and the forks
    b.group.position.lerpVectors(b.home, L.aligned, k);
    b.group.rotation.set(0, b.facing + shortAngle(L.alignedRot - b.facing) * k, 0);
  };
  let pose;
  if (t < LTT.reach[1]) {
    pose = lerpL(LREST, grab, ease(lphase(t, 'reach')));
    slideBin(ease(Math.max(0, (lphase(t, 'reach') - 0.5) * 2)));
  }
  else if (t < LTT.grip[1]) pose = grab;
  else if (t < LTT.dump[1]) {
    if (!L.attached) {
      L.attached = true;
      b.collider.off = true;
      LOADER.forks.attach(b.group);
      audio.clang();
    }
    if (t < LTT.lift[1]) pose = loaderSwing(grab, ease(lphase(t, 'lift')));
    else {
      const k = lphase(t, 'dump');
      pose = { ...LTOP, tilt: LTOP.tilt + Math.sin(k * Math.PI * 6) * 0.1 * (1 - k) };
      if (Math.random() < 0.8) {
        const mouth = b.group.localToWorld(armTmp.set((Math.random() - 0.5) * 2.4, 1.6, (Math.random() - 0.5) * 1.2));
        spawnParticle({
          pos: mouth.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, -6, (Math.random() - 0.5) * 1.5),
          color: TRASH_COLORS[(Math.random() * TRASH_COLORS.length) | 0], size: 0.3 + Math.random() * 0.2, life: 0.6, grav: 20,
        });
      }
      if (!L.added && k > 0.35) {
        L.added = true;
        const got = Math.min(DUMPSTER_BAGS, CAPACITY - state.load);
        state.load += got;
        state.stats.dumpsters++;
        state.stats.bags += got;
        addScore(30);
        audio.golden();
        popup(`FRONT LOAD! +${got} bags`, truck.group.position, 'gold', 5);
        narrate('frontload', state.stats.dumpsters === 1 ? 1 : 0.4, state.stats.dumpsters === 1);
        if (state.load >= CAPACITY) toast('🚛 Truck is FULL! Head to The Dump (orange on the map).');
      }
    }
  } else if (t < LTT.lower[1]) pose = loaderSwing(grab, 1 - ease(lphase(t, 'lower')));
  else if (t < LTT.release[1]) {
    pose = grab;
    if (!L.released) {
      L.released = true;
      scene.attach(b.group);
      b.group.scale.set(1, 1, 1);
      slideBin(1);
      b.state = 'idle';
      b.cooldown = 35;
    }
  } else if (t < LTT.retract[1]) {
    pose = lerpL(grab, LREST, ease(lphase(t, 'retract')));
    slideBin(1 - ease(lphase(t, 'retract'))); // scoot it back where it belongs
  } else {
    slideBin(0);
    b.collider.off = false;
    state.lift = null;
    pose = LREST;
  }
  if (state.lift) L.hold = t < LTT.release[1];
  Object.assign(loaderPose, pose);
  applyLoader(loaderPose);
}

// ---------------------------------------------------------------------------
// The trash mountain: every dumped bag arcs onto the pile and stays there
// ---------------------------------------------------------------------------
const PILE_MAX = 220;
const pileBatches = [0x2b2b2b, 0x3d7ea6, 0x40704a].map((c) => {
  const t = makeTrashBag(() => 0);
  t.traverse((m) => m.isMesh && m.material.color && m.material.color.getHex() === 0x2b2b2b && (m.material = toon(c)));
  return new PropBatch(scene, t, PILE_MAX);
});
const flyingBags = [];
let pileCount = 0;
const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _bs = new THREE.Vector3();

function pileSpot() {
  const D = world.dump;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * (D.pileR - 0.8);
  const grow = Math.min(2.6, pileCount * 0.018); // the mountain rises over the shift
  const y = D.pileY + (1 - r / D.pileR) * D.pileH * (1 + grow / D.pileH) - 0.15;
  return new THREE.Vector3(D.pileX + Math.cos(a) * r, y, D.pileZ + Math.sin(a) * r);
}

function launchBagToPile(from) {
  let f = flyingBags.find((b) => !b.active);
  if (!f) {
    const mesh = makeTrashBag(Math.random);
    scene.add(mesh);
    f = { mesh };
    flyingBags.push(f);
  }
  f.active = true;
  f.t = 0;
  f.from = from.clone();
  f.to = pileSpot();
  f.batch = pileBatches[(Math.random() * pileBatches.length) | 0];
  f.mesh.visible = true;
  f.mesh.position.copy(from);
}

function updatePile(dt) {
  for (const f of flyingBags) {
    if (!f.active) continue;
    f.t += dt / 0.85;
    const k = Math.min(1, f.t);
    f.mesh.position.lerpVectors(f.from, f.to, k);
    f.mesh.position.y += Math.sin(k * Math.PI) * 8;
    f.mesh.rotation.x += dt * 8;
    f.mesh.rotation.z += dt * 5;
    if (k >= 1) {
      f.active = false;
      f.mesh.visible = false;
      // settle into the pile for good
      const batch = f.batch;
      if (batch.count < PILE_MAX) {
        _bq.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.6));
        _bs.setScalar(0.9 + Math.random() * 0.5);
        batch.set(batch.add(), _bm.compose(f.to, _bq, _bs));
      }
      pileCount++;
      burst(f.to.clone(), 3, { colors: TRASH_COLORS, size: 0.25, life: 0.6, grav: 15, speed: 4, up: 4 });
    }
  }
}

function resetPile() {
  for (const b of pileBatches) b.reset();
  for (const f of flyingBags) {
    f.active = false;
    f.mesh.visible = false;
  }
  pileCount = 0;
}

// ---------------------------------------------------------------------------
// Geese: the one thing in town that does not get knocked over
// ---------------------------------------------------------------------------
const geese = [];
const onRoad = (x, z) => surfaceHeight(x, z) === ROAD_Y && Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3;
for (let i = 0; i < 6; i++) {
  const g = makeGoose();
  g.group.scale.setScalar(1.5); // geese are large and in charge
  scene.add(g.group);
  geese.push({ ...g, x: 0, z: 0, h: 0, tx: 0, tz: 0, wait: 0, alert: 0, honkT: 0, hop: 0, cool: 0, replyT: 0 });
}
function placeGoose(g) {
  do {
    const i = (Math.random() * (N + 1)) | 0;
    const along = -HALF + Math.random() * HALF * 2;
    const off = (Math.random() - 0.5) * (ROAD - 4);
    [g.x, g.z] = Math.random() < 0.5 ? [roadCenter(i) + off, along] : [along, roadCenter(i) + off];
  } while (!onRoad(g.x, g.z) || Math.hypot(g.x - T.pos.x, g.z - T.pos.z) < 40);
  g.home = [g.x, g.z];
  g.tx = g.x;
  g.tz = g.z;
  g.alert = 0;
}
// Spilled cargo: bags that fly out of the hopper and then fade away
const spilled = [];
function spill(n) {
  n = Math.min(n, state.load);
  state.load -= n;
  const from = truck.group.localToWorld(tmpV.copy(truck.hopperLocal));
  for (let i = 0; i < n; i++) {
    const mesh = makeTrashBag(Math.random);
    scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    spilled.push({ mesh, pos: from.clone(), vel: new THREE.Vector3(Math.cos(a) * 6, 9 + Math.random() * 4, Math.sin(a) * 6), t: 0 });
  }
  if (n) popup(`-${n} SPILLED!`, truck.group.position, 'bad', 3);
}
function updateGeese(dt, time) {
  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  for (const g of geese) {
    const dx = T.pos.x - g.x;
    const dz = T.pos.z - g.z;
    const dist = Math.hypot(dx, dz);
    g.cool -= dt;
    g.hop = Math.max(0, g.hop - dt);
    let walking = false;
    if (dist > 17) g.alert = 0;
    const standoff = dist < 11 && g.alert < 3.5 && state.mode === 'playing';
    if (g.replyT > 0) {
      g.replyT -= dt;
      if (g.replyT <= 0) gooseHonk(g);
    }
    if (standoff) {
      // Turn to face the truck and honk at it
      g.alert += dt;
      g.h = Math.atan2(dx, dz);
      g.honkT -= dt;
      if (g.honkT <= 0) {
        g.honkT = 0.9 + Math.random() * 0.6;
        gooseHonk(g);
      }
    } else if (g.wait > 0) {
      g.wait -= dt;
    } else {
      const tx = g.tx - g.x;
      const tz = g.tz - g.z;
      if (Math.hypot(tx, tz) < 0.4) {
        g.wait = 0.5 + Math.random() * 3;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * 10;
          const x = g.home[0] + Math.cos(a) * r;
          const z = g.home[1] + Math.sin(a) * r;
          if (onRoad(x, z)) {
            g.tx = x;
            g.tz = z;
            break;
          }
        }
      } else {
        g.h = Math.atan2(tx, tz);
        g.x += Math.sin(g.h) * 1.6 * dt;
        g.z += Math.cos(g.h) * 1.6 * dt;
        walking = true;
      }
    }
    // Geese are immovable objects. The truck is not an unstoppable force.
    if (T.y < 2) {
      for (const off of [1.9, -1.9]) {
        const cx = T.pos.x + fx * off;
        const cz = T.pos.z + fz * off;
        const ex = cx - g.x;
        const ez = cz - g.z;
        const d = Math.hypot(ex, ez);
        const R = 2.4;
        if (d < R && d > 1e-3) {
          T.pos.x += (ex / d) * (R - d);
          T.pos.z += (ez / d) * (R - d);
          const speed = Math.hypot(T.vel.x, T.vel.z);
          if (speed > 6 && g.cool <= 0 && state.mode === 'playing') {
            g.cool = 2;
            g.hop = 0.45;
            T.vel.multiplyScalar(-0.45);
            bonk(14);
            gooseHonk(g, true);
            spill(3);
            state.streak = 0;
            state.stats.geese++;
            popup('GOOSE WINS', g.group.position, 'bad', 4);
            narrate('goose', 1, true);
          } else {
            const vn = (T.vel.x * ex + T.vel.z * ez) / d;
            if (vn < 0) {
              T.vel.x -= (vn * ex) / d;
              T.vel.z -= (vn * ez) / d;
            }
          }
          break;
        }
      }
    }
    g.group.position.set(g.x, surfaceHeight(g.x, g.z) + Math.sin(g.hop * 14) * g.hop * 1.6, g.z);
    g.group.rotation.y = g.h;
    g.body.rotation.z = walking ? Math.sin(time * 9 + g.home[0]) * 0.12 : 0;
    g.neck.rotation.x = g.hop > 0 || standoff ? -0.35 : 0.1 + Math.sin(time * 2 + g.home[1]) * 0.06;
  }
  // Spilled bags tumble out and fade
  for (let i = spilled.length - 1; i >= 0; i--) {
    const b = spilled[i];
    b.t += dt;
    b.vel.y -= GRAVITY * dt;
    b.pos.addScaledVector(b.vel, dt);
    const floor = surfaceHeight(b.pos.x, b.pos.z);
    if (b.pos.y < floor) {
      b.pos.y = floor;
      b.vel.multiplyScalar(0.4);
      b.vel.y = Math.abs(b.vel.y) * 0.3;
    }
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.x += dt * 6 * Math.max(0, 1 - b.t);
    if (b.t > 3) b.mesh.scale.setScalar(Math.max(0.01, 1 - (b.t - 3)));
    if (b.t > 4) {
      scene.remove(b.mesh);
      spilled.splice(i, 1);
    }
  }
}
let lastGooseHonk = -9;
function gooseHonk(g, force = false) {
  g.hop = Math.max(g.hop, 0.25);
  popup('HONK!', g.group.position, 'bad', 2.6);
  if (force || state.time - lastGooseHonk > 0.35) {
    lastGooseHonk = state.time;
    audio.gooseHonk();
  }
}

// ---------------------------------------------------------------------------
// Beach balls: bat them around the parks and plaza
// ---------------------------------------------------------------------------
const balls = world.balls.map(([x, z]) => {
  const b = makeBeachBall();
  scene.add(b.group);
  return { ...b, home: [x, z], pos: new THREE.Vector3(), vel: new THREE.Vector3(), hitT: -9 };
});
function resetBalls() {
  for (const b of balls) {
    b.pos.set(b.home[0], surfaceHeight(b.home[0], b.home[1]) + 0.9, b.home[1]);
    b.vel.set(0, 0, 0);
    b.group.position.copy(b.pos);
  }
}
const BALL_R = 0.9;
function updateBalls(dt) {
  const fx = Math.sin(T.heading);
  const fz = Math.cos(T.heading);
  for (const b of balls) {
    // Truck hits: punt the ball
    for (const off of [1.9, -1.9]) {
      const dx = b.pos.x - (T.pos.x + fx * off);
      const dz = b.pos.z - (T.pos.z + fz * off);
      const d = Math.hypot(dx, dz);
      if (d < 1.7 + BALL_R && b.pos.y < T.y + 3.5) {
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        const sp = Math.hypot(T.vel.x, T.vel.z);
        b.vel.set(T.vel.x * 1.15 + nx * (4 + sp * 0.3), 5 + sp * 0.4, T.vel.z * 1.15 + nz * (4 + sp * 0.3));
        b.pos.x = T.pos.x + fx * off + nx * (1.75 + BALL_R);
        b.pos.z = T.pos.z + fz * off + nz * (1.75 + BALL_R);
        if (state.time - b.hitT > 0.6) {
          b.hitT = state.time;
          audio.boing();
          if (state.mode === 'playing') {
            addScore(1);
            popup('BOING! +1', b.pos, 'fun', 0);
          }
        }
        break;
      }
    }
    b.vel.y -= GRAVITY * 0.6 * dt;
    b.pos.addScaledVector(b.vel, dt);
    const floor = surfaceHeight(b.pos.x, b.pos.z) + BALL_R;
    if (b.pos.y < floor) {
      b.pos.y = floor;
      b.vel.y = Math.abs(b.vel.y) > 2 ? -b.vel.y * 0.65 : 0;
      b.vel.x *= 1 - Math.min(1, dt * 1.2);
      b.vel.z *= 1 - Math.min(1, dt * 1.2);
    }
    // Bounce off buildings, trees and the edge of town
    for (const w of world.boxes) {
      if (w.off) continue;
      const qx = Math.max(w.minX, Math.min(b.pos.x, w.maxX));
      const qz = Math.max(w.minZ, Math.min(b.pos.z, w.maxZ));
      const ex = b.pos.x - qx;
      const ez = b.pos.z - qz;
      const e = Math.hypot(ex, ez);
      if (e < BALL_R && e > 1e-4) {
        b.pos.x = qx + (ex / e) * BALL_R;
        b.pos.z = qz + (ez / e) * BALL_R;
        const vn = (b.vel.x * ex + b.vel.z * ez) / e;
        if (vn < 0) {
          b.vel.x -= (1.7 * vn * ex) / e;
          b.vel.z -= (1.7 * vn * ez) / e;
        }
      }
    }
    for (const c of world.circles) {
      if (c.off) continue;
      const ex = b.pos.x - c.x;
      const ez = b.pos.z - c.z;
      const e = Math.hypot(ex, ez);
      if (e < c.r + BALL_R && e > 1e-4) {
        b.pos.x = c.x + (ex / e) * (c.r + BALL_R);
        b.pos.z = c.z + (ez / e) * (c.r + BALL_R);
        const vn = (b.vel.x * ex + b.vel.z * ez) / e;
        if (vn < 0) {
          b.vel.x -= (1.7 * vn * ex) / e;
          b.vel.z -= (1.7 * vn * ez) / e;
        }
      }
    }
    b.group.position.copy(b.pos);
    // Roll in the direction of travel
    const v = Math.hypot(b.vel.x, b.vel.z);
    if (v > 0.05) {
      _ax.set(b.vel.z / v, 0, -b.vel.x / v);
      b.ball.quaternion.premultiply(_q.setFromAxisAngle(_ax, (v * dt) / BALL_R));
    }
  }
}

// ---------------------------------------------------------------------------
// Pigeons in the plaza: they scatter when the truck shows up
// ---------------------------------------------------------------------------
const pigeons = [];
for (const spot of world.pigeonSpots) {
  for (let i = 0; i < 10; i++) {
    const pg = makePigeon();
    pg.group.scale.setScalar(1.3);
    scene.add(pg.group);
    pigeons.push({ ...pg, spot, state: 'peck', t: Math.random() * 3, pos: new THREE.Vector3(), vel: new THREE.Vector3(), h: 0 });
  }
}
let lastFlutter = -9;
function placePigeon(pg) {
  let x;
  let z;
  do {
    const a = Math.random() * Math.PI * 2;
    const r = 6.5 + Math.random() * (pg.spot.r - 6.5);
    x = pg.spot.x + Math.cos(a) * r;
    z = pg.spot.z + Math.sin(a) * r;
  } while (world.props.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.6));
  pg.pos.set(x, LAWN_Y, z);
  pg.h = Math.random() * 6;
  pg.state = 'peck';
  pg.group.visible = true;
}
function updatePigeons(dt, time) {
  for (const pg of pigeons) {
    pg.t -= dt;
    const d = Math.hypot(pg.pos.x - T.pos.x, pg.pos.z - T.pos.z);
    if (pg.state === 'peck') {
      if (pg.t <= 0) {
        pg.t = 0.5 + Math.random() * 2;
        pg.h += (Math.random() - 0.5) * 2;
      }
      pg.pos.x += Math.sin(pg.h) * 0.3 * dt;
      pg.pos.z += Math.cos(pg.h) * 0.3 * dt;
      pg.group.rotation.x = Math.max(0, Math.sin(time * 9 + pg.pos.x * 3)) * 0.5; // peck peck
      pg.wings[0].rotation.z = -1.35; // wings folded along the body
      pg.wings[1].rotation.z = 1.35;
      if (d < 13) {
        // Everybody panics
        pg.state = 'fly';
        pg.t = 4 + Math.random() * 2;
        const ax = pg.pos.x - T.pos.x;
        const az = pg.pos.z - T.pos.z;
        const al = Math.hypot(ax, az) || 1;
        pg.vel.set((ax / al) * 7 + (Math.random() - 0.5) * 4, 6 + Math.random() * 3, (az / al) * 7 + (Math.random() - 0.5) * 4);
        pg.h = Math.atan2(pg.vel.x, pg.vel.z);
        pg.group.rotation.x = -0.4;
        if (time - lastFlutter > 1.5) {
          lastFlutter = time;
          audio.flutter();
          if (state.mode === 'playing') popup('coo!!', pg.pos.clone(), 'fun', 0);
        }
      }
    } else if (pg.state === 'fly') {
      pg.vel.y += 1.5 * dt;
      pg.pos.addScaledVector(pg.vel, dt);
      const flap = Math.sin(time * 30 + pg.pos.x) * 0.9;
      pg.wings[0].rotation.z = flap;
      pg.wings[1].rotation.z = -flap;
      if (pg.t <= 0) {
        pg.state = 'away';
        pg.group.visible = false;
        pg.t = 12 + Math.random() * 8;
      }
    } else if (pg.state === 'away' && pg.t <= 0 && Math.hypot(pg.spot.x - T.pos.x, pg.spot.z - T.pos.z) > 40) {
      placePigeon(pg);
    }
    pg.group.position.copy(pg.pos);
    pg.group.rotation.y = pg.h;
  }
}

// Driving through a bush makes it explode in leaves (it's fine, bushes are tough)
function updateBushes() {
  for (const b of world.bushes) {
    if (Math.abs(b.x - T.pos.x) > 4 || Math.abs(b.z - T.pos.z) > 4) continue;
    if (Math.hypot(b.x - T.pos.x, b.z - T.pos.z) < 2.6 && state.time - (b.t || -9) > 1.2 && Math.hypot(T.vel.x, T.vel.z) > 3) {
      b.t = state.time;
      leafBurst(b.x, b.z, 0.8, 10);
    }
  }
}

// ---------------------------------------------------------------------------
// Treasures: shiny junk for Steve's hoard, scattered around town
// ---------------------------------------------------------------------------
const TREASURE_NAMES = [
  'a rubber duck', 'a single roller skate', "a trophy for 'Most Improved'", 'a VHS tape of Cats 2',
  'a golden spoon', 'half a treasure map', 'a tiny disco ball', 'a lucky sock (the other one)',
  "somebody's dentures", 'the TV remote everyone was looking for',
];
const TREASURE_COLORS = [0xff6bd5, 0x6ec6ff, 0xffd23f, 0x7cf3a0, 0xc77dff, 0xff8c42];
const treasures = [];
{
  const spots = [];
  // Floating past the end of each park ramp: you have to jump for these
  for (const r of world.ramps) {
    spots.push([r.x + r.dirX * (r.len + 7), r.z + r.dirZ * (r.len + 7), LAWN_Y + 5.0]);
  }
  const dumpBlock = world.blocks.find((b) => b.type === 'dump');
  spots.push([dumpBlock.cx + 15, dumpBlock.cz - 15, LAWN_Y + 1.6]);
  const plaza = world.blocks.find((b) => b.type === 'plaza');
  spots.push([plaza.cx - 12, plaza.cz, LAWN_Y + 1.6]);
  // Tucked into a few backyards
  const yards = world.blocks.filter((b) => b.type === 'houses');
  for (const k of [3, 9, 15]) {
    const b = yards[k % yards.length];
    spots.push([b.cx + 5.5, b.cz + 5.5, LAWN_Y + 1.6]);
  }
  // Far corners of town
  spots.push([roadCenter(0), roadCenter(0), ROAD_Y + 1.6]);
  spots.push([roadCenter(N), roadCenter(N), ROAD_Y + 1.6]);
  spots.forEach(([x, z, y], i) => {
    const t = makeTreasure(TREASURE_COLORS[i % TREASURE_COLORS.length]);
    t.group.position.set(x, y, z);
    t.beam.position.y = 20 - (y - 1.6);
    scene.add(t.group);
    treasures.push({ ...t, x, y, z, name: TREASURE_NAMES[i % TREASURE_NAMES.length], found: false });
  });
}

function resetTreasures() {
  for (const t of treasures) {
    t.found = false;
    t.group.visible = true;
  }
}

function updateTreasures(dt) {
  for (const t of treasures) {
    if (t.found) continue;
    t.spin.rotation.y += dt * 2;
    t.spin.position.y = Math.sin(state.time * 2.5 + t.x) * 0.2;
    const dy = t.y - (T.y + 1.6);
    if (Math.hypot(t.x - T.pos.x, t.z - T.pos.z) < 3.4 && Math.abs(dy) < 2.3) {
      t.found = true;
      t.group.visible = false;
      state.stats.treasures++;
      addScore(50);
      audio.treasure();
      burst(t.group.position.clone(), 30, { colors: [0xffffff, 0xffd23f, 0xff6bd5, 0x6ec6ff], size: 0.25, life: 1.1, grav: 8, speed: 10, up: 8 });
      popup('TREASURE! +50', truck.group.position, 'gold', 4);
      const n = state.stats.treasures;
      toast(`💎 Steve found ${t.name}! Into the hoard it goes. (${n}/${treasures.length})`, 4);
      if (n === treasures.length) setTimeout(() => toast('👑 The hoard is complete. Steve weeps with joy.', 4), 1500);
    }
  }
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
  toast('☀️ Good morning, Steve! Empty the glowing trash cans before the sun goes down.', 4);
}

function brendaSays(stars, st) {
  if (st.geese >= 3) return '"Please stop hitting the geese. They have retained counsel."';
  if (st.smashed >= 60) return '"The neighborhood association would like a word. Several words."';
  if (st.snacks >= 6) return '"You ate more of the cargo than you delivered. Bold."';
  if (st.treasures >= 8) return '"Impressive hoard. HR will be asking where it came from."';
  return [
    '"I have seen raccoons drive better. I have seen raccoons not drive at all, and that was also better."',
    '"Surprisingly adequate. Suspicious."',
    '"Fine work. I am docking you for the flamingos anyway."',
    '"Exemplary. I am legally required to say I did not see the mailboxes."',
  ][stars];
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
    ['Cans emptied', st.cans],
    ['Dumpsters hoisted over the cab', st.dumpsters],
    ['Bags delivered to The Dump', st.dumped],
    ['Cargo eaten "for quality control"', st.snacks],
    ['Longest airtime', `${st.air.toFixed(1)}s`],
    ['Property "rearranged"', st.smashed],
    ['Trees felled', st.trees],
    ['Treasures hoarded', `${st.treasures}/${treasures.length}`],
    ['Double grabs', st.doubles],
    ['Boosts', st.boosts],
    ['Geese disrespected', st.geese],
    ['Citizens bounced', st.cats],
  ];
  $('review').textContent = brendaSays(stars, st);
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
$('unstickBtn').addEventListener('click', () => {
  setPaused(false);
  unstick();
});
const syncMuteBtn = () => ($('muteBtn').textContent = audio.muted ? '🔇 Sound off' : '🔊 Sound on');
$('muteBtn').addEventListener('click', () => {
  audio.toggleMute();
  syncMuteBtn();
});
window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => document.hidden && setPaused(true));

// ---------------------------------------------------------------------------
// Steve cam: a little live portrait of Steve's face in the HUD
// ---------------------------------------------------------------------------
const faceCam = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
const portraitEl = $('portrait');
const _fp = new THREE.Vector3();
const _fh = new THREE.Vector3();
let lastMood = '';
function renderPortrait() {
  const r = portraitEl.getBoundingClientRect();
  if (r.width < 10) return;
  truck.body.updateMatrixWorld(true);
  steve.head.getWorldPosition(_fh);
  // In front of his face, a bit toward the middle of the cab, looking back at him
  const h = T.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // Just inside the windshield, a little above his eye line, nudged toward the middle
  const side = 0.3 - Math.max(0, steveLean) * 3; // swing outside the doorway as he leans out
  _fp.copy(_fh).add(tmpV2.set(fx * 1.75 + fz * side, 0.3, fz * 1.75 - fx * side));
  faceCam.position.copy(_fp);
  faceCam.lookAt(_fh.x, _fh.y - 0.02, _fh.z);
  // hide what's between him and the camera (the loader arms, the steering wheel)
  truck.loader.pivot.visible = false;
  for (const m of truck.steeringWheel) m.visible = false;
  faceCam.aspect = r.width / r.height;
  faceCam.updateProjectionMatrix();
  const y = window.innerHeight - r.bottom;
  renderer.setScissorTest(true);
  renderer.setScissor(r.left + 3, y + 3, r.width - 6, r.height - 6);
  renderer.setViewport(r.left + 3, y + 3, r.width - 6, r.height - 6);
  renderer.shadowMap.autoUpdate = false;
  renderer.render(scene, faceCam);
  truck.loader.pivot.visible = true;
  for (const m of truck.steeringWheel) m.visible = true;
  renderer.shadowMap.autoUpdate = true;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);

  // Mood frame + label
  let mood;
  if (state.chompT > 0) mood = 'chomp';
  else if (state.hangry) mood = 'hangry';
  else if (state.hunger < 25) mood = 'hungry';
  else if (state.boostT > 0 || state.zoomT > 0) mood = 'zoom';
  else if (state.hicT > 0) mood = 'hic';
  else mood = state.hunger > 60 ? 'happy' : 'peckish';
  if (mood !== lastMood) {
    lastMood = mood;
    portraitEl.className = mood;
    const M = {
      chomp: ['😋', 'nom nom'], hangry: ['💢', 'HANGRY! feed me'], hungry: ['🍕?', 'hungry'],
      zoom: ['⚡', 'zoomies'], hic: ['🫧', 'hic!'], happy: ['', 'happy'], peckish: ['', 'peckish'],
    };
    $('mood').textContent = M[mood][0];
    $('moodText').textContent = M[mood][1];
  }
  $('portraitFill').style.width = `${state.hunger}%`;
}

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
    syncMuteBtn();
    toast(m ? '🔇 Muted' : '🔊 Sound on', 1.5);
  }
  if (pressed.has('pause')) setPaused(state.mode === 'playing');
  if (pressed.has('enter') && (state.mode === 'title' || state.mode === 'results')) startShift();
  else if (pressed.has('enter') && state.mode === 'paused') setPaused(false);

  if (state.mode === 'playing') {
    updateTruck(dt);
    updateGameplay(dt);
    updateProps(dt);
    updateBushes();
    updateGeese(dt, elapsed);
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
    updateBalls(dt);
    updatePigeons(dt, elapsed);
    updatePile(dt);
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
  if (state.mode === 'playing' || state.mode === 'paused') renderPortrait();
}
frame();

// Handy for debugging / automated screenshots
window.__steve = { state, T, keys, startShift, world, renderer, geese, cats };
