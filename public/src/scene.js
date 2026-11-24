// The renderer, scene, camera, town (`world`) and truck model, created once at
// import. Needs a real DOM and WebGL, so unit tests can't import this.
import * as THREE from '../vendor/three.module.js';
import { makeTruck } from './models.js';
import { buildWorld } from './world.js';

const container = /** @type {HTMLElement} */ (document.getElementById('game'));
export const renderer = new THREE.WebGLRenderer({
	antialias: true,
	powerPreference: 'high-performance',
});
export const SMALL_DEVICE =
	window.matchMedia('(pointer: coarse)').matches ||
	Math.min(window.innerWidth, window.innerHeight) < 540;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, SMALL_DEVICE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

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
