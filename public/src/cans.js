import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { CAPACITY, TRASH_COLORS } from './constants.js';
import { narrate, popup, toast } from './hud.js';
import { burst, spawnParticle } from './particles.js';
import { scene, truck, world } from './scene.js';
import { addScore, state, T } from './state.js';
import { cap, ease, timeline } from './util.js';
import { WALK_Y } from './world.js';

export function spawnCan(silent = false) {
	const candidates = world.houses.filter(
		(h) =>
			h.state === 'idle' &&
			h.cooldown <= 0 &&
			Math.hypot(h.canX - T.pos.x, h.canZ - T.pos.z) > 30,
	);
	if (!candidates.length) return;
	const h = candidates[(Math.random() * candidates.length) | 0];
	h.state = 'out';
	h.golden = false; // golden cans retired; the big prizes are dumpsters now
	const can = h.golden ? h.goldCan : h.can;
	can.group.visible = true;
	can.group.position.set(h.canX, 0.2, h.canZ);
	can.group.rotation.set(0, Math.random() * 6, 0);
	can.lid.rotation.set(0, 0, 0);
	(h.golden ? h.goldMarker : h.marker).group.visible = true;
	if (!silent) {
		if (h.golden) toast(`✨ ${cap(h.name)} on ${h.street} put out a GOLDEN can! ✨`);
		else if (Math.random() < 0.3) toast(`${cap(h.name)} on ${h.street} put their trash out.`);
	}
}

export function canFor(h) {
	return h.golden ? h.goldCan : h.can;
}

// ---------------------------------------------------------------------------
// Grabber arm: a side-loader with a telescoping boom (ext), a lever that
// swings from hanging straight down (lift = 0) up around the outside and over
// the hopper (lift = LIFT_MAX), and a wrist that sets the can's tilt (tilt = 0
// keeps it upright, DUMP_TILT tips it into the hopper).
// ---------------------------------------------------------------------------
export const ARMS = truck.arms;
const ARM = ARMS[0]; // shared dimensions
const LIFT_MAX = (210 * Math.PI) / 180;
const DUMP_TILT = (-150 * Math.PI) / 180;
const REST = { ext: 0, yaw: 0, lift: 0, tilt: 0 };
for (const a of ARMS) a.pose = { ...REST, close: 0 };
const armTmp = new THREE.Vector3();

/** Boom extension + yaw needed to hold a can whose base is at world point p. */
export function canToArm(arm, p) {
	arm.base.worldToLocal(armTmp.copy(p));
	// undo the base's own yaw so we get the yaw needed to face the can
	const c = Math.cos(arm.base.rotation.y);
	const sn = Math.sin(arm.base.rotation.y);
	const x = armTmp.x * c + armTmp.z * sn;
	const z = -armTmp.x * sn + armTmp.z * c;
	const horiz = Math.hypot(x, z);
	return { ext: horiz - ARM.GRIP, yaw: Math.atan2(z, -x), side: -x };
}

function applyArm(arm, pose) {
	const ext = Math.max(0, Math.min(arm.MAX_EXT, pose.ext));
	arm.base.rotation.y = pose.yaw;
	arm.boom.scale.x = Math.max(0.01, ext);
	arm.slide.position.x = -ext;
	arm.lever.rotation.z = -pose.lift;
	arm.wrist.rotation.z = pose.tilt + pose.lift; // tilt is relative to the truck, not the lever
	for (const f of arm.fingers) f.rotation.y = f.userData.side * (0.55 - pose.close * 0.62);
}

const lerpPose = (a, b, k) => ({
	ext: a.ext + (b.ext - a.ext) * k,
	yaw: a.yaw + (b.yaw - a.yaw) * k,
	lift: a.lift + (b.lift - a.lift) * k,
	tilt: a.tilt + (b.tilt - a.tilt) * k,
});
/** Lift pose for 0..1 along the swing; the can stays upright until it clears the rim. */
const swing = (k) => {
	const lift = LIFT_MAX * k;
	const tip = Math.max(0, Math.min(1, (k - 0.6) / 0.4));
	return { ext: 0, yaw: 0, lift, tilt: DUMP_TILT * ease(tip) };
};

export function startGrab(h, arm) {
	h.state = 'grabbing';
	h.marker.group.visible = false;
	h.goldMarker.group.visible = false;
	const can = canFor(h);
	can.group.position.y = WALK_Y; // stop fidgeting, you're being picked up
	can.group.rotation.z = 0;
	const g = {
		h,
		arm,
		t: 0,
		added: false,
		attached: false,
		released: false,
		hold: true,
		home: can.group.position.clone(),
		rotY: can.group.rotation.y,
	};
	// Grabbing on both sides at nearly the same time is a double grab
	const other = state.grabs.find((o) => o.arm !== arm);
	if (other && other.t < 0.6) {
		addScore(25);
		popup('DOUBLE GRAB! +25', truck.group.position, 'gold', 5);
		audio.golden();
		state.stats.doubles++;
	}
	state.grabs.push(g);
	audio.grab();
}

// Timeline (seconds). The truck holds still until the can is back down.
const GRAB = timeline({
	reach: 0.45,
	grip: 0.12,
	pull: 0.3,
	lift: 0.5,
	dump: 0.45,
	lower: 0.45,
	push: 0.3,
	release: 0.12,
	retract: 0.3,
});
for (const a of ARMS) applyArm(a, a.pose);

export function updateGrabs(dt) {
	truck.body.updateMatrixWorld(true);
	for (const arm of ARMS) {
		if (state.grabs.some((g) => g.arm === arm)) continue;
		const k = 1 - Math.exp(-10 * dt);
		Object.assign(arm.pose, lerpPose(arm.pose, REST, k));
		arm.pose.close += (0 - arm.pose.close) * k;
		applyArm(arm, arm.pose);
	}
	for (const g of [...state.grabs]) updateGrab(g, dt);
}

function updateGrab(g, dt) {
	const arm = g.arm;
	g.t += dt;
	const t = g.t;
	const can = canFor(g.h);
	const grabPose = { ...canToArm(arm, g.home), lift: 0, tilt: 0 };
	const carry = { ...REST };
	let pose;
	let close = 0;
	if (t < GRAB.end.reach) {
		pose = lerpPose(REST, grabPose, ease(GRAB.phase(t, 'reach')));
	} else if (t < GRAB.end.grip) {
		pose = grabPose;
		close = ease(GRAB.phase(t, 'grip'));
	} else if (t < GRAB.end.dump) {
		if (!g.attached) {
			g.attached = true;
			arm.gripper.attach(can.group);
		}
		close = 1;
		if (t < GRAB.end.pull) pose = lerpPose(grabPose, carry, ease(GRAB.phase(t, 'pull')));
		else if (t < GRAB.end.lift) pose = swing(ease(GRAB.phase(t, 'lift')));
		else {
			// Shake it out
			const k = GRAB.phase(t, 'dump');
			pose = swing(1);
			pose.tilt += Math.sin(k * Math.PI * 6) * 0.12 * (1 - k);
			can.lid.rotation.x = -1.9 * Math.min(1, k * 4);
			if (Math.random() < 0.7) {
				const mouth = can.group.localToWorld(armTmp.set(0, 1.3, 0));
				spawnParticle({
					pos: mouth.clone(),
					vel: new THREE.Vector3(
						(Math.random() - 0.5) * 1.5,
						-3,
						(Math.random() - 0.5) * 1.5,
					),
					color: TRASH_COLORS[(Math.random() * TRASH_COLORS.length) | 0],
					size: 0.22 + Math.random() * 0.15,
					life: 0.35,
					grav: 20,
				});
			}
			if (!g.added && k > 0.35) {
				g.added = true;
				collectBags(g.h);
			}
		}
	} else if (t < GRAB.end.push) {
		close = 1;
		if (t < GRAB.end.lower) {
			pose = swing(1 - ease(GRAB.phase(t, 'lower')));
			can.lid.rotation.x = -1.9 + 1.3 * GRAB.phase(t, 'lower');
		} else pose = lerpPose(carry, grabPose, ease(GRAB.phase(t, 'push')));
	} else if (t < GRAB.end.release) {
		pose = grabPose;
		close = 1 - ease(GRAB.phase(t, 'release'));
		if (!g.released) {
			g.released = true;
			scene.attach(can.group);
			can.group.position.copy(g.home);
			can.group.rotation.set(0, g.rotY, 0);
			can.group.scale.set(1, 1, 1);
			can.lid.rotation.x = -0.6; // left ajar, as is tradition
		}
	} else if (t < GRAB.end.retract) {
		pose = lerpPose(grabPose, REST, ease(GRAB.phase(t, 'retract')));
	} else {
		g.h.state = 'done';
		g.h.hideT = 4;
		state.grabs.splice(state.grabs.indexOf(g), 1);
		Object.assign(arm.pose, REST, { close: 0 });
		applyArm(arm, arm.pose);
		return;
	}
	g.hold = t < GRAB.end.release;
	Object.assign(arm.pose, pose, { close });
	applyArm(arm, arm.pose);
}

function collectBags(h) {
	const n = h.golden ? 5 : 1 + ((Math.random() * 3) | 0);
	const got = Math.min(n, CAPACITY - state.load);
	state.load += got;
	state.stats.cans++;
	state.stats.bags += got;
	const pos = truck.group.position;
	if (state.time - state.lastCollect < 14) state.streak++;
	else state.streak = 1;
	state.lastCollect = state.time;
	let pts = 5;
	if (state.streak > 1) pts += 5 * (state.streak - 1);
	if (h.golden) {
		pts += 50;
		state.stats.golden++;
		audio.golden();
		popup(`GOLDEN! +${got} bags`, pos, 'gold', 4);
		burst(pos.clone().add(new THREE.Vector3(0, 4, 0)), 25, {
			colors: [0xffd23f, 0xffffff, 0xffb300],
			size: 0.25,
			life: 1,
			grav: 12,
			speed: 10,
			up: 9,
		});
	} else {
		audio.collect(got);
		popup(`+${got} bag${got > 1 ? 's' : ''}`, pos, 'good', 4);
	}
	addScore(pts);
	if (state.streak > 1) {
		setTimeout(() => popup(`STREAK x${state.streak}!`, truck.group.position, 'fun', 2), 250);
	}
	if (got < n) toast("Truck's stuffed! Some trash fell on the lawn. Oops.");
	else if (state.load < CAPACITY) narrate('pickup', 0.25);
	if (state.load >= CAPACITY) toast('🚛 Truck is FULL! Head to The Dump (orange on the map).');
}
