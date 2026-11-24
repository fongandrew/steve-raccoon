// Builds the town: roads, blocks, houses, parks, the dump, and all colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  toon, box, cyl, sphere, makeHouse, makeTree, makeBush, makeTrashCan, makeMarker, makeMailbox,
  makeHydrant, makeCone, makeTrashPile, makeSign, makeRamp, makeSeagull, makeLampPost, makeBench,
  makeFlowerBed, makePicnicTable, makeDumpster, makeBooth, makeStatue, makeTrashBag, makeTire,
  makeFlamingo, makeGnome, makePicketFence, makeBar, makeSchool, makeFlagpole, makeSchoolBus, makePlayground,
  makeFirehouse, makeFireEngine, makeShed, makeScarecrow, makeCabbage, makePumpkin, makeSunflower, makeCarrots,
} from './models.js';
import { PropBatch } from './props.js';

export const N = 5; // blocks per side
export const BLOCK = 40;
export const ROAD = 14;
export const PITCH = BLOCK + ROAD;
export const HALF = (N * PITCH) / 2;

// Surface heights, so everything sits on the same ground
export const ROAD_Y = 0.1;
export const WALK_Y = 0.2;
export const LAWN_Y = 0.24;
const LAWN_HALF = (BLOCK - 3) / 2;

/** Mulberry32 seeded RNG so the town is the same every time. */
export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const roadCenter = (i) => -HALF + i * PITCH;
export const blockCenter = (i) => -HALF + i * PITCH + PITCH / 2;

/** Height of the road / sidewalk / lawn at a point (ignores ramps). */
export function surfaceHeight(x, z) {
  const i = Math.floor((x + HALF) / PITCH);
  const j = Math.floor((z + HALF) / PITCH);
  if (i < 0 || j < 0 || i >= N || j >= N) return ROAD_Y;
  const lx = Math.abs(x - blockCenter(i));
  const lz = Math.abs(z - blockCenter(j));
  if (lx > BLOCK / 2 || lz > BLOCK / 2) return ROAD_Y;
  if (lx < LAWN_HALF && lz < LAWN_HALF) return LAWN_Y;
  return WALK_Y;
}

export function buildWorld(scene) {
  const rand = rng(1337);
  const S = new THREE.Group(); // static stuff, batched at the end
  const world = {
    boxes: [], // static AABB colliders {minX,maxX,minZ,maxZ}
    circles: [], // static circle colliders {x,z,r}
    houses: [],
    props: [], // knockable props
    ramps: [], // {x,z,dirX,dirZ,w,len,h}
    blocks: [],
    dump: null,
    seagulls: [],
    ducks: [],
    fountains: [],
    bushes: [], // {x,z} drive-through bushes (leaf bursts)
    balls: [], // beach ball spawn spots
    pigeonSpots: [],
    bins: [], // dumpsters the front loader can lift
    critterSpots: [], // special spawn points for citizens (the firehouse dog)
    flags: [],
  };
  world.batches = {
    lamp: new PropBatch(scene, makeLampPost(), 140),
    fence: new PropBatch(scene, makePicketFence(), 900),
    flamingo: new PropBatch(scene, makeFlamingo(), 120),
    gnome: new PropBatch(scene, makeGnome(), 120),
    cabbage: new PropBatch(scene, makeCabbage(), 40),
    pumpkin: new PropBatch(scene, makePumpkin(), 40),
    carrots: new PropBatch(scene, makeCarrots(), 40),
    sunflower: new PropBatch(scene, makeSunflower(), 40),
    ...treeBatches(scene),
  };

  // Grass all around, one asphalt slab for every road (no z-fighting)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), toon(0x8fd16a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const asphaltSize = HALF * 2 + ROAD;
  const asphalt = box(asphaltSize, ROAD_Y, asphaltSize, 0x5f6470, 0, ROAD_Y / 2, 0);
  asphalt.castShadow = false;
  S.add(asphalt);
  // Curb strip around the outside of town
  for (const [w, d, x, z] of [
    [asphaltSize + 1, 0.5, 0, asphaltSize / 2], [asphaltSize + 1, 0.5, 0, -asphaltSize / 2],
    [0.5, asphaltSize + 1, asphaltSize / 2, 0], [0.5, asphaltSize + 1, -asphaltSize / 2, 0],
  ]) S.add(box(w, WALK_Y, d, 0xd9d4c7, x, WALK_Y / 2, z));

  // Road markings (instanced): lane dashes + crosswalks
  const marks = [];
  const markPlace = (x, z, sx, sz) => marks.push([x, z, sx, sz]);
  for (let i = 0; i <= N; i++) {
    const c = roadCenter(i);
    for (let j = 0; j < N; j++) {
      const from = roadCenter(j) + ROAD / 2 + 4.2;
      const to = roadCenter(j + 1) - ROAD / 2 - 3.5;
      for (let t = from; t < to; t += 4.5) {
        markPlace(c, t + 1.1, 0.35, 2.2);
        markPlace(t + 1.1, c, 2.2, 0.35);
      }
    }
  }
  const dashMesh = instancedMarks(marks, 0xfff3b0);
  scene.add(dashMesh);
  const walks = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x0 = roadCenter(i);
      const z0 = roadCenter(j);
      const dirs = [[1, 0, i < N], [-1, 0, i > 0], [0, 1, j < N], [0, -1, j > 0]];
      for (const [dx, dz, ok] of dirs) {
        if (!ok) continue;
        const cx = x0 + dx * (ROAD / 2 + 1.6);
        const cz = z0 + dz * (ROAD / 2 + 1.6);
        for (let k = -5; k <= 5; k += 2) {
          if (dx) walks.push([cx, z0 + k, 2.4, 1.0]);
          else walks.push([x0 + k, cz, 1.0, 2.4]);
        }
      }
    }
  }
  scene.add(instancedMarks(walks, 0xf4f4ef));

  // Block types
  const types = [];
  for (let i = 0; i < N * N; i++) types.push('houses');
  const idx = (bx, bz) => bz * N + bx;
  types[idx(4, 0)] = 'dump';
  types[idx(1, 1)] = 'park';
  types[idx(3, 3)] = 'park';
  types[idx(0, 4)] = 'park';
  types[idx(2, 2)] = 'plaza';
  types[idx(2, 0)] = 'bar';
  types[idx(0, 2)] = 'school';
  types[idx(4, 3)] = 'firehouse';
  types[idx(2, 4)] = 'garden';

  const streetNames = ['Maple', 'Acorn', 'Biscuit', 'Wobble', 'Pickle', 'Noodle', 'Puddle', 'Crumb', 'Clover', 'Muffin'];
  const familyNames = [
    'Pemberton', 'Higgins', 'Okafor', 'Nguyen', 'Butterworth', 'Garcia', 'Featherbottom', 'Kowalski',
    'Snodgrass', 'Patel', 'McFluff', 'Larsen', 'Applebaum', 'Tanaka', 'Wigglesworth', 'Moreau',
  ];

  for (let bz = 0; bz < N; bz++) {
    for (let bx = 0; bx < N; bx++) {
      const cx = blockCenter(bx);
      const cz = blockCenter(bz);
      const type = types[idx(bx, bz)];
      world.blocks.push({ cx, cz, type });

      // Sidewalk slab + lawn
      const slab = box(BLOCK, WALK_Y, BLOCK, 0xd9d4c7, cx, WALK_Y / 2, cz);
      slab.castShadow = false;
      S.add(slab);
      const lawnCol = type === 'plaza' ? 0xe8dcc0 : type === 'dump' ? 0xb39a72 : type === 'garden' ? 0x7cc35a : 0x8fd16a;
      const lawn = box(BLOCK - 3, LAWN_Y, BLOCK - 3, lawnCol, cx, LAWN_Y / 2, cz);
      lawn.castShadow = false;
      S.add(lawn);

      // Street lamps on every corner
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        addBatchProp(world, 'lamp', cx + sx * (BLOCK / 2 - 0.8), cz + sz * (BLOCK / 2 - 0.8), 0.35, 'lamp');
      }

      if (type === 'houses') buildHouseBlock(S, scene, world, rand, cx, cz, bx, bz, streetNames, familyNames);
      else if (type === 'park') buildPark(S, scene, world, rand, cx, cz);
      else if (type === 'dump') buildDump(S, scene, world, rand, cx, cz);
      else if (type === 'plaza') buildPlaza(S, scene, world, rand, cx, cz);
      else if (type === 'bar') buildBar(S, scene, world, rand, cx, cz);
      else if (type === 'school') buildSchool(S, scene, world, rand, cx, cz);
      else if (type === 'firehouse') buildFirehouse(S, scene, world, rand, cx, cz);
      else if (type === 'garden') buildGarden(S, scene, world, rand, cx, cz);
    }
  }

  // Ring of trees around the edge of town + invisible walls
  const edge = HALF + 12;
  for (let t = -edge; t <= edge; t += 6) {
    for (const [x, z] of [[t, -edge], [t, edge], [-edge, t], [edge, t]]) {
      for (let k = 0; k < 2; k++) {
        const tree = makeTree(rand, 1.3 + rand() * 0.6);
        const out = k * (6 + rand() * 4);
        const nx = Math.abs(x) >= edge ? Math.sign(x) * out : 0;
        const nz = Math.abs(z) >= edge ? Math.sign(z) * out : 0;
        tree.position.set(x + nx + (rand() - 0.5) * 3, 0, z + nz + (rand() - 0.5) * 3);
        S.add(tree);
      }
    }
  }
  const W = HALF + 5;
  world.boxes.push({ minX: -W - 10, maxX: -W, minZ: -W - 10, maxZ: W + 10 });
  world.boxes.push({ minX: W, maxX: W + 10, minZ: -W - 10, maxZ: W + 10 });
  world.boxes.push({ minX: -W - 10, maxX: W + 10, minZ: -W - 10, maxZ: -W });
  world.boxes.push({ minX: -W - 10, maxX: W + 10, minZ: W, maxZ: W + 10 });

  // Traffic cones in little groups around the roads ("road work")
  for (let k = 0; k < 9; k++) {
    const i = (rand() * (N + 1)) | 0;
    const j = (rand() * N) | 0;
    const along = roadCenter(j) + ROAD / 2 + 8 + rand() * (BLOCK - 16);
    const side = rand() < 0.5 ? -1 : 1;
    const vertical = rand() < 0.5;
    for (let c = 0; c < 3; c++) {
      const a = along + c * 2.2;
      const across = roadCenter(i) + side * (3.8 - c * 0.6);
      const [x, z] = vertical ? [across, a] : [a, across];
      addProp(scene, world, makeCone(), x, z, 0.45, 'cone', rand() * 6);
    }
  }

  bakeStatic(S, scene);
  return world;
}

function instancedMarks(list, color) {
  const geo = new THREE.BoxGeometry(1, 0.02, 1);
  const mesh = new THREE.InstancedMesh(geo, toon(color), list.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  list.forEach(([x, z, sx, sz], k) => {
    m4.compose(new THREE.Vector3(x, ROAD_Y + 0.01, z), q, new THREE.Vector3(sx, 1, sz));
    mesh.setMatrixAt(k, m4);
  });
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Merges all static meshes that share a material into one mesh each. The town
 * has thousands of little parts; this turns them into a few dozen draw calls.
 */
function bakeStatic(root, scene) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (o.isInstancedMesh || Array.isArray(m) || m.map || m.transparent) {
      keep.push(o);
      return;
    }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.clearGroups();
    g.applyMatrix4(o.matrixWorld);
    const key = `${m.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mat: m, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    buckets.get(key).geos.push(g);
  });
  for (const o of keep) scene.attach(o);
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
}

function newProp(world, kind, x, z, r, rotY, y) {
  const p = {
    kind, x, z, r, knocked: false, state: 'idle', timer: 0,
    home: new THREE.Vector3(x, y, z),
    homeQuat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    pos: new THREE.Vector3(x, y, z),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(), spin: new THREE.Vector3(),
  };
  p.quat.copy(p.homeQuat);
  world.props.push(p);
  return p;
}

/** A knockable prop backed by its own mesh. */
function addProp(scene, world, mesh, x, z, r, kind, rotY = 0) {
  const y = surfaceHeight(x, z);
  mesh.position.set(x, y, z);
  mesh.rotation.set(0, rotY, 0);
  scene.add(mesh);
  const p = newProp(world, kind, x, z, r, rotY, y);
  p.mesh = mesh;
  return p;
}

const _m4 = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
/** A knockable prop drawn as one instance of a shared batch. */
function addBatchProp(world, batchName, x, z, r, kind, rotY = 0) {
  const y = surfaceHeight(x, z);
  const p = newProp(world, kind, x, z, r, rotY, y);
  p.batch = world.batches[batchName];
  p.index = p.batch.add();
  p.batch.set(p.index, _m4.compose(p.pos, p.quat, _one));
  return p;
}

const treeCircle = (world, x, z, r) => world.circles.push({ x, z, r, tree: true });

/** A few tree templates (three leafy, one pine) drawn as instanced batches. */
function treeBatches(scene) {
  const out = {};
  let leafy = 0;
  let pine = false;
  for (let seed = 1; seed < 80 && (leafy < 3 || !pine); seed++) {
    const t = makeTree(rng(seed * 7919));
    const isPine = t.children.some((m) => m.geometry && m.geometry.type === 'ConeGeometry');
    if (isPine && !pine) {
      pine = true;
      out.tree3 = new PropBatch(scene, t, 150);
    } else if (!isPine && leafy < 3) {
      out[`tree${leafy++}`] = new PropBatch(scene, t, 150);
    }
  }
  return out;
}

/** A tree that blocks the truck but falls over if hit hard (or often) enough. */
function addTree(world, rand, x, z, scale, r) {
  const variant = rand() < 0.22 ? 3 : (rand() * 3) | 0;
  const p = addBatchProp(world, `tree${variant}`, x, z, r, 'tree', rand() * 6);
  p.scale = scale;
  p.batch.set(p.index, _m4.compose(p.pos, p.quat, new THREE.Vector3(scale, scale, scale)));
  const circle = { x, z, r, tree: true, prop: p, dmg: 0 };
  p.circle = circle;
  world.circles.push(circle);
}

function buildHouseBlock(S, scene, world, rand, cx, cz, bx, bz, streetNames, familyNames) {
  // One house per side, facing the road.
  const sides = [
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
  ];
  for (const s of sides) {
    const { group, w, d, roofCol } = makeHouse(rand);
    const dist = 11.5;
    const hx = cx + s.dx * dist;
    const hz = cz + s.dz * dist;
    const facing = Math.atan2(s.dx, s.dz);
    group.position.set(hx, LAWN_Y, hz);
    group.rotation.y = facing;
    S.add(group);
    // collider: house footprint in world axes
    const hw = (s.dx === 0 ? w : d) / 2 + 0.2;
    const hd = (s.dx === 0 ? d : w) / 2 + 0.2;
    world.boxes.push({ minX: hx - hw, maxX: hx + hw, minZ: hz - hd, maxZ: hz + hd });

    // Local frame helpers: f = toward the road, p = sideways
    const px = -s.dz;
    const pz = s.dx;
    const at = (fwd, side) => [cx + s.dx * fwd + px * side, cz + s.dz * fwd + pz * side];

    // Driveway beside the house + front path to the door
    const front = dist + d / 2;
    const dwSide = w / 2 + 1.8;
    const dwFrom = dist - d / 2 + 0.5;
    const dwLen = BLOCK / 2 - 1.5 - dwFrom;
    const [dwx, dwz] = at(dwFrom + dwLen / 2, dwSide);
    const dw = box(s.dx === 0 ? 3 : dwLen, 0.04, s.dx === 0 ? dwLen : 3, 0xc7c2b4, dwx, LAWN_Y + 0.02, dwz);
    dw.castShadow = false;
    S.add(dw);
    const pathLen = BLOCK / 2 - 1.5 - front - 1.1;
    const [ptx, ptz] = at(front + 1.1 + pathLen / 2, 0);
    const path = box(s.dx === 0 ? 1.3 : pathLen, 0.04, s.dx === 0 ? pathLen : 1.3, 0xd9d4c7, ptx, LAWN_Y + 0.02, ptz);
    path.castShadow = false;
    S.add(path);

    // Bushes under the front windows
    for (const off of [-w / 3.3, w / 3.3]) {
      if (rand() < 0.85) {
        const b = makeBush(rand);
        const [bx2, bz2] = at(front + 0.9, off);
        b.position.set(bx2, LAWN_Y, bz2);
        b.rotation.y = facing;
        S.add(b);
        world.bushes.push({ x: bx2, z: bz2 });
      }
    }

    // Can spot at the curb, mailbox by the front path
    const curb = BLOCK / 2 - 1.2;
    const [canX, canZ] = at(curb, -2.6);
    const can = makeTrashCan(false);
    can.group.position.set(canX, WALK_Y, canZ);
    can.group.visible = false;
    scene.add(can.group);
    const goldCan = makeTrashCan(true);
    goldCan.group.position.copy(can.group.position);
    goldCan.group.visible = false;
    scene.add(goldCan.group);
    const marker = makeMarker(false);
    marker.group.position.set(canX, WALK_Y, canZ);
    marker.group.visible = false;
    scene.add(marker.group);
    const goldMarker = makeMarker(true);
    goldMarker.group.position.copy(marker.group.position);
    goldMarker.group.visible = false;
    scene.add(goldMarker.group);

    const street = streetNames[(Math.abs(s.dx ? bx * 2 + (s.dx > 0 ? 1 : 0) : bz * 2 + (s.dz > 0 ? 1 : 0)) + (s.dx ? 0 : 3)) % streetNames.length];
    world.houses.push({
      x: hx, z: hz,
      canX, canZ,
      facing,
      roofCol,
      can, goldCan, marker, goldMarker,
      name: `the ${familyNames[(rand() * familyNames.length) | 0]}s`,
      street: `${street} St`,
      state: 'idle', // idle | out | grabbing | done
      golden: false,
      cooldown: 0,
    });

    const mb = makeMailbox(rand);
    const [mbx, mbz] = at(curb, 1.3);
    addProp(scene, world, mb, mbx, mbz, 0.4, 'mailbox', facing);

    // White picket fence along the front of some yards, with gaps for the
    // path and driveway
    if (rand() < 0.6) {
      const fenceLine = BLOCK / 2 - 1.8;
      for (let side = -14.4; side <= 14.4; side += 2.4) {
        if (Math.abs(side) < 1.6) continue; // front path
        if (side > dwSide - 2.0 && side < dwSide + 2.0) continue; // driveway
        const [fx, fz] = at(fenceLine, side);
        addBatchProp(world, 'fence', fx, fz, 0.9, 'fence', facing);
      }
    }
    // Lawn ornaments: a pink flamingo or a garden gnome (or both)
    if (rand() < 0.55) {
      const [ox, oz] = at(front + 3.2, -w / 3.3 - 0.4);
      addBatchProp(world, 'flamingo', ox, oz, 0.45, 'flamingo', facing + rand() * 2 - 1);
    }
    if (rand() < 0.45) {
      const [ox, oz] = at(front + 2.2, 1.6);
      addBatchProp(world, 'gnome', ox, oz, 0.4, 'gnome', facing + rand() - 0.5);
    }
  }
  // Backyard: a big shade tree and a few smaller ones in the gaps
  addTree(world, rand, cx, cz, 1.2, 1);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (rand() < 0.35) continue;
    addTree(world, rand, cx + sx * 15.5, cz + sz * 15.5, 0.9 + rand() * 0.3, 0.8);
  }
  // Fire hydrant partway down one side
  if (rand() < 0.7) {
    const side = rand() < 0.5 ? -1 : 1;
    const along = (rand() < 0.5 ? -1 : 1) * 12.5;
    const edge = BLOCK / 2 - 0.9;
    const [x, z] = rand() < 0.5 ? [cx + side * edge, cz + along] : [cx + along, cz + side * edge];
    addProp(scene, world, makeHydrant(), x, z, 0.4, 'hydrant');
  }
}

function buildPark(S, scene, world, rand, cx, cz) {
  // Ramp runs through the middle along an axis; a dirt runway crosses the park
  const dir = rand() < 0.5 ? 1 : -1;
  const alongX = rand() < 0.5;
  const dX = alongX ? dir : 0;
  const dZ = alongX ? 0 : dir;
  const lX = -dZ; // lateral
  const lZ = dX;
  const at = (u, v) => [cx + dX * u + lX * v, cz + dZ * u + lZ * v];
  const runway = box(alongX ? BLOCK - 3 : 7, 0.03, alongX ? 7 : BLOCK - 3, 0xcfae7a, cx, LAWN_Y + 0.015, cz);
  runway.castShadow = false;
  S.add(runway);

  const w = 6;
  const len = 11;
  const h = 2.6;
  const ramp = makeRamp(w, len, h);
  const [sx, sz] = at(-len / 2 - 2, 0);
  ramp.position.set(sx, LAWN_Y, sz);
  ramp.rotation.y = Math.atan2(dX, dZ);
  S.add(ramp);
  world.ramps.push({ x: sx, z: sz, dirX: dX, dirZ: dZ, w, len, h });

  // Sign beside the approach, facing oncoming drivers
  const sign = makeSign(['SICK JUMP', 'ZONE'], '#e17055', 4.6, 1.8);
  const [gx, gz] = at(-len / 2 - 6, 6.2);
  addProp(scene, world, sign, gx, gz, 1.2, 'sign', Math.atan2(-dX, -dZ));

  // Trees around the edge, keeping the runway clear
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.2;
    const u = Math.cos(a) * 15.5;
    const v = Math.sin(a) * 15.5;
    if (Math.abs(v) < 6) continue;
    const [x, z] = at(u, v);
    addTree(world, rand, x, z, 1 + rand() * 0.4, 0.9);
  }

  // Pond with stones, a duck, and benches facing it
  const [ox, oz] = at(6, -9.5);
  const rim = cyl(4.4, 4.4, 0.12, 0xb9b2a4, ox, LAWN_Y + 0.03, oz, 22);
  rim.castShadow = false;
  S.add(rim);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 22), toon(0x6ec6ff, { emissive: 0x2a7fb8, emissiveIntensity: 0.25 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(ox, LAWN_Y + 0.1, oz);
  pond.receiveShadow = true;
  S.add(pond);
  for (let k = 0; k < 7; k++) {
    const a = rand() * Math.PI * 2;
    S.add(sphere(0.35 + rand() * 0.2, 0x9aa0a8, ox + Math.cos(a) * 4.4, LAWN_Y + 0.05, oz + Math.sin(a) * 4.4, 6));
  }
  world.circles.push({ x: ox, z: oz, r: 4.2 });
  const duck = new THREE.Group();
  duck.add(box(0.6, 0.4, 0.8, 0xffd23f, 0, 0.2, 0));
  duck.add(box(0.4, 0.4, 0.4, 0xffd23f, 0, 0.55, 0.3));
  duck.add(box(0.2, 0.1, 0.25, 0xff8c42, 0, 0.5, 0.6));
  duck.add(box(0.06, 0.08, 0.06, 0x111111, 0.2, 0.62, 0.42));
  duck.add(box(0.06, 0.08, 0.06, 0x111111, -0.2, 0.62, 0.42));
  duck.position.set(ox, LAWN_Y + 0.1, oz);
  duck.userData.duck = { cx: ox, cz: oz };
  scene.add(duck);
  world.ducks.push(duck);
  const [bx, bz] = at(6, -4.6);
  addProp(scene, world, makeBench(), bx, bz, 1.0, 'bench', Math.atan2(lX, lZ) + Math.PI);

  // Picnic table and flowers in the other quadrants
  const [tx, tz] = at(-7, 10);
  addProp(scene, world, makePicnicTable(), tx, tz, 1.2, 'table', rand() * 3);
  world.balls.push([cx + dX * 2 + lX * 8, cz + dZ * 2 + lZ * 8], [cx - dX * 9 + lX * 3, cz - dZ * 9 + lZ * 3]);
  for (const [u, v] of [[8, 10], [-9, -10]]) {
    const [fx, fz] = at(u, v);
    const bed = makeFlowerBed(rand, 2);
    bed.position.set(fx, LAWN_Y, fz);
    S.add(bed);
    world.circles.push({ x: fx, z: fz, r: 2 });
  }
}

function pavingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc6b4';
  g.fillRect(0, 0, 128, 128);
  const cols = ['#ece3cf', '#e6dcc6', '#f1e9d8'];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = cols[(x * 7 + y * 3) % 3];
      g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.anisotropy = 8;
  return tex;
}

function buildPlaza(S, scene, world, rand, cx, cz) {
  const paving = new THREE.Mesh(
    new THREE.PlaneGeometry(BLOCK - 3, BLOCK - 3),
    new THREE.MeshToonMaterial({ map: pavingTexture(), gradientMap: toon(0xffffff).gradientMap }),
  );
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(cx, LAWN_Y + 0.01, cz);
  paving.receiveShadow = true;
  S.add(paving);

  // Fountain with a stone statue of a heroic raccoon
  S.add(cyl(5, 5.2, 0.8, 0xd9d4c7, cx, LAWN_Y + 0.4, cz, 28));
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28), toon(0x6ec6ff, { emissive: 0x2a7fb8, emissiveIntensity: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, LAWN_Y + 0.75, cz);
  water.receiveShadow = true;
  S.add(water);
  S.add(cyl(1.3, 1.6, 2.2, 0xd9d4c7, cx, LAWN_Y + 1.5, cz, 16));
  S.add(cyl(1.6, 1.6, 0.25, 0xc9c2b4, cx, LAWN_Y + 2.7, cz, 16));
  const statue = makeStatue();
  statue.position.set(cx, LAWN_Y + 2.8, cz);
  statue.rotation.y = Math.PI / 4;
  scene.add(statue);
  world.circles.push({ x: cx, z: cz, r: 5.2 });
  world.fountains.push({ x: cx, z: cz, y: LAWN_Y + 2.6 });

  const sign = makeSign(['OUR HERO', '(unknown raccoon)'], '#6c5ce7', 5, 1.7);
  addProp(scene, world, sign, cx + 10.6, cz + 10.6, 1.2, 'sign', Math.PI / 4);
  world.balls.push([cx - 10, cz + 4], [cx + 4, cz - 11]);
  addBin(S, scene, world, cx, cz - 13.5, Math.PI, 0x2d936c);
  world.pigeonSpots.push({ x: cx, z: cz, r: 11 });

  // Benches facing the fountain, flower beds and trees in the corners
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    addProp(scene, world, makeBench(), cx + dx * 8.5, cz + dz * 8.5, 1.0, 'bench', Math.atan2(-dx, -dz));
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const bed = makeFlowerBed(rand, 2.6);
    bed.position.set(cx + sx * 13, LAWN_Y, cz + sz * 13);
    S.add(bed);
    const tr = makeTree(rand, 1.1);
    tr.position.set(cx + sx * 13, LAWN_Y + 0.35, cz + sz * 13);
    S.add(tr);
    treeCircle(world, cx + sx * 13, cz + sz * 13, 2.6);
    addBatchProp(world, 'lamp', cx + sx * 6.5, cz + sz * 6.5, 0.35, 'lamp');
  }
}

function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(0, 0, 250, 0, Math.PI * 2);
  g.fill();
  // hazard ring
  g.lineWidth = 34;
  for (let k = 0; k < 24; k++) {
    g.strokeStyle = k % 2 ? '#ffd23f' : '#2b2d33';
    g.beginPath();
    g.arc(0, 0, 222, (k / 24) * Math.PI * 2, ((k + 1) / 24) * Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#2b2d33';
  g.font = 'bold 84px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('UNLOAD', 0, -30);
  g.font = 'bold 46px "Trebuchet MS", sans-serif';
  g.fillText('▼ HERE ▼', 0, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildDump(S, scene, world, rand, cx, cz) {
  const pile = makeTrashPile(rand, 7);
  const px = cx + 6;
  const pz = cz - 6;
  pile.position.set(px, LAWN_Y, pz);
  S.add(pile);
  world.circles.push({ x: px, z: pz, r: 7 });

  // Dirt and oil stains
  for (let k = 0; k < 7; k++) {
    const st = new THREE.Mesh(new THREE.CircleGeometry(1 + rand() * 1.8, 10), toon(rand() < 0.5 ? 0x9c8460 : 0x8a7454));
    st.rotation.x = -Math.PI / 2;
    st.position.set(cx + (rand() - 0.5) * 30, LAWN_Y + 0.01, cz + (rand() - 0.5) * 30);
    st.receiveShadow = true;
    S.add(st);
  }

  // Chain-link fence all the way round, with wide gates on the town side
  const F = 18.6;
  const fenceMat = toon(0xc9ccd3, { transparent: true, opacity: 0.45 });
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      S.add(cyl(0.08, 0.08, 2.1, 0x9aa0a8, x0 + (x1 - x0) * t, LAWN_Y + 1.05, z0 + (z1 - z0) * t, 6));
    }
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    S.add(box(horiz ? len : 0.06, 1.7, horiz ? 0.06 : len, 0, mx, LAWN_Y + 1.1, mz, fenceMat));
    S.add(box(horiz ? len : 0.08, 0.08, horiz ? 0.08 : len, 0x9aa0a8, mx, LAWN_Y + 2.0, mz));
    world.boxes.push({
      minX: Math.min(x0, x1) - 0.3, maxX: Math.max(x0, x1) + 0.3, minZ: Math.min(z0, z1) - 0.3, maxZ: Math.max(z0, z1) + 0.3,
    });
  };
  fence(cx + F, cz - F, cx + F, cz + F); // east
  fence(cx - F, cz - F, cx + F, cz - F); // north
  fence(cx - F, cz - F, cx - F, cz - 2); // west (open toward the south-west corner)
  fence(cx + 2, cz + F, cx + F, cz + F); // south

  // Dumpsters along the back fence, a little office by the gate
  for (const [x, col] of [[-11, 0x3d7ea6], [-6.5, 0x2d936c]]) {
    const d = makeDumpster(col);
    d.position.set(cx + x, LAWN_Y, cz - F + 1.6);
    S.add(d);
    world.boxes.push({ minX: cx + x - 1.7, maxX: cx + x + 1.7, minZ: cz - F, maxZ: cz - F + 2.6 });
  }
  const booth = makeBooth();
  booth.position.set(cx + 14.5, LAWN_Y, cz + 13.5);
  booth.rotation.y = Math.PI;
  S.add(booth);
  world.boxes.push({ minX: cx + 12.8, maxX: cx + 16.2, minZ: cz + 12, maxZ: cz + 15 });
  for (let k = 0; k < 5; k++) {
    addProp(scene, world, makeTrashBag(rand), cx + 16.5 - k * 1.3, cz + 4 + rand(), 0.6, 'bag', rand() * 6);
  }
  for (let k = 0; k < 3; k++) {
    const tire = new THREE.Group();
    const t = makeTire();
    t.rotation.x = Math.PI / 2;
    t.position.y = 0.25 + k * 0.5;
    tire.add(t);
    addProp(scene, world, tire, cx + 16 - (k % 2) * 0.2, cz - 1.5 - k * 1.6, 0.8, 'tire');
  }

  // Unload pad
  const padX = cx - 7.5;
  const padZ = cz + 7.5;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshBasicMaterial({ map: padTexture(), transparent: true }));
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = Math.PI / 4;
  pad.position.set(padX, LAWN_Y + 0.02, padZ);
  scene.add(pad);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(6.1, 6.5, 40), new THREE.MeshBasicMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }));
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(padX, LAWN_Y + 0.03, padZ);
  scene.add(padRing);
  world.dump = { x: padX, z: padZ, r: 6, pad, padRing, pileX: px, pileZ: pz, pileR: 7, pileH: 4.2, pileY: LAWN_Y };

  const sign = makeSign(['THE DUMP', 'unload here ♥'], '#8e5b3d', 6, 2.2);
  addProp(scene, world, sign, cx - F - 0.9, cz - 7, 1.2, 'sign', -Math.PI / 2);

  for (let k = 0; k < 5; k++) {
    const g = makeSeagull();
    g.group.userData = { cx: px, cz: pz, r: 5 + rand() * 6, h: 8 + rand() * 5, speed: 0.6 + rand() * 0.6, phase: rand() * 7 };
    scene.add(g.group);
    world.seagulls.push(g);
  }
}

// ---------------------------------------------------------------------------
// Special blocks
// ---------------------------------------------------------------------------

const blockAt = (v) => blockCenter(Math.max(0, Math.min(N - 1, Math.floor((v + HALF) / PITCH))));

/** Static AABB collider for a footprint centered at (x, z). */
function solid(world, x, z, w, d) {
  const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
  world.boxes.push(b);
  return b;
}

function paving(S, x, z, w, d, color = 0xc7c2b4) {
  const m = box(w, 0.04, d, color, x, LAWN_Y + 0.02, z);
  m.castShadow = false;
  S.add(m);
}

/** A big dumpster at the curb, facing the road, for the front loader. */
function addBin(S, scene, world, x, z, facing, color) {
  // Paved approach from the curb so the truck can drive straight in
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const sx = Math.abs(fx) > 0.5;
  const edge = sx ? (fx > 0 ? 1 : -1) : fz > 0 ? 1 : -1;
  const curbDist = Math.abs(sx ? x - blockAt(x) : z - blockAt(z)) ;
  const len = BLOCK / 2 - curbDist + 1;
  const mid = len / 2 - 1;
  const pad = box(sx ? len : 5.5, 0.04, sx ? 5.5 : len, 0xb9b2a4, x + (sx ? edge * mid : 0), LAWN_Y + 0.025, z + (sx ? 0 : edge * mid));
  pad.castShadow = false;
  S.add(pad);
  for (const k of [-1, 1]) {
    const line = box(sx ? len : 0.18, 0.05, sx ? 0.18 : len, 0xffd23f, x + (sx ? edge * mid : k * 2.6), LAWN_Y + 0.03, z + (sx ? k * 2.6 : edge * mid));
    line.castShadow = false;
    S.add(line);
  }
  const g = makeDumpster(color);
  g.position.set(x, WALK_Y, z);
  g.rotation.y = facing;
  scene.add(g);
  const alongX = Math.abs(Math.sin(facing)) < 0.5; // long side runs along x
  const collider = solid(world, x, z, alongX ? 3.6 : 2.2, alongX ? 2.2 : 3.6);
  const marker = makeMarker(true);
  marker.group.position.set(x, WALK_Y, z);
  marker.group.scale.setScalar(1.7);
  marker.group.visible = false;
  scene.add(marker.group);
  world.bins.push({ x, z, facing, group: g, collider, marker, state: 'idle', cooldown: 0, home: g.position.clone() });
}

function cornerTrees(S, world, rand, cx, cz, skip = []) {
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (skip.some(([a, b]) => a === sx && b === sz)) continue;
    addTree(world, rand, cx + sx * 15.5, cz + sz * 15.5, 1 + rand() * 0.3, 0.9);
  }
}

function buildBar(S, scene, world, rand, cx, cz) {
  const bar = makeBar();
  bar.position.set(cx, LAWN_Y, cz + 1);
  S.add(bar);
  solid(world, cx, cz + 1, 16.4, 10.4);
  paving(S, cx, cz + 11, 17, 8, 0xb89a74); // wooden patio deck
  paving(S, cx, cz + 16.5, 3, 4); // path to the sidewalk
  for (const x of [-5, 0, 5]) addProp(scene, world, makePicnicTable(), cx + x, cz + 11, 1.2, 'table', rand() * 0.4 - 0.2);
  for (const s of [-7.5, 7.5]) world.circles.push({ x: cx + s, z: cz + 8.5, r: 0.2 });
  // parking lot out back, with the dumpster
  paving(S, cx, cz - 12, 30, 11, 0x6a6f7b);
  for (let x = -12; x <= 12; x += 4) paving(S, cx + x, cz - 12, 0.15, 5, 0xfffbe8);
  addBin(S, scene, world, cx + 6, cz - 6.6, Math.PI, 0x3d7ea6);
  cornerTrees(S, world, rand, cx, cz, [[1, -1], [-1, -1]]);
  for (let k = 0; k < 2; k++) addBatchProp(world, 'gnome', cx + 9 + k, cz + 7.5, 0.4, 'gnome', rand() * 6);
}

function buildSchool(S, scene, world, rand, cx, cz) {
  const school = makeSchool();
  school.position.set(cx, LAWN_Y, cz - 7);
  S.add(school);
  solid(world, cx, cz - 7, 22.4, 9.4);
  solid(world, cx, cz - 1.8, 5.2, 1.6);
  paving(S, cx, cz + 6, 6, 21); // front walk
  const flag = makeFlagpole();
  flag.position.set(cx + 7, LAWN_Y, cz + 2);
  scene.add(flag);
  world.flags.push(flag.userData.flag);
  world.circles.push({ x: cx + 7, z: cz + 2, r: 0.25 });
  const pg = makePlayground();
  pg.position.set(cx - 9, LAWN_Y, cz + 8);
  S.add(pg);
  world.circles.push({ x: cx - 9, z: cz + 8.5, r: 1.6 }, { x: cx - 4.5, z: cz + 8, r: 1.8 });
  // the bus waits by the curb
  paving(S, cx + 11, cz + 9, 4, 12, 0x6a6f7b);
  const bus = makeSchoolBus();
  bus.position.set(cx + 11, LAWN_Y, cz + 9);
  S.add(bus);
  solid(world, cx + 11, cz + 9, 2.8, 10.6);
  addBin(S, scene, world, cx + 13.5, cz - 8, Math.PI / 2, 0x2d936c);
  cornerTrees(S, world, rand, cx, cz, [[1, 1], [1, -1]]);
  // hopscotch
  for (let i = 0; i < 6; i++) paving(S, cx - 2.5, cz + 2 + i * 1.1, 1, 1, i % 2 ? 0xfff3b0 : 0xffb3c1);
}

function buildFirehouse(S, scene, world, rand, cx, cz) {
  const fh = makeFirehouse();
  fh.position.set(cx - 3, LAWN_Y, cz - 3);
  S.add(fh);
  solid(world, cx - 3, cz - 3, 16.4, 11.4);
  solid(world, cx + 6.5, cz - 6.5, 3.4, 3.4);
  paving(S, cx - 3, cz + 10.5, 16, 15.5); // concrete apron to the street
  for (let x = -9; x <= 3; x += 6) paving(S, cx + x, cz + 10.5, 0.2, 15, 0xffd23f);
  const engine = makeFireEngine();
  engine.position.set(cx - 7, LAWN_Y, cz + 3.5);
  S.add(engine);
  solid(world, cx - 7, cz + 3.5, 2.8, 7.6);
  addProp(scene, world, makeHydrant(), cx + 7, cz + 4, 0.4, 'hydrant');
  addProp(scene, world, makeHydrant(), cx - 12.5, cz + 4, 0.4, 'hydrant');
  addBin(S, scene, world, cx + 12, cz + 9, Math.PI / 2, 0xc8402e);
  world.critterSpots.push({ species: 'dalmatian', x: cx + 3, z: cz + 6 });
  cornerTrees(S, world, rand, cx, cz, [[1, 1], [-1, 1]]);
}

function buildGarden(S, scene, world, rand, cx, cz) {
  // Picket fence all the way round, with gates in the middle of each side
  const E = BLOCK / 2 - 2.2;
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let t = -E + 1.2; t <= E - 1.2; t += 2.4) {
      if (Math.abs(t) < 3.6) continue;
      const x = cx + nx * E + (nz !== 0 ? t : 0);
      const z = cz + nz * E + (nx !== 0 ? t : 0);
      addBatchProp(world, 'fence', x, z, 0.9, 'fence', Math.atan2(nx, nz));
    }
  }
  // Raised beds of vegetables that are, frankly, in harm's way
  const kinds = ['cabbage', 'pumpkin', 'carrots', 'cabbage'];
  [-10.5, -3.5, 3.5, 10.5].forEach((z, row) => {
    for (const side of [-1, 1]) {
      const bx = cx + side * 8.5;
      const bed = box(12, 0.3, 3, 0x6b4a2f, bx, LAWN_Y + 0.15, cz + z);
      bed.castShadow = false;
      S.add(bed);
      for (let i = 0; i < 5; i++) {
        addBatchProp(world, kinds[row], bx - 4.8 + i * 2.4, cz + z, 0.5, 'veggie', rand() * 6);
      }
    }
  });
  // Sunflowers along the inside of the fence
  for (let t = -14; t <= 14; t += 3.5) {
    if (Math.abs(t) < 4) continue;
    addBatchProp(world, 'sunflower', cx + t, cz - E + 1.3, 0.4, 'sunflower', rand() * 0.6 - 0.3);
    addBatchProp(world, 'sunflower', cx + t, cz + E - 1.3, 0.4, 'sunflower', Math.PI + rand() * 0.6 - 0.3);
  }
  addProp(scene, world, makeScarecrow(), cx, cz + 0.5, 0.6, 'scarecrow', 0.3);
  const shed = makeShed();
  shed.position.set(cx + 13, LAWN_Y, cz - 13);
  shed.rotation.y = Math.PI / 4;
  S.add(shed);
  world.circles.push({ x: cx + 13, z: cz - 13, r: 2.4 });
  for (let k = 0; k < 3; k++) addBatchProp(world, 'gnome', cx - 14 + k * 1.2, cz - 14, 0.4, 'gnome', rand() * 6);
  world.critterSpots.push({ species: 'bunny', x: cx - 5, z: cz }, { species: 'bunny', x: cx + 5, z: cz + 7 });
}

/** Ground height (surface + ramps) at a point. */
export function groundHeight(world, x, z) {
  let h = surfaceHeight(x, z);
  for (const r of world.ramps) {
    const dx = x - r.x;
    const dz = z - r.z;
    const u = dx * r.dirX + dz * r.dirZ; // along
    const v = dx * -r.dirZ + dz * r.dirX; // across
    if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) h = Math.max(h, LAWN_Y + (u / r.len) * r.h);
  }
  return h;
}

/** True on the grass of a house block (slow going). */
export function isOnLawn(world, x, z) {
  for (const b of world.blocks) {
    if (b.type !== 'houses') continue;
    if (Math.abs(x - b.cx) < BLOCK / 2 - 2.5 && Math.abs(z - b.cz) < BLOCK / 2 - 2.5) return true;
  }
  return false;
}
