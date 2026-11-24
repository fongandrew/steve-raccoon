import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { GRAVITY } from './constants.js';
import { narrate, popup } from './hud.js';
import { CRITTER_WORDS, glow, makeCritter } from './models.js';
import { scene, world } from './scene.js';
import { addScore, state, T } from './state.js';
import { wrapAngle } from './util.js';
import { BLOCK, blockCenter, HALF, N, surfaceHeight } from './world.js';

// Citizens: a mix of critters out for a stroll. Most will get out of Steve's
// way, by running or leaping; the slow ones get bounced (gently, cartoonishly).
const SPECIES = {
	// townsfolk
	bear: { n: 2, speed: 1.7, dodge: 0.5, sound: 'oof' },
	fox: { n: 2, speed: 3.6, dodge: 0.85, sound: 'yip' },
	bunnylady: { n: 2, speed: 1.6, dodge: 0.6, sound: 'squeak' },
	frog: { n: 2, speed: 2.4, dodge: 0.7, sound: 'squeak' },
	badger: { n: 2, speed: 1.2, dodge: 0.45, sound: 'oof' },
	mole: { n: 2, speed: 1.9, dodge: 0.6, sound: 'oof' },
	pig: { n: 2, speed: 1.6, dodge: 0.5, sound: 'oof' },
	// pets
	kitten: { n: 2, speed: 2.2, dodge: 0.8, sound: 'meow' },
	puppy: { n: 1, speed: 2.6, dodge: 0.6, sound: 'yip' },
	bunny: { n: 0, speed: 2.4, dodge: 0.9, sound: 'squeak', hop: true },
	squirrel: { n: 2, speed: 3.2, dodge: 0.85, sound: 'squeak' },
	dalmatian: { n: 0, speed: 2.6, dodge: 0.6, sound: 'yip' },
};
export const cats = []; // (all citizens, not just cats; the name stuck)
function addCritter(species, spot) {
	const c = makeCritter(species, Math.random);
	scene.add(c.group);
	const stars = new THREE.Group();
	for (let k = 0; k < 3; k++) {
		const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), glow(0xffd23f, 0.8));
		st.position.set(
			Math.cos((k / 3) * Math.PI * 2) * 0.5,
			0,
			Math.sin((k / 3) * Math.PI * 2) * 0.5,
		);
		stars.add(st);
	}
	stars.position.y = 1.5;
	stars.visible = false;
	c.group.add(stars);
	cats.push({
		...c,
		spec: SPECIES[species],
		spot,
		stars,
		x: 0,
		z: 0,
		y: 0,
		h: 0,
		state: 'walk',
		t: 0,
		vx: 0,
		vz: 0,
		vy: 0,
		spin: 0,
	});
}
for (const [sp, def] of Object.entries(SPECIES))
	for (let i = 0; i < def.n; i++) addCritter(sp, null);
for (const spot of world.critterSpots) addCritter(spot.species, spot);

export function placeCat(cat) {
	if (cat.spot) {
		Object.assign(cat, {
			x: cat.spot.x,
			z: cat.spot.z,
			y: surfaceHeight(cat.spot.x, cat.spot.z),
			h: Math.random() * 6,
			state: 'walk',
			t: 2,
		});
		return;
	}
	const bx = (Math.random() * N) | 0;
	const bz = (Math.random() * N) | 0;
	const side = (Math.random() * 4) | 0;
	const off = (Math.random() - 0.5) * (BLOCK - 4);
	const e = BLOCK / 2 - 0.8;
	const cx = blockCenter(bx);
	const cz = blockCenter(bz);
	const spots = [
		[cx + off, cz + e, Math.PI / 2],
		[cx + off, cz - e, -Math.PI / 2],
		[cx + e, cz + off, 0],
		[cx - e, cz + off, Math.PI],
	];
	const [x, z, h] = spots[side];
	Object.assign(cat, { x, z, y: surfaceHeight(x, z), h, state: 'walk', t: Math.random() * 4 });
	if (Math.hypot(x - T.pos.x, z - T.pos.z) < 30) cat.x += 60 * (x > 0 ? -1 : 1);
}

function catBlocked(x, z) {
	for (const b of world.boxes)
		if (!b.off && x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5)
			return true;
	for (const s of world.circles)
		if (!s.off && Math.hypot(x - s.x, z - s.z) < s.r + 0.5) return true;
	return Math.abs(x) > HALF + 3 || Math.abs(z) > HALF + 3;
}

/** Two-legged townsfolk: stroll, panic-run with flailing arms, wave, get bounced. */
function animateFolk(c, dt, time) {
	const moving = c.state === 'walk' || c.state === 'flee';
	const fleeing = c.state === 'flee';
	c.ph =
		(c.ph || Math.random() * 6) +
		dt * (moving ? (fleeing ? 16 : 7) * Math.max(0.8, c.spec.speed / 2) : 0);
	const k = (v, target, rate = 10) => v + (target - v) * Math.min(1, dt * rate);
	const B = c.body;
	const near = Math.hypot(c.x - T.pos.x, c.z - T.pos.z) < 16 && Math.hypot(T.vel.x, T.vel.z) < 6;
	let legA = 0;
	let armA = 0;
	let armLift = [0, 0];
	let pitch = 0;
	let roll = 0;
	let bob = 0;
	let headYaw = 0;
	const headPitch = 0;
	if (moving) {
		const sw = Math.sin(c.ph);
		legA = sw * (fleeing ? 0.9 : 0.55);
		armA = -sw * (fleeing ? 0.3 : 0.5);
		bob = Math.abs(Math.cos(c.ph)) * (fleeing ? 0.07 : 0.04);
		roll = Math.sin(c.ph) * 0.05;
		if (fleeing) {
			// arms up, flailing, running for it
			armLift = [2.6 + Math.sin(c.ph * 1.7) * 0.5, 2.6 + Math.cos(c.ph * 1.7) * 0.5];
			pitch = 0.2;
		}
	} else if (c.state === 'sit') {
		// standing about; looks around, and waves at Steve when he's nearby and polite
		headYaw = Math.sin(time * 0.6 + c.z) * 0.6;
		if (near) {
			const a = Math.atan2(T.pos.x - c.x, T.pos.z - c.z) - c.vh;
			headYaw = Math.max(-1, Math.min(1, wrapAngle(a)));
			armLift[0] = 2.5;
		}
	} else if (c.state === 'jump' || c.state === 'fly') {
		armLift = [2.8, 2.8];
		legA = 0.6;
		if (c.state === 'fly') roll = Math.sin(time * 25) * 0.4;
	} else if (c.state === 'dazed') {
		headYaw = Math.sin(time * 6) * 0.3;
		roll = Math.sin(time * 6) * 0.15;
	}
	c.legs[0].rotation.x = k(c.legs[0].rotation.x, legA, 18);
	c.legs[1].rotation.x = k(c.legs[1].rotation.x, -legA, 18);
	for (let i = 0; i < 2; i++) {
		const side = i === 0 ? 1 : -1;
		const wave = c.state === 'sit' && near && i === 0 ? Math.sin(time * 12) * 0.35 : 0;
		const swingDir = i === 0 ? armA : -armA;
		c.arms[i].rotation.x = k(c.arms[i].rotation.x, armLift[i] ? -0.2 : swingDir, 14);
		c.arms[i].rotation.z = k(c.arms[i].rotation.z, side * (0.12 + armLift[i]) + wave, 14);
	}
	if (c.state !== 'fly') B.rotation.x = k(B.rotation.x, pitch);
	B.rotation.z = k(B.rotation.z, roll, 14);
	B.position.y = k(B.position.y, c.baseY + bob, 20);
	c.head.rotation.y = k(c.head.rotation.y, headYaw, 5);
	c.head.rotation.x = k(c.head.rotation.x, headPitch, 8);
	c.tail.rotation.z = Math.sin(time * 3 + c.x) * 0.3;
	c.tailSegs.forEach((sg, i) => (sg.rotation.z = Math.sin(time * 2 - i * 0.6) * 0.15));
	c.blinkT = (c.blinkT ?? Math.random() * 3) - dt;
	if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3;
	const closed = c.blinkT < 0 || c.state === 'dazed';
	for (const e of c.eyes) e.scale.y = closed ? 0.15 : 1;
}

/** Pose and animate a critter from its state. */
function animateCritter(c, dt, time) {
	c.vh = c.vh ?? c.h;
	c.vh += wrapAngle(c.h - c.vh) * Math.min(1, dt * (c.state === 'flee' ? 12 : 6)); // turn smoothly
	c.group.position.set(c.x, c.y, c.z);
	c.group.rotation.y = c.vh;
	if (c.biped) return animateFolk(c, dt, time);
	const moving = c.state === 'walk' || c.state === 'flee';
	const fleeing = c.state === 'flee';
	const airborne = c.state === 'jump' || c.state === 'fly';
	c.ph =
		(c.ph || Math.random() * 6) +
		dt * (moving ? (fleeing ? 22 : 11) * (c.spec.speed > 2.9 ? 1.2 : 1) : 0);
	const k = (v, target, rate = 10) => v + (target - v) * Math.min(1, dt * rate);
	const B = c.body;
	let bodyY = c.baseY;
	let pitch = 0;
	let roll = 0;
	let squash = 1;
	const legSwing = [0, 0, 0, 0];
	let headPitch = 0;
	let headYaw = 0;
	let earFlap = 0;

	if (c.spec.hop && moving) {
		// bunny: hop, squash on landing, stretch in the air, back feet kick
		const t = (c.ph * 0.45) % (Math.PI * 2);
		const air = Math.max(0, Math.sin(t));
		bodyY += air * 0.4;
		squash = air > 0.05 ? 1 + air * 0.12 : 0.85;
		pitch = Math.cos(t) * 0.25;
		legSwing[2] = legSwing[3] = -air * 0.9;
		legSwing[0] = legSwing[1] = air * 0.5;
		earFlap = -air * 0.5;
	} else if (moving) {
		// trot: diagonal leg pairs, a little bob and waddle
		const sw = Math.sin(c.ph) * (fleeing ? 0.9 : 0.65);
		legSwing[0] = legSwing[3] = sw;
		legSwing[1] = legSwing[2] = -sw;
		bodyY += Math.abs(Math.cos(c.ph)) * (fleeing ? 0.06 : 0.035);
		roll = Math.sin(c.ph) * 0.06;
		headPitch = Math.cos(c.ph * 2) * 0.06;
		pitch = fleeing ? 0.18 : 0; // lean into it
		earFlap = Math.sin(c.ph * 2) * 0.2 + (fleeing ? -0.4 : 0);
	} else if (c.state === 'sit') {
		// sit back on the haunches and look around
		pitch = -0.35;
		bodyY -= 0.06;
		legSwing[2] = legSwing[3] = -1.2;
		legSwing[0] = legSwing[1] = 0.3;
		headPitch = 0.28;
		headYaw = Math.sin(time * 0.7 + c.z) * 0.6;
		earFlap = Math.sin(time * 5 + c.x) > 0.96 ? 0.3 : 0; // ear twitch
	} else if (airborne) {
		// limbs out, ears up, wheee (or nope)
		legSwing[0] = legSwing[1] = -0.9;
		legSwing[2] = legSwing[3] = 0.9;
		squash = c.state === 'jump' ? 1.12 : 1;
		earFlap = -0.6;
		if (c.state === 'fly') roll = Math.sin(time * 30) * 0.3;
	} else if (c.state === 'dazed') {
		headYaw = Math.sin(time * 6) * 0.25;
		roll = Math.sin(time * 6) * 0.12;
		pitch = -0.1;
	}
	if (c.state !== 'fly') B.rotation.x = k(B.rotation.x, pitch);
	B.rotation.z = k(B.rotation.z, roll, 14);
	B.position.y = k(B.position.y, bodyY, 20);
	B.scale.set(1 / Math.sqrt(squash), k(B.scale.y, squash, 18), 1 / Math.sqrt(squash));
	c.legs.forEach((l, i) => (l.rotation.x = k(l.rotation.x, legSwing[i], 16)));
	c.head.rotation.x = k(c.head.rotation.x, headPitch, 8);
	c.head.rotation.y = k(c.head.rotation.y, headYaw, 4);
	c.ears.forEach((e) => (e.rotation.x = k(e.rotation.x, earFlap, 10)));
	// tail: wag (fast for happy dogs, swishy for cats), sway for the rest
	const wagRate =
		c.species === 'puppy' || c.species === 'dalmatian' ? 18 : c.species === 'kitten' ? 3 : 2;
	const wagAmt = c.species === 'puppy' || c.species === 'dalmatian' ? 0.5 : 0.25;
	c.tail.rotation.z = Math.sin(time * wagRate + c.x) * wagAmt;
	c.tailSegs.forEach(
		(sg, i) => (sg.rotation.z = Math.sin(time * wagRate * 0.6 - i * 0.6 + c.z) * 0.12),
	);
	// blink every few seconds
	c.blinkT = (c.blinkT ?? Math.random() * 3) - dt;
	if (c.blinkT < -0.12) c.blinkT = 2 + Math.random() * 3;
	const closed = c.blinkT < 0 || c.state === 'dazed';
	for (const e of c.eyes) e.scale.y = closed ? 0.15 : 1;
}

function critterSound(c) {
	const snd = c.spec.sound;
	if (snd === 'meow') audio.meow();
	else if (snd === 'yip') audio.yip();
	else if (snd === 'huff') audio.huff();
	else if (snd === 'oof') audio.oof();
	else audio.squeak();
}

/** Leap sideways out of the truck's path. */
export function scareCat(c, strength = 1) {
	if (c.state === 'fly' || c.state === 'jump' || c.state === 'dazed') return;
	const dx = c.x - T.pos.x;
	const dz = c.z - T.pos.z;
	const fx = Math.sin(T.heading);
	const fz = Math.cos(T.heading);
	let sx = -fz;
	let sz = fx;
	if (sx * dx + sz * dz < 0) {
		sx = -sx;
		sz = -sz;
	}
	c.state = 'jump';
	c.vx = sx * 9 * strength;
	c.vz = sz * 9 * strength;
	c.vy = 9;
	c.h = Math.atan2(sx, sz);
	if (Math.random() < 0.5)
		popup(['nope!', 'eep!', '!!!', 'yikes!'][(Math.random() * 4) | 0], c.group.position, 'fun');
}

export function updateCats(dt, time) {
	const speed = Math.hypot(T.vel.x, T.vel.z);
	const fx = Math.sin(T.heading);
	const fz = Math.cos(T.heading);
	for (const c of cats) {
		c.t -= dt;
		const dx = c.x - T.pos.x;
		const dz = c.z - T.pos.z;
		const dist = Math.hypot(dx, dz);
		// How squarely the truck is bearing down on this critter
		const approaching = (dx * T.vel.x + dz * T.vel.z) / ((dist || 1) * (speed || 1));
		const lateral = Math.abs(dx * -fz + dz * fx); // distance from the truck's path
		const ground = c.state === 'walk' || c.state === 'sit' || c.state === 'flee';
		if (ground) {
			// Truck coming? Scurry sideways out of its path.
			if (
				c.state !== 'flee' &&
				dist < 18 &&
				speed > 5 &&
				approaching > 0.6 &&
				lateral < 4 &&
				T.y < 1
			) {
				c.state = 'flee';
				c.t = 1.4;
				let sx = -fz;
				let sz = fx;
				if (sx * dx + sz * dz < 0) {
					sx = -sx;
					sz = -sz;
				}
				c.h = Math.atan2(sx, sz);
				c.dodgeRoll = Math.random() < c.spec.dodge;
			}
			if (c.state === 'flee') {
				if (c.t <= 0) c.state = 'walk';
				if (dist < 7 && speed > 5 && approaching > 0.5 && c.dodgeRoll) scareCat(c);
			} else if (c.t <= 0) {
				if (c.state === 'walk' && Math.random() < 0.35) {
					c.state = 'sit';
					c.t = 2 + Math.random() * 3;
				} else {
					c.state = 'walk';
					c.h += (Math.random() - 0.5) * 2.5;
					c.t = 2 + Math.random() * 4;
				}
			}
			if (c.state === 'walk' || c.state === 'flee') {
				const v = c.spec.speed * (c.state === 'flee' ? 2.6 : 1);
				const nx = c.x + Math.sin(c.h) * v * dt;
				const nz = c.z + Math.cos(c.h) * v * dt;
				if (catBlocked(nx, nz)) c.h += Math.PI * (0.5 + Math.random());
				else {
					c.x = nx;
					c.z = nz;
					c.y = surfaceHeight(nx, nz);
				}
			}
			// Bounced!
			if (dist < 3.4 && T.y < 1.5 && c.state !== 'jump') {
				for (const off of [1.9, -1.9]) {
					const d = Math.hypot(c.x - (T.pos.x + fx * off), c.z - (T.pos.z + fz * off));
					if (d < 2.1) {
						if (speed > 3) {
							c.state = 'fly';
							const k = c.species === 'hedgehog' ? 1.4 : 1; // hedgehogs curl up and really go
							c.vx = (T.vel.x * 0.8 + dx * 1.5) * k;
							c.vz = (T.vel.z * 0.8 + dz * 1.5) * k;
							c.vy = 11 * k;
							c.spin = 14;
							critterSound(c);
							if (state.mode === 'playing') {
								addScore(-5);
								state.stats.cats++;
								const words = CRITTER_WORDS[c.species];
								popup(
									`${words[(Math.random() * words.length) | 0]} -5`,
									c.group.position.clone(),
									'bad',
								);
								if (state.stats.cats === 1) narrate('critter', 1, true);
								else narrate('critter', 0.3);
							}
						} else {
							c.x += dx * 0.1;
							c.z += dz * 0.1;
						}
						break;
					}
				}
			}
		} else if (c.state === 'jump' || c.state === 'fly') {
			c.vy -= GRAVITY * 0.8 * dt;
			const nx = c.x + c.vx * dt;
			const nz = c.z + c.vz * dt;
			if (!catBlocked(nx, nz)) {
				c.x = nx;
				c.z = nz;
			} else {
				c.vx *= -0.4;
				c.vz *= -0.4;
			}
			c.y += c.vy * dt;
			if (c.state === 'fly') c.body.rotation.x += c.spin * dt;
			const floor = surfaceHeight(c.x, c.z);
			if (c.y <= floor) {
				c.y = floor;
				c.body.rotation.x = 0;
				if (c.state === 'fly') {
					c.state = 'dazed';
					c.t = 2.5;
					c.stars.visible = true;
				} else {
					c.state = 'walk';
					c.t = 1 + Math.random() * 2;
				}
			}
		} else if (c.state === 'dazed') {
			c.stars.rotation.y += dt * 5;
			if (c.t <= 0) {
				c.state = 'walk';
				c.stars.visible = false;
				c.h += Math.PI;
				c.t = 3;
			}
		}
		animateCritter(c, dt, time);
	}
}
