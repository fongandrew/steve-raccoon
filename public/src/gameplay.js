// Per-frame shift rules: actions, can pickups, unloading at the dump, hunger and snacks.
import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { ARMS, canFor, grabSpot, spawnCan, startGrab, updateGrabs } from './cans.js';
import { ACTIVE_CANS, CAPACITY, GRAB_SPEED, PRACTICE_HUNGER, SHIFT, SNACKS } from './constants.js';
import { cats, scareCat } from './critters.js';
import { geese } from './geese.js';
import { narrate, popup, toast } from './hud.js';
import { pressed } from './input.js';
import { updateBins } from './loader.js';
import { launchBagToPile } from './pile.js';
import { truck, world } from './scene.js';
import { endShift } from './shift.js';
import { addScore, state, T } from './state.js';
import { updateTreasures } from './treasures.js';
import { unstick } from './truck.js';
import { WALK_Y } from './world.js';

const tmpV = new THREE.Vector3();

/** @param {number} dt */
export function updateGameplay(dt) {
	state.time += dt;
	const pos = truck.group.position;
	const speed = Math.hypot(T.vel.x, T.vel.z);

	// Edge-triggered actions
	if (pressed.has('honk') && state.honkCd <= 0) {
		state.honkCd = 0.7;
		audio.honk();
		popup('HONK!', truck.group.position, 'fun', 4);
		for (const c of cats) if (Math.hypot(c.x - T.pos.x, c.z - T.pos.z) < 24) scareCat(c, 1.1);
		// The geese honk back. Of course they do.
		for (const g of geese)
			if (Math.hypot(g.x - T.pos.x, g.z - T.pos.z) < 30) g.replyT = 0.3 + Math.random() * 0.5;
		narrate('honk', 0.25);
	}
	if (pressed.has('snack')) snack();
	if (pressed.has('reset')) unstick();

	state.honkCd -= dt;
	state.snackCd -= dt;
	state.chompT = Math.max(0, state.chompT - dt);
	state.celebrateT = Math.max(0, state.celebrateT - dt);

	// Hunger
	const wasHangry = state.hangry;
	// In practice Steve gets peckish enough to snack, but never hangry
	state.hunger = Math.max(state.practice ? PRACTICE_HUNGER : 0, state.hunger - dt * 1.45);
	state.hangry = state.hunger <= 0;
	if (state.hangry && !wasHangry) {
		toast(
			`😾 STEVE IS HANGRY. Steering is now more of a suggestion. ${document.body.classList.contains('touch') ? 'Tap his face' : 'Press E'} to snack!`,
			4,
		);
		audio.burp();
	}

	if (state.boostT > 0) state.boostT -= dt;
	updateTreasures(dt);

	// Snack effects
	if (state.zoomT > 0) {
		state.zoomT -= dt;
		if (state.zoomT <= 0) toast('The coffee wore off. Steve is just a raccoon again.');
	}
	if (state.hicT > 0) {
		state.hicT -= dt;
		state.hicNext -= dt;
		if (state.hicNext <= 0) {
			state.hicNext = 0.7 + Math.random() * 0.4;
			if (T.grounded) {
				T.grounded = false;
				T.vy = 6;
				T.airTime = -1; // hiccups don't count as air time
				audio.hiccup();
				popup('hic!', pos, 'fun');
			}
		}
	}

	// Cans: spawning, markers, grabbing
	state.spawnT -= dt;
	const outCount = world.houses.filter((h) => h.state === 'out').length;
	if (outCount < ACTIVE_CANS && state.spawnT <= 0) {
		spawnCan();
		state.spawnT = 2;
	}
	for (const h of world.houses) {
		if (h.cooldown > 0) h.cooldown -= dt;
		if (h.state === 'out') {
			const m = h.golden ? h.goldMarker : h.marker;
			m.arrow.position.y = 3 + Math.sin(state.time * 4 + h.x) * 0.3;
			m.arrow.rotation.y += dt * 3;
			m.ring.scale.setScalar(1 + Math.sin(state.time * 5) * 0.08);
			// Full cans get nervous when the truck is near
			const cg = canFor(h).group;
			const near = Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z) < 22;
			const ph = h.x * 0.7;
			cg.position.y = WALK_Y + (near ? Math.abs(Math.sin(state.time * 9 + ph)) * 0.28 : 0);
			cg.rotation.z = near ? Math.sin(state.time * 18 + ph) * 0.07 : 0;
			if (T.grounded && Math.abs(T.fwd) < GRAB_SPEED) {
				const d = Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z);
				// Whichever free claw can get to the can most easily takes it
				let arm = null;
				let spot = null;
				if (d < 10) {
					for (const a of ARMS) {
						if (state.grabs.some((g) => g.arm === a)) continue;
						const r = grabSpot(a, canFor(h).group.position);
						if (r && (!spot || r.moved < spot.moved)) {
							arm = a;
							spot = r;
						}
					}
				}
				if (arm) {
					if (state.load >= CAPACITY) {
						if (!h.fullWarned) {
							h.fullWarned = true;
							popup('TRUCK FULL!', pos, 'bad');
							toast('No room! Empty the truck at The Dump first.');
						}
					} else startGrab(h, arm, spot?.point);
				} else if (d > 10) h.fullWarned = false;
			}
		} else if (h.state === 'done') {
			h.hideT -= dt;
			if (h.hideT <= 0) {
				canFor(h).group.visible = false;
				h.state = 'idle';
				h.cooldown = 20 + Math.random() * 20;
			}
		}
	}
	updateGrabs(dt);
	updateBins(dt);

	// Dump
	const dd = Math.hypot(world.dump.x - T.pos.x, world.dump.z - T.pos.z);
	world.dump.padRing.scale.setScalar(1 + Math.sin(state.time * 4) * 0.04);
	if (dd < world.dump.r && speed < 8 && T.grounded) {
		if (!state.dumping && state.load > 0) {
			state.dumping = { start: state.load, n: 0, tick: 0 };
			narrate('dump', 1, true);
		}
	}
	if (state.dumping) {
		const D = state.dumping;
		D.tick -= dt;
		const inZone = dd < world.dump.r + 1;
		if (inZone && state.load > 0 && D.tick <= 0) {
			D.tick = 0.13;
			state.load--;
			D.n++;
			state.stats.dumped++;
			addScore(10);
			audio.dumpTick();
			launchBagToPile(truck.group.localToWorld(tmpV.copy(truck.rearLocal)));
		}
		if (state.load === 0 || !inZone) {
			let bonus = 0;
			let label = '';
			if (D.start >= CAPACITY && D.n >= CAPACITY) {
				bonus = 100;
				label = 'FULL LOAD BONUS!';
			} else if (D.n >= 8) {
				bonus = 30;
				label = 'Big load bonus!';
			}
			if (D.n > 0) {
				state.stats.loads++;
				addScore(bonus);
				audio.cash();
				state.celebrateT = 1.2;
				popup(
					`+${D.n * 10 + bonus}${bonus ? ' ' + label : ''}`,
					truck.group.position,
					bonus >= 100 ? 'gold' : 'good',
					3,
				);
				if (bonus >= 100) audio.fanfare();
			}
			state.dumping = null;
		}
	}

	// Standing around too long earns commentary
	state.idleT = speed < 1 && !state.dumping && !state.grabs.length ? (state.idleT || 0) + dt : 0;
	if (state.idleT > 7) {
		state.idleT = -20;
		narrate('idle', 1, true);
	}

	// Reverse beeper
	if (T.fwd < -0.5) {
		state.beepT -= dt;
		if (state.beepT <= 0) {
			state.beepT = 0.45;
			audio.beep();
		}
	}

	// Quips
	state.quipT -= dt;
	if (state.quipT <= 0) {
		state.quipT = 22 + Math.random() * 15;
		narrate('ambient');
	}

	// Time
	if (state.practice) return; // no clock: drive as long as you like
	const left = SHIFT - state.time;
	if (!state.warned && left < 30) {
		state.warned = true;
		state.goldenHour = true;
		toast('🌇 GOLDEN HOUR! 30 seconds left and every point counts DOUBLE!', 4);
		audio.fanfare();
	}
	if (left <= 0) endShift();
}

function snack() {
	if (state.snackCd > 0) return;
	if (state.load <= 0) {
		toast('Nothing in the truck to snack on! Steve pats his empty tummy.');
		state.snackCd = 1;
		return;
	}
	if (state.hunger > 92) {
		popup('not hungry', truck.group.position, 'fun');
		state.snackCd = 0.6;
		return;
	}
	state.snackCd = 1.2;
	state.load--;
	state.stats.snacks++;
	const s = /** @type {(typeof SNACKS)[number]} */ (SNACKS[(Math.random() * SNACKS.length) | 0]);
	state.hunger = Math.min(100, state.hunger + s.h);
	state.chompT = 1;
	audio.chomp();
	toast(`🍽️ ${s.msg}`);
	popup('CHOMP!', truck.group.position, 'good', 2);
	if (s.fx === 'zoom') state.zoomT = 7;
	if (s.fx === 'hiccups') {
		state.hicT = 5;
		state.hicNext = 0.5;
	}
	if (state.hunger >= 100)
		setTimeout(() => {
			audio.burp();
			popup('*BURP*', truck.group.position, 'fun');
		}, 1100);
}
