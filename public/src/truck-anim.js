// Truck and Steve animation: everything visual that follows from the physics state.
import * as THREE from '../vendor/three.module.js';
import { BOOST_COLORS, CAPACITY } from './constants.js';
import { keys, touch } from './input.js';
import { LIFT } from './loader.js';
import { spawnParticle } from './particles.js';
import { steve, truck, world } from './scene.js';
import { state, T } from './state.js';
import { boostLevel } from './util.js';
import { groundHeight } from './world.js';

const tmpV = new THREE.Vector3();

let blinkT = 2;
/** How far Steve is leaning out of the doorway; the portrait camera follows it. */
export const steveAnim = { lean: 0 };
let duckAmt = 0;

/**
 * @param {number} dt
 * @param {number} time seconds, for the idle wobbles
 */
export function animateTruck(dt, time) {
	// Spring squash
	T.squashV += (-90 * T.squash - 9 * T.squashV) * dt;
	T.squash += T.squashV * dt;
	T.squash = Math.max(-0.25, Math.min(0.25, T.squash));

	truck.group.position.set(T.pos.x, T.y, T.pos.z);
	truck.group.rotation.y = T.heading;

	// Pitch: from ramp slope when grounded, nose-down in the air
	let targetPitch = 0;
	if (T.grounded) {
		const fx = Math.sin(T.heading);
		const fz = Math.cos(T.heading);
		const hf = groundHeight(world, T.pos.x + fx * 2.5, T.pos.z + fz * 2.5);
		const hb = groundHeight(world, T.pos.x - fx * 2.5, T.pos.z - fz * 2.5);
		targetPitch = -Math.atan2(hf - hb, 5);
	} else {
		targetPitch = Math.max(-0.5, Math.min(0.4, -T.vy * 0.03));
	}
	T.pitch += (targetPitch - T.pitch) * Math.min(1, dt * 10);
	const targetRoll = Math.max(-0.12, Math.min(0.12, T.fwd * T.steer * 0.012)) + T.lat * 0.01;
	T.roll += (targetRoll - T.roll) * Math.min(1, dt * 6);
	truck.body.rotation.set(T.pitch, 0, T.roll);
	const idle = Math.sin(time * 30) * 0.008 * (state.mode === 'playing' ? 1 : 0.5);
	truck.body.scale.set(1 - T.squash * 0.4, 1 + T.squash + idle, 1 - T.squash * 0.4);
	truck.body.position.y = idle * 2;

	for (const w of truck.wheels) w.rotation.x += (T.fwd / 0.62) * dt;
	const fillTarget = 2.25 + (state.load / CAPACITY) * 0.95;
	truck.fill.position.y += (fillTarget - truck.fill.position.y) * Math.min(1, dt * 4);
	truck.fill.visible = state.load > 0 || truck.fill.position.y > 2.3;
	for (const w of truck.frontWheels) w.rotation.y = T.steer * 1.2;

	// Beacon blinks
	const on = Math.sin(time * 9) > 0;
	truck.beaconMat.emissiveIntensity = on ? 1.6 : 0.15;
	truck.beacon.rotation.y += dt * 6;

	// Exhaust puffs
	const throttle = (keys.has('gas') || touch.gas) && state.mode === 'playing' ? 1 : 0;
	if (Math.random() < (0.15 + throttle * 0.5) * dt * 60 * 0.25) {
		const p = truck.group.localToWorld(tmpV.set(1.25, 3.9, 1.3));
		spawnParticle({
			pos: p,
			vel: new THREE.Vector3(
				(Math.random() - 0.5) * 0.5,
				2.5,
				(Math.random() - 0.5) * 0.5,
			).add(T.vel.clone().multiplyScalar(0.3)),
			color: state.zoomT > 0 ? 0xffd23f : 0xe4e7eb,
			size: 0.22,
			life: 1.0,
			grow: 3.2,
			sphere: true,
			alpha: 0.6,
		});
	}
	// Drift sparks colored by charge level, and boost flames
	const lvl = boostLevel(state.driftCharge);
	if (state.driftCharge > 0.25) {
		for (const sx of [1.3, -1.3]) {
			if (Math.random() < 0.7) {
				const p = truck.group.localToWorld(tmpV.set(sx, 0.25, -2.9));
				spawnParticle({
					pos: p,
					vel: new THREE.Vector3(
						(Math.random() - 0.5) * 4,
						2 + Math.random() * 3,
						(Math.random() - 0.5) * 4,
					),
					color: /** @type {number} */ (BOOST_COLORS[lvl]),
					size: 0.14 + lvl * 0.04,
					life: 0.35,
					grav: 14,
				});
			}
		}
	}
	if (state.boostT > 0) {
		for (let i = 0; i < 2; i++) {
			const p = truck.group.localToWorld(tmpV.set(1.22, 3.95, 1.3));
			spawnParticle({
				pos: p,
				vel: new THREE.Vector3(
					Math.random() - 0.5,
					3 + Math.random() * 2,
					Math.random() - 0.5,
				),
				color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f,
				size: 0.3,
				life: 0.35,
				grow: 1.5,
				sphere: true,
			});
		}
		const r = truck.group.localToWorld(
			tmpV.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, -4.2),
		);
		spawnParticle({
			pos: r,
			vel: new THREE.Vector3(-Math.sin(T.heading) * 6, 0.5, -Math.cos(T.heading) * 6),
			color: 0xffffff,
			size: 0.12,
			life: 0.25,
		});
	}

	// Drift dust
	if (T.grounded && Math.abs(T.lat) > 3.5) {
		for (const sx of [1.3, -1.3]) {
			const p = truck.group.localToWorld(tmpV.set(sx, 0.3, -2.9));
			spawnParticle({
				pos: p,
				vel: new THREE.Vector3(Math.random() - 0.5, 1.2, Math.random() - 0.5),
				color: 0xe9e4d7,
				size: 0.5,
				life: 0.7,
				grow: 2,
				sphere: true,
				alpha: 0.5,
			});
		}
	}

	// --- Steve ---
	const head = steve.head;
	let headY = 0;
	let headX = 0;
	let headZ = 0;
	// Body lean: a little out the doorway when cruising, more into right turns (toward the door),
	// inward on left turns, and well out (looking back) when reversing.
	const reversing = T.fwd < -0.5;
	const cruising = Math.abs(T.fwd) > 0.5;
	let leanTarget;
	if (reversing) leanTarget = 0.46;
	else leanTarget = Math.max(-0.18, Math.min(0.4, (cruising ? 0.12 : 0.04) - T.steer * 0.5));
	steveAnim.lean += (leanTarget - steveAnim.lean) * Math.min(1, dt * 5);
	steve.group.rotation.z = steveAnim.lean; // doorway is on the right (-x)
	steve.group.position.x = steve.group.userData.baseX - Math.max(0, steveAnim.lean) * 0.6;
	if (state.chompT > 0) {
		headX = Math.abs(Math.sin(state.chompT * 18)) * 0.35;
		headY = Math.sin(state.chompT * 9) * 0.1;
	} else if (reversing) {
		// Look back over his shoulder, out the doorway
		headY = -2.2;
		headX = -0.1;
	} else if (state.hangry) {
		headZ = Math.sin(time * 25) * 0.12;
		headY = -T.steer * 0.8;
	} else {
		headY = -0.15 + T.steer * 0.7 + Math.sin(time * 0.7) * 0.1;
		headX = -0.05 + (T.grounded ? 0 : -0.3);
	}
	head.rotation.x += (headX - head.rotation.x) * Math.min(1, dt * 12);
	head.rotation.y += (headY - head.rotation.y) * Math.min(1, dt * 8);
	head.rotation.z = (head.userData.baseTilt || 0) + headZ;
	const cele = state.celebrateT > 0 ? Math.abs(Math.sin(state.celebrateT * 12)) * 0.08 : 0;
	const ducking = state.lift && state.lift.t > 0.55 && state.lift.t < LIFT.end.lower;
	duckAmt += ((ducking ? 1 : 0) - duckAmt) * Math.min(1, dt * 10);
	steve.group.position.y =
		steve.group.userData.baseY + cele + (T.grounded ? 0 : 0.1) - duckAmt * 0.45;
	steve.head.position.y = 1.12 - duckAmt * 0.12;
	// Both paws on the wheel; the outer one waves out the doorway when celebrating
	const waving = state.celebrateT > 0;
	// arms[1] is his doorway-side (right) arm: it grabs the frame when reversing
	// and waves after a dump; arms[0] stays on the wheel
	steve.arms[0].rotation.set(-1.1, 0, 0.2 + T.steer * 0.6);
	if (reversing && !waving) steve.arms[1].rotation.set(-2.0, 0, -0.9);
	else
		steve.arms[1].rotation.set(
			waving ? -2.6 : -1.1,
			0,
			-0.2 + T.steer * 0.6 - (waving ? 0.6 + Math.sin(state.celebrateT * 18) * 0.3 : 0),
		);
	// Tail wags, faster at speed
	const sp = Math.abs(T.fwd);
	steve.tail.forEach((seg, i) => {
		const rest = steve.tailRest
			? /** @type {{ x: number, y: number }} */ (steve.tailRest[i])
			: { x: i < 4 ? -0.12 : 0.22, y: 0 };
		const wag = steve.tailWag ?? 0.18 + sp * 0.006;
		seg.rotation.y = rest.y + Math.sin(time * 2.2 - i * 0.6) * wag;
		seg.rotation.x = rest.x + Math.sin(time * 1.7 - i * 0.5) * wag * 0.4;
	});
	// Blink
	blinkT -= dt;
	const blink = blinkT < 0.12;
	if (blinkT < 0) blinkT = 2 + Math.random() * 3;
	for (const e of steve.eyes) e.scale.y = blink ? 0.15 : state.hangry ? 0.55 : 1;
}
