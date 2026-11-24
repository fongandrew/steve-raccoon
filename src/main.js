// Steve Raccoon: a game about a raccoon, a trash truck, and poor impulse control.
import * as THREE from 'three';
import { M, makeTruck, makeBag, makePizza, makeGoose, makeGull, makeCloud, makeArrow, windowMat } from './models.js';
import { buildWorld, HALF, P, R, B, onRoad, roadC, blockC, mulberry32 } from './world.js';
import { Sfx } from './audio.js';

const CAP = 12, SHIFT = 150, MAXSPD = 27, BOOSTSPD = 43;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ------------------------------------------------------------------ renderer & scene
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
// sky: [zenith, horizon] by day and at dusk
const SKY_DAY = [new THREE.Color(0x3d9df0), new THREE.Color(0xb9e4ff)];
const SKY_DUSK = [new THREE.Color(0x5b5fa8), new THREE.Color(0xffb38a)];
const SUN_DAY = new THREE.Color(0xfff1d6), SUN_DUSK = new THREE.Color(0xff9a5c);
scene.background = SKY_DAY[1].clone();
scene.fog = new THREE.Fog(SKY_DAY[1].clone(), 140, 460);

const camera = new THREE.PerspectiveCamera(60, 1, 1, 1100);

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: SKY_DAY[0].clone() }, horizon: { value: SKY_DAY[1].clone() } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y * 1.15, 0.0, 1.0);
      gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0);
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), skyMat);
sky.renderOrder = -10;
scene.add(sky);
const sunDisc = new THREE.Group();
{
  const mk = (r, o) => new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: o, fog: false, depthWrite: false }));
  sunDisc.add(mk(70, 0.12), mk(48, 0.2), mk(30, 1));
  sunDisc.renderOrder = -9;
  scene.add(sunDisc);
}

const hemi = new THREE.HemisphereLight(0xd4ebff, 0xb3a58c, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.8);
sun.castShadow = true;
const coarse = matchMedia('(pointer: coarse)').matches;
sun.shadow.mapSize.setScalar(coarse ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.25;
scene.add(sun, sun.target);

const world = buildWorld(scene);
const sfx = new Sfx();

// ------------------------------------------------------------------ actors
const truck = Object.assign(makeTruck(), {
  pos: new THREE.Vector3(), heading: 0, speed: 0, steer: 0, y: 0, headYaw: 0, chomp: 0, lastSpeed: 0, pitch: 0,
  hopper: new THREE.Vector3(),
});
scene.add(truck.group);

const arrow = makeArrow();
scene.add(arrow);

const clouds = [];
{
  const rng = mulberry32(7);
  for (let i = 0; i < 12; i++) {
    const c = makeCloud(rng);
    c.position.set((rng() - 0.5) * 700, 70 + rng() * 40, (rng() - 0.5) * 700);
    c.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    scene.add(c);
    clouds.push(c);
  }
}

const gulls = [];
for (let i = 0; i < 5; i++) {
  const g = makeGull();
  g.traverse(o => { o.castShadow = false; });
  scene.add(g);
  gulls.push({ g, a: i * 1.3, r: 7 + i * 2, h: 15 + (i % 3) * 2.5, s: 0.5 + i * 0.07 });
}

const GOOSE_HOMES = [
  [world.park.x - 6, world.park.z + 5, 15, true], [world.park.x + 5, world.park.z - 2, 15, true], [world.park.x, world.park.z + 9, 15, true],
  [roadC(2), roadC(2), 12, false], [roadC(1), roadC(3), 12, false], [roadC(3), roadC(2), 12, false], [roadC(2), roadC(1), 12, false],
];
const geese = GOOSE_HOMES.map(([x, z, range, free]) => {
  const group = makeGoose();
  scene.add(group);
  return { group, home: new THREE.Vector3(x, 0, z), range, free, pos: new THREE.Vector3(x, 0, z), target: new THREE.Vector3(x, 0, z), heading: rand(6.28), wait: rand(2), alert: 0, honkT: 0, cool: 0, hop: 0 };
});

const pizzas = [];
for (let i = 0; i < 4; i++) {
  const group = makePizza();
  scene.add(group);
  pizzas.push({ group, pos: new THREE.Vector3(), active: false, respawn: 0 });
}

const bags = [];     // spilled trash lying around
const flights = [];  // bags flying onto the pile
const fountains = [];

// ------------------------------------------------------------------ particles
const PMAX = 280;
const pGeo = new THREE.BoxGeometry(1, 1, 1);
const pRound = new THREE.SphereGeometry(0.6, 10, 8);
const parts = [];
for (let i = 0; i < PMAX; i++) {
  const m = new THREE.Mesh(pGeo, M(0xffffff));
  m.visible = false;
  scene.add(m);
  parts.push({ m, vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grav: 20, spin: 0 });
}
let pIdx = 0;
function puff(x, y, z, vx, vy, vz, color, size = 0.4, life = 0.7, grav = 20, round = false, glow = false) {
  const p = parts[pIdx = (pIdx + 1) % PMAX];
  p.m.material = M(color, glow ? { flatShading: false, emissive: color, emissiveIntensity: 0.9 } : round ? { flatShading: false } : undefined);
  p.m.geometry = round ? pRound : pGeo;
  p.m.position.set(x, y, z);
  p.m.rotation.set(rand(3), rand(3), rand(3));
  p.m.visible = true;
  p.vel.set(vx, vy, vz);
  p.life = p.max = life; p.size = size; p.grav = grav; p.spin = rand(-6, 6);
}
function burst(pos, colors, n = 10, power = 6, size = 0.4) {
  for (let i = 0; i < n; i++) puff(pos.x, pos.y, pos.z, rand(-power, power), rand(power * 0.5, power * 1.4), rand(-power, power), pick(colors), size * rand(0.6, 1.3), rand(0.5, 1.0));
}
const TRASH_COLORS = [0x2d2f36, 0xd9b77e, 0x5dbb4f, 0xf5f1e3, 0xd96c4a, 0x7b8a99, 0xf7d154];

// ------------------------------------------------------------------ game state
const game = {
  state: 'title', t: 0, time: SHIFT, cash: 0, load: 0, reserved: 0, snacks: 1, streak: 0, streakT: 0, boostT: 0,
  shake: 0, unloadT: 0, visitFull: false, visitCount: 0, inPad: false, honkCool: 0, idle: 0, totalDumped: 0,
  stats: null,
};
const freshStats = () => ({ bins: 0, dumped: 0, eaten: 0, pizzas: 0, geese: 0, mailbox: 0, flamingo: 0, gnome: 0, hydrant: 0, crashes: 0 });
const input = { up: false, down: false, left: false, right: false };
let best = 0;
try { best = +localStorage.getItem('steve-raccoon-best') || 0; } catch { /* private mode */ }
$('best').textContent = '$' + best;

const QUOTES = {
  pickup: ['Ooh, leftovers!', 'Vintage!', 'Still warm!', 'Is that... lasagna?', "One man's trash is my lunch.", 'Finders keepers.', 'Jackpot. Coffee grounds.', 'Mine now.'],
  full: ["She's full! To Mt. Trashmore!", "Can't fit another banana peel.", 'Truck is stuffed. Like me on a Tuesday.'],
  goose: ['Sorry, sir.', 'Geese have right of way. Always.', 'I did NOT see him there.', 'Please do not tell the other geese.', "He's not even dented!"],
  snack: ['Quality control.', 'Nom. For safety.', 'I am a professional.', 'Fuel efficiency!', 'It counts as recycling.'],
  pizza: ['PIZZA! Still in the box!', 'Who throws this away?!', 'Best job ever.'],
  prop: ['That was like that already.', 'Mailbox had it coming.', 'I have tiny hands, OK?', 'Nobody saw that.', 'Abstract landscaping.', 'Oops-a-daisy.'],
  crash: ['Parallel parking!', 'Insurance is a human concept.', 'Meant to do that.', 'The house came out of nowhere.', 'Brakes are more of a suggestion.'],
  dump: ['Goodbye, beautiful garbage.', 'Go be free, little bags.', 'Another honest day of work!', 'Mt. Trashmore grows stronger.'],
  idle: ['I washed my hands. In a puddle.', 'Do you smell that? Heaven.', 'Technically I have no license.', '...are we on break?'],
  horn: ['Beep beep, baby.', 'Coming through!', 'Make way for garbage!'],
  hedge: ['Boing.', 'Town limits. Spooky.'],
  start: ["Let's get trashy.", 'Clock in, snack out.', 'Steve Raccoon, reporting for doody.'],
  emptyTank: ['Nothing to snack on. Tragic.'],
};

// ------------------------------------------------------------------ HUD helpers
const slotsEl = $('slots');
for (let i = 0; i < CAP; i++) slotsEl.appendChild(document.createElement('i'));
const bubbleEl = $('bubble'), toastEl = $('toast'), popupsEl = $('popups');
let bubbleT = 0, bubbleAge = 9, toastT = 0;
const popups = [];
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

function say(kind, force = false) {
  if (!force && bubbleAge < 1.6) return;
  bubbleEl.textContent = QUOTES[kind] ? pick(QUOTES[kind]) : kind;
  bubbleEl.classList.add('show');
  bubbleT = 2.6; bubbleAge = 0;
}
function toast(text, dur = 2.2) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  toastT = dur;
}
function popup(text, pos, cls = '') {
  if (popups.length > 24) popups.shift().el.remove();
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  popupsEl.appendChild(el);
  popups.push({ el, pos: pos.clone(), t: 0, off: popups.filter(o => o.t < 0.6).length * 34 });
}
function project(v) {
  tmpV.copy(v).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * innerWidth, y: (-tmpV.y * 0.5 + 0.5) * innerHeight, ok: tmpV.z < 1 };
}
function addCash(n) {
  game.cash += n;
  const el = $('cash');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ------------------------------------------------------------------ setup / reset
function setBinFull(b, full) {
  b.full = full;
  const u = b.group.userData;
  u.trash.visible = full;
  u.lid.rotation.x = full ? -0.55 : 0;
  for (const e of u.eyes) e.scale.y = full ? 1 : 0.12;
}
function placePizza(p) {
  for (let tries = 0; tries < 20; tries++) {
    const a = roadC(Math.floor(rand(5))), b = rand(-HALF + 12, HALF - 12);
    const [x, z] = Math.random() < 0.5 ? [a, b] : [b, a];
    if (Math.hypot(x - truck.pos.x, z - truck.pos.z) < 30) continue;
    if (pizzas.some(o => o !== p && o.active && o.pos.distanceTo(tmpV.set(x, 0, z)) < 30)) continue;
    p.pos.set(x, 0, z);
    break;
  }
  p.group.position.copy(p.pos);
  p.group.visible = true;
  p.active = true;
}
function reset() {
  Object.assign(game, { time: SHIFT, cash: 0, load: 0, reserved: 0, snacks: 1, streak: 0, streakT: 0, boostT: 0, shake: 0, unloadT: 0, inPad: false, idle: 0, totalDumped: 0, stats: freshStats() });
  truck.pos.set(roadC(3) + 3.5, 0, blockC(2));
  truck.heading = Math.PI; truck.speed = 0; truck.steer = 0;
  camYaw = truck.heading;
  for (const b of world.bins) {
    b.anim = null; b.refill = 0;
    b.group.position.copy(b.home);
    b.group.rotation.set(0, b.rotY, 0);
    setBinFull(b, true);
  }
  for (const p of world.props) {
    p.knocked = false; p.rest = false;
    p.group.position.copy(p.home);
    p.group.rotation.set(0, p.rotY, 0);
  }
  for (const g of geese) { g.pos.copy(g.home); g.target.copy(g.home); g.alert = 0; g.cool = 0; }
  for (const b of bags) scene.remove(b.group);
  for (const f of flights) scene.remove(f.group);
  bags.length = flights.length = fountains.length = 0;
  world.dump.pile.scale.setScalar(1);
  for (const p of pizzas) { p.active = false; placePizza(p); }
  // one guaranteed pizza in Sal's parking lot
  pizzas[0].pos.set(world.pizza.x, 0, world.pizza.z + 4);
  pizzas[0].group.position.copy(pizzas[0].pos);
}

function startShift() {
  sfx.init();
  sfx.music(true);
  reset();
  game.state = 'playing';
  $('title').classList.add('hidden');
  $('report').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) { $('touch').classList.remove('hidden'); document.body.classList.add('touch'); }
  say('start', true);
  toast('COLLECT THE TRASH!', 2);
}

function endShift() {
  game.state = 'over';
  sfx.whistle();
  sfx.music(false);
  const s = game.stats;
  const ranks = [[2200, 'Supreme Overlord of Refuse'], [1500, 'Garbage Virtuoso'], [900, 'Certified Trash Panda'], [400, 'Junior Bin Wrangler'], [0, 'Probationary Dumpster Diver']];
  $('rank').textContent = 'Rank: ' + ranks.find(r => game.cash >= r[0])[1];
  const rows = [
    ['Bins emptied', s.bins], ['Trash delivered to Mt. Trashmore', s.dumped],
    ['Cargo eaten "for quality control"', s.eaten], ['Pizzas rescued', s.pizzas],
    ['Geese disrespected', s.geese], ['Mailboxes wronged', s.mailbox], ['Flamingos launched', s.flamingo],
    ['Gnomes relocated', s.gnome], ['Hydrants liberated', s.hydrant],
  ];
  const isBest = game.cash > best;
  if (isBest) { best = game.cash; try { localStorage.setItem('steve-raccoon-best', best); } catch { /* ignore */ } }
  $('stats').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') +
    `<tr class="total"><td>CASH${isBest ? ' (NEW BEST!)' : ''}</td><td>$${game.cash}</td></tr>`;
  const chaos = s.mailbox + s.flamingo + s.gnome + s.hydrant;
  let review;
  if (s.geese >= 3) review = 'The geese have filed a formal complaint. Several, actually.';
  else if (s.eaten >= 5) review = 'Please stop eating the inventory, Steve.';
  else if (chaos >= 12) review = 'The mailboxes are unionizing against you.';
  else if (s.dumped === 0) review = 'You did not deliver any trash. Where did it go, Steve? WHERE?';
  else if (game.cash >= 1500) review = 'Outstanding work. I am still not giving you a key to the pizza place.';
  else review = 'Surprisingly adequate. Suspicious.';
  $('review').textContent = `"${review}" - Brenda (possum), Regional Manager`;
  $('best').textContent = '$' + best;
  setTimeout(() => { if (game.state === 'over') { $('report').classList.remove('hidden'); $('hud').classList.add('hidden'); } }, 900);
  $('touch').classList.add('hidden');
}

// ------------------------------------------------------------------ input
const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
addEventListener('keydown', e => {
  if (KEYS[e.code]) { input[KEYS[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); game.state === 'playing' ? snack() : null; }
  if (e.code === 'Enter' && game.state !== 'playing') startShift();
  if (e.code === 'KeyH') horn();
  if (e.code === 'KeyM') sfx.setMuted(!sfx.muted);
  if (e.code === 'KeyR' && game.state !== 'title') startShift();
});
addEventListener('keyup', e => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });
addEventListener('blur', () => { for (const k in input) input[k] = false; });
$('startBtn').addEventListener('click', startShift);
$('againBtn').addEventListener('click', startShift);
for (const btn of document.querySelectorAll('#touch button')) {
  const k = btn.dataset.k;
  const set = v => e => {
    e.preventDefault();
    btn.classList.toggle('down', v);
    if (k === 'snack') { if (v) snack(); } else input[k] = v;
  };
  btn.addEventListener('pointerdown', set(true));
  btn.addEventListener('pointerup', set(false));
  btn.addEventListener('pointercancel', set(false));
  btn.addEventListener('pointerleave', set(false));
}

function snack() {
  if (game.boostT > 0.4) return;
  if (game.snacks > 0) { game.snacks--; }
  else if (game.load > 0) { game.load--; game.stats.eaten++; popup('-1 cargo (yum)', truck.hopper, 'bad'); }
  else { say('emptyTank'); return; }
  game.boostT = 2.6;
  truck.chomp = 0.5;
  sfx.chomp(); sfx.boost();
  say('snack');
}
function horn() {
  if (game.state !== 'playing') return;
  sfx.horn();
  say('horn');
  for (const g of geese) if (g.pos.distanceTo(truck.pos) < 40) g.honkT = Math.min(g.honkT, rand(0.3, 0.8)), g.alert = Math.min(g.alert, 0), g.forceHonk = true;
}

// ------------------------------------------------------------------ truck
const fwd = new THREE.Vector3();
function pushOut(cx, cz, r) {
  // returns [nx, nz, depth] of the deepest penetration for a circle against the static world, or null
  let best = null;
  for (const b of world.boxes) {
    const px = clamp(cx, b.x0, b.x1), pz = clamp(cz, b.z0, b.z1);
    let dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-4) { // centre is inside the box: leave by the nearest face
      const l = cx - b.x0, rr = b.x1 - cx, t = cz - b.z0, bt = b.z1 - cz, m = Math.min(l, rr, t, bt);
      if (m === l) { dx = -1; dz = 0; } else if (m === rr) { dx = 1; dz = 0; } else if (m === t) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
      d = -m;
    } else { dx /= d; dz /= d; }
    if (!best || r - d > best[2]) best = [dx, dz, r - d];
  }
  const circ = (x, z, cr) => {
    const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz);
    if (d < r + cr && d > 1e-4 && (!best || r + cr - d > best[2])) best = [dx / d, dz / d, r + cr - d];
  };
  for (const c of world.circles) circ(c.x, c.z, c.r);
  return best;
}

function updateTruck(dt) {
  const playing = game.state === 'playing';
  const thr = playing ? (input.up ? 1 : 0) - (input.down ? 1 : 0) : 0;
  const steerIn = playing ? (input.left ? 1 : 0) - (input.right ? 1 : 0) : 0;
  truck.steer += (steerIn - truck.steer) * Math.min(1, dt * 7);
  const boosting = game.boostT > 0;
  const inDump = Math.abs(truck.pos.x - world.dump.x) < 22 && Math.abs(truck.pos.z - world.dump.z) < 22;
  const offroad = !onRoad(truck.pos.x, truck.pos.z) && !inDump;
  let max = boosting ? BOOSTSPD : MAXSPD;
  if (offroad) max *= 0.72;

  if (thr > 0) truck.speed += (truck.speed < 0 ? 42 : 17) * dt;
  else if (thr < 0) truck.speed -= (truck.speed > 0 ? 46 : 13) * dt;
  else truck.speed -= Math.sign(truck.speed) * Math.min(Math.abs(truck.speed), (playing ? 8 : 30) * dt);
  if (boosting) truck.speed += 45 * dt;
  if (truck.speed > max) truck.speed = Math.max(max, truck.speed - 35 * dt);
  if (truck.speed < -11) truck.speed = -11;

  truck.heading += truck.steer * 2.25 * clamp(truck.speed / 9, -1, 1) / (1 + Math.abs(truck.speed) / 70) * dt;
  fwd.set(Math.sin(truck.heading), 0, Math.cos(truck.heading));
  truck.pos.addScaledVector(fwd, truck.speed * dt);

  // collisions: two circles, nose and tail
  for (const off of [2.1, -1.9]) {
    const cx = truck.pos.x + fwd.x * off, cz = truck.pos.z + fwd.z * off;
    const hit = pushOut(cx, cz, 1.9);
    if (hit) {
      truck.pos.x += hit[0] * hit[2]; truck.pos.z += hit[1] * hit[2];
      const vn = (fwd.x * hit[0] + fwd.z * hit[1]) * truck.speed;
      if (vn < -7) crash(-0.35, 'crash');
      else truck.speed *= 1 - Math.min(1, dt * 1.5);
    }
  }
  const lim = HALF - 2.4;
  if (Math.abs(truck.pos.x) > lim || Math.abs(truck.pos.z) > lim) {
    truck.pos.x = clamp(truck.pos.x, -lim, lim); truck.pos.z = clamp(truck.pos.z, -lim, lim);
    if (Math.abs(truck.speed) > 7) { truck.speed *= -0.5; sfx.boing(); game.shake = 0.25; say('hedge'); burst(tmpV2.copy(truck.pos).setY(2), [0x3f9a55, 0x63c26a], 12, 7, 0.5); }
  }

  // visuals
  const ratio = truck.speed / MAXSPD;
  const accel = (truck.speed - truck.lastSpeed) / Math.max(dt, 1e-3);
  truck.lastSpeed = truck.speed;
  truck.pitch = lerp(truck.pitch, clamp(-accel * 0.0035, -0.09, 0.09), Math.min(1, dt * 6));
  const bl = v => Math.abs((((v + HALF) % P) + P) % P - R - B / 2);
  const onPave = Math.max(bl(truck.pos.x), bl(truck.pos.z)) > 19;
  truck.y = lerp(truck.y, onRoad(truck.pos.x, truck.pos.z) ? 0 : inDump ? 0.2 : onPave ? 0.24 : 0.3, Math.min(1, dt * 12));
  truck.beaconMat.emissiveIntensity = Math.sin(game.t * 9) > 0 ? 1.6 : 0.15;
  truck.group.position.set(truck.pos.x, truck.y, truck.pos.z);
  truck.group.rotation.y = truck.heading;
  truck.body.rotation.z = truck.steer * ratio * 0.13;
  truck.body.rotation.x = truck.pitch;
  truck.body.position.y = Math.abs(Math.sin(game.t * 13)) * 0.05 * Math.min(1, Math.abs(ratio) * 2) + (offroad ? Math.sin(game.t * 31) * 0.04 * Math.abs(ratio) : 0);
  const sq = 1 + Math.sin(game.t * 9) * 0.012;
  truck.body.scale.set(1 / sq, sq, 1);
  for (const w of truck.wheels) w.rotation.x += truck.speed * dt / 0.78;
  for (const p of truck.steerPivots) p.rotation.y = truck.steer * 0.45;
  truck.heap.scale.y = lerp(truck.heap.scale.y, Math.max(0.01, game.load / CAP * 1.25), Math.min(1, dt * 8));
  truck.group.updateMatrixWorld();
  truck.hopper.set(0, 4.9, -1.3).applyMatrix4(truck.group.matrixWorld);

  // Steve
  game.idle = Math.abs(truck.speed) < 0.5 ? game.idle + dt : 0;
  const lookBack = truck.speed < -1.5 || game.idle > 3.5 || game.state === 'over';
  let yawTo = lookBack ? Math.PI * 0.92 : truck.steer * 0.7;
  if (game.state === 'title') yawTo = Math.atan2(camera.position.x - truck.pos.x, camera.position.z - truck.pos.z) - truck.heading;
  truck.headYaw = lerpAngle(truck.headYaw, yawTo, Math.min(1, dt * 6));
  truck.head.rotation.y = truck.headYaw;
  truck.head.rotation.z = Math.sin(game.t * 2.2) * 0.07;
  truck.head.position.y = 1.32 + Math.sin(game.t * 13) * 0.03 * Math.abs(ratio);
  truck.chomp = Math.max(0, truck.chomp - dt);
  const ch = 1 + Math.abs(Math.sin(truck.chomp * 25)) * 0.18 * (truck.chomp > 0 ? 1 : 0);
  truck.head.scale.set(1, ch, 1);
  for (const k of ['earL', 'earR']) truck.head.userData[k].rotation.x = -Math.max(0, ratio) * 0.7 + Math.sin(game.t * 22 + (k === 'earL' ? 0 : 1)) * 0.12 * Math.abs(ratio);
  truck.tail.rotation.x = lerp(truck.tail.rotation.x, -clamp(ratio, -0.3, 1.5) * 0.45, Math.min(1, dt * 5));
  truck.tail.userData.segs.forEach((s, i) => { if (i) { s.rotation.z = 0.16 + Math.sin(game.t * 5 - i * 0.7) * 0.2; s.rotation.x = Math.cos(game.t * 4 - i * 0.6) * 0.1; } });
  if (playing && game.idle > 7 && game.idle - dt <= 7) say('idle');

  // exhaust, boost and dust
  if (Math.random() < dt * (6 + Math.abs(ratio) * 14)) {
    tmpV2.set(-1.25, 5.2, 1.15).applyMatrix4(truck.group.matrixWorld);
    puff(tmpV2.x, tmpV2.y, tmpV2.z, rand(-0.5, 0.5), 2.5, rand(-0.5, 0.5), 0xf0f0f0, 0.3, 0.55, -2, true);
  }
  if (boosting) {
    for (let i = 0; i < 3; i++) {
      tmpV2.set(rand(-1.2, 1.2), 1.0, -4.4).applyMatrix4(truck.group.matrixWorld);
      puff(tmpV2.x, tmpV2.y, tmpV2.z, -fwd.x * 6 + rand(-2, 2), rand(1, 4), -fwd.z * 6 + rand(-2, 2), pick([0xfff2a8, 0xf7d154, 0xff8a3c, 0xff5a3c]), rand(0.22, 0.42), 0.32, -4, true, true);
    }
  }
  if (offroad && Math.abs(truck.speed) > 8 && Math.random() < dt * 30) {
    tmpV2.set(rand(-1.4, 1.4), 0.3, -3).applyMatrix4(truck.group.matrixWorld);
    puff(tmpV2.x, tmpV2.y, tmpV2.z, rand(-2, 2), rand(2, 5), rand(-2, 2), pick([0x7cc96b, 0x9a7b4f, 0x63c26a]), 0.3, 0.6, 20, true);
  }
  sfx.setEngine(ratio + (boosting ? 0.5 : 0), game.state === 'playing');
}

function crash(bounce, quote) {
  truck.speed *= bounce;
  game.shake = 0.35;
  game.stats.crashes++;
  sfx.thunk();
  say(quote);
  burst(tmpV2.copy(truck.pos).addScaledVector(fwd, 3).setY(1.5), [0xffffff, 0xffe066, 0xcccccc], 8, 6, 0.3);
}

function spill(n) {
  n = Math.min(n, game.load);
  game.load -= n;
  for (let i = 0; i < n; i++) {
    const group = makeBag();
    group.position.copy(truck.hopper);
    scene.add(group);
    const a = rand(6.28);
    bags.push({ group, vel: new THREE.Vector3(Math.cos(a) * rand(4, 9), rand(8, 13), Math.sin(a) * rand(4, 9)), t: 0, landed: false });
  }
  if (n) popup(`-${n} SPILLED!`, truck.hopper, 'bad');
}

// ------------------------------------------------------------------ bins
function updateBins(dt) {
  const playing = game.state === 'playing';
  for (const b of world.bins) {
    const g = b.group;
    if (b.anim) {
      const a = b.anim;
      a.t += dt / 1.05;
      let flip = 0;
      if (a.t < 0.4) {
        const k = ease(a.t / 0.4);
        g.position.lerpVectors(b.home, truck.hopper, k);
        g.position.y += Math.sin(k * Math.PI) * 3.5;
        flip = k * Math.PI * 0.9;
      } else if (a.t < 0.62) {
        g.position.copy(truck.hopper);
        g.position.y += 0.6 + Math.sin(a.t * 80) * 0.12;
        flip = Math.PI * 0.9;
        if (!a.tipped) { a.tipped = true; tipBin(b); }
      } else if (a.t < 1) {
        const k = ease((a.t - 0.62) / 0.38);
        g.position.lerpVectors(truck.hopper, b.home, k);
        g.position.y += Math.sin(k * Math.PI) * 3.5;
        flip = Math.PI * 0.9 * (1 - k);
      } else {
        b.anim = null;
        g.position.copy(b.home);
        b.pop = 0.3;
      }
      g.rotation.set(-flip, b.rotY + (b.anim ? Math.sin(a.t * Math.PI) * 1.5 : 0), 0);
      continue;
    }
    const d2 = (truck.pos.x - b.home.x) ** 2 + (truck.pos.z - b.home.z) ** 2;
    if (!b.full) {
      b.refill -= dt;
      if (b.refill <= 0) { setBinFull(b, true); b.pop = 0.35; }
    } else if (playing && d2 < 8.6 * 8.6 && game.load + game.reserved < CAP) {
      b.anim = { t: 0, tipped: false };
      game.reserved += b.units;
    }
    // idle wiggle: full bins get nervous when the truck is near
    const near = b.full && d2 < 22 * 22;
    b.pop = Math.max(0, b.pop - dt);
    const s = 1 + Math.sin(b.pop * 20) * b.pop;
    g.scale.set(s, 2 - s, s);
    g.position.y = b.home.y + (near ? Math.abs(Math.sin(game.t * 9 + b.phase)) * 0.3 : 0);
    g.rotation.z = near ? Math.sin(game.t * 18 + b.phase) * 0.06 : 0;
  }
}

function tipBin(b) {
  game.reserved = Math.max(0, game.reserved - b.units);
  const units = Math.min(b.units, CAP - game.load);
  setBinFull(b, false);
  b.refill = rand(32, 48);
  if (units <= 0) return;
  game.load += units;
  game.streak = game.streakT > 0 ? Math.min(game.streak + 1, 10) : 1;
  game.streakT = 4.5;
  const tip = 5 * game.streak * units;
  addCash(tip);
  game.stats.bins++;
  popup(`+$${tip}` + (game.streak > 2 ? ` x${game.streak}` : ''), truck.hopper, game.streak >= 5 ? 'big' : '');
  sfx.pickup(game.streak);
  burst(truck.hopper, TRASH_COLORS, 9, 4, 0.35);
  if (game.load >= CAP) { say('full', true); sfx.fanfare(); }
  else if (Math.random() < 0.3) say('pickup');
}

// ------------------------------------------------------------------ dump
function updateDump(dt) {
  const d = world.dump;
  const inPad = Math.hypot(truck.pos.x - d.pad.x, truck.pos.z - d.pad.z) < d.padR + 1;
  if (inPad && !game.inPad) { game.visitFull = game.load >= CAP; game.visitCount = 0; }
  game.inPad = inPad;
  d.padMesh.scale.setScalar(1 + Math.sin(game.t * 5) * 0.03);
  if (inPad && game.load > 0 && game.state === 'playing' && Math.abs(truck.speed) < 20) {
    game.unloadT -= dt;
    while (game.unloadT <= 0 && game.load > 0) {
      game.unloadT += 0.11;
      game.load--; game.visitCount++; game.totalDumped++;
      game.stats.dumped++;
      addCash(20);
      game.time += 1.5;
      sfx.coin();
      const group = makeBag();
      scene.add(group);
      const a = rand(6.28), r = rand(2, 8);
      flights.push({ group, from: truck.hopper.clone(), to: new THREE.Vector3(d.pilePos.x + Math.cos(a) * r, 9 * (1 - r / 11) * d.pile.scale.y, d.pilePos.z + Math.sin(a) * r), t: 0 });
      popup('+$20', tmpV2.copy(truck.hopper).add(tmpV.set(rand(-2, 2), rand(0, 2), rand(-2, 2))));
      if (game.load === 0) {
        if (game.visitFull) { addCash(100); toast('FULL LOAD BONUS +$100!'); sfx.fanfare(); }
        else toast(`+${Math.round(game.visitCount * 1.5)} SECONDS!`, 1.6);
        say('dump', true);
      }
    }
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.t += dt / 0.8;
    f.group.position.lerpVectors(f.from, f.to, f.t);
    f.group.position.y += Math.sin(f.t * Math.PI) * 9;
    f.group.rotation.x += dt * 9;
    if (f.t >= 1) {
      burst(f.to, TRASH_COLORS, 4, 3, 0.3);
      scene.remove(f.group);
      flights.splice(i, 1);
      d.pile.scale.setScalar(1 + Math.min(0.5, game.totalDumped * 0.004));
    }
  }
  gulls.forEach(gl => {
    gl.a += dt * gl.s;
    gl.g.position.set(d.pilePos.x + Math.cos(gl.a) * gl.r, gl.h + Math.sin(gl.a * 3) * 1.5, d.pilePos.z + Math.sin(gl.a) * gl.r);
    gl.g.rotation.y = -gl.a;
    gl.g.userData.wings.forEach((w, i) => { w.rotation.z = Math.sin(game.t * 9 + gl.r) * 0.6 * (i ? 1 : -1); });
  });
}

// ------------------------------------------------------------------ geese, props, pickups
function updateGeese(dt) {
  game.honkCool -= dt;
  for (const g of geese) {
    const dx = truck.pos.x - g.pos.x, dz = truck.pos.z - g.pos.z, dist = Math.hypot(dx, dz);
    g.cool -= dt;
    let moving = false;
    if (dist > 17) g.alert = 0;
    const standoff = dist < 11 && g.alert < 3.2 && game.state === 'playing';
    if (standoff || g.forceHonk) {
      if (standoff) g.alert += dt;
      g.heading = lerpAngle(g.heading, Math.atan2(dx, dz), Math.min(1, dt * 8));
      g.honkT -= dt;
      if (g.honkT <= 0) {
        g.honkT = rand(0.9, 1.5);
        g.hop = 0.25;
        g.forceHonk = false;
        popup('HONK!', tmpV2.copy(g.pos).setY(3.4), 'honk');
        if (game.honkCool <= 0) { sfx.honk(); game.honkCool = 0.35; }
      }
    } else if (g.wait > 0) {
      g.wait -= dt;
    } else {
      const tx = g.target.x - g.pos.x, tz = g.target.z - g.pos.z, td = Math.hypot(tx, tz);
      if (td < 0.5) {
        g.wait = rand(0.5, 3);
        for (let i = 0; i < 12; i++) {
          const a = rand(6.28), r = rand(3, g.range);
          const x = g.home.x + Math.cos(a) * r, z = g.home.z + Math.sin(a) * r;
          if (g.free || onRoad(x, z)) { g.target.set(x, 0, z); break; }
        }
      } else {
        g.heading = lerpAngle(g.heading, Math.atan2(tx, tz), Math.min(1, dt * 5));
        g.pos.x += Math.sin(g.heading) * 1.8 * dt; g.pos.z += Math.cos(g.heading) * 1.8 * dt;
        moving = true;
      }
    }
    // geese are immovable objects
    for (const off of [2.1, -1.9]) {
      const cx = truck.pos.x + fwd.x * off, cz = truck.pos.z + fwd.z * off;
      const ddx = cx - g.pos.x, ddz = cz - g.pos.z, d = Math.hypot(ddx, ddz);
      if (d < 3.0 && d > 1e-3) {
        truck.pos.x += ddx / d * (3.0 - d); truck.pos.z += ddz / d * (3.0 - d);
        if (Math.abs(truck.speed) > 6 && g.cool <= 0 && game.state === 'playing') {
          g.cool = 2;
          g.hop = 0.4; g.honkT = 0.15; g.forceHonk = true;
          game.stats.geese++;
          game.streak = 0; game.streakT = 0;
          crash(-0.6, 'goose');
          spill(3);
          popup('GOOSE WINS', tmpV2.copy(g.pos).setY(7.5), 'bad');
        }
      }
    }
    g.hop = Math.max(0, g.hop - dt);
    const onPond = Math.hypot(g.pos.x - world.park.x, g.pos.z - world.park.z) < 8;
    g.group.position.set(g.pos.x, (onPond ? -0.35 : 0.05) + (onRoad(g.pos.x, g.pos.z) ? 0 : 0.3) + Math.sin(g.hop * 12) * g.hop * 2, g.pos.z);
    g.group.rotation.y = g.heading;
    const u = g.group.userData;
    u.inner.rotation.z = moving ? Math.sin(game.t * 9 + g.home.x) * 0.14 : 0;
    u.feet.forEach((f, i) => { f.rotation.x = moving ? Math.sin(game.t * 9 + g.home.x + i * Math.PI) * 0.6 : 0; f.visible = !onPond; });
    u.neck.rotation.x = 0.15 + (g.hop > 0 ? -0.5 : Math.sin(game.t * 2 + g.home.z) * 0.06);
  }
}

const PROP_WORDS = { mailbox: ['YOU GOT MAIL', 'RETURN TO SENDER', 'SPECIAL DELIVERY'], flamingo: ['SQUAWK!', 'FLY, PINK ONE!'], gnome: ['GNOOOOO!', 'GNOME MORE!'], hydrant: ['SPLOOSH!'] };
function updateProps(dt) {
  for (const p of world.props) {
    if (!p.knocked) {
      if (Math.abs(truck.speed) < 3) continue;
      for (const off of [2.6, -2.2]) {
        const cx = truck.pos.x + fwd.x * off, cz = truck.pos.z + fwd.z * off;
        if (Math.hypot(cx - p.home.x, cz - p.home.z) < 1.8 + p.r) {
          p.knocked = true; p.rest = false;
          p.vel.set(fwd.x * truck.speed * 0.9 + rand(-4, 4), rand(9, 14), fwd.z * truck.speed * 0.9 + rand(-4, 4));
          p.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
          truck.speed *= 0.93;
          if (game.state === 'playing') game.stats[p.type]++;
          popup(pick(PROP_WORDS[p.type]), tmpV2.copy(p.home).setY(3), 'bad');
          sfx.thunk();
          game.shake = Math.max(game.shake, 0.12);
          if (p.type === 'hydrant') { fountains.push({ pos: p.home.clone(), t: 9 }); sfx.splash(); }
          if (Math.random() < 0.45) say('prop');
          break;
        }
      }
    } else if (!p.rest) {
      p.vel.y -= 32 * dt;
      p.group.position.addScaledVector(p.vel, dt);
      p.group.rotation.x += p.spin.x * dt; p.group.rotation.y += p.spin.y * dt; p.group.rotation.z += p.spin.z * dt;
      const pos = p.group.position;
      pos.x = clamp(pos.x, -HALF, HALF); pos.z = clamp(pos.z, -HALF, HALF);
      if (pos.y < 0.35 && p.vel.y < 0) {
        pos.y = 0.35;
        if (p.vel.y > -4) { p.rest = true; p.group.rotation.set(Math.PI / 2, p.group.rotation.y, 0); }
        p.vel.y *= -0.45; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.6);
      }
    }
  }
  for (let i = fountains.length - 1; i >= 0; i--) {
    const f = fountains[i];
    f.t -= dt;
    for (let k = 0; k < 2; k++) puff(f.pos.x, 0.5, f.pos.z, rand(-1.6, 1.6), rand(11, 16) * Math.min(1, f.t / 2), rand(-1.6, 1.6), pick([0x8fd6ff, 0xc9ecff, 0x5fb8f0]), 0.32, 1.1, 22, true);
    if (f.t <= 0) fountains.splice(i, 1);
  }
}

function updatePickups(dt) {
  world.pizza.spinner.rotation.y += dt * 0.9;
  for (const p of pizzas) {
    if (!p.active) {
      p.respawn -= dt;
      if (p.respawn <= 0) placePizza(p);
      continue;
    }
    const inner = p.group.userData.inner;
    inner.rotation.y += dt * 2.2;
    inner.position.y = 1.7 + Math.sin(game.t * 3 + p.pos.x) * 0.3;
    if (game.state === 'playing' && Math.hypot(truck.pos.x - p.pos.x, truck.pos.z - p.pos.z) < 3.8) {
      p.active = false; p.group.visible = false; p.respawn = rand(8, 14);
      game.stats.pizzas++;
      addCash(25);
      const fullUp = game.snacks >= 3;
      if (!fullUp) game.snacks++;
      popup(fullUp ? 'PIZZA! +$25' : 'PIZZA! +$25 +BOOST', tmpV2.copy(p.pos).setY(3.5), 'big');
      sfx.fanfare();
      say('pizza', true);
      burst(tmpV2.copy(p.pos).setY(1.5), [0xf7d154, 0xd8402f, 0xe8c58c], 12, 6, 0.35);
    }
  }
  for (let i = bags.length - 1; i >= 0; i--) {
    const b = bags[i];
    b.t += dt;
    const pos = b.group.position;
    if (!b.landed) {
      b.vel.y -= 30 * dt;
      pos.addScaledVector(b.vel, dt);
      b.group.rotation.x += dt * 6;
      pos.x = clamp(pos.x, -HALF + 2, HALF - 2); pos.z = clamp(pos.z, -HALF + 2, HALF - 2);
      if (pos.y <= 0.1) { pos.y = 0.1; b.landed = true; b.group.rotation.set(0, rand(6), 0); }
    } else if (b.t > 1.3 && game.state === 'playing' && game.load < CAP && Math.hypot(truck.pos.x - pos.x, truck.pos.z - pos.z) < 4) {
      game.load++;
      sfx.pickup(0);
      popup('+1', pos);
      scene.remove(b.group); bags.splice(i, 1);
      continue;
    }
    if (b.t > 24) b.group.scale.setScalar(Math.max(0.01, 25 - b.t));
    if (b.t > 25) { scene.remove(b.group); bags.splice(i, 1); }
  }
}

function updateParticles(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vel.y -= p.grav * dt;
    p.m.position.addScaledVector(p.vel, dt);
    if (p.m.position.y < 0.1 && p.grav > 0) { p.m.position.y = 0.1; p.vel.set(0, 0, 0); }
    p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * dt;
    p.m.scale.setScalar(p.size * Math.min(1, p.life / p.max * 2));
  }
}

// ------------------------------------------------------------------ camera
let camYaw = Math.PI;
const sunDir = new THREE.Vector3(0.5, 0.7, 0.4).normalize();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt, snap) {
  const portrait = clamp(1.25 / camera.aspect, 1, 1.9);
  if (game.state === 'title') {
    const a = Math.PI + 0.55 + Math.sin(game.t * 0.25) * 0.3;
    camPos.set(truck.pos.x + Math.sin(a) * 13 * portrait, 5.2, truck.pos.z + Math.cos(a) * 13 * portrait);
    camLook.copy(truck.pos).setY(3.2);
    // nudge the truck out from behind the title card on wide screens
    if (camera.aspect > 1.2) camLook.add(tmpV.set(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(-4.5));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    return;
  }
  camYaw = lerpAngle(camYaw, truck.heading, 1 - Math.exp(-dt * 3.2));
  const dist = 15.5 * portrait, h = 8.5 * portrait;
  camPos.set(truck.pos.x - Math.sin(camYaw) * dist, h, truck.pos.z - Math.cos(camYaw) * dist);
  if (snap) camera.position.copy(camPos); else camera.position.lerp(camPos, 1 - Math.exp(-dt * 7));
  camLook.copy(truck.pos).addScaledVector(fwd, 5).setY(3.2);
  game.shake = Math.max(0, game.shake - dt);
  if (game.shake > 0) camera.position.add(tmpV.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(game.shake * 1.6));
  camera.lookAt(camLook);
  const fov = game.boostT > 0 ? 76 : 60 + Math.abs(truck.speed) / MAXSPD * 5;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 5)); camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ HUD
const mapEl = $('map'), mctx = mapEl.getContext('2d');
const MS = mapEl.width / (2 * HALF + 8);
const mp = v => (v + HALF + 4) * MS;
let mapTick = 0;
function drawMap() {
  const g = mctx, W = mapEl.width;
  g.fillStyle = '#6d7280'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = blockC(i), cz = blockC(j);
    const isDump = cx === world.dump.x && cz === world.dump.z;
    g.fillStyle = isDump ? '#b79463' : '#86d672';
    g.fillRect(mp(cx - 22), mp(cz - 22), 44 * MS, 44 * MS);
  }
  g.fillStyle = '#6cc4f0'; g.beginPath(); g.arc(mp(world.park.x), mp(world.park.z), 8.5 * MS, 0, 6.3); g.fill();
  g.fillStyle = '#d8402f'; g.fillRect(mp(world.pizza.x - 11), mp(world.pizza.z - 23), 22 * MS, 12 * MS);
  const d = world.dump;
  g.fillStyle = '#8d9078'; g.beginPath(); g.arc(mp(d.pilePos.x), mp(d.pilePos.z), 10 * MS, 0, 6.3); g.fill();
  const pulse = game.load >= CAP * 0.75 ? 1 + Math.sin(game.t * 8) * 0.3 : 1;
  g.fillStyle = '#ffe066'; g.strokeStyle = '#e2543d'; g.lineWidth = 4;
  g.beginPath(); g.arc(mp(d.pad.x), mp(d.pad.z), 8 * MS * pulse, 0, 6.3); g.fill(); g.stroke();
  for (const b of world.bins) {
    if (!b.full) continue;
    g.fillStyle = b.type === 'bin' ? '#1f7a1f' : '#1c5fd0';
    const r = b.type === 'dumpster' ? 5 : 3.5;
    g.fillRect(mp(b.home.x) - r, mp(b.home.z) - r, r * 2, r * 2);
  }
  for (const p of pizzas) if (p.active) {
    g.fillStyle = '#ff9a2e'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(mp(p.pos.x), mp(p.pos.z) + 7); g.lineTo(mp(p.pos.x) - 6, mp(p.pos.z) - 5); g.lineTo(mp(p.pos.x) + 6, mp(p.pos.z) - 5); g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = '#fff';
  for (const gs of geese) { g.beginPath(); g.arc(mp(gs.pos.x), mp(gs.pos.z), 3.5, 0, 6.3); g.fill(); }
  g.save();
  g.translate(mp(truck.pos.x), mp(truck.pos.z));
  g.rotate(-truck.heading);
  g.fillStyle = '#ffc94a'; g.strokeStyle = '#2b2d42'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 13); g.lineTo(-8, -9); g.lineTo(8, -9); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

let lastHud = '';
function updateHud(dt) {
  const t = Math.max(0, Math.ceil(game.time));
  const key = `${game.cash}|${t}|${game.load}|${game.snacks}|${game.streakT > 0 ? game.streak : 0}`;
  if (key !== lastHud) {
    lastHud = key;
    $('cash').textContent = '$' + game.cash;
    $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('low', t <= 15);
    $('loadText').textContent = `${game.load}/${CAP}`;
    [...slotsEl.children].forEach((el, i) => el.classList.toggle('on', i < game.load));
    slotsEl.classList.toggle('full', game.load >= CAP);
    [...$('snacks').children].forEach((el, i) => el.classList.toggle('on', i < game.snacks));
    $('streak').textContent = 'x' + (game.streakT > 0 ? game.streak : 1);
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show'); }
  else if (game.state === 'playing' && game.load >= CAP && !game.inPad) { toastEl.textContent = 'TRUCK FULL! HEAD TO MT. TRASHMORE'; toastEl.classList.add('show'); }
  else toastEl.classList.remove('show');

  bubbleAge += dt;
  if (bubbleT > 0) {
    bubbleT -= dt;
    if (bubbleT <= 0) bubbleEl.classList.remove('show');
    const s = project(tmpV2.set(0, 7.0, 2.4).applyMatrix4(truck.group.matrixWorld));
    bubbleEl.style.left = clamp(s.x, 130, innerWidth - 130) + 'px';
    bubbleEl.style.top = Math.max(70, s.y) + 'px';
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt;
    if (p.t > 1.3) { p.el.remove(); popups.splice(i, 1); continue; }
    const s = project(p.pos);
    const sc = Math.min(1, p.t * 8);
    p.el.style.transform = `translate(${s.x}px, ${s.y - p.t * 60 - p.off}px) translate(-50%, -50%) scale(${sc})`;
    p.el.style.opacity = s.ok ? Math.min(1, (1.3 - p.t) * 3) : 0;
  }
  if (++mapTick % 4 === 0) drawMap();
}

// ------------------------------------------------------------------ main loop
function update(dt) {
  game.t += dt;
  if (game.state === 'playing') {
    game.time -= dt;
    game.streakT -= dt;
    game.boostT = Math.max(0, game.boostT - dt);
    if (game.time <= 0) { game.time = 0; endShift(); }
  }
  updateTruck(dt);
  updateBins(dt);
  updateDump(dt);
  updateGeese(dt);
  updateProps(dt);
  updatePickups(dt);
  updateParticles(dt);

  // dump arrow
  const d = world.dump;
  arrow.visible = game.state === 'playing' && game.load >= CAP * 0.75 && !game.inPad;
  if (arrow.visible) {
    arrow.position.set(truck.pos.x, 9.5 + Math.sin(game.t * 5) * 0.3, truck.pos.z);
    arrow.rotation.y = Math.atan2(d.pad.x - truck.pos.x, d.pad.z - truck.pos.z);
  }

  // the sun gets low as the shift runs out
  const day = game.state === 'title' ? 1 : clamp(game.time / 75, 0, 1);
  skyMat.uniforms.top.value.lerpColors(SKY_DUSK[0], SKY_DAY[0], day);
  skyMat.uniforms.horizon.value.lerpColors(SKY_DUSK[1], SKY_DAY[1], day);
  scene.fog.color.copy(skyMat.uniforms.horizon.value);
  scene.background.copy(scene.fog.color);
  sun.color.lerpColors(SUN_DUSK, SUN_DAY, day);
  sun.intensity = 2.2 + day * 0.6;
  hemi.intensity = 1.0 + day * 0.25;
  windowMat.emissiveIntensity = (1 - day) * 1.1;
  sunDir.set(0.42 + (1 - day) * 0.45, 0.28 + day * 0.5, 0.36).normalize();
  // keep the shadow map centred a little ahead of the truck, where the camera is looking
  const ahead = game.state === 'title' ? 0 : 22;
  sun.target.position.set(truck.pos.x + Math.sin(camYaw) * ahead, 0, truck.pos.z + Math.cos(camYaw) * ahead);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 120);
  for (const c of clouds) { c.position.x += dt * 2; if (c.position.x > 380) c.position.x = -380; }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
reset();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  updateCamera(dt);
  sky.position.copy(camera.position);
  sunDisc.position.copy(camera.position).addScaledVector(sunDir, 850);
  sunDisc.lookAt(camera.position);
  renderer.render(scene, camera);
  updateHud(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for poking at the game from the console
window.__steve = { scene, camera, game, truck, world, geese, pizzas, input, startShift, endShift, spill, update, updateCamera, updateHud };
