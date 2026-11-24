// The chase camera behind the truck (plus the title-screen orbit and a
// photo-mode override for screenshot scripts).
import * as THREE from '../vendor/three.module.js';
import { camera } from './scene.js';
import { state, T } from './state.js';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

let camHeading = 0;
/**
 * @typedef {object} CameraOverride
 * @property {[number, number, number]} pos
 * @property {[number, number, number]} look
 * @property {number} [fov]
 */

/** @type {CameraOverride | null} */
let override = null;

/** Snap the chase camera back behind the truck (new shift). */
export function resetCamera() {
	camHeading = 0;
}

/**
 * Debug / photo-mode camera used by screenshot scripts; `null` hands it back.
 *
 * @param {CameraOverride | null} o
 */
export function setCameraOverride(o) {
	override = o;
}

const camLook = new THREE.Vector3();
/**
 * @param {number} dt
 * @param {number} time seconds since boot (drives the title orbit)
 */
export function updateCamera(dt, time) {
	const o = override;
	if (o) {
		camera.position.set(...o.pos);
		camera.lookAt(...o.look);
		if (o.fov && camera.fov !== o.fov) {
			camera.fov = o.fov;
			camera.updateProjectionMatrix();
		}
		return;
	}
	if (state.mode === 'title') {
		const a = time * 0.25;
		camera.position.set(T.pos.x + Math.sin(a) * 13, 6.5, T.pos.z + Math.cos(a) * 13);
		camLook.set(T.pos.x, 2.8, T.pos.z);
		camera.lookAt(camLook);
		return;
	}
	let dh = T.heading - camHeading;
	while (dh > Math.PI) dh -= Math.PI * 2;
	while (dh < -Math.PI) dh += Math.PI * 2;
	// when reversing, don't swing around
	camHeading += dh * Math.min(1, dt * 3.5);
	const fx = Math.sin(camHeading);
	const fz = Math.cos(camHeading);
	const speed = Math.hypot(T.vel.x, T.vel.z);
	const back = 12.5 + speed * 0.12;
	const desired = tmpV.set(T.pos.x - fx * back, 9.5 + T.y * 0.6, T.pos.z - fz * back);
	camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
	const look = tmpV2.set(T.pos.x + fx * 6, 2.2 + T.y * 0.8, T.pos.z + fz * 6);
	camLook.lerp(look, 1 - Math.exp(-10 * dt));
	camera.lookAt(camLook);
	if (state.shake > 0) {
		camera.position.x += (Math.random() - 0.5) * state.shake;
		camera.position.y += (Math.random() - 0.5) * state.shake;
		state.shake = Math.max(0, state.shake - dt * 2);
	}
	const fov = 60 + speed * 0.35 + (state.zoomT > 0 ? 6 : 0) + (state.boostT > 0 ? 8 : 0);
	if (Math.abs(camera.fov - fov) > 0.05) {
		camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
		camera.updateProjectionMatrix();
	}
}
