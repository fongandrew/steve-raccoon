// The trash mountain at the dump: bags fly in from the truck and settle into instanced piles.
import * as THREE from '../vendor/three.module.js';
import { TRASH_COLORS } from './constants.js';
import { makeTrashBag, toon } from './models.js';
import { burst } from './particles.js';
import { PropBatch } from './props.js';
import { scene, world } from './scene.js';

/**
 * A bag in the air between the truck and the pile. Pooled: `active` is false
 * while it waits for reuse.
 * @typedef {object} FlyingBag
 * @property {THREE.Group} mesh
 * @property {boolean} active
 * @property {number} t 0..1 along the arc
 * @property {THREE.Vector3} from
 * @property {THREE.Vector3} to
 * @property {PropBatch} batch the pile batch it joins when it lands
 */

const PILE_MAX = 220;
const pileBatches = [0x2b2b2b, 0x3d7ea6, 0x40704a].map((c) => {
	const t = makeTrashBag(() => 0);
	t.traverse((obj) => {
		const m = /** @type {THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>} */ (obj);
		if (m.isMesh && m.material.color && m.material.color.getHex() === 0x2b2b2b)
			m.material = toon(c);
	});
	return new PropBatch(scene, t, PILE_MAX);
});
/** @type {FlyingBag[]} */
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

/** @param {THREE.Vector3} from where the bag leaves the truck */
export function launchBagToPile(from) {
	let f = flyingBags.find((b) => !b.active);
	if (!f) {
		const mesh = makeTrashBag(Math.random);
		scene.add(mesh);
		// the rest is filled in just below
		f = /** @type {FlyingBag} */ ({ mesh });
		flyingBags.push(f);
	}
	f.active = true;
	f.t = 0;
	f.from = from.clone();
	f.to = pileSpot();
	f.batch = /** @type {PropBatch} */ (pileBatches[(Math.random() * pileBatches.length) | 0]);
	f.mesh.visible = true;
	f.mesh.position.copy(from);
}

/** @param {number} dt */
export function updatePile(dt) {
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
				_bq.setFromEuler(
					new THREE.Euler(
						(Math.random() - 0.5) * 0.6,
						Math.random() * 6,
						(Math.random() - 0.5) * 0.6,
					),
				);
				_bs.setScalar(0.9 + Math.random() * 0.5);
				batch.set(batch.add(), _bm.compose(f.to, _bq, _bs));
			}
			pileCount++;
			burst(f.to.clone(), 3, {
				colors: TRASH_COLORS,
				size: 0.25,
				life: 0.6,
				grav: 15,
				speed: 4,
				up: 4,
			});
		}
	}
}

export function resetPile() {
	for (const b of pileBatches) b.reset();
	for (const f of flyingBags) {
		f.active = false;
		f.mesh.visible = false;
	}
	pileCount = 0;
}
