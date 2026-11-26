// Geese: immovable. The truck bounces off them, and hitting one costs points.
import { audio } from './audio.js';
import { GOOSE_PENALTY } from './constants.js';
import { narrate, popup } from './hud.js';
import { makeGoose } from './models.js';
import { scene, truck } from './scene.js';
import { addScore, state, T } from './state.js';
import { bonk } from './truck.js';
import { HALF, N, ROAD, ROAD_Y, roadCenter, surfaceHeight } from './world.js';

/**
 * @typedef {import('./models.js').GooseModel & {
 *   x: number,
 *   z: number,
 *   h: number,
 *   tx: number,
 *   tz: number,
 *   wait: number,
 *   alert: number,
 *   honkT: number,
 *   hop: number,
 *   cool: number,
 *   replyT: number,
 *   home?: [number, number],
 * }} Goose
 * `tx`/`tz` is where it is wandering to; `home` (set by `placeGoose`) the spot it wanders round.
 */

/** @type {Goose[]} */
export const geese = [];
/** @type {(x: number, z: number) => boolean} */
const onRoad = (x, z) =>
	surfaceHeight(x, z) === ROAD_Y && Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3;
for (let i = 0; i < 6; i++) {
	const g = makeGoose();
	g.group.scale.setScalar(1.5); // geese are large and in charge
	scene.add(g.group);
	geese.push({
		...g,
		x: 0,
		z: 0,
		h: 0,
		tx: 0,
		tz: 0,
		wait: 0,
		alert: 0,
		honkT: 0,
		hop: 0,
		cool: 0,
		replyT: 0,
	});
}
/** @param {Goose} g */
export function placeGoose(g) {
	do {
		const i = (Math.random() * (N + 1)) | 0;
		const along = -HALF + Math.random() * HALF * 2;
		const off = (Math.random() - 0.5) * (ROAD - 4);
		[g.x, g.z] =
			Math.random() < 0.5 ? [roadCenter(i) + off, along] : [along, roadCenter(i) + off];
	} while (!onRoad(g.x, g.z) || Math.hypot(g.x - T.pos.x, g.z - T.pos.z) < 40);
	g.home = [g.x, g.z];
	g.tx = g.x;
	g.tz = g.z;
	g.alert = 0;
}
/**
 * @param {number} dt
 * @param {number} time
 */
export function updateGeese(dt, time) {
	const fx = Math.sin(T.heading);
	const fz = Math.cos(T.heading);
	for (const g of geese) {
		const home = /** @type {[number, number]} */ (g.home);
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
					const x = home[0] + Math.cos(a) * r;
					const z = home[1] + Math.sin(a) * r;
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
						addScore(-GOOSE_PENALTY);
						popup(`-${GOOSE_PENALTY}`, truck.group.position, 'bad', 3);
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
		g.group.position.set(
			g.x,
			surfaceHeight(g.x, g.z) + Math.sin(g.hop * 14) * g.hop * 1.6,
			g.z,
		);
		g.group.rotation.y = g.h;
		g.body.rotation.z = walking ? Math.sin(time * 9 + home[0]) * 0.12 : 0;
		g.neck.rotation.x =
			g.hop > 0 || standoff ? -0.35 : 0.1 + Math.sin(time * 2 + home[1]) * 0.06;
	}
}
/**
 * @param {Goose} g
 * @param {boolean} [force] honk out loud even if another goose just did
 */
function gooseHonk(g, force = false) {
	g.hop = Math.max(g.hop, 0.25);
	popup('HONK!', g.group.position, 'bad', 2.6);
	if (force || state.time - state.lastGooseHonk > 0.35) {
		state.lastGooseHonk = state.time;
		audio.gooseHonk();
	}
}
