// Knock-over-able props, trees and bushes: what happens when the truck hits them.
import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { GRAVITY, TRASH_COLORS } from './constants.js';
import { narrate, popup } from './hud.js';
import { burst, leafBurst, spawnParticle } from './particles.js';
import { truck, world } from './scene.js';
import { addScore, state, T } from './state.js';

/** @typedef {import('./world.js').Prop} Prop */
/** @typedef {import('./world.js').BatchProp} BatchProp */
/** @typedef {import('./world.js').PropKind} PropKind */
/** @typedef {import('./world.js').TreeCircle} TreeCircle */

/**
 * How one kind of prop reacts to being hit.
 * @typedef {object} PropBehaviour
 * @property {'fly' | 'tip' | 'shatter'} style
 * @property {number} pts score for knocking it over (negative for the ones Steve shouldn't)
 * @property {number} slow how much of the truck's speed survives the hit
 * @property {string} text popup text
 * @property {'boing' | 'bonk' | 'clang' | 'crunch' | 'squeak'} sound
 * @property {boolean} [bad] counts as a bonk
 * @property {boolean} [light] flies further
 * @property {boolean} [heavy] flies less far
 * @property {boolean} [quiet] no popup of its own
 * @property {number[]} [debris] colours of the bits that fly off
 */

/**
 * Put a prop back where it started.
 * @param {Prop} p
 */
export function resetProp(p) {
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
/**
 * Copy a prop's position and rotation to whatever draws it.
 * @param {Prop} p
 */
function syncProp(p) {
	if (p.mesh) {
		p.mesh.visible = !p.hidden;
		p.mesh.position.copy(p.pos);
		p.mesh.quaternion.copy(p.quat);
	} else {
		_ps.setScalar(p.hidden ? 0 : p.scale || 1);
		const bp = /** @type {BatchProp} */ (p);
		bp.batch.set(bp.index, _pm.compose(p.pos, p.quat, _ps));
	}
}

// How each kind of prop reacts to being hit.
//   style: fly (launched, tumbles, lands on its side), tip (falls over from
//   its base), shatter (bursts into debris)
//   slow: how much of the truck's speed survives the hit
/** @type {Partial<Record<PropKind, PropBehaviour>> & { cone: PropBehaviour }} */
const KINDS = {
	cone: { style: 'fly', pts: 2, slow: 0.98, text: 'boop!', sound: 'boing' },
	mailbox: { style: 'fly', pts: -10, slow: 0.95, text: 'MAILBOX!', sound: 'bonk', bad: true },
	hydrant: { style: 'fly', pts: -15, slow: 0.85, text: 'HYDRANT!', sound: 'bonk', bad: true },
	lamp: { style: 'tip', pts: 0, slow: 0.88, text: 'clang!', sound: 'clang' },
	sign: { style: 'tip', pts: 2, slow: 0.88, text: 'timber!', sound: 'crunch' },
	fence: {
		style: 'shatter',
		pts: 1,
		slow: 0.97,
		text: 'crunch!',
		sound: 'crunch',
		debris: [0xfdfdf8, 0xe8e4d8],
	},
	flamingo: { style: 'fly', pts: 3, slow: 0.99, text: 'flamingo!', sound: 'squeak', light: true },
	gnome: { style: 'fly', pts: 3, slow: 0.99, text: 'yeet!', sound: 'boing', light: true },
	bench: { style: 'fly', pts: 1, slow: 0.9, text: 'bench!', sound: 'crunch', heavy: true },
	table: { style: 'fly', pts: 1, slow: 0.9, text: 'picnic over!', sound: 'crunch', heavy: true },
	bag: {
		style: 'fly',
		pts: 1,
		slow: 0.97,
		text: 'splat!',
		sound: 'bonk',
		light: true,
		debris: TRASH_COLORS,
	},
	tire: { style: 'fly', pts: 1, slow: 0.97, text: 'boing!', sound: 'boing', light: true },
	veggie: {
		style: 'fly',
		pts: 1,
		slow: 0.99,
		text: 'squish!',
		sound: 'crunch',
		light: true,
		debris: [0x6fbf4a, 0x9fd86b, 0xff8c2a],
	},
	sunflower: { style: 'tip', pts: 1, slow: 0.98, text: 'timber!', sound: 'crunch' },
	chainlink: { style: 'tip', pts: 2, slow: 0.9, text: 'clang!', sound: 'clang' },
	tree: { style: 'tip', pts: 5, slow: 0.8, text: 'TIMBER!', sound: 'crunch', quiet: true },
	scarecrow: { style: 'tip', pts: 3, slow: 0.95, text: 'scarecrow down!', sound: 'crunch' },
};

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _e = new THREE.Euler();

/** @param {number} dt */
export function updateProps(dt) {
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
						const tipEnd = p.home
							.clone()
							.addScaledVector(
								_ax.copy(/** @type {THREE.Vector3} */ (p.tipDir)),
								p.kind === 'lamp' ? 5 : p.kind === 'tree' ? 4 : 3,
							);
						if (p.kind === 'tree') {
							leafBurst(tipEnd.x, tipEnd.z, 0.8, 22);
							audio.bonk(0.8);
							state.shake = Math.max(state.shake, 0.35);
						}
						burst(tipEnd, 6, {
							color: 0xd9d4c7,
							size: 0.4,
							life: 0.6,
							grav: 4,
							speed: 4,
							up: 2,
							sphere: true,
							grow: 1.5,
							alpha: 0.6,
						});
					}
				} else {
					p.tipW = 0;
					p.state = 'rest';
				}
			}
			p.quat
				.copy(p.homeQuat)
				.premultiply(_q.setFromAxisAngle(/** @type {THREE.Vector3} */ (p.tipAxis), p.tipA));
			syncProp(p);
		}
		if (p.geyser > 0) {
			p.geyser -= dt;
			for (let i = 0; i < 3; i++) {
				spawnParticle({
					pos: p.home.clone().add(new THREE.Vector3(0, 0.5, 0)),
					vel: new THREE.Vector3(
						(Math.random() - 0.5) * 2.5,
						11 + Math.random() * 4,
						(Math.random() - 0.5) * 2.5,
					),
					color: Math.random() < 0.5 ? 0x6ec6ff : 0xc8ecff,
					size: 0.3,
					life: 1.4,
					grav: 18,
					sphere: true,
				});
			}
			if (!p.washed && Math.hypot(T.pos.x - p.home.x, T.pos.z - p.home.z) < 3.5) {
				p.washed = true;
				addScore(10);
				popup('FREE CAR WASH! +10', truck.group.position, 'fun');
				audio.splash();
			}
		}
		if (
			p.timer > (p.kind === 'tree' ? 60 : 30) &&
			Math.hypot(T.pos.x - p.home.x, T.pos.z - p.home.z) > 45
		)
			resetProp(p);
	}
}

/**
 * Knock a prop over.
 * @param {Prop} p
 * @param {number} nx direction from the truck to the prop
 * @param {number} nz
 * @param {number} speed the truck's speed
 */
export function knockProp(p, nx, nz, speed) {
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
		const debris = /** @type {number[]} */ (K.debris);
		for (let i = 0; i < 9; i++) {
			spawnParticle({
				pos: at
					.clone()
					.add(
						new THREE.Vector3(
							(Math.random() - 0.5) * 2,
							Math.random() * 0.6,
							(Math.random() - 0.5) * 2,
						),
					),
				vel: new THREE.Vector3(
					dx * power * 0.5 + (Math.random() - 0.5) * 5,
					3 + Math.random() * 5,
					dz * power * 0.5 + (Math.random() - 0.5) * 5,
				),
				color: /** @type {number} */ (debris[i % debris.length]),
				size: 0.22 + Math.random() * 0.2,
				life: 1.6,
				grav: 22,
			});
		}
	} else {
		p.state = 'fly';
		p.vel.set(dx * power * 0.95, 4 + power * 0.35, dz * power * 0.95);
		p.spin.set(
			(Math.random() - 0.5) * 18,
			(Math.random() - 0.5) * 8,
			(Math.random() - 0.5) * 18,
		);
		p.restA = Math.random() * Math.PI * 2;
		p.restLift = p.kind === 'tire' ? 0 : 0.15;
		p.pos.y = p.home.y + 0.05;
		if (K.debris)
			burst(p.home.clone().add(new THREE.Vector3(0, 0.6, 0)), 8, {
				colors: K.debris,
				size: 0.25,
				life: 1,
				grav: 18,
				speed: 6,
				up: 6,
			});
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
		burst(p.home.clone().add(new THREE.Vector3(0, 1, 0)), 10, {
			color: 0xffffff,
			size: 0.35,
			life: 2,
			grav: 2,
			speed: 5,
			up: 5,
			drag: 1.5,
		});
		if (Math.random() < 0.4) narrate('prop', 1, true);
	} else if (p.kind === 'hydrant') {
		audio.splash();
		p.geyser = 7;
		p.washed = false;
	} else if (p.kind === 'lamp') {
		burst(p.home.clone().add(new THREE.Vector3(0, 1, 0)), 8, {
			colors: [0xffd23f, 0xffffff],
			size: 0.12,
			life: 0.4,
			grav: 20,
			speed: 8,
			up: 5,
		});
	}
	// Chaos combo: wreck lots of stuff in quick succession
	state.chaos = state.time - state.lastSmash < 1.5 ? state.chaos + 1 : 1;
	state.lastSmash = state.time;
	if (p.kind === 'veggie' || p.kind === 'sunflower' || p.kind === 'scarecrow')
		narrate('garden', 0.25);
	else if (state.chaos === 1) narrate('prop', 0.2);
	if (state.chaos > 0 && state.chaos % 5 === 0) {
		const bonus = state.chaos * 2;
		addScore(bonus);
		popup(`CHAOS x${state.chaos}! +${bonus}`, truck.group.position, 'gold', 4);
		audio.golden();
	}
}

/**
 * Fell the tree whose trunk is `circle`.
 * @param {TreeCircle} circle
 * @param {number} nx direction from the truck to the tree
 * @param {number} nz
 */
export function fellTree(circle, nx, nz) {
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

// Driving through a bush makes it explode in leaves (it's fine, bushes are tough)
export function updateBushes() {
	for (const b of world.bushes) {
		if (Math.abs(b.x - T.pos.x) > 4 || Math.abs(b.z - T.pos.z) > 4) continue;
		if (
			Math.hypot(b.x - T.pos.x, b.z - T.pos.z) < 2.6 &&
			state.time - (b.t || -9) > 1.2 &&
			Math.hypot(T.vel.x, T.vel.z) > 3
		) {
			b.t = state.time;
			leafBurst(b.x, b.z, 0.8, 10);
		}
	}
}
