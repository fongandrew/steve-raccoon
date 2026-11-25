// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/client.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * The client half: one socket, one room, and the reconnect behaviour that makes
 * a phone on cellular tolerable.
 *
 * The governing rule is that nobody ever waits for anybody. There is no
 * "connecting..." modal that blocks play, no pause when a player drops, and no
 * replay of a missed gap — a rejoiner hard-snaps to the current keyframe and
 * carries on. Jumpy beats paused.
 */

import { Clock } from './clock.js';
import { decode, decodeJson, encode, encodeJson, KIND, PROTO_VERSION } from './protocol.js';

/** Heartbeat cadence. Answered by the server without waking a hibernated room. */
const HEARTBEAT_MS = 1000;

/** No traffic at all for this long and we assume the socket is dead. */
const DEAD_MS = 3000;

const RECONNECT_BASE_MS = 250;
const RECONNECT_MAX_MS = 5000;

/** Clock pings, once synced. Frequent enough to track drift, rare enough to ignore. */
const PING_MS = 2000;

/**
 * How many times a build mismatch may trigger a reload before we stop and tell
 * the player. Without a cap, a service worker serving stale bytes turns a
 * version mismatch into an infinite reload loop.
 */
const MAX_VERSION_RELOADS = 2;

const RELOAD_KEY = 'netplay:version-reloads';

/**
 * @typedef {object} NetClientOptions
 * @property {string} serverUrl Origin of the relay, e.g. https://x.workers.dev.
 * @property {string} gameId
 * @property {string} buildId
 * @property {string} room Join code.
 * @property {string} name Display name.
 * @property {(state: ConnectionState) => void} [onStatus]
 * @property {(welcome: any) => void} [onWelcome]
 * @property {(msg: any) => void} [onPresence]
 * @property {(env: import('./protocol.js').Envelope) => void} [onMessage]
 * @property {(info: any) => void} [onResume]
 * @property {(err: any) => void} [onError]
 * @property {() => void} [onNeedKeyframe]
 */

/** @typedef {'idle' | 'connecting' | 'live' | 'reconnecting' | 'failed'} ConnectionState */

export class NetClient {
	/**
	 * @param {NetClientOptions} opts
	 */
	constructor(opts) {
		this.opts = opts;
		/** @type {WebSocket | null} */
		this.ws = null;
		/** @type {ConnectionState} */
		this.state = 'idle';
		this.clock = new Clock();
		this.slot = -1;
		/** @type {any} */
		this.welcome = null;
		this.seq = 0;
		this.attempt = 0;
		this.lastRecv = 0;
		/** @type {Map<number, number>} pingSeq -> local send time */
		this.pings = new Map();
		this.closedByUs = false;
		/** @type {any} */
		this.timers = { heartbeat: null, ping: null, reconnect: null, watchdog: null };
		this.boundVisibility = () => {
			// Coming back from a locked screen is the single most common way a
			// socket turns out to be dead, so don't wait for the watchdog.
			if (!document.hidden) this.kick();
		};
		this.boundOnline = () => this.kick();
	}

	/** Token for this room, so a reconnect lands back in the same slot. */
	get tokenKey() {
		return `netplay:${this.opts.gameId}:${this.opts.room}:token`;
	}

	get token() {
		try {
			return sessionStorage.getItem(this.tokenKey) ?? '';
		} catch {
			return '';
		}
	}

	/** @param {string} value */
	set token(value) {
		try {
			sessionStorage.setItem(this.tokenKey, value);
		} catch {
			// Private mode; a rejoin just gets a fresh slot.
		}
	}

	connect() {
		this.closedByUs = false;
		this.open();
		addEventListener('visibilitychange', this.boundVisibility);
		addEventListener('online', this.boundOnline);
	}

	open() {
		this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
		const base = this.opts.serverUrl.replace(/^http/, 'ws').replace(/\/$/, '');
		const url = `${base}/ws?game=${encodeURIComponent(this.opts.gameId)}&room=${encodeURIComponent(this.opts.room)}`;
		const ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';
		this.ws = ws;

		ws.onopen = () => {
			this.attempt = 0;
			this.lastRecv = Date.now();
			this.sendJson(KIND.HELLO, {
				gameId: this.opts.gameId,
				buildId: this.opts.buildId,
				protoVersion: PROTO_VERSION,
				name: this.opts.name,
				token: this.token,
			});
			this.startTimers();
		};

		ws.onmessage = (ev) => {
			this.lastRecv = Date.now();
			if (typeof ev.data === 'string') return; // keepalive pong
			const env = decode(ev.data);
			if (env) this.route(env);
		};

		ws.onclose = () => this.dropped();
		ws.onerror = () => {
			// An error is always followed by a close; let that path handle it so
			// reconnects aren't scheduled twice.
		};
	}

	/**
	 * @param {import('./protocol.js').Envelope} env
	 */
	route(env) {
		switch (env.kind) {
			case KIND.WELCOME: {
				const welcome = decodeJson(env.payload);
				this.welcome = welcome;
				this.slot = welcome?.slot ?? -1;
				if (welcome?.token) this.token = welcome.token;
				this.clearReloadCount();
				this.setState('live');
				this.opts.onWelcome?.(welcome);
				return;
			}
			case KIND.PRESENCE:
				this.opts.onPresence?.(decodeJson(env.payload));
				return;
			case KIND.RESUME:
				this.opts.onResume?.(decodeJson(env.payload));
				return;
			case KIND.PONG: {
				const sent = this.pings.get(env.seq);
				if (sent !== undefined) {
					this.pings.delete(env.seq);
					this.clock.sample(sent, env.serverTick);
				}
				return;
			}
			case KIND.CONTROL: {
				const msg = decodeJson(env.payload);
				if (msg?.type === 'need_keyframe') {
					this.opts.onNeedKeyframe?.();
					return;
				}
				this.opts.onMessage?.(env);
				return;
			}
			case KIND.ERROR: {
				const err = decodeJson(env.payload);
				if (err?.code === 'version') {
					this.handleVersionMismatch(err);
					return;
				}
				this.opts.onError?.(err);
				return;
			}
			default:
				this.opts.onMessage?.(env);
		}
	}

	/**
	 * The room is pinned to a different build than ours. Update the service
	 * worker and reload — the room code lives in the URL, so the retry is
	 * automatic — but only a bounded number of times.
	 *
	 * @param {any} err
	 */
	handleVersionMismatch(err) {
		const count = this.reloadCount();
		if (count >= MAX_VERSION_RELOADS) {
			this.closedByUs = true;
			this.setState('failed');
			this.opts.onError?.({ ...err, code: 'version_stuck' });
			return;
		}
		this.bumpReloadCount();
		this.opts.onError?.({ ...err, code: 'version', reloading: true });
		Promise.resolve()
			.then(async () => {
				const reg = await navigator.serviceWorker?.getRegistration?.();
				await reg?.update?.();
			})
			.catch(() => {})
			.finally(() => location.reload());
	}

	reloadCount() {
		try {
			return Number(sessionStorage.getItem(RELOAD_KEY) ?? '0') || 0;
		} catch {
			return 0;
		}
	}

	bumpReloadCount() {
		try {
			sessionStorage.setItem(RELOAD_KEY, String(this.reloadCount() + 1));
		} catch {
			// nothing to do
		}
	}

	clearReloadCount() {
		try {
			sessionStorage.removeItem(RELOAD_KEY);
		} catch {
			// nothing to do
		}
	}

	startTimers() {
		this.stopTimers();
		this.timers.heartbeat = setInterval(() => {
			// A text frame: the Durable Object answers it without waking.
			if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('p');
		}, HEARTBEAT_MS);
		this.timers.ping = setInterval(() => this.ping(), PING_MS);
		this.timers.watchdog = setInterval(() => {
			if (Date.now() - this.lastRecv > DEAD_MS) this.kick();
		}, DEAD_MS / 2);
		this.ping();
	}

	stopTimers() {
		for (const key of /** @type {const} */ (['heartbeat', 'ping', 'watchdog'])) {
			if (this.timers[key] !== null) clearInterval(this.timers[key]);
			this.timers[key] = null;
		}
	}

	ping() {
		if (this.ws?.readyState !== WebSocket.OPEN) return;
		const seq = ++this.seq;
		this.pings.set(seq, Date.now());
		if (this.pings.size > 16) {
			const oldest = this.pings.keys().next().value;
			if (oldest !== undefined) this.pings.delete(oldest);
		}
		this.ws.send(encode({ kind: KIND.PING, seq }));
	}

	/** Force a reconnect now — the socket looks dead even if it hasn't said so. */
	kick() {
		if (this.closedByUs) return;
		if (
			this.ws &&
			this.ws.readyState === WebSocket.OPEN &&
			Date.now() - this.lastRecv < DEAD_MS
		) {
			return;
		}
		try {
			this.ws?.close();
		} catch {
			// already gone
		}
		this.dropped();
	}

	dropped() {
		this.stopTimers();
		this.ws = null;
		if (this.closedByUs) {
			this.setState('idle');
			return;
		}
		if (this.timers.reconnect !== null) return;
		this.setState('reconnecting');
		const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt);
		this.attempt++;
		this.timers.reconnect = setTimeout(() => {
			this.timers.reconnect = null;
			this.open();
		}, delay);
	}

	/**
	 * @param {ConnectionState} state
	 */
	setState(state) {
		if (this.state === state) return;
		this.state = state;
		this.opts.onStatus?.(state);
	}

	/**
	 * @param {number} kind
	 * @param {Uint8Array} [payload]
	 * @param {number} [flags]
	 */
	send(kind, payload, flags = 0) {
		if (this.ws?.readyState !== WebSocket.OPEN) return false;
		this.ws.send(encode({ kind, slot: this.slot, seq: ++this.seq, flags }, payload));
		return true;
	}

	/**
	 * @param {number} kind
	 * @param {unknown} value
	 */
	sendJson(kind, value) {
		if (this.ws?.readyState !== WebSocket.OPEN) return false;
		this.ws.send(encodeJson({ kind, slot: this.slot, seq: ++this.seq }, value));
		return true;
	}

	/** @param {Uint8Array} payload */
	sendInput(payload) {
		return this.send(KIND.INPUT, payload);
	}

	/** @param {Uint8Array} payload */
	sendSnapshot(payload) {
		return this.send(KIND.SNAPSHOT, payload);
	}

	/** @param {Uint8Array} payload */
	sendEvent(payload) {
		return this.send(KIND.EVENT, payload);
	}

	/** @param {Uint8Array} payload */
	sendKeyframe(payload) {
		return this.send(KIND.KEYFRAME, payload);
	}

	/** @param {unknown} value */
	sendControl(value) {
		return this.sendJson(KIND.CONTROL, value);
	}

	serverNow() {
		return this.clock.serverNow();
	}

	close() {
		this.closedByUs = true;
		this.stopTimers();
		if (this.timers.reconnect !== null) {
			clearTimeout(this.timers.reconnect);
			this.timers.reconnect = null;
		}
		removeEventListener('visibilitychange', this.boundVisibility);
		removeEventListener('online', this.boundOnline);
		try {
			this.ws?.close();
		} catch {
			// already gone
		}
		this.ws = null;
		this.setState('idle');
	}
}

/**
 * Ask the relay for a new room. Returns the join code plus the room's seed.
 *
 * @param {object} opts
 * @param {string} opts.serverUrl
 * @param {string} opts.gameId
 * @param {string} opts.buildId
 * @param {'realtime' | 'turnbased'} [opts.mode]
 * @returns {Promise<{ code: string, seed: number, epoch: number, mode: string }>}
 */
export async function createRoom(opts) {
	const res = await fetch(`${opts.serverUrl.replace(/\/$/, '')}/rooms`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			gameId: opts.gameId,
			buildId: opts.buildId,
			mode: opts.mode ?? 'realtime',
		}),
	});
	if (!res.ok) throw new Error(`could not create a room (${res.status})`);
	return res.json();
}
