import * as THREE from '../vendor/three.module.js';
import { audio } from './audio.js';
import { CAPACITY, DUMPSTER_BAGS, TRASH_COLORS } from './constants.js';
import { narrate, popup, toast } from './hud.js';
import { spawnParticle } from './particles.js';
import { scene, truck, world } from './scene.js';
import { addScore, state, T } from './state.js';
import { ease } from './util.js';

const armTmp = new THREE.Vector3();

const LOADER = truck.loader;
const LREST = { r: -0.14, L: 2.3, tilt: -0.05 }; // tucked over the cab, forks folded up
const LTOP = { r: -1.78, L: 4.4, tilt: -2.4 };
const loaderPose = { ...LREST };

function applyLoader(p) {
	LOADER.pivot.rotation.x = p.r;
	for (const s of LOADER.sliders) s.scale.z = Math.max(0.01, p.L - LOADER.sliderStart);
	LOADER.forks.position.z = p.L;
	LOADER.forks.rotation.x = p.tilt - p.r;
}
applyLoader(loaderPose);

const lerpL = (a, b, k) => ({
	r: a.r + (b.r - a.r) * k,
	L: a.L + (b.L - a.L) * k,
	tilt: a.tilt + (b.tilt - a.tilt) * k,
});

/** Loader pose that puts the forks into the sleeves of a dumpster at world point p. */
function binToLoader(p) {
	truck.body.worldToLocal(armTmp.copy(p));
	armTmp.y += 0.95;
	armTmp.z -= 0.65;
	armTmp.x = 0;
	armTmp.sub(LOADER.P);
	return {
		r: Math.atan2(-armTmp.y, armTmp.z),
		L: Math.min(6.8, Math.max(3, armTmp.length())),
		tilt: 0,
	};
}
const loaderSwing = (from, k) => ({
	r: from.r + (LTOP.r - from.r) * k,
	L: from.L + (LTOP.L - from.L) * k,
	tilt: LTOP.tilt * ease(Math.max(0, Math.min(1, (k - 0.55) / 0.45))),
});

const LT = {
	reach: 0.5,
	grip: 0.15,
	lift: 0.95,
	dump: 0.6,
	lower: 0.85,
	release: 0.15,
	retract: 0.4,
};
export const LTT = {};
{
	let t = 0;
	for (const k of Object.keys(LT)) {
		LTT[k] = [t, t + LT[k]];
		t += LT[k];
	}
}
const lphase = (t, k) => Math.max(0, Math.min(1, (t - LTT[k][0]) / LT[k]));

export function resetBins() {
	state.lift = null;
	Object.assign(loaderPose, LREST);
	applyLoader(loaderPose);
	for (const b of world.bins) {
		if (b.group.parent !== scene) scene.attach(b.group);
		b.group.position.copy(b.home);
		b.group.rotation.set(0, b.facing, 0);
		b.group.scale.set(1, 1, 1);
		b.collider.off = false;
		b.state = 'idle';
		b.cooldown = 0;
		b.marker.group.visible = false;
	}
	state.binSpawnT = 0;
	// one is waiting right from the start
	setBinFull(world.bins[(Math.random() * world.bins.length) | 0]);
}

function setBinFull(b) {
	b.state = 'out';
	b.marker.group.visible = true;
}

export function updateBins(dt) {
	// Keep a couple of full dumpsters around town
	state.binSpawnT -= dt;
	if (state.binSpawnT <= 0) {
		state.binSpawnT = 18;
		const out = world.bins.filter((b) => b.state === 'out').length;
		const idle = world.bins.filter(
			(b) =>
				b.state === 'idle' &&
				b.cooldown <= 0 &&
				Math.hypot(b.x - T.pos.x, b.z - T.pos.z) > 40,
		);
		if (out < 2 && idle.length) {
			setBinFull(idle[(Math.random() * idle.length) | 0]);
			if (state.mode === 'playing')
				toast('🗑️ A dumpster somewhere is overflowing. Steve can feel it.', 3);
		}
	}
	for (const b of world.bins) {
		if (b.cooldown > 0) b.cooldown -= dt;
		if (b.state !== 'out') continue;
		b.marker.arrow.position.y = 3 + Math.sin(state.time * 4) * 0.3;
		b.marker.arrow.rotation.y += dt * 3;
		// Full dumpsters rattle when the truck is near
		const near = Math.hypot(b.x - T.pos.x, b.z - T.pos.z) < 22;
		b.group.rotation.z = near ? Math.sin(state.time * 16 + b.x) * 0.025 : 0;
		if (state.lift || !T.grounded || Math.abs(T.fwd) > 4) continue;
		truck.group.worldToLocal(armTmp.copy(b.home));
		const lx = armTmp.x;
		const lz = armTmp.z;
		if (lz < 3 || lz > 11 || Math.abs(lx) > 5) continue;
		// Roughly facing it? The forks are forgiving: the dumpster gets pulled
		// into line as it's picked up.
		let dh = T.heading - (b.facing + Math.PI);
		while (dh > Math.PI) dh -= Math.PI * 2;
		while (dh < -Math.PI) dh += Math.PI * 2;
		if (lz > 3.8 && lz < 9.8 && Math.abs(lx) < 2.8 && Math.abs(dh) < 0.95) {
			startLift(b);
		} else if (!b.hinted && lz < 9) {
			b.hinted = true;
			popup('Line up head-on!', truck.group.position, 'fun', 4);
		}
	}
	updateLift(dt);
}

function startLift(b) {
	b.state = 'lifting';
	b.hinted = false;
	b.marker.group.visible = false;
	b.group.rotation.z = 0;
	// Where the dumpster sits once squared up with the forks (truck-local x = 0)
	truck.group.worldToLocal(armTmp.copy(b.home));
	const aligned = truck.group.localToWorld(
		new THREE.Vector3(0, 0, Math.min(8.2, Math.max(4.6, armTmp.z))),
	);
	aligned.y = b.home.y;
	b.collider.off = true;
	state.lift = {
		b,
		t: 0,
		attached: false,
		added: false,
		released: false,
		hold: true,
		aligned,
		alignedRot: T.heading + Math.PI,
	};
	audio.grab();
}

function updateLift(dt) {
	const L = state.lift;
	if (!L) {
		Object.assign(loaderPose, lerpL(loaderPose, LREST, 1 - Math.exp(-8 * dt)));
		applyLoader(loaderPose);
		return;
	}
	truck.body.updateMatrixWorld(true);
	L.t += dt;
	const t = L.t;
	const b = L.b;
	const grab = binToLoader(L.aligned);
	const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
	const slideBin = (k) => {
		// drag the dumpster between its spot and the forks
		b.group.position.lerpVectors(b.home, L.aligned, k);
		b.group.rotation.set(0, b.facing + shortAngle(L.alignedRot - b.facing) * k, 0);
	};
	let pose;
	if (t < LTT.reach[1]) {
		pose = lerpL(LREST, grab, ease(lphase(t, 'reach')));
		slideBin(ease(Math.max(0, (lphase(t, 'reach') - 0.5) * 2)));
	} else if (t < LTT.grip[1]) pose = grab;
	else if (t < LTT.dump[1]) {
		if (!L.attached) {
			L.attached = true;
			b.collider.off = true;
			LOADER.forks.attach(b.group);
			audio.clang();
		}
		if (t < LTT.lift[1]) pose = loaderSwing(grab, ease(lphase(t, 'lift')));
		else {
			const k = lphase(t, 'dump');
			pose = { ...LTOP, tilt: LTOP.tilt + Math.sin(k * Math.PI * 6) * 0.1 * (1 - k) };
			if (Math.random() < 0.8) {
				const mouth = b.group.localToWorld(
					armTmp.set((Math.random() - 0.5) * 2.4, 1.6, (Math.random() - 0.5) * 1.2),
				);
				spawnParticle({
					pos: mouth.clone(),
					vel: new THREE.Vector3(
						(Math.random() - 0.5) * 1.5,
						-6,
						(Math.random() - 0.5) * 1.5,
					),
					color: TRASH_COLORS[(Math.random() * TRASH_COLORS.length) | 0],
					size: 0.3 + Math.random() * 0.2,
					life: 0.6,
					grav: 20,
				});
			}
			if (!L.added && k > 0.35) {
				L.added = true;
				const got = Math.min(DUMPSTER_BAGS, CAPACITY - state.load);
				state.load += got;
				state.stats.dumpsters++;
				state.stats.bags += got;
				addScore(30);
				audio.golden();
				popup(`FRONT LOAD! +${got} bags`, truck.group.position, 'gold', 5);
				narrate(
					'frontload',
					state.stats.dumpsters === 1 ? 1 : 0.4,
					state.stats.dumpsters === 1,
				);
				if (state.load >= CAPACITY)
					toast('🚛 Truck is FULL! Head to The Dump (orange on the map).');
			}
		}
	} else if (t < LTT.lower[1]) pose = loaderSwing(grab, 1 - ease(lphase(t, 'lower')));
	else if (t < LTT.release[1]) {
		pose = grab;
		if (!L.released) {
			L.released = true;
			scene.attach(b.group);
			b.group.scale.set(1, 1, 1);
			slideBin(1);
			b.state = 'idle';
			b.cooldown = 35;
		}
	} else if (t < LTT.retract[1]) {
		pose = lerpL(grab, LREST, ease(lphase(t, 'retract')));
		slideBin(1 - ease(lphase(t, 'retract'))); // scoot it back where it belongs
	} else {
		slideBin(0);
		b.collider.off = false;
		state.lift = null;
		pose = LREST;
	}
	if (state.lift) L.hold = t < LTT.release[1];
	Object.assign(loaderPose, pose);
	applyLoader(loaderPose);
}
