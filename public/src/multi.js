// A shift with friends: one room on the netplay relay, as the game sees it.
//
// The engine's three kinds of state map like this:
// - seed-derived: the town. It is built from a fixed seed, so every screen
//   already has the same streets and houses and none of it is sent. The shift
//   clock is the relay's time minus the agreed start.
// - owned: each truck. Its player simulates it and sends ~20 snapshots a
//   second; everyone else draws it a moment in the past through an
//   `OwnedBuffer` (rivals.js) and bumps their own truck off it (truck.js),
//   telling the other truck's owner what shove it is owed in return.
// - contested: cans, dumpsters and treasures. They only change through relay
//   events, which every client applies in the relay's order with the reducer
//   in contest.js, so two trucks reaching for one can always agree who won.
//   A claim takes effect when it comes back confirmed; nothing is guessed.
//
// The lowest connected slot is the host. The host starts shifts and decides
// which house puts a can out next (as events, like any other claim). A shift
// starts with a `shift` event rather than only a control message, because the
// relay replays events to a player whose phone reconnects.
import { grabConfirmed, pickSpawnHouse, putCanOut, rivalTookCan } from './cans.js';
import { ACTIVE_CANS } from './constants.js';
import { applyClaim, freshContest, standings } from './contest.js';
import { announceBin, rivalTookBin, setBinFull, startLift } from './loader.js';
import { lerpAngle, lerpNumber, OwnedBuffer } from './net/owned.js';
import { decodeJson, KIND } from './net/protocol.js';
import { addRival, clearRivals, placeRival, removeRival, rivals } from './rivals.js';
import { activeCansFor, MAX_PLAYERS, raccoonFor } from './roster.js';
import { world } from './scene.js';
import { beginOnlineShift, showStandings } from './shift.js';
import { state, T } from './state.js';
import { collectTreasure, rivalTookTreasure, treasures } from './treasures.js';
import { takeBump } from './truck.js';
import {
	decodeEvent,
	decodeKeyframe,
	decodeSnap,
	encodeEvent,
	encodeKeyframe,
	encodeSnap,
} from './wire.js';

/** @typedef {import('./contest.js').Claim} Claim */
/** @typedef {import('./contest.js').Contest} Contest */
/** @typedef {import('./link.js').GameLink} GameLink */
/** @typedef {import('./link.js').Standing} Standing */
/** @typedef {import('./net/protocol.js').Envelope} Envelope */
/** @typedef {import('./wire.js').Snap} Snap */

/**
 * What the session needs from a `NetClient`: narrow on purpose.
 *
 * @typedef {object} Net
 * @property {number} slot
 * @property {() => number} serverNow
 * @property {(dtSeconds: number) => void} tick step the clock smoothing
 * @property {(bytes: Uint8Array) => void} sendEvent
 * @property {(bytes: Uint8Array) => void} sendSnapshot
 * @property {(bytes: Uint8Array) => void} sendKeyframe
 * @property {(value: unknown) => void} sendControl
 */

/** Snapshots a second: driving, and sitting in the lobby or on the results. */
const SNAPSHOT_HZ = 20;
const IDLE_SNAPSHOT_HZ = 3;

/** Seconds from the host pressing Start to the trucks being let go. */
export const COUNTDOWN = 4;

/** @returns {Contest} */
const blankContest = () => freshContest(world.houses.length, world.bins.length, treasures.length);

/**
 * @implements {GameLink}
 */
export class Session {
	/**
	 * @param {object} opts
	 * @param {Net} opts.net
	 * @param {string} opts.code room join code
	 * @param {() => void} [opts.onChange] the lobby view changed
	 */
	constructor({ net, code, onChange }) {
		this.net = net;
		this.code = code;
		this.onChange = onChange ?? (() => {});
		/** @type {Map<number, { slot: number, connected: boolean }>} */
		this.players = new Map();
		/** @type {OwnedBuffer<Snap>} */
		this.remote = new OwnedBuffer((a, b, t) => ({
			...b,
			x: lerpNumber(a.x, b.x, t),
			z: lerpNumber(a.z, b.z, t),
			y: lerpNumber(a.y, b.y, t),
			heading: lerpAngle(a.heading, b.heading, t),
			vx: lerpNumber(a.vx, b.vx, t),
			vz: lerpNumber(a.vz, b.vz, t),
			steer: lerpNumber(a.steer, b.steer, t),
		}));
		/** Current shift number (0 = none yet) and its start, in relay ms. */
		this.shift = 0;
		this.startAt = 0;
		this.contest = blankContest();
		this.sendAccum = 0;
		this.boardAccum = 0;
	}

	// ---- GameLink (what the game modules call) ----

	get slot() {
		return this.net.slot;
	}

	/** The lowest connected slot runs the room. */
	hostSlot() {
		let host = this.net.slot;
		for (const p of this.players.values()) if (p.connected && p.slot < host) host = p.slot;
		return host;
	}

	isHost() {
		return this.net.slot >= 0 && this.hostSlot() === this.net.slot;
	}

	time() {
		return this.shift ? (this.net.serverNow() - this.startAt) / 1000 : -Infinity;
	}

	playerCount() {
		let n = 0;
		for (const p of this.players.values()) if (p.connected) n++;
		return Math.max(1, n);
	}

	truckSpots() {
		const spots = [{ x: T.pos.x, z: T.pos.z }];
		for (const r of rivals.values()) if (r.seen) spots.push({ x: r.x, z: r.z });
		return spots;
	}

	/** @param {Claim} claim */
	claim(claim) {
		if (this.shift) this.net.sendEvent(encodeEvent(claim));
	}

	/**
	 * We ran into another truck. Its owner's game may not have seen the hit
	 * (it sees us a moment in the past), so say what shove it is owed. A control
	 * message, not an event: it matters now or never, and must not be replayed.
	 *
	 * @param {number} slot
	 * @param {number} ix
	 * @param {number} iz
	 */
	bumped(slot, ix, iz) {
		const r2 = (/** @type {number} */ v) => Math.round(v * 100) / 100;
		this.net.sendControl({ type: 'bump', to: slot, ix: r2(ix), iz: r2(iz) });
	}

	/** @returns {Standing[]} */
	table() {
		/** @type {Standing[]} */
		const rows = [];
		for (const p of this.players.values()) {
			const me = p.slot === this.net.slot;
			const rival = rivals.get(p.slot);
			// Someone who dropped out keeps their place on the board if they scored
			if (!me && !p.connected && !rival) continue;
			const who = raccoonFor(p.slot);
			rows.push({
				slot: p.slot,
				name: who.name,
				css: who.css,
				score: me ? state.score : (rival?.score ?? 0),
				me,
			});
		}
		return standings(rows);
	}

	// ---- Lobby ----

	/** @returns {{ slot: number, name: string, css: string, me: boolean, host: boolean }[]} */
	lobby() {
		const host = this.hostSlot();
		return [...this.players.values()]
			.filter((p) => p.connected)
			.sort((a, b) => a.slot - b.slot)
			.map((p) => ({
				slot: p.slot,
				name: raccoonFor(p.slot).name,
				css: raccoonFor(p.slot).css,
				me: p.slot === this.net.slot,
				host: p.slot === host,
			}));
	}

	hostName() {
		return raccoonFor(this.hostSlot()).name;
	}

	/**
	 * Host only: start the next shift a few seconds from now. A second shift
	 * first resets the room, so the relay's replay log starts at this one.
	 *
	 * @returns {boolean}
	 */
	startNextShift() {
		if (!this.isHost()) return false;
		if (this.shift) this.net.sendControl({ type: 'lobby' });
		const startAt = Math.round(this.net.serverNow() + COUNTDOWN * 1000);
		this.net.sendEvent(encodeEvent({ type: 'shift', shift: this.shift + 1, startAt }));
		this.net.sendControl({ type: 'start' });
		return true;
	}

	// ---- Per frame ----

	/** @param {number} dt seconds */
	frame(dt) {
		this.net.tick(dt);
		this.syncRivals();
		this.sendSnapshot(dt);
		if (state.mode === 'countdown' && this.time() >= 0) state.mode = 'playing';
		if (state.mode === 'countdown') state.time = this.time();
		// Scores keep trickling in after the whistle: keep the table honest
		this.boardAccum += dt;
		if (this.boardAccum > 0.5) {
			this.boardAccum = 0;
			if (state.mode === 'results') showStandings(this.table());
		}
	}

	/** Move every other truck to where its owner was a moment ago. */
	syncRivals() {
		if (!this.shift) return;
		const now = this.net.serverNow();
		for (const slot of this.remote.slots()) {
			if (slot === this.net.slot) continue;
			const sample = this.remote.sample(slot, now);
			if (!sample) continue;
			const p = this.players.get(slot);
			placeRival(slot, sample.value, sample.stale || !p || !p.connected);
		}
	}

	/** @param {number} dt */
	sendSnapshot(dt) {
		const driving = state.mode === 'playing' || state.mode === 'countdown';
		this.sendAccum += dt;
		if (this.sendAccum < 1 / (driving ? SNAPSHOT_HZ : IDLE_SNAPSHOT_HZ)) return;
		this.sendAccum = 0;
		this.net.sendSnapshot(
			encodeSnap({
				shift: this.shift,
				x: T.pos.x,
				z: T.pos.z,
				y: T.y,
				heading: T.heading,
				vx: T.vel.x,
				vz: T.vel.z,
				steer: T.steer / 0.6,
				load: state.load,
				score: state.score,
				boosting: state.boostT > 0,
				grounded: T.grounded,
			}),
		);
	}

	// ---- Relay callbacks (wired up in lobby.js) ----

	/** @param {any} welcome */
	onWelcome(welcome) {
		this.players.clear();
		for (const p of welcome?.players ?? []) {
			this.players.set(p.slot, { slot: p.slot, connected: !!p.connected });
		}
		this.players.set(this.net.slot, { slot: this.net.slot, connected: true });
		// What follows (keyframe, events) is the room's truth: replay it from a
		// clean slate rather than on top of what we already had.
		this.contest = blankContest();
		this.onChange();
	}

	/** @param {any} msg */
	onPresence(msg) {
		const slot = Number(msg?.slot);
		if (msg?.state === 'gone') {
			this.players.delete(slot);
			this.remote.drop(slot);
			removeRival(slot);
		} else {
			const connected = msg?.state === 'join';
			this.players.set(slot, { slot, connected });
			if (!connected) {
				this.remote.drop(slot);
				// Off the road, but their score stays on the board
				const r = rivals.get(slot);
				if (r) {
					r.model.group.visible = false;
					r.tag.style.display = 'none';
					r.seen = false;
				}
			}
		}
		this.onChange();
	}

	/** @param {Envelope} env */
	onMessage(env) {
		if (env.kind === KIND.SNAPSHOT) {
			if (env.slot === this.net.slot || env.slot >= MAX_PLAYERS) return;
			const snap = decodeSnap(env.payload);
			if (snap.shift === this.shift && this.shift) {
				this.remote.push(env.slot, env.serverTick, snap);
			}
			return;
		}
		if (env.kind === KIND.CONTROL) {
			const msg = decodeJson(env.payload);
			if (msg?.type === 'bump' && msg.to === this.net.slot && env.slot !== this.net.slot) {
				takeBump(env.slot, Number(msg.ix) || 0, Number(msg.iz) || 0);
			}
			return;
		}
		if (env.kind === KIND.KEYFRAME) {
			this.applyKeyframe(env.payload);
			return;
		}
		if (env.kind === KIND.EVENT) {
			const ev = decodeEvent(env.payload);
			if (!ev) return;
			if (ev.type === 'shift') this.beginShift(ev.shift, ev.startAt);
			else this.confirm(env.slot, ev);
		}
	}

	/** The relay wants a checkpoint: the confirmed contest is the room's truth. */
	keyframe() {
		this.net.sendKeyframe(
			encodeKeyframe({ shift: this.shift, startAt: this.startAt, contest: this.contest }),
		);
	}

	// ---- Internals ----

	/**
	 * @param {number} shift
	 * @param {number} startAt
	 */
	beginShift(shift, startAt) {
		// A replayed or duplicate start for a shift we're already in changes nothing.
		if (shift <= this.shift) return;
		this.shift = shift;
		this.startAt = startAt;
		this.contest = blankContest();
		this.remote = new OwnedBuffer(this.remote.lerp);
		clearRivals();
		for (const p of this.players.values()) {
			if (p.connected && p.slot !== this.net.slot && p.slot < MAX_PLAYERS) addRival(p.slot);
		}
		beginOnlineShift(this.net.slot);
		state.time = this.time();
		if (this.isHost()) this.seedTown();
		this.onChange();
	}

	/** Host: put the first cans out and fill one dumpster, as the shift begins. */
	seedTown() {
		const n = activeCansFor(this.playerCount(), ACTIVE_CANS);
		/** @type {Set<number>} */
		const picked = new Set();
		for (let tries = 0; picked.size < n && tries < n * 6; tries++) {
			const h = pickSpawnHouse([{ x: T.pos.x, z: T.pos.z }]);
			if (h) picked.add(world.houses.indexOf(h));
		}
		for (const i of picked) this.claim({ type: 'out', i });
		if (world.bins.length) {
			this.claim({ type: 'binOut', i: (Math.random() * world.bins.length) | 0 });
		}
	}

	/**
	 * Fold a relay-ordered claim into the contest and, if it stood, show it.
	 *
	 * @param {number} slot who sent it
	 * @param {Claim} claim
	 */
	confirm(slot, claim) {
		if (!this.shift) return;
		if (!applyClaim(this.contest, claim, slot)) return; // someone was first
		const mine = slot === this.net.slot;
		const who = raccoonFor(slot).name;
		// Cans and dumpsters put out before the trucks are let go are part of the scenery
		const quiet = this.time() < 1;
		switch (claim.type) {
			case 'out': {
				const h = world.houses[claim.i];
				if (h && h.state === 'idle') putCanOut(h, quiet);
				break;
			}
			case 'can': {
				const h = world.houses[claim.i];
				if (!h) break;
				if (mine) grabConfirmed(h);
				else rivalTookCan(h, who);
				break;
			}
			case 'binOut': {
				const b = world.bins[claim.i];
				if (!b) break;
				setBinFull(b);
				if (!quiet) announceBin();
				break;
			}
			case 'bin': {
				const b = world.bins[claim.i];
				if (!b) break;
				if (mine) startLift(b);
				else rivalTookBin(b, who);
				break;
			}
			case 'gem': {
				const t = treasures[claim.i];
				if (!t) break;
				if (mine) collectTreasure(t);
				else rivalTookTreasure(t, who);
				break;
			}
		}
	}

	/**
	 * Catch up from the relay's cached checkpoint (we joined or reconnected
	 * partway through a shift).
	 *
	 * @param {Uint8Array} bytes
	 */
	applyKeyframe(bytes) {
		const k = decodeKeyframe(bytes);
		if (!k.shift) return;
		this.beginShift(k.shift, k.startAt);
		if (k.shift !== this.shift) return;
		const fresh = blankContest();
		if (
			k.contest.cans.length !== fresh.cans.length ||
			k.contest.bins.length !== fresh.bins.length ||
			k.contest.gems.length !== fresh.gems.length
		) {
			return; // not this town: a different build would have been refused earlier
		}
		this.contest = k.contest;
		this.contest.cans.forEach((out, i) => {
			const h = world.houses[i];
			if (out && h && h.state === 'idle') putCanOut(h, true);
		});
		this.contest.bins.forEach((full, i) => {
			const b = world.bins[i];
			if (full && b) setBinFull(b);
		});
		this.contest.gems.forEach((slot, i) => {
			const t = treasures[i];
			if (slot >= 0 && t) {
				t.found = true;
				t.group.visible = false;
			}
		});
	}
}
