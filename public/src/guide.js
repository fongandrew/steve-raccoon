import * as THREE from '../vendor/three.module.js';
import { CAPACITY, DUMPSTER_BAGS } from './constants.js';
import { toon } from './models.js';
import { scene, world } from './scene.js';
import { state, T } from './state.js';

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
	guide.add(
		new THREE.LineSegments(
			new THREE.EdgesGeometry(geo),
			new THREE.LineBasicMaterial({ color: 0x24262b }),
		),
	);
	guide.scale.setScalar(0.8);
}
scene.add(guide);

export function updateGuide(time) {
	let tx;
	let tz;
	let col = 0x7cf3a0;
	if (
		state.load >= CAPACITY ||
		(state.load >= 8 && Math.hypot(world.dump.x - T.pos.x, world.dump.z - T.pos.z) < 70)
	) {
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
	if (
		tx === undefined ||
		state.mode !== 'playing' ||
		Math.hypot(tx - T.pos.x, tz - T.pos.z) < 12
	) {
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
