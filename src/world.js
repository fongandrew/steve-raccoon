// Builds the town of Binsville: a 4x4 grid of blocks with a park, a pizzeria and the dump.
import * as THREE from 'three';
import {
  M, box, cyl, ball, cone, sign, makeHouse, makeTree, makeMailbox, makeFlamingo, makeGnome,
  makeHydrant, makeBench, makeBin,
} from './models.js';

export const N = 4, B = 44, R = 14, P = B + R;
export const HALF = (N * B + (N + 1) * R) / 2; // 123
export const roadC = i => -HALF + R / 2 + i * P;
export const blockC = j => -HALF + R + B / 2 + j * P;

const DUMP = [3, 3], PARK = [1, 2], PIZZA = [2, 0];

const inRoadBand = v => {
  const t = v + HALF;
  if (t < 0 || t > 2 * HALF) return false;
  return (t % P) < R;
};
export const onRoad = (x, z) => inRoadBand(x) || inRoadBand(z);

export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function buildWorld(scene) {
  const rng = mulberry32(1337);
  const boxes = [];   // {x0,x1,z0,z1}
  const circles = []; // {x,z,r}
  const bins = [];
  const props = [];
  const root = new THREE.Group();
  scene.add(root);

  const addBin = (type, x, z, rotY) => {
    const group = makeBin(type);
    group.position.set(x, 0.24, z);
    group.rotation.order = 'YXZ';
    group.rotation.y = rotY;
    root.add(group);
    bins.push({
      type, units: type === 'dumpster' ? 4 : type === 'recycle' ? 2 : 1,
      home: new THREE.Vector3(x, 0.24, z), rotY, group, full: true, refill: 0, anim: null, pop: 0,
      phase: rng() * 6.28,
    });
  };
  const addProp = (type, make, x, z, rotY, r = 0.6, y = 0.3) => {
    const group = make();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    root.add(group);
    props.push({ type, group, home: new THREE.Vector3(x, y, z), rotY, r, knocked: false, vel: new THREE.Vector3(), spin: new THREE.Vector3(), rest: false });
  };
  const addTree = (x, z, s = 1) => {
    const t = makeTree(rng, s);
    t.position.set(x, 0.3, z);
    root.add(t);
    circles.push({ x, z, r: 0.8 * s });
  };

  // ---- ground, roads, markings
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), M(0x8fd67a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, 2 * HALF), M(0x666b78));
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.02;
  asphalt.receiveShadow = true;
  root.add(asphalt);

  const dashGeo = new THREE.PlaneGeometry(0.5, 2.6).rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: 0xfff3c4, roughness: 1 }), 5 * 4 * 7 * 2 + 5 * 5 * 0 + 10);
  let di = 0;
  const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dv = new THREE.Vector3(), ds = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = -3; k <= 3; k++) {
        const along = blockC(j) + k * 6;
        dq.setFromAxisAngle(up, 0);
        dm.compose(dv.set(roadC(i), 0.04, along), dq, ds); dashes.setMatrixAt(di++, dm);
        dq.setFromAxisAngle(up, Math.PI / 2);
        dm.compose(dv.set(along, 0.04, roadC(i)), dq, ds); dashes.setMatrixAt(di++, dm);
      }
    }
  }
  dashes.count = di;
  dashes.receiveShadow = true;
  root.add(dashes);

  // ---- blocks
  let dump = null, park = null, pizza = null;
  for (let bi = 0; bi < N; bi++) {
    for (let bj = 0; bj < N; bj++) {
      const cx = blockC(bi), cz = blockC(bj);
      const is = s => s[0] === bi && s[1] === bj;

      if (is(DUMP)) { dump = buildDump(cx, cz); continue; }

      root.add(box(B, 0.24, B, 0xe9e2cf, cx, 0.12, cz));
      root.add(box(B - 6, 0.3, B - 6, is(PARK) ? 0x7fcf6b : 0x86d672, cx, 0.15, cz));
      const hs = rng() < 0.5 ? 1 : -1, hz = rng() < 0.5 ? 1 : -1;
      addProp('hydrant', makeHydrant, cx + hs * 20.5, cz + hz * 20.5, 0, 0.5, 0.24);

      if (is(PARK)) { park = buildPark(cx, cz); continue; }
      if (is(PIZZA)) { pizza = buildPizza(cx, cz); continue; }

      for (const qx of [-1, 1]) {
        for (const qz of [-1, 1]) {
          const lx = cx + qx * 10.5, lz = cz + qz * 10.5;
          const faceX = rng() < 0.5;
          const w = 10 + Math.floor(rng() * 3), d = 8, h = 4.4 + rng() * 1.2;
          const house = makeHouse(rng, w, d, h);
          const rotY = faceX ? qx * Math.PI / 2 : (qz > 0 ? 0 : Math.PI);
          house.position.set(lx, 0, lz);
          house.rotation.y = rotY;
          root.add(house);
          const hw = (faceX ? d : w) / 2, hd = (faceX ? w : d) / 2;
          boxes.push({ x0: lx - hw, x1: lx + hw, z0: lz - hd, z1: lz + hd });

          // curb-side stuff, placed in "facing" coordinates: f = out toward the road, c = along the curb
          const place = (f, c) => faceX ? [cx + qx * f, lz + c] : [lx + c, cz + qz * f];
          const side = rng() < 0.5 ? 1 : -1;
          const [bx, bz] = place(20.5, side * (2.5 + rng() * 2));
          addBin(rng() < 0.28 ? 'recycle' : 'bin', bx, bz, rotY);
          const [mx, mz] = place(19.9, -side * (3 + rng() * 2));
          addProp('mailbox', makeMailbox, mx, mz, rotY + Math.PI / 2, 0.5, 0.24);
          if (rng() < 0.55) {
            const [fx, fz] = place(15.5 + rng() * 2.5, (rng() - 0.5) * 9);
            addProp('flamingo', makeFlamingo, fx, fz, rotY + (rng() - 0.5), 0.5);
          }
          if (rng() < 0.4) {
            const [gx, gz] = place(15.5 + rng() * 2.5, (rng() - 0.5) * 9);
            addProp('gnome', makeGnome, gx, gz, rotY + (rng() - 0.5), 0.45);
          }
        }
      }
      addTree(cx + (rng() - 0.5) * 3, cz + (rng() - 0.5) * 3, 1.1 + rng() * 0.4);
    }
  }

  function buildPark(cx, cz) {
    const pond = new THREE.Mesh(new THREE.CircleGeometry(8.5, 20), M(0x6cc4f0, { roughness: 0.25, flatShading: false }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(cx + 2, 0.32, cz - 1);
    pond.receiveShadow = true;
    root.add(pond);
    const rim = new THREE.Mesh(new THREE.RingGeometry(8.5, 9.3, 20), M(0xd9c9a0));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(cx + 2, 0.315, cz - 1);
    root.add(rim);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.28 + 0.3;
      addTree(cx + Math.cos(a) * 15.5, cz + Math.sin(a) * 15.5, 1 + rng() * 0.5);
    }
    for (const [x, z, r] of [[-9, 8, 0.6], [11, 9, -0.5]]) {
      const b = makeBench();
      b.position.set(cx + x, 0.3, cz + z);
      b.rotation.y = Math.PI + r;
      root.add(b);
      circles.push({ x: cx + x, z: cz + z, r: 1.2 });
    }
    const flowers = [0xff7eb6, 0xffe066, 0xffffff, 0xb79cff];
    for (let i = 0; i < 40; i++) {
      const a = rng() * 6.28, r = 10 + rng() * 8;
      root.add(ball(0.18, flowers[i % 4], cx + 2 + Math.cos(a) * r, 0.42, cz - 1 + Math.sin(a) * r));
    }
    addBin('bin', cx - 20.5, cz - 6, -Math.PI / 2);
    addBin('recycle', cx + 20.5, cz + 5, Math.PI / 2);
    addBin('bin', cx + 4, cz + 20.5, 0);
    addBin('bin', cx - 5, cz - 20.5, Math.PI);
    return { x: cx + 2, z: cz - 1 };
  }

  function buildPizza(cx, cz) {
    root.add(box(B - 6, 0.06, 20, 0x5d616d, cx, 0.33, cz + 9)); // parking lot
    for (let i = -3; i <= 3; i++) root.add(box(0.2, 0.02, 5, 0xfff3c4, cx + i * 5, 0.37, cz + 14));
    root.add(box(22, 6, 12, 0xfff1dc, cx, 3.3, cz - 8));
    root.add(box(23, 0.8, 13, 0xd8402f, cx, 6.7, cz - 8));
    root.add(box(22.4, 1.4, 0.3, 0xd8402f, cx, 4.6, cz - 1.85));
    for (let i = -4; i <= 4; i++) if (i % 2) root.add(box(2.45, 1.4, 0.32, 0xffffff, cx + i * 2.45, 4.6, cz - 1.84));
    root.add(box(2, 3, 0.2, 0x7a4a2a, cx, 1.8, cz - 1.95));
    for (const s of [-1, 1]) root.add(box(5, 2.2, 0.2, 0xaee4ff, cx + s * 6, 2.4, cz - 1.95, { roughness: 0.2 }));
    const sg = sign([{ text: "SAL'S PIZZA", size: 120, color: '#d8402f' }, { text: 'no raccoons (this means you, Steve)', size: 40, color: '#444' }],
      12, 3, { w: 1024, h: 256, bg: '#fffbe9', border: '#2e9a52' });
    sg.position.set(cx, 8.7, cz - 2.5);
    root.add(sg);
    root.add(box(12.4, 3.4, 0.3, 0x2e9a52, cx, 8.7, cz - 2.7));
    boxes.push({ x0: cx - 11, x1: cx + 11, z0: cz - 14, z1: cz - 2 });

    // giant spinning slice
    const spinner = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, -2.6); shape.lineTo(1.9, 2.2); shape.lineTo(-1.9, 2.2); shape.closePath();
    const slice = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }), M(0xf7d154));
    slice.position.z = -0.2;
    slice.castShadow = true;
    spinner.add(slice);
    spinner.add(box(4.2, 0.7, 0.7, 0xd9a05b, 0, 2.4, 0));
    for (const [x, y] of [[0.5, 1.2], [-0.6, 0.6], [0.1, -0.5], [0.2, -1.6]]) {
      for (const s of [-1, 1]) {
        const p = cyl(0.36, 0.36, 0.1, 0xd8402f, x, y, s * 0.24, 8);
        p.rotation.x = Math.PI / 2;
        spinner.add(p);
      }
    }
    spinner.position.set(cx + 7, 11.2, cz - 9);
    root.add(spinner);
    root.add(cyl(0.2, 0.2, 2.4, 0x555a66, cx + 7, 7.8, cz - 9, 6));

    addBin('dumpster', cx - 15.5, cz - 7, Math.PI / 2);
    addBin('dumpster', cx + 15.5, cz - 9, -Math.PI / 2);
    addBin('recycle', cx - 12, cz + 20.5, 0);
    addBin('bin', cx + 20.5, cz + 12, Math.PI / 2);
    return { x: cx, z: cz + 9, spinner };
  }

  function buildDump(cx, cz) {
    root.add(box(B, 0.2, B, 0xb79463, cx, 0.1, cz));
    // fence on the two outer edges
    for (let i = -5; i <= 5; i++) {
      root.add(box(0.3, 2.2, 0.3, 0x8a5a3a, cx + 21.5, 1.1, cz + i * 4.2));
      root.add(box(0.3, 2.2, 0.3, 0x8a5a3a, cx + i * 4.2, 1.1, cz + 21.5));
    }
    for (const y of [0.9, 1.8]) {
      root.add(box(0.15, 0.3, B - 1, 0xa87447, cx + 21.5, y, cz));
      root.add(box(B - 1, 0.3, 0.15, 0xa87447, cx, y, cz + 21.5));
    }
    boxes.push({ x0: cx + 21, x1: cx + 22, z0: cz - 22, z1: cz + 22 });
    boxes.push({ x0: cx - 22, x1: cx + 22, z0: cz + 21, z1: cz + 22 });

    const pile = new THREE.Group();
    pile.position.set(cx + 8, 0.2, cz + 8);
    const mound = new THREE.Mesh(new THREE.ConeGeometry(11, 9, 9), M(0x8d9078));
    mound.position.y = 4.5;
    mound.castShadow = true; mound.receiveShadow = true;
    pile.add(mound);
    const junk = [0x2d2f36, 0x2d2f36, 0xd96c4a, 0x5b8def, 0xf7d154, 0xff7eb6, 0xc9b58a, 0x7b8a99, 0xffffff];
    for (let i = 0; i < 46; i++) {
      const a = rng() * 6.28, t = 0.12 + rng() * 0.8;
      const x = Math.cos(a) * 11 * t, z = Math.sin(a) * 11 * t, y = 9 * (1 - t) + 0.1;
      const c = junk[Math.floor(rng() * junk.length)];
      let m;
      const k = rng();
      if (k < 0.45) { m = ball(0.5 + rng() * 0.3, c, x, y, z); m.scale.y = 0.8; }
      else if (k < 0.85) { m = box(0.9, 0.7, 1.1, c, x, y, z); m.rotation.set(rng() * 3, rng() * 3, rng() * 3); }
      else { m = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.25, 6, 10), M(0x25262b)); m.position.set(x, y + 0.1, z); m.rotation.set(1.2 + rng(), rng() * 3, 0); m.castShadow = true; }
      pile.add(m);
    }
    // an old couch, lovingly discarded
    const couch = new THREE.Group();
    couch.add(box(3, 0.8, 1.3, 0xc77dba, 0, 0.4, 0), box(3, 1.1, 0.4, 0xc77dba, 0, 1.1, -0.5), box(0.4, 1.1, 1.3, 0xa85e9c, -1.5, 0.7, 0), box(0.4, 1.1, 1.3, 0xa85e9c, 1.5, 0.7, 0));
    couch.position.set(-6.5, 3.3, -5.5); couch.rotation.set(0.25, 0.8, -0.5);
    pile.add(couch);
    root.add(pile);
    circles.push({ x: cx + 8, z: cz + 8, r: 9.6 });

    // summit flag
    root.add(cyl(0.18, 0.18, 9, 0xdddddd, cx + 8, 12.5, cz + 8, 6));
    const flag = sign([{ text: 'MT. TRASHMORE', size: 86, color: '#ffffff' }, { text: 'est. last tuesday', size: 44, color: '#ffe9a0' }],
      10, 3, { w: 768, h: 230, bg: '#e2543d', border: '#ffffff' });
    flag.position.set(cx + 8 - 3.6, 15.3, cz + 8 - 3.6);
    flag.rotation.y = Math.PI * 1.25;
    root.add(flag);
    const back = box(10, 3, 0.1, 0xe2543d, cx + 8 - 3.55, 15.3, cz + 8 - 3.55);
    back.rotation.y = Math.PI * 1.25;
    root.add(back);

    // drop pad
    const pad = new THREE.Group();
    pad.position.set(cx - 9, 0.22, cz - 9);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.5, 28), M(0xffe066, { emissive: 0xffc400, emissiveIntensity: 0.25 }));
    disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.7, 6.5, 28), M(0xff5a3c, { emissive: 0xff3c1a, emissiveIntensity: 0.5 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    const label = sign([{ text: 'DUMP', size: 150, color: '#7a4a12' }, { text: 'HERE', size: 150, color: '#7a4a12' }], 7, 7, { w: 512, h: 512, bg: '#ffe066' });
    label.rotation.x = -Math.PI / 2; label.rotation.z = Math.PI * 1.25; label.position.y = 0.03;
    pad.add(disc, label, ring);
    root.add(pad);

    return { x: cx, z: cz, pad: new THREE.Vector3(cx - 9, 0, cz - 9), padR: 6.5, padMesh: ring, pile, pilePos: new THREE.Vector3(cx + 8, 0, cz + 8) };
  }

  // ---- edge of town: hedges, trees and rolling hills
  for (const s of [-1, 1]) {
    root.add(box(2 * HALF + 6, 3, 3, 0x3f9a55, 0, 1.5, s * (HALF + 1.5)));
    root.add(box(3, 3, 2 * HALF + 6, 0x3f9a55, s * (HALF + 1.5), 1.5, 0));
  }
  for (let i = 0; i < 70; i++) {
    const a = i / 70 * 6.28 + rng() * 0.05, r = HALF * 1.45 + 6 + rng() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < HALF + 5 && Math.abs(z) < HALF + 5) continue;
    const t = makeTree(rng, 1.6 + rng() * 1.2);
    t.position.set(x, 0, z);
    root.add(t);
  }
  const hillGeo = new THREE.IcosahedronGeometry(1, 2);
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * 6.28, r = 300 + rng() * 60;
    const hill = new THREE.Mesh(hillGeo, M(i % 2 ? 0x7cc96b : 0x6fbd66));
    const s = 60 + rng() * 50;
    hill.scale.set(s, s * (0.3 + rng() * 0.3), s);
    hill.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
    root.add(hill);
  }

  return { root, boxes, circles, bins, props, dump, park, pizza };
}
