import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { GRAVITY } from './constants.js';
import { popup } from './hud.js';
import { makeBeachBall } from './models.js';
import { scene, world } from './scene.js';
import { addScore, state, T } from './state.js';
import { surfaceHeight } from './world.js';

const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();

const balls = world.balls.map(([x, z]) => {
	const b = makeBeachBall();
	scene.add(b.group);
	return { ...b, home: [x, z], pos: new THREE.Vector3(), vel: new THREE.Vector3(), hitT: -9 };
});
export function resetBalls() {
	for (const b of balls) {
		b.pos.set(b.home[0], surfaceHeight(b.home[0], b.home[1]) + 0.9, b.home[1]);
		b.vel.set(0, 0, 0);
		b.hitT = -9;
		b.group.position.copy(b.pos);
	}
}
const BALL_R = 0.9;
export function updateBalls(dt) {
	const fx = Math.sin(T.heading);
	const fz = Math.cos(T.heading);
	for (const b of balls) {
		// Truck hits: punt the ball
		for (const off of [1.9, -1.9]) {
			const dx = b.pos.x - (T.pos.x + fx * off);
			const dz = b.pos.z - (T.pos.z + fz * off);
			const d = Math.hypot(dx, dz);
			if (d < 1.7 + BALL_R && b.pos.y < T.y + 3.5) {
				const nx = dx / (d || 1);
				const nz = dz / (d || 1);
				const sp = Math.hypot(T.vel.x, T.vel.z);
				b.vel.set(
					T.vel.x * 1.15 + nx * (4 + sp * 0.3),
					5 + sp * 0.4,
					T.vel.z * 1.15 + nz * (4 + sp * 0.3),
				);
				b.pos.x = T.pos.x + fx * off + nx * (1.75 + BALL_R);
				b.pos.z = T.pos.z + fz * off + nz * (1.75 + BALL_R);
				if (state.time - b.hitT > 0.6) {
					b.hitT = state.time;
					audio.boing();
					if (state.mode === 'playing') {
						addScore(1);
						popup('BOING! +1', b.pos, 'fun', 0);
					}
				}
				break;
			}
		}
		b.vel.y -= GRAVITY * 0.6 * dt;
		b.pos.addScaledVector(b.vel, dt);
		const floor = surfaceHeight(b.pos.x, b.pos.z) + BALL_R;
		if (b.pos.y < floor) {
			b.pos.y = floor;
			b.vel.y = Math.abs(b.vel.y) > 2 ? -b.vel.y * 0.65 : 0;
			b.vel.x *= 1 - Math.min(1, dt * 1.2);
			b.vel.z *= 1 - Math.min(1, dt * 1.2);
		}
		// Bounce off buildings, trees and the edge of town
		for (const w of world.boxes) {
			if (w.off) continue;
			const qx = Math.max(w.minX, Math.min(b.pos.x, w.maxX));
			const qz = Math.max(w.minZ, Math.min(b.pos.z, w.maxZ));
			const ex = b.pos.x - qx;
			const ez = b.pos.z - qz;
			const e = Math.hypot(ex, ez);
			if (e < BALL_R && e > 1e-4) {
				b.pos.x = qx + (ex / e) * BALL_R;
				b.pos.z = qz + (ez / e) * BALL_R;
				const vn = (b.vel.x * ex + b.vel.z * ez) / e;
				if (vn < 0) {
					b.vel.x -= (1.7 * vn * ex) / e;
					b.vel.z -= (1.7 * vn * ez) / e;
				}
			}
		}
		for (const c of world.circles) {
			if (c.off) continue;
			const ex = b.pos.x - c.x;
			const ez = b.pos.z - c.z;
			const e = Math.hypot(ex, ez);
			if (e < c.r + BALL_R && e > 1e-4) {
				b.pos.x = c.x + (ex / e) * (c.r + BALL_R);
				b.pos.z = c.z + (ez / e) * (c.r + BALL_R);
				const vn = (b.vel.x * ex + b.vel.z * ez) / e;
				if (vn < 0) {
					b.vel.x -= (1.7 * vn * ex) / e;
					b.vel.z -= (1.7 * vn * ez) / e;
				}
			}
		}
		b.group.position.copy(b.pos);
		// Roll in the direction of travel
		const v = Math.hypot(b.vel.x, b.vel.z);
		if (v > 0.05) {
			_ax.set(b.vel.z / v, 0, -b.vel.x / v);
			b.ball.quaternion.premultiply(_q.setFromAxisAngle(_ax, (v * dt) / BALL_R));
		}
	}
}
