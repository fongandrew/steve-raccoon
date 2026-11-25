// Driving physics for the truck: steering, drifting, jumps and collisions with the town.
import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { GRAVITY, MAX_SPEED } from './constants.js';
import { narrate, popup, toast } from './hud.js';
import { keys, touch } from './input.js';
import { burst, leafBurst } from './particles.js';
import { rivals } from './rivals.js';
import { truck, world } from './scene.js';
import { fellTree } from './smash.js';
import { addScore, state, T } from './state.js';
import { boostLevel, pick } from './util.js';
import { groundHeight, HALF, isOnLawn, PITCH, roadCenter } from './world.js';

const tmpV2 = new THREE.Vector3();

const prevPos = new THREE.Vector3();

/** Touch drifting starts above this forward speed, and gives up below the other. */
const TOUCH_DRIFT_START = 8;
const TOUCH_DRIFT_MIN = 5;

/** @param {number} dt */
export function updateTruck(dt) {
	// Online, the pause menu is an overlay: the truck just coasts while it's up
	const playing = state.mode === 'playing' && !state.menuOpen;
	const fx = Math.sin(T.heading);
	const fz = Math.cos(T.heading);
	const rx = -fz;
	const rz = fx;
	let fwd = T.vel.x * fx + T.vel.z * fz;
	let lat = T.vel.x * rx + T.vel.z * rz;

	let steerIn = playing ? (keys.has('left') ? 1 : 0) - (keys.has('right') ? 1 : 0) : 0;
	if (playing && Math.abs(touch.steer) > 0.12) {
		steerIn = -Math.max(-1, Math.min(1, touch.steer * 1.25));
	}
	// Touch has no drift button. Braking while already turning at speed kicks
	// the back end out instead of slowing down, and the drift lasts until the
	// thumb comes off the brake (or the truck has all but stopped).
	if (state.touchDrift) {
		if (!playing || !touch.brake || fwd < TOUCH_DRIFT_MIN) state.touchDrift = false;
	} else if (
		playing &&
		touch.brake &&
		T.grounded &&
		fwd > TOUCH_DRIFT_START &&
		Math.abs(steerIn) > 0.3
	) {
		state.touchDrift = true;
	}
	const gas = playing && (keys.has('gas') || touch.gas || state.touchDrift) ? 1 : 0;
	const brake = playing && (keys.has('brake') || (touch.brake && !state.touchDrift)) ? 1 : 0;
	const drift = playing && (keys.has('drift') || state.touchDrift);

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
	if (state.hangry)
		target += Math.sin(state.time * 2.7) * 0.18 + Math.sin(state.time * 7.1) * 0.08;
	T.steer += (target - T.steer) * Math.min(1, dt * 8);
	const yawRate = ((fwd * Math.tan(T.steer)) / 3.8) * (drift ? 1.45 : 1) * (T.grounded ? 1 : 0.3);
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
				burst(truck.group.position, 12, {
					color: 0xd9c9a3,
					size: 0.5,
					life: 0.7,
					grav: 6,
					speed: 8,
					up: 3,
					sphere: true,
					grow: 1.5,
				});
				state.shake = Math.max(state.shake, 0.4);
			}
			if (T.airTime > 0.45 && playing) {
				const pts = Math.round(T.airTime * 50);
				addScore(pts);
				state.stats.air = Math.max(state.stats.air, T.airTime);
				audio.boing();
				popup(`AIR TIME! +${pts}`, truck.group.position, 'fun');
				if (T.airTime > 0.9)
					toast(
						pick([
							'Steve has achieved liftoff.',
							'The neighbors are filming.',
							'Trash truck physics: optional.',
						]),
					);
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
			if (c.x < b.minX - r || c.x > b.maxX + r || c.z < b.minZ - r || c.z > b.maxZ + r)
				continue;
			const qx = Math.max(b.minX, Math.min(c.x, b.maxX));
			const qz = Math.max(b.minZ, Math.min(c.z, b.maxZ));
			let nx = c.x - qx;
			let nz = c.z - qz;
			const d = Math.hypot(nx, nz);
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
				if (s.prop && s.dmg > 8)
					popup(s.dmg > 18 ? 'creeeak...' : 'wobble', s.prop.home, 'fun', 3);
			}
		}
	}
	if (maxImpact > 7) bonk(maxImpact);
	bumpRivals();
}

/** Two circles a side, like the static colliders; trucks touch a little inside them. */
const TRUCK_R = 1.5;
/** How bouncy truck-on-truck is (0 = they stick, 1 = billiard balls). */
const BUMP_BOUNCE = 0.55;

/**
 * Trucks are solid to each other. Each player's game only ever moves its own
 * truck: it takes half of the push apart and its own half of the bounce (two
 * equal trucks swapping momentum), and the other player's game does the
 * mirror image with the same numbers.
 */
function bumpRivals() {
	let hardest = 0;
	let who = null;
	for (const r of rivals.values()) {
		if (!r.seen || Math.abs(r.y - T.y) > 2.6) continue;
		if (Math.abs(r.x - T.pos.x) > 9 || Math.abs(r.z - T.pos.z) > 9) continue;
		const rfx = Math.sin(r.heading);
		const rfz = Math.cos(r.heading);
		for (const off of [1.9, -1.9]) {
			for (const roff of [1.9, -1.9]) {
				const dx = T.pos.x + Math.sin(T.heading) * off - (r.x + rfx * roff);
				const dz = T.pos.z + Math.cos(T.heading) * off - (r.z + rfz * roff);
				const d = Math.hypot(dx, dz);
				if (d >= TRUCK_R * 2 || d < 1e-3) continue;
				const nx = dx / d;
				const nz = dz / d;
				// A parked (or lagging) truck won't move itself out of the way
				const share = Math.hypot(r.vx, r.vz) < 0.5 ? 1 : 0.5;
				T.pos.x += nx * (TRUCK_R * 2 - d) * share;
				T.pos.z += nz * (TRUCK_R * 2 - d) * share;
				const closing = (T.vel.x - r.vx) * nx + (T.vel.z - r.vz) * nz;
				if (closing < 0) {
					const kick = (-(1 + BUMP_BOUNCE) / 2) * closing;
					T.vel.x += nx * kick;
					T.vel.z += nz * kick;
					if (-closing > hardest) {
						hardest = -closing;
						who = r;
					}
				}
			}
		}
	}
	if (!who || hardest < 4) return;
	bonk(hardest * 0.8);
	if (state.mode !== 'playing' || state.time - state.lastBump < 1) return;
	state.lastBump = state.time;
	state.stats.bumps++;
	popup(hardest > 12 ? 'WHAM!' : 'BUMP!', truck.group.position, 'fun', 3);
	narrate('bump', state.stats.bumps === 1 ? 1 : 0.3, state.stats.bumps === 1);
}

function releaseBoost() {
	const level = boostLevel(state.driftCharge);
	if (!level) return;
	state.boostT = 0.5 + level * 0.45;
	state.stats.boosts++;
	const pts = /** @type {number} */ ([0, 5, 10, 20][level]);
	addScore(pts);
	audio.boost(level);
	state.shake = Math.max(state.shake, 0.25 + level * 0.1);
	popup(
		`${['', 'BOOST!', 'SUPER BOOST!', 'ULTRA BOOST!'][level]} +${pts}`,
		truck.group.position,
		level === 3 ? 'gold' : 'fun',
		2,
	);
	// instant kick forward
	T.vel.x += Math.sin(T.heading) * 4 * level;
	T.vel.z += Math.cos(T.heading) * 4 * level;
}

/**
 * Push the truck (and its collision circle `c`) out along a contact normal and
 * bounce off it.
 * @param {THREE.Vector3} c
 * @param {number} nx
 * @param {number} nz
 * @param {number} pen penetration depth
 * @returns {number} speed into the surface before the bounce, 0 if moving away
 */
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

/** @param {number} strength impact speed */
export function bonk(strength) {
	if (state.time - state.lastBonk < 0.4) return;
	state.lastBonk = state.time;
	audio.bonk(Math.min(1, strength / 15));
	T.squashV -= Math.min(5, strength * 0.25);
	state.shake = Math.max(state.shake, Math.min(0.8, strength * 0.04));
	if (strength > 10 && state.mode === 'playing') {
		popup(pick(['BONK!', 'OOF!', 'WHOMP!', 'CLONK!']), truck.group.position, 'bad');
		narrate('crash', 0.5);
	}
}

export function unstick() {
	// Snap onto the nearest road
	/** @param {number} v */
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
