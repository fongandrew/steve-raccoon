// Builds the town: roads, blocks, houses, parks, the dump, and all colliders.
import * as THREE from 'three';
import {
  toon, box, cyl, makeHouse, makeTree, makeBush, makeTrashCan, makeMarker, makeMailbox,
  makeHydrant, makeCone, makeTrashPile, makeSign, makeRamp, makeSeagull,
} from './models.js';

export const N = 5; // blocks per side
export const BLOCK = 40;
export const ROAD = 14;
export const PITCH = BLOCK + ROAD;
export const HALF = (N * PITCH) / 2;

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

export function buildWorld(scene) {
  const rand = rng(1337);
  const world = {
    boxes: [], // static AABB colliders {minX,maxX,minZ,maxZ}
    circles: [], // static circle colliders {x,z,r}
    houses: [], // {canSpot:{x,z}, facing, can, marker, name}
    props: [], // knockable props
    ramps: [], // {x,z,dirX,dirZ,w,len,h}
    lawns: [], // slow zones {minX,maxX,minZ,maxZ}
    dump: null, // {x,z,r} unload pad
    seagulls: [],
    blocks: [],
  };

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 200, HALF * 2 + 200), toon(0x8fd16a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads
  const roadMat = toon(0x5a5f6b);
  const roadLen = HALF * 2 + ROAD;
  for (let i = 0; i <= N; i++) {
    const c = roadCenter(i);
    const a = new THREE.Mesh(new THREE.BoxGeometry(ROAD, 0.1, roadLen), roadMat);
    a.position.set(c, 0.05, 0);
    a.receiveShadow = true;
    scene.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(roadLen, 0.1, ROAD), roadMat);
    b.position.set(0, 0.051, c);
    b.receiveShadow = true;
    scene.add(b);
  }
  // Lane dashes (instanced)
  const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 2.2);
  const dashes = [];
  for (let i = 0; i <= N; i++) {
    const c = roadCenter(i);
    for (let j = 0; j < N; j++) {
      const from = roadCenter(j) + ROAD / 2 + 2;
      for (let t = from; t < roadCenter(j + 1) - ROAD / 2 - 1; t += 4.5) {
        dashes.push([c, t, 0]);
        dashes.push([t, c, Math.PI / 2]);
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, toon(0xfff3b0), dashes.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  dashes.forEach(([x, z, r], k) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
    m4.compose(new THREE.Vector3(x, 0.11, z), q, new THREE.Vector3(1, 1, 1));
    dashMesh.setMatrixAt(k, m4);
  });
  dashMesh.receiveShadow = true;
  scene.add(dashMesh);

  // Block types
  const types = [];
  for (let i = 0; i < N * N; i++) types.push('houses');
  const idx = (bx, bz) => bz * N + bx;
  types[idx(4, 0)] = 'dump';
  types[idx(1, 1)] = 'park';
  types[idx(3, 3)] = 'park';
  types[idx(0, 4)] = 'park';
  types[idx(2, 2)] = 'plaza';

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

      // Sidewalk slab + grass
      const slab = box(BLOCK, 0.2, BLOCK, 0xd9d4c7, cx, 0.1, cz);
      slab.castShadow = false;
      scene.add(slab);
      const lawnCol = type === 'plaza' ? 0xe8dcc0 : type === 'dump' ? 0xb9a27a : 0x8fd16a;
      const lawn = box(BLOCK - 3, 0.24, BLOCK - 3, lawnCol, cx, 0.12, cz);
      lawn.castShadow = false;
      scene.add(lawn);

      if (type === 'houses') buildHouseBlock(scene, world, rand, cx, cz, bx, bz, streetNames, familyNames);
      else if (type === 'park') buildPark(scene, world, rand, cx, cz);
      else if (type === 'dump') buildDump(scene, world, rand, cx, cz);
      else if (type === 'plaza') buildPlaza(scene, world, rand, cx, cz);
    }
  }

  // Ring of trees around the edge of town + invisible walls
  const edge = HALF + 8;
  for (let t = -edge; t <= edge; t += 7) {
    for (const [x, z] of [[t, -edge], [t, edge], [-edge, t], [edge, t]]) {
      const tree = makeTree(rand, 1.3 + rand() * 0.5);
      tree.position.set(x + (rand() - 0.5) * 3, 0, z + (rand() - 0.5) * 3);
      scene.add(tree);
    }
  }
  const W = HALF + 5;
  world.boxes.push({ minX: -W - 10, maxX: -W, minZ: -W - 10, maxZ: W + 10 });
  world.boxes.push({ minX: W, maxX: W + 10, minZ: -W - 10, maxZ: W + 10 });
  world.boxes.push({ minX: -W - 10, maxX: W + 10, minZ: -W - 10, maxZ: -W });
  world.boxes.push({ minX: -W - 10, maxX: W + 10, minZ: W, maxZ: W + 10 });

  // Traffic cones scattered around roads
  for (let k = 0; k < 26; k++) {
    const i = (rand() * (N + 1)) | 0;
    const j = (rand() * N) | 0;
    const along = roadCenter(j) + ROAD / 2 + 4 + rand() * (BLOCK - 8);
    const across = roadCenter(i) + (rand() < 0.5 ? -1 : 1) * (2 + rand() * 3);
    const [x, z] = rand() < 0.5 ? [across, along] : [along, across];
    addProp(scene, world, makeCone(), x, z, 0.45, 'cone', rand() * 6);
  }

  return world;
}

function addProp(scene, world, mesh, x, z, r, kind, rotY = 0) {
  mesh.position.set(x, 0.2, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  const p = {
    mesh, kind, x, z, r, knocked: false,
    vel: new THREE.Vector3(), spin: new THREE.Vector3(), home: new THREE.Vector3(x, 0.2, z), homeRot: rotY, timer: 0,
  };
  world.props.push(p);
  return p;
}

function buildHouseBlock(scene, world, rand, cx, cz, bx, bz, streetNames, familyNames) {
  // One house per side, facing the road.
  const sides = [
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
  ];
  for (const s of sides) {
    const { group, w, d } = makeHouse(rand);
    const dist = 11.5;
    const hx = cx + s.dx * dist;
    const hz = cz + s.dz * dist;
    group.position.set(hx, 0.24, hz);
    group.rotation.y = Math.atan2(s.dx, s.dz);
    scene.add(group);
    // collider: house footprint in world axes
    const hw = (s.dx === 0 ? w : d) / 2 + 0.2;
    const hd = (s.dx === 0 ? d : w) / 2 + 0.2;
    world.boxes.push({ minX: hx - hw, maxX: hx + hw, minZ: hz - hd, maxZ: hz + hd });

    // side vector (perpendicular to facing)
    const px = -s.dz;
    const pz = s.dx;
    // Driveway
    const dwLen = BLOCK / 2 - dist - d / 2 + 1;
    const dwMid = dist + d / 2 + dwLen / 2 - 0.5;
    const dw = box(s.dx === 0 ? 3 : dwLen, 0.05, s.dx === 0 ? dwLen : 3, 0xc7c2b4, cx + s.dx * dwMid + px * 2.2, 0.26, cz + s.dz * dwMid + pz * 2.2);
    dw.castShadow = false;
    scene.add(dw);

    // Bushes flanking the door
    for (const off of [-3.6, 3.6]) {
      if (rand() < 0.7) {
        const b = makeBush(rand);
        b.position.set(hx + s.dx * (d / 2 + 1) + px * off, 0.24, hz + s.dz * (d / 2 + 1) + pz * off);
        b.rotation.y = group.rotation.y;
        scene.add(b);
      }
    }

    // Can spot at the curb, mailbox on the other side of the driveway
    const curb = BLOCK / 2 - 1.2;
    const canX = cx + s.dx * curb - px * 2.5;
    const canZ = cz + s.dz * curb - pz * 2.5;
    const golden = false;
    const can = makeTrashCan(golden);
    can.group.position.set(canX, 0.2, canZ);
    can.group.visible = false;
    scene.add(can.group);
    const goldCan = makeTrashCan(true);
    goldCan.group.position.copy(can.group.position);
    goldCan.group.visible = false;
    scene.add(goldCan.group);
    const marker = makeMarker(false);
    marker.group.position.set(canX, 0.2, canZ);
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
      facing: Math.atan2(s.dx, s.dz),
      can, goldCan, marker, goldMarker,
      name: `the ${familyNames[(rand() * familyNames.length) | 0]}s`,
      street: `${street} St`,
      state: 'idle', // idle | out | grabbing | done
      golden: false,
      cooldown: 0,
    });

    const mb = makeMailbox(rand);
    mb.rotation.y = group.rotation.y;
    addProp(scene, world, mb, cx + s.dx * curb + px * 4.8, cz + s.dz * curb + pz * 4.8, 0.4, 'mailbox', group.rotation.y);
  }
  // Backyard tree + corner hydrant
  const t = makeTree(rand, 1.2);
  t.position.set(cx, 0.24, cz);
  scene.add(t);
  world.circles.push({ x: cx, z: cz, r: 1 });
  if (rand() < 0.6) {
    const sx = rand() < 0.5 ? -1 : 1;
    const sz = rand() < 0.5 ? -1 : 1;
    addProp(scene, world, makeHydrant(), cx + sx * (BLOCK / 2 - 1.2), cz + sz * (BLOCK / 2 - 1.2), 0.4, 'hydrant');
  }
  // Corner trees
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (rand() < 0.5) continue;
    const tr = makeTree(rand, 0.9 + rand() * 0.3);
    const x = cx + sx * 16;
    const z = cz + sz * 16;
    tr.position.set(x, 0.24, z);
    scene.add(tr);
    world.circles.push({ x, z, r: 0.8 });
  }
}

function buildPark(scene, world, rand, cx, cz) {
  // A few trees around the edge, a pond, and a big ramp in the middle.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.4;
    const x = cx + Math.cos(a) * 15;
    const z = cz + Math.sin(a) * 15;
    const tr = makeTree(rand, 1 + rand() * 0.4);
    tr.position.set(x, 0.24, z);
    scene.add(tr);
    world.circles.push({ x, z, r: 0.9 });
  }
  // Pond
  const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 20), toon(0x6ec6ff, { emissive: 0x2a7fb8, emissiveIntensity: 0.2 }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(cx - 9, 0.26, cz + 9);
  scene.add(pond);
  // A duck. Every pond needs a duck.
  const duck = new THREE.Group();
  duck.add(box(0.6, 0.4, 0.8, 0xffd23f, 0, 0.2, 0));
  duck.add(box(0.4, 0.4, 0.4, 0xffd23f, 0, 0.55, 0.3));
  duck.add(box(0.2, 0.1, 0.25, 0xff8c42, 0, 0.5, 0.6));
  duck.position.set(cx - 9, 0.26, cz + 9);
  duck.userData.duck = { cx: cx - 9, cz: cz + 9 };
  scene.add(duck);
  world.ducks = world.ducks || [];
  world.ducks.push(duck);

  // Ramp: runs diagonally-ish, aligned with an axis for sanity
  const dir = rand() < 0.5 ? 1 : -1;
  const alongX = rand() < 0.5;
  const w = 6;
  const len = 11;
  const h = 2.6;
  const ramp = makeRamp(w, len, h);
  const sx = cx - (alongX ? dir * len / 2 : 0);
  const sz = cz - (alongX ? 0 : dir * len / 2);
  ramp.position.set(sx, 0.24, sz);
  ramp.rotation.y = alongX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  scene.add(ramp);
  world.ramps.push({ x: sx, z: sz, dirX: alongX ? dir : 0, dirZ: alongX ? 0 : dir, w, len, h });
  // Landing pad sign
  const sign = makeSign(['SICK JUMP', 'ZONE'], '#e17055', 5, 2);
  sign.position.set(cx + (alongX ? 0 : 6), 0.24, cz + (alongX ? 6 : 0));
  sign.rotation.y = alongX ? 0 : Math.PI / 2;
  scene.add(sign);
}

function buildPlaza(scene, world, rand, cx, cz) {
  // Town square with a statue of a raccoon hero holding a trash can aloft
  const base = cyl(4, 4.5, 1.2, 0xd9d4c7, cx, 0.6, cz, 20);
  scene.add(base);
  const fountain = cyl(3.4, 3.4, 0.4, 0x6ec6ff, cx, 1.3, cz, 20);
  scene.add(fountain);
  const pillar = cyl(0.8, 1, 3, 0xbfb8a6, cx, 2.5, cz, 10);
  scene.add(pillar);
  const statue = new THREE.Group();
  const stone = 0xa8a294;
  statue.add(cyl(0.7, 0.9, 1.4, stone, 0, 0.7, 0, 10));
  statue.add(cyl(0.6, 0.6, 0.7, stone, 0, 1.75, 0, 10));
  for (const s of [1, -1]) {
    const ear = cyl(0, 0.25, 0.45, stone, 0.35 * s, 2.25, 0, 6);
    statue.add(ear);
  }
  statue.add(cyl(0.12, 0.12, 1.3, stone, 0.65, 2.1, 0, 6));
  statue.add(cyl(0.45, 0.35, 0.9, stone, 0.65, 3.1, 0, 10));
  const tail = cyl(0.18, 0.3, 1.6, stone, 0, 0.6, -0.9, 8);
  tail.rotation.x = 0.9;
  statue.add(tail);
  statue.position.set(cx, 4, cz);
  scene.add(statue);
  world.circles.push({ x: cx, z: cz, r: 4.4 });
  const sign = makeSign(['OUR HERO', '(unknown raccoon)'], '#6c5ce7', 6, 2);
  sign.position.set(cx, 0.24, cz + 7.5);
  scene.add(sign);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tr = makeTree(rand, 1.1);
    tr.position.set(cx + sx * 14, 0.24, cz + sz * 14);
    scene.add(tr);
    world.circles.push({ x: cx + sx * 14, z: cz + sz * 14, r: 0.9 });
    addProp(scene, world, makeHydrant(), cx + sx * 8, cz + sz * 8, 0.4, 'hydrant');
  }
}

function buildDump(scene, world, rand, cx, cz) {
  const pile = makeTrashPile(rand, 7);
  const px = cx + 6;
  const pz = cz - 6;
  pile.position.set(px, 0.2, pz);
  scene.add(pile);
  world.circles.push({ x: px, z: pz, r: 7 });

  // Fence on two sides
  for (let t = -18; t <= 18; t += 3) {
    scene.add(box(0.15, 2, 0.15, 0x9aa0a8, cx + 19, 1, cz + t));
    scene.add(box(0.15, 2, 0.15, 0x9aa0a8, cx + t, 1, cz - 19));
  }
  scene.add(box(0.08, 1.6, 38, 0xc9ccd3, cx + 19, 1, cz, toon(0xc9ccd3, { transparent: true, opacity: 0.5 })));
  scene.add(box(38, 1.6, 0.08, 0xc9ccd3, cx, 1, cz - 19, toon(0xc9ccd3, { transparent: true, opacity: 0.5 })));
  world.boxes.push({ minX: cx + 18.8, maxX: cx + 19.4, minZ: cz - 19.4, maxZ: cz + 19.4 });
  world.boxes.push({ minX: cx - 19.4, maxX: cx + 19.4, minZ: cz - 19.4, maxZ: cz - 18.8 });

  // Unload pad
  const padX = cx - 7;
  const padZ = cz + 7;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(padX, 0.27, padZ);
  scene.add(pad);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.2, 32), new THREE.MeshBasicMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }));
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(padX, 0.28, padZ);
  scene.add(padRing);
  world.dump = { x: padX, z: padZ, r: 6, pad, padRing };

  const sign = makeSign(['THE DUMP', 'unload here ♥'], '#8e5b3d', 7, 2.4);
  sign.position.set(cx - 17.5, 0.24, cz - 6);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);

  for (let k = 0; k < 5; k++) {
    const g = makeSeagull();
    g.group.userData = { cx: px, cz: pz, r: 5 + rand() * 6, h: 8 + rand() * 5, speed: 0.6 + rand() * 0.6, phase: rand() * 7 };
    scene.add(g.group);
    world.seagulls.push(g);
  }
}

/** Ground height (ramps) at a point. */
export function groundHeight(world, x, z) {
  let h = 0;
  for (const r of world.ramps) {
    const dx = x - r.x;
    const dz = z - r.z;
    const u = dx * r.dirX + dz * r.dirZ; // along
    const v = dx * -r.dirZ + dz * r.dirX; // across
    if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) h = Math.max(h, (u / r.len) * r.h);
  }
  return h;
}

/** Spawns a few cats wandering the neighborhood. */
export function isOnLawn(world, x, z) {
  for (const b of world.blocks) {
    if (b.type !== 'houses') continue;
    if (Math.abs(x - b.cx) < BLOCK / 2 - 2.5 && Math.abs(z - b.cz) < BLOCK / 2 - 2.5) return true;
  }
  return false;
}
