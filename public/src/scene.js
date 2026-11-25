// The renderer, scene, camera, town (`world`) and truck model, created once at
// import. Needs a real DOM and WebGL, so unit tests can't import this.
import * as THREE from '../vendor/three.module.js';
import { makeTruck } from './models.js';
import { buildWorld } from './world.js';

const container = /** @type {HTMLElement} */ (document.getElementById('game'));
export const SMALL_DEVICE =
	window.matchMedia('(pointer: coarse)').matches ||
	Math.min(window.innerWidth, window.innerHeight) < 540;

/**
 * How hard to push the GPU. Phones get lighter settings, and a device whose
 * browser has already thrown the game's WebGL context away once (the sad-face
 * canvas: out of graphics memory, or a driver crash) drops to `low` from then
 * on. `?gfx=high|mobile|low` forces a level, and is remembered.
 *
 * - `high`: 4x antialiasing, 4096 shadow map, up to 2x pixel ratio
 * - `mobile`: no antialiasing, 1024 shadow map, up to 1.5x pixel ratio
 * - `low`: no shadows, 1x pixel ratio, no Steve cam
 *
 * @typedef {'high' | 'mobile' | 'low'} Gfx
 */
const GFX_KEY = 'steveRaccoonGfx';
const GFX_LEVELS = ['high', 'mobile', 'low'];

/** @returns {Gfx} */
function pickGfx() {
	const fromQuery = new URLSearchParams(location.search).get('gfx');
	let saved = null;
	try {
		if (fromQuery && GFX_LEVELS.includes(fromQuery)) localStorage.setItem(GFX_KEY, fromQuery);
		saved = localStorage.getItem(GFX_KEY);
	} catch {
		// private mode: fall through to the default for this device
	}
	const choice = fromQuery ?? saved;
	if (choice && GFX_LEVELS.includes(choice)) return /** @type {Gfx} */ (choice);
	return SMALL_DEVICE ? 'mobile' : 'high';
}
export const GFX = pickGfx();

export const renderer = new THREE.WebGLRenderer({
	antialias: GFX === 'high',
	powerPreference: 'high-performance',
});
renderer.setPixelRatio(
	Math.min(window.devicePixelRatio, GFX === 'high' ? 2 : GFX === 'mobile' ? 1.5 : 1),
);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = GFX !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

/** True while the browser has taken the WebGL context away: nothing can be drawn. */
export const gpu = { lost: false };
renderer.domElement.addEventListener('webglcontextlost', () => {
	gpu.lost = true;
	// Next load, ask for less. If we were already at the bottom there is
	// nothing lighter to try, so just wait for the context to come back.
	if (GFX === 'low') return;
	try {
		localStorage.setItem(GFX_KEY, 'low');
	} catch {
		return; // can't remember the downgrade, so a reload would only crash again
	}
	// Once per tab, so a device that can't run even `low` doesn't reload forever
	if (sessionStorage.getItem(GFX_KEY)) return;
	sessionStorage.setItem(GFX_KEY, 'reloaded');
	location.reload();
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
	gpu.lost = false;
});

export const scene = new THREE.Scene();
export const skyColor = new THREE.Color(0x9ed8ff); // horizon color, shared with fog
scene.fog = new THREE.Fog(skyColor, 110, 320);

export const camera = new THREE.PerspectiveCamera(
	60,
	window.innerWidth / window.innerHeight,
	0.5,
	900,
);

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

export const world = buildWorld(scene);

export const truck = makeTruck();
scene.add(truck.group);
export const steve = truck.steve;
