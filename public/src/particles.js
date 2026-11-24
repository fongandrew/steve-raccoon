// A small pool of unlit box/sphere particles: dust, sparks, leaves, splashes.
import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { scene } from './scene.js';

/**
 * One pooled particle. Free for reuse once `life` runs out.
 *
 * @typedef {object} Particle
 * @property {THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>} mesh
 * @property {THREE.Vector3} vel
 * @property {number} life seconds left
 * @property {number} maxLife
 * @property {number} grav
 * @property {number} grow how much it swells over its life (0 = not at all)
 * @property {number} size
 * @property {number} drag
 * @property {number} alpha
 */

/**
 * @typedef {object} ParticleOptions
 * @property {THREE.Vector3} pos copied
 * @property {THREE.Vector3} vel copied
 * @property {number | undefined} [color]
 * @property {number} [size]
 * @property {number} [life] seconds
 * @property {number} [grav]
 * @property {number} [grow]
 * @property {boolean} [sphere] a ball instead of a box
 * @property {number} [drag]
 * @property {number} [alpha]
 */

/**
 * @typedef {object} BurstExtras
 * @property {number} [speed] outward speed
 * @property {number} [up] upward speed
 * @property {number[]} [colors] each particle picks one at random (instead of `color`)
 */

/** @typedef {Omit<ParticleOptions, 'pos' | 'vel'> & BurstExtras} BurstOptions */

/** @type {Particle[]} */
const particles = [];
const pGeoBox = new THREE.BoxGeometry(1, 1, 1);
const pGeoSphere = new THREE.IcosahedronGeometry(0.5, 1);

/** @param {ParticleOptions} options */
export function spawnParticle({
	pos,
	vel,
	color = 0xffffff,
	size = 0.3,
	life = 1,
	grav = 0,
	grow = 0,
	sphere = false,
	drag = 0,
	alpha = 1,
}) {
	let p = particles.find((q) => q.life <= 0);
	if (!p) {
		if (particles.length > 400) return;
		/** @type {Particle['mesh']} */
		const mesh = new THREE.Mesh(pGeoBox, new THREE.MeshBasicMaterial({ transparent: true }));
		scene.add(mesh);
		p = /** @type {Particle} */ ({ mesh, vel: new THREE.Vector3(), life: 0 });
		particles.push(p);
	}
	p.mesh.geometry = sphere ? pGeoSphere : pGeoBox;
	p.mesh.material.color.setHex(color);
	p.mesh.material.opacity = 1;
	p.mesh.position.copy(pos);
	p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
	p.mesh.scale.setScalar(size);
	p.mesh.visible = true;
	p.vel.copy(vel);
	Object.assign(p, { life, maxLife: life, grav, grow, size, drag, alpha });
}

/** @param {number} dt */
export function updateParticles(dt) {
	for (const p of particles) {
		if (p.life <= 0) continue;
		p.life -= dt;
		if (p.life <= 0) {
			p.mesh.visible = false;
			continue;
		}
		p.vel.y -= p.grav * dt;
		if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
		p.mesh.position.addScaledVector(p.vel, dt);
		if (p.mesh.position.y < 0.2 && p.grav > 0) {
			p.mesh.position.y = 0.2;
			p.vel.set(p.vel.x * 0.5, Math.abs(p.vel.y) * 0.3, p.vel.z * 0.5);
		}
		p.mesh.rotation.x += dt * 4;
		const k = p.life / p.maxLife;
		p.mesh.scale.setScalar(p.size * (1 + p.grow * (1 - k)));
		p.mesh.material.opacity = Math.min(1, k * 2) * p.alpha;
	}
}

/**
 * Throw `n` particles up and outward from one point.
 *
 * @param {THREE.Vector3} pos
 * @param {number} n
 * @param {BurstOptions} opts
 */
export function burst(pos, n, opts) {
	for (let i = 0; i < n; i++) {
		const a = Math.random() * Math.PI * 2;
		const s = (opts.speed || 6) * (0.5 + Math.random() * 0.7);
		spawnParticle({
			...opts,
			pos,
			color: opts.colors ? opts.colors[(Math.random() * opts.colors.length) | 0] : opts.color,
			vel: new THREE.Vector3(
				Math.cos(a) * s * 0.6,
				(opts.up || 6) * (0.6 + Math.random() * 0.6),
				Math.sin(a) * s * 0.6,
			),
		});
	}
}

const LEAF_COLORS = [0x5cc96b, 0x48b85a, 0x7bd67a, 0x3fa65a];
/**
 * A puff of leaves (with a rustle) around a point.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} n
 */
export function leafBurst(x, z, y, n) {
	for (let i = 0; i < n; i++) {
		spawnParticle({
			pos: new THREE.Vector3(
				x + (Math.random() - 0.5) * 2,
				y + Math.random() * 1.5,
				z + (Math.random() - 0.5) * 2,
			),
			vel: new THREE.Vector3(
				(Math.random() - 0.5) * 5,
				1 + Math.random() * 3,
				(Math.random() - 0.5) * 5,
			),
			color: LEAF_COLORS[i % LEAF_COLORS.length],
			size: 0.22,
			life: 1.8,
			grav: 2.5,
			drag: 1.2,
		});
	}
	audio.rustle();
}
