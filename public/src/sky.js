// Sky dome, sun and hemisphere light, clouds and horizon hills, the day-to-dusk
// colour cycle, and ambient motion (flags, fountains, seagulls, ducks).
import * as THREE from '../vendor/three.module.js';
import { makeCloud, nightMats } from './models.js';
import { spawnParticle } from './particles.js';
import { camera, scene, skyColor, SMALL_DEVICE, world } from './scene.js';
import { T } from './state.js';
import { LAWN_Y, rng } from './world.js';

const tmpV = new THREE.Vector3();

// Gradient sky dome with a soft sun
const skyUniforms = {
	top: { value: new THREE.Color(0x5fb4f2) },
	horizon: { value: skyColor },
	sunDir: { value: new THREE.Vector3(0, 1, 0) },
	sunCol: { value: new THREE.Color(0xfff2c8) },
};
const sky = new THREE.Mesh(
	new THREE.SphereGeometry(700, 32, 16),
	new THREE.ShaderMaterial({
		uniforms: skyUniforms,
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
		vertexShader: `varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
		fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, top, smoothstep(0.0, 0.5, d.y));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (smoothstep(0.9985, 0.9992, s) * 0.9 + pow(s, 14.0) * 0.22);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
	}),
);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// Puffy clouds drifting overhead and low hills on the horizon. These use
// unlit materials with baked "faux light" vertex colors so they don't pick up
// the green bounce light from the ground.
/**
 * @param {THREE.BufferGeometry} geo
 * @param {number} lo brightness facing away from the light
 * @param {number} hi brightness facing it
 */
function fauxShade(geo, lo, hi) {
	const n = /** @type {THREE.BufferAttribute} */ (geo.attributes.normal);
	const col = new Float32Array(n.count * 3);
	const L = new THREE.Vector3(0.4, 1, 0.3).normalize();
	for (let i = 0; i < n.count; i++) {
		const k = lo + (hi - lo) * Math.max(0, n.getX(i) * L.x + n.getY(i) * L.y + n.getZ(i) * L.z);
		col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
const clouds = new THREE.Group();
{
	const r = rng(99);
	for (let i = 0; i < 16; i++) {
		const c = makeCloud(r, cloudMat);
		c.traverse((o) => {
			const m = /** @type {THREE.Mesh} */ (o);
			return m.isMesh && fauxShade(m.geometry, 0.86, 1.0);
		});
		const a = (i / 16) * Math.PI * 2 + r() * 0.3;
		const d = 140 + r() * 260;
		c.position.set(Math.cos(a) * d, 70 + r() * 50, Math.sin(a) * d);
		c.rotation.y = r() * 6;
		c.scale.setScalar(0.9 + r() * 0.8);
		clouds.add(c);
	}
}
scene.add(clouds);
const hillMat = new THREE.MeshBasicMaterial({ color: 0x79c46a, vertexColors: true, fog: false });
const hillBase = new THREE.Color(0x6fbf62);
{
	const r = rng(7);
	for (let i = 0; i < 30; i++) {
		const a = (i / 30) * Math.PI * 2 + r() * 0.2;
		const d = 430 + r() * 60;
		const geo = new THREE.IcosahedronGeometry(1, 1);
		fauxShade(geo, 0.78, 1.0);
		const hill = new THREE.Mesh(geo, hillMat);
		hill.scale.set(60 + r() * 60, 18 + r() * 24, 60 + r() * 60);
		hill.position.set(Math.cos(a) * d, -6, Math.sin(a) * d);
		hill.rotation.y = r() * 6;
		scene.add(hill);
	}
}

const hemi = new THREE.HemisphereLight(0xffffff, 0x9cc27a, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(SMALL_DEVICE ? 2048 : 4096, SMALL_DEVICE ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 260 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

/** @typedef {[number, THREE.Color, THREE.Color, THREE.Color, number]} SkyKey */

// [t, sky top, horizon, sunlight color, sun intensity]
const SKY_KEYS = /** @type {SkyKey[]} */ (
	[
		[0, 0x7fb6e8, 0xffd2a8, 0xffd8b0, 1.5],
		[0.15, 0x5aaeef, 0xc4e6fb, 0xfff6e6, 2.2],
		[0.6, 0x4ea6ec, 0xbfe3fa, 0xffffff, 2.3],
		[0.82, 0x6f9fd8, 0xffcf9f, 0xffd9a8, 1.9],
		[1, 0x6a6fb8, 0xff9e7a, 0xff9f70, 1.25],
	].map(([t, top, hor, light, k]) => [
		t,
		new THREE.Color(top),
		new THREE.Color(hor),
		new THREE.Color(light),
		k,
	])
);
const sunCol = new THREE.Color();
const topCol = new THREE.Color();
const cloudDay = new THREE.Color(0xffffff);
const cloudDusk = new THREE.Color(0xffc6b0);

/** @param {number} t how far through the day, 0 (dawn) to 1 (dusk) */
export function updateSky(t) {
	let i = 0;
	while (i < SKY_KEYS.length - 2 && t > /** @type {SkyKey} */ (SKY_KEYS[i + 1])[0]) i++;
	const [t0, top0, hor0, l0, k0] = /** @type {SkyKey} */ (SKY_KEYS[i]);
	const [t1, top1, hor1, l1, k1] = /** @type {SkyKey} */ (SKY_KEYS[i + 1]);
	const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
	skyColor.copy(hor0).lerp(hor1, f);
	topCol.copy(top0).lerp(top1, f);
	skyUniforms.top.value.copy(topCol);
	/** @type {THREE.Fog} */ (scene.fog).color.copy(skyColor);
	sunCol.copy(l0).lerp(l1, f);
	sun.color.copy(sunCol);
	sun.intensity = k0 + (k1 - k0) * f;
	hemi.color.copy(topCol).lerp(new THREE.Color(0xffffff), 0.6);
	// sun arcs from east to west
	const a = Math.PI * (0.12 + 0.76 * t);
	const dir = tmpV.set(Math.cos(a) * 0.8, Math.sin(a) * 0.9 + 0.25, 0.45).normalize();
	skyUniforms.sunDir.value.copy(dir);
	skyUniforms.sunCol.value.copy(sunCol);
	sun.position.set(T.pos.x + dir.x * 120, dir.y * 120, T.pos.z + dir.z * 120);
	sun.target.position.set(T.pos.x, 0, T.pos.z);
	sky.position.copy(camera.position);
	// Distant scenery picks up the haze; clouds blush at sunset
	hillMat.color.copy(hillBase).lerp(topCol, 0.25).lerp(skyColor, 0.25);
	const dusk = Math.max(0, Math.min(1, (t - 0.7) / 0.3));
	cloudMat.color.copy(cloudDay).lerp(cloudDusk, dusk);
	// Windows and street lamps switch on as evening comes
	const night = Math.max(0, Math.min(1, (t - 0.72) / 0.22));
	nightMats.windows.emissiveIntensity = night * 0.85;
	nightMats.lamps.emissiveIntensity = 0.15 + night * 1.5;
}

let fountainT = 0;
/**
 * @param {number} dt
 * @param {number} time seconds since boot
 */
export function updateAmbient(dt, time) {
	for (const f of world.flags) f.rotation.y = Math.sin(time * 1.7) * 0.35;
	clouds.rotation.y = time * 0.004;
	fountainT -= dt;
	if (fountainT <= 0) {
		fountainT = 0.05;
		for (const f of world.fountains) {
			if (Math.hypot(f.x - camera.position.x, f.z - camera.position.z) > 110) continue;
			const a = Math.random() * Math.PI * 2;
			spawnParticle({
				pos: tmpV.set(f.x + Math.cos(a) * 1.4, f.y, f.z + Math.sin(a) * 1.4),
				vel: new THREE.Vector3(Math.cos(a) * 2.2, 3 + Math.random(), Math.sin(a) * 2.2),
				color: Math.random() < 0.5 ? 0x8fd3ff : 0xd4f1ff,
				size: 0.2,
				life: 0.75,
				grav: 12,
				sphere: true,
				alpha: 0.8,
			});
		}
	}
	for (const g of world.seagulls) {
		const u = g.group.userData;
		const a = time * u.speed + u.phase;
		g.group.position.set(
			u.cx + Math.cos(a) * u.r,
			u.h + Math.sin(time * 1.3 + u.phase) * 0.6,
			u.cz + Math.sin(a) * u.r,
		);
		g.group.rotation.y = -a;
		g.group.rotation.z = 0.25;
		const flap = Math.sin(time * 10 + u.phase) * 0.5;
		/** @type {THREE.Group} */ (g.wings[0]).rotation.z = flap;
		/** @type {THREE.Group} */ (g.wings[1]).rotation.z = -flap;
	}
	for (const d of world.ducks || []) {
		const u = d.userData.duck;
		const a = time * 0.4;
		d.position.set(
			u.cx + Math.cos(a) * 2.2,
			LAWN_Y + 0.1 + Math.sin(time * 3) * 0.05,
			u.cz + Math.sin(a) * 2.2,
		);
		d.rotation.y = -a;
	}
}
