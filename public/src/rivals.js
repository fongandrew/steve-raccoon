// The other trucks in a room. Each is a full truck model in its raccoon's
// colours, moved to wherever the room's snapshots say its owner has driven
// it. Nothing here simulates them: the local truck bumps off them in truck.js.
import * as THREE from '../vendor/three.module.js';
import { $ } from './hud.js';
import { makeTruck } from './models.js';
import { raccoonFor } from './roster.js';
import { camera, scene } from './scene.js';

/** @typedef {import('./wire.js').Snap} Snap */

/**
 * @typedef {object} Rival
 * @property {number} slot
 * @property {string} name
 * @property {string} css their colour, for the HUD and minimap
 * @property {import('./models.js').TruckModel} model
 * @property {HTMLElement} tag the name floating over the truck
 * @property {boolean} seen a snapshot has arrived, so the position is real
 * @property {boolean} stale no fresh snapshot: lagging, or gone quiet
 * @property {number} x
 * @property {number} z
 * @property {number} y
 * @property {number} heading
 * @property {number} vx
 * @property {number} vz
 * @property {number} load
 * @property {number} score
 */

/** @type {Map<number, Rival>} */
export const rivals = new Map();

const tmp = new THREE.Vector3();

/**
 * @param {number} slot
 * @returns {Rival}
 */
export function addRival(slot) {
	const had = rivals.get(slot);
	if (had) return had;
	const who = raccoonFor(slot);
	const model = makeTruck();
	model.setLivery(who);
	model.group.visible = false; // until we know where it is
	scene.add(model.group);
	const tag = document.createElement('div');
	tag.className = 'nameTag';
	tag.textContent = who.name;
	tag.style.setProperty('--who', who.css);
	$('popups').appendChild(tag);
	/** @type {Rival} */
	const r = {
		slot,
		name: who.name,
		css: who.css,
		model,
		tag,
		seen: false,
		stale: false,
		x: 0,
		z: 0,
		y: 0,
		heading: 0,
		vx: 0,
		vz: 0,
		load: 0,
		score: 0,
	};
	rivals.set(slot, r);
	return r;
}

/** @param {number} slot */
export function removeRival(slot) {
	const r = rivals.get(slot);
	if (!r) return;
	scene.remove(r.model.group);
	r.tag.remove();
	rivals.delete(slot);
}

export function clearRivals() {
	for (const slot of [...rivals.keys()]) removeRival(slot);
}

/**
 * Put a rival where its owner's latest (interpolated) snapshot says it is.
 *
 * @param {number} slot
 * @param {Snap} s
 * @param {boolean} stale
 */
export function placeRival(slot, s, stale) {
	const r = addRival(slot);
	r.seen = true;
	r.stale = stale;
	Object.assign(r, { x: s.x, z: s.z, y: s.y, heading: s.heading, load: s.load, score: s.score });
	// A truck we have lost touch with isn't going anywhere, as far as bumps go
	r.vx = stale ? 0 : s.vx;
	r.vz = stale ? 0 : s.vz;
	const m = r.model;
	m.group.visible = true;
	m.group.position.set(s.x, s.y, s.z);
	m.group.rotation.y = s.heading;
	for (const w of m.frontWheels) w.rotation.y = s.steer * 0.72;
	m.fill.position.y = 2.25 + (Math.min(12, s.load) / 12) * 0.95;
	m.fill.visible = s.load > 0;
}

/**
 * Per-frame dressing: rolling wheels, the beacon, and the name tags.
 *
 * @param {number} dt
 * @param {number} time
 */
export function updateRivals(dt, time) {
	for (const r of rivals.values()) {
		if (!r.seen) continue;
		const m = r.model;
		const fwd = r.vx * Math.sin(r.heading) + r.vz * Math.cos(r.heading);
		for (const w of m.wheels) w.rotation.x += (fwd / 0.62) * dt;
		m.beaconMat.emissiveIntensity = Math.sin(time * 9 + r.slot) > 0 ? 1.6 : 0.15;
		m.beacon.rotation.y += dt * 6;
		// Name tag over the cab, hidden when the truck is behind the camera
		tmp.set(r.x, r.y + 6.2, r.z).project(camera);
		const shown = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
		r.tag.style.display = shown ? '' : 'none';
		if (shown) {
			r.tag.style.left = `${((tmp.x + 1) / 2) * window.innerWidth}px`;
			r.tag.style.top = `${((1 - tmp.y) / 2) * window.innerHeight}px`;
			r.tag.classList.toggle('stale', r.stale);
		}
	}
}
