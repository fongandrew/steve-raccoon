import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { popup } from './hud.js';
import { makePigeon } from './models.js';
import { scene, world } from './scene.js';
import { state, T } from './state.js';
import { LAWN_Y } from './world.js';

export const pigeons = [];
for (const spot of world.pigeonSpots) {
	for (let i = 0; i < 10; i++) {
		const pg = makePigeon();
		pg.group.scale.setScalar(1.3);
		scene.add(pg.group);
		pigeons.push({
			...pg,
			spot,
			state: 'peck',
			t: Math.random() * 3,
			pos: new THREE.Vector3(),
			vel: new THREE.Vector3(),
			h: 0,
		});
	}
}
let lastFlutter = -9;
export function placePigeon(pg) {
	let x;
	let z;
	do {
		const a = Math.random() * Math.PI * 2;
		const r = 6.5 + Math.random() * (pg.spot.r - 6.5);
		x = pg.spot.x + Math.cos(a) * r;
		z = pg.spot.z + Math.sin(a) * r;
	} while (world.props.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.6));
	pg.pos.set(x, LAWN_Y, z);
	pg.h = Math.random() * 6;
	pg.state = 'peck';
	pg.group.visible = true;
}
export function updatePigeons(dt, time) {
	for (const pg of pigeons) {
		pg.t -= dt;
		const d = Math.hypot(pg.pos.x - T.pos.x, pg.pos.z - T.pos.z);
		if (pg.state === 'peck') {
			if (pg.t <= 0) {
				pg.t = 0.5 + Math.random() * 2;
				pg.h += (Math.random() - 0.5) * 2;
			}
			pg.pos.x += Math.sin(pg.h) * 0.3 * dt;
			pg.pos.z += Math.cos(pg.h) * 0.3 * dt;
			pg.group.rotation.x = Math.max(0, Math.sin(time * 9 + pg.pos.x * 3)) * 0.5; // peck peck
			pg.wings[0].rotation.z = -1.35; // wings folded along the body
			pg.wings[1].rotation.z = 1.35;
			if (d < 13) {
				// Everybody panics
				pg.state = 'fly';
				pg.t = 4 + Math.random() * 2;
				const ax = pg.pos.x - T.pos.x;
				const az = pg.pos.z - T.pos.z;
				const al = Math.hypot(ax, az) || 1;
				pg.vel.set(
					(ax / al) * 7 + (Math.random() - 0.5) * 4,
					6 + Math.random() * 3,
					(az / al) * 7 + (Math.random() - 0.5) * 4,
				);
				pg.h = Math.atan2(pg.vel.x, pg.vel.z);
				pg.group.rotation.x = -0.4;
				if (time - lastFlutter > 1.5) {
					lastFlutter = time;
					audio.flutter();
					if (state.mode === 'playing') popup('coo!!', pg.pos.clone(), 'fun', 0);
				}
			}
		} else if (pg.state === 'fly') {
			pg.vel.y += 1.5 * dt;
			pg.pos.addScaledVector(pg.vel, dt);
			const flap = Math.sin(time * 30 + pg.pos.x) * 0.9;
			pg.wings[0].rotation.z = flap;
			pg.wings[1].rotation.z = -flap;
			if (pg.t <= 0) {
				pg.state = 'away';
				pg.group.visible = false;
				pg.t = 12 + Math.random() * 8;
			}
		} else if (
			pg.state === 'away' &&
			pg.t <= 0 &&
			Math.hypot(pg.spot.x - T.pos.x, pg.spot.z - T.pos.z) > 40
		) {
			placePigeon(pg);
		}
		pg.group.position.copy(pg.pos);
		pg.group.rotation.y = pg.h;
	}
}
