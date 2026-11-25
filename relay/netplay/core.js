// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/core.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * The room state machine, with no transport in it at all.
 *
 * `handle()` takes a connection handle plus raw bytes and returns a list of
 * actions ("send these bytes to these sockets"). The Durable Object adapter and
 * the Node adapter both just execute those actions. Keeping the core pure is
 * what makes the whole protocol testable without a socket, and what keeps the
 * DO adapter thin enough to trust.
 *
 * Deliberately absent: any knowledge of what a game's payload bytes mean.
 */

import {
	decode,
	decodeJson,
	encode,
	encodeJson,
	KIND,
	MAX_SLOT,
	maxPayloadFor,
	PROTO_VERSION,
	restamp,
	SERVER_SLOT,
	toBytes,
} from './protocol.js';

/** Broadcast to every connected player, sender included. */
export const TO_ALL = -1;
/** Broadcast to every connected player except the sender. */
export const TO_OTHERS = -2;
/**
 * Reply to the socket the message came from. Not the same as its slot: before a
 * successful `hello` a connection has no slot (-1, which is `TO_ALL`), so
 * addressing a refusal by slot would broadcast it to the whole room.
 */
export const TO_SENDER = -3;

export const ERR = {
	VERSION: 'version',
	NO_ROOM: 'no_room',
	FULL: 'full',
	PROTOCOL: 'protocol',
	TOO_BIG: 'too_big',
	RATE: 'rate',
};

/** How long a disconnected player keeps their slot. */
export const GRACE_MS = 30_000;

/**
 * Silence after which a socket is presumed dead even though it never sent a
 * close frame.
 *
 * A phone that drives into a tunnel, or a browser tab killed by the OS, leaves
 * a connection that looks perfectly open from the server's side — TCP can take
 * minutes to notice. Without this the player stays "connected" forever, their
 * slot is never reclaimed, and everyone else keeps waiting for a car that is
 * never going to move. Clients heartbeat every second, so 8s is comfortably
 * past any honest jitter.
 */
export const LIVENESS_MS = 8000;

/** Contested events retained since the last keyframe. */
export const MAX_EVENT_LOG = 256;

/**
 * Sustained inbound message budget per connection. Sized off the worst honest
 * case rather than a round number: a 20 Hz realtime game sends an `input` and a
 * `snapshot` per frame (40/s), plus pings, contested events and control
 * traffic. 120 leaves that comfortable headroom while still stopping a runaway
 * loop from melting the room's request budget.
 */
export const RATE_WINDOW_MS = 1000;
export const RATE_MAX_MESSAGES = 120;

/**
 * Consecutive over-budget windows before the adapter hangs up. Refusing a
 * message doesn't make it free: it has already woken the Durable Object and been
 * billed, so a socket that won't slow down has to go. One bad window is
 * forgiven, because a phone coming out of a tunnel delivers several seconds of
 * queued messages at once.
 */
export const RATE_MAX_STRIKES = 3;

/**
 * Messages in a single window that mean hanging up at once. Well past what the
 * worst honest backlog can hold: `LIVENESS_MS` of queueing at ~45 messages/s is
 * about 360.
 */
export const RATE_KICK_MESSAGES = 600;

/** WebSocket close code (policy violation) for a flooding socket. */
export const CLOSE_FLOODING = 1008;

/** @typedef {'lobby' | 'playing' | 'results'} Phase */
/** @typedef {'realtime' | 'turnbased'} Mode */

/**
 * A player slot. Survives disconnection for `GRACE_MS` so a phone that loses
 * signal in a tunnel comes back as the same racer.
 *
 * @typedef {object} Player
 * @property {number} slot
 * @property {string} name
 * @property {string} token
 * @property {boolean} connected
 * @property {number} lastSeen Epoch ms.
 */

/**
 * The adapter's per-socket handle. The core mutates `slot` and the rate-limit
 * counters; the adapter owns everything else and is responsible for keeping the
 * handle alive across messages (and, under DO hibernation, for rebuilding it
 * from the socket attachment).
 *
 * @typedef {object} Conn
 * @property {number} slot -1 until `hello` succeeds.
 * @property {string} token
 * @property {number} windowStart
 * @property {number} windowCount
 * @property {number} strikes Consecutive windows that went over budget.
 * @property {boolean} kick Set by the core when the adapter must close this socket.
 */

/**
 * @param {number} now
 * @param {number} [slot]
 * @param {string} [token]
 * @returns {Conn}
 */
export function newConn(now, slot = -1, token = '') {
	return { slot, token, windowStart: now, windowCount: 0, strikes: 0, kick: false };
}

/**
 * One thing to send. `to` is a slot number, `TO_ALL`, `TO_OTHERS` or `TO_SENDER`; `latest`
 * marks a message the adapter may drop for a saturated socket rather than
 * queueing behind it.
 *
 * @typedef {object} Action
 * @property {number} to
 * @property {Uint8Array} bytes
 * @property {boolean} latest
 */

/**
 * @typedef {object} RoomInit
 * @property {string} gameId
 * @property {string} buildId
 * @property {Mode} mode
 * @property {number} seed
 * @property {number} epoch Epoch ms the room's ticks count from.
 */

/**
 * The subset of room state that must survive hibernation. Binary blobs are
 * stored as plain arrays so the whole thing round-trips through JSON — DO
 * storage handles structured clone, but the Node adapter and the tests want
 * something boring.
 *
 * @typedef {object} StoredRoom
 * @property {RoomInit} init
 * @property {Phase} phase
 * @property {Player[]} players
 * @property {number} order
 * @property {number[][]} events
 * @property {boolean} logTruncated
 * @property {number[] | null} keyframe
 * @property {Array<[number, number[]]>} owned
 */

/**
 * @returns {string}
 */
function makeToken() {
	const buf = new Uint8Array(16);
	crypto.getRandomValues(buf);
	return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RoomCore {
	/**
	 * @param {{ now?: () => number }} [opts]
	 */
	constructor(opts = {}) {
		/** @type {() => number} */
		this.now = opts.now ?? (() => Date.now());
		/** @type {RoomInit | null} */
		this.init = null;
		/** @type {Phase} */
		this.phase = 'lobby';
		/** @type {Map<number, Player>} */
		this.players = new Map();
		/** Next global order to assign to a contested event. */
		this.order = 0;
		/** @type {Uint8Array[]} Framed event messages since the last keyframe. */
		this.events = [];
		this.logTruncated = false;
		/** @type {Uint8Array | null} */
		this.keyframe = null;
		/** @type {Map<number, Uint8Array>} Latest owned snapshot per slot. */
		this.owned = new Map();
	}

	get initialized() {
		return this.init !== null;
	}

	/**
	 * Create the room. `idFromName` auto-vivifies a Durable Object for any name,
	 * so an unknown join code otherwise lands a player in a silent ghost room —
	 * this flag is what lets the adapter reject that.
	 *
	 * @param {RoomInit} init
	 */
	create(init) {
		this.init = init;
	}

	/** Milliseconds since the room epoch. */
	tick() {
		if (!this.init) return 0;
		return Math.max(0, this.now() - this.init.epoch) >>> 0;
	}

	/**
	 * @param {string} code
	 * @param {Record<string, unknown>} [extra]
	 * @returns {Uint8Array}
	 */
	errorFrame(code, extra) {
		return encodeJson(
			{ kind: KIND.ERROR, slot: SERVER_SLOT, serverTick: this.tick() },
			{ code, ...extra },
		);
	}

	/**
	 * @param {number} to
	 * @param {Uint8Array} bytes
	 * @param {boolean} [latest]
	 * @returns {Action}
	 */
	static send(to, bytes, latest = false) {
		return { to, bytes, latest };
	}

	/**
	 * Charge one inbound message against a connection's budget, and decide whether
	 * the socket has earned a hang-up (`conn.kick`, which the adapter acts on).
	 *
	 * Separate from `handle()` because adapters must also charge frames that never
	 * reach it — a stray text frame wakes the Durable Object like any other.
	 *
	 * @param {Conn} conn
	 * @param {number} [now]
	 * @returns {boolean} True if the message is within budget.
	 */
	charge(conn, now = this.now()) {
		const elapsed = now - conn.windowStart;
		if (elapsed > RATE_WINDOW_MS) {
			// A window that stayed in budget, or a whole window of silence, clears
			// the record.
			if (conn.windowCount <= RATE_MAX_MESSAGES || elapsed > 2 * RATE_WINDOW_MS) {
				conn.strikes = 0;
			}
			conn.windowStart = now;
			conn.windowCount = 0;
		}
		conn.windowCount++;
		if (conn.windowCount <= RATE_MAX_MESSAGES) return true;

		if (conn.windowCount === RATE_MAX_MESSAGES + 1) conn.strikes++;
		if (conn.strikes >= RATE_MAX_STRIKES || conn.windowCount > RATE_KICK_MESSAGES) {
			conn.kick = true;
		}
		return false;
	}

	/**
	 * Route one inbound message. The relay path here is deliberately synchronous
	 * and allocation-light: a Durable Object serializes on every `await` inside
	 * its message handler, so an await here would quietly cap room throughput.
	 *
	 * @param {Conn} conn
	 * @param {ArrayBuffer | ArrayBufferView | Uint8Array} data
	 * @returns {Action[]}
	 */
	handle(conn, data) {
		const bytes = toBytes(data);
		const now = this.now();

		if (!this.charge(conn, now)) {
			// Say so once per window; answering every message would double the
			// flood.
			const tell = conn.windowCount === RATE_MAX_MESSAGES + 1;
			return tell ? [RoomCore.send(TO_SENDER, this.errorFrame(ERR.RATE))] : [];
		}

		const env = decode(bytes);
		if (!env) return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.PROTOCOL))];
		if (env.payload.length > maxPayloadFor(env.kind)) {
			return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.TOO_BIG, { kind: env.kind }))];
		}

		if (env.kind === KIND.HELLO) return this.hello(conn, env.payload);
		if (conn.slot < 0) return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.PROTOCOL))];

		const player = this.players.get(conn.slot);
		if (player) player.lastSeen = now;

		const serverTick = this.tick();
		// The sender's own slot claim is never trusted — free, and it means a
		// buggy client can't impersonate another player's car.
		restamp(bytes, { slot: conn.slot, serverTick });

		switch (env.kind) {
			case KIND.INPUT:
				return [RoomCore.send(TO_OTHERS, bytes, true)];

			case KIND.SNAPSHOT:
				this.owned.set(conn.slot, bytes.slice());
				return [RoomCore.send(TO_OTHERS, bytes, true)];

			case KIND.EVENT: {
				// The one thing only a server can do: pick a winner. Sequencing is
				// free here because a Durable Object is single-threaded per room.
				const order = ++this.order;
				restamp(bytes, { order });
				const kept = bytes.slice();
				this.events.push(kept);
				const actions = [RoomCore.send(TO_ALL, kept, false)];
				if (this.events.length > MAX_EVENT_LOG) {
					this.events.shift();
					this.logTruncated = true;
					actions.push(
						RoomCore.send(
							this.lowestConnectedSlot(),
							encodeJson(
								{ kind: KIND.CONTROL, slot: SERVER_SLOT, serverTick },
								{ type: 'need_keyframe' },
							),
						),
					);
				}
				return actions;
			}

			case KIND.KEYFRAME:
				this.keyframe = bytes.slice();
				this.events.length = 0;
				this.logTruncated = false;
				return [];

			case KIND.PING:
				return [
					RoomCore.send(
						TO_SENDER,
						encode(
							{
								kind: KIND.PONG,
								slot: SERVER_SLOT,
								seq: env.seq,
								serverTick,
								order: this.order,
							},
							env.payload,
						),
					),
				];

			case KIND.CONTROL:
				return this.control(conn, env.payload, bytes, serverTick);

			default:
				return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.PROTOCOL))];
		}
	}

	/**
	 * Join or rejoin. Rejoin is by reconnect token: same token, same slot, same
	 * car.
	 *
	 * @param {Conn} conn
	 * @param {Uint8Array} payload
	 * @returns {Action[]}
	 */
	hello(conn, payload) {
		if (!this.init) return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.NO_ROOM))];

		const msg = decodeJson(payload);
		if (!msg || typeof msg !== 'object') {
			return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.PROTOCOL))];
		}
		if (msg.protoVersion !== PROTO_VERSION) {
			return [
				RoomCore.send(
					TO_SENDER,
					this.errorFrame(ERR.VERSION, { expectedProtocol: PROTO_VERSION }),
				),
			];
		}
		if (msg.gameId !== this.init.gameId) {
			return [
				RoomCore.send(
					TO_SENDER,
					this.errorFrame(ERR.NO_ROOM, { expectedGame: this.init.gameId }),
				),
			];
		}

		/** @type {Action[]} */
		const pre = [];
		if (msg.buildId !== this.init.buildId) {
			// A build hash carries no ordering, so we can't tell "newer" from
			// "older". In the lobby we let the joiner re-pin and tell everyone else
			// to reload; the client caps its retries so a genuinely stale cache
			// surfaces as a message rather than a reload loop. Once play starts the
			// pin is frozen and the mismatched client is simply refused.
			if (this.phase !== 'lobby') {
				return [
					RoomCore.send(
						TO_SENDER,
						this.errorFrame(ERR.VERSION, { expected: this.init.buildId }),
					),
				];
			}
			this.init = { ...this.init, buildId: String(msg.buildId) };
			pre.push(
				RoomCore.send(
					TO_ALL,
					this.errorFrame(ERR.VERSION, { expected: this.init.buildId }),
				),
			);
		}

		const token = typeof msg.token === 'string' ? msg.token : '';
		const name = typeof msg.name === 'string' ? msg.name.slice(0, 24) : 'Player';

		let player = this.findByToken(token);
		if (!player) {
			const slot = this.freeSlot();
			if (slot < 0) return [RoomCore.send(TO_SENDER, this.errorFrame(ERR.FULL))];
			player = {
				slot,
				name,
				token: makeToken(),
				connected: false,
				lastSeen: this.now(),
			};
			this.players.set(slot, player);
		}
		player.name = name;
		player.connected = true;
		player.lastSeen = this.now();
		conn.slot = player.slot;
		conn.token = player.token;

		const serverTick = this.tick();
		/** @type {Action[]} */
		const actions = [
			...pre,
			RoomCore.send(
				player.slot,
				encodeJson(
					{ kind: KIND.WELCOME, slot: player.slot, serverTick },
					{
						slot: player.slot,
						token: player.token,
						seed: this.init.seed,
						epoch: this.init.epoch,
						mode: this.init.mode,
						gameId: this.init.gameId,
						buildId: this.init.buildId,
						phase: this.phase,
						players: [...this.players.values()].map((p) => ({
							slot: p.slot,
							name: p.name,
							connected: p.connected,
						})),
					},
				),
			),
		];

		// Catch the joiner up: keyframe first, then the events since it, then
		// everyone's latest owned state. A rejoiner hard-snaps to this — it never
		// replays the gap, because replaying a 4-second gap on a phone that just
		// came out of a tunnel is worse than teleporting.
		if (this.keyframe) actions.push(RoomCore.send(player.slot, this.keyframe));
		for (const ev of this.events) actions.push(RoomCore.send(player.slot, ev));
		for (const [slot, snap] of this.owned) {
			if (slot !== player.slot) actions.push(RoomCore.send(player.slot, snap));
		}
		actions.push(
			RoomCore.send(
				player.slot,
				encodeJson(
					{ kind: KIND.RESUME, slot: SERVER_SLOT, serverTick, order: this.order },
					{
						keyframe: this.keyframe !== null,
						events: this.events.length,
						truncated: this.logTruncated,
					},
				),
			),
		);
		actions.push(
			RoomCore.send(
				TO_OTHERS,
				encodeJson(
					{ kind: KIND.PRESENCE, slot: player.slot, serverTick },
					{ slot: player.slot, state: 'join', name: player.name },
				),
			),
		);
		return actions;
	}

	/**
	 * Lifecycle control. The server understands exactly three transitions and
	 * relays everything else untouched, so a game can invent its own control
	 * messages (ready checks, rematch votes) with no server change.
	 *
	 * @param {Conn} conn
	 * @param {Uint8Array} payload
	 * @param {Uint8Array} bytes
	 * @param {number} serverTick
	 * @returns {Action[]}
	 */
	control(conn, payload, bytes, serverTick) {
		void conn;
		void serverTick;
		const msg = decodeJson(payload);
		const type = msg && typeof msg === 'object' ? msg.type : null;
		if (type === 'start') this.phase = 'playing';
		else if (type === 'results') this.phase = 'results';
		else if (type === 'lobby') {
			this.phase = 'lobby';
			this.events.length = 0;
			this.keyframe = null;
			this.owned.clear();
			this.logTruncated = false;
		}
		return [RoomCore.send(TO_ALL, bytes, false)];
	}

	/**
	 * A socket went away. The slot is held — not freed — until the grace window
	 * expires, so the game keeps the player's car on the track and `sweep()`
	 * decides when they're really gone.
	 *
	 * @param {Conn} conn
	 * @returns {Action[]}
	 */
	disconnect(conn) {
		const player = this.players.get(conn.slot);
		if (!player) return [];
		player.connected = false;
		player.lastSeen = this.now();
		return [
			RoomCore.send(
				TO_OTHERS,
				encodeJson(
					{ kind: KIND.PRESENCE, slot: player.slot, serverTick: this.tick() },
					{ slot: player.slot, state: 'leave', name: player.name },
				),
			),
		];
	}

	/**
	 * Expire grace windows. Driven by the adapter's alarm; returns the presence
	 * broadcasts for players who are now really gone.
	 *
	 * @returns {Action[]}
	 */
	sweep() {
		const now = this.now();
		/** @type {Action[]} */
		const actions = [];
		for (const player of [...this.players.values()]) {
			if (player.connected || now - player.lastSeen < GRACE_MS) continue;
			this.players.delete(player.slot);
			this.owned.delete(player.slot);
			actions.push(
				RoomCore.send(
					TO_ALL,
					encodeJson(
						{ kind: KIND.PRESENCE, slot: player.slot, serverTick: this.tick() },
						{ slot: player.slot, state: 'gone', name: player.name },
					),
				),
			);
		}
		return actions;
	}

	/** True once nothing is holding the room open and it can be reclaimed. */
	isEmpty() {
		return this.players.size === 0;
	}

	/**
	 * @param {string} token
	 * @returns {Player | undefined}
	 */
	findByToken(token) {
		if (!token) return undefined;
		for (const player of this.players.values()) {
			if (player.token === token) return player;
		}
		return undefined;
	}

	/** @returns {number} Lowest unused slot, or -1 if the room is full. */
	freeSlot() {
		for (let slot = 0; slot <= MAX_SLOT; slot++) {
			if (!this.players.has(slot)) return slot;
		}
		return -1;
	}

	/** @returns {number} */
	lowestConnectedSlot() {
		for (let slot = 0; slot <= MAX_SLOT; slot++) {
			const player = this.players.get(slot);
			if (player?.connected) return slot;
		}
		return TO_ALL;
	}

	/**
	 * Snapshot for storage. Called on state transitions and a dirty-flush alarm —
	 * never per message. The free plan allows 100k SQLite row writes a day, which
	 * a per-message write would burn through in one afternoon.
	 *
	 * @returns {StoredRoom | null}
	 */
	toStored() {
		if (!this.init) return null;
		return {
			init: this.init,
			phase: this.phase,
			players: [...this.players.values()],
			order: this.order,
			events: this.events.map((e) => Array.from(e)),
			logTruncated: this.logTruncated,
			keyframe: this.keyframe ? Array.from(this.keyframe) : null,
			owned: [...this.owned].map(([slot, bytes]) => [slot, Array.from(bytes)]),
		};
	}

	/**
	 * @param {StoredRoom} stored
	 * @param {{ now?: () => number }} [opts]
	 * @returns {RoomCore}
	 */
	static fromStored(stored, opts = {}) {
		const room = new RoomCore(opts);
		room.init = stored.init;
		room.phase = stored.phase;
		room.order = stored.order;
		room.logTruncated = stored.logTruncated;
		room.events = stored.events.map((e) => Uint8Array.from(e));
		room.keyframe = stored.keyframe ? Uint8Array.from(stored.keyframe) : null;
		for (const player of stored.players) {
			// Nothing is connected on the far side of a wake — the sockets are
			// reattached by the adapter, which flips these back.
			room.players.set(player.slot, { ...player, connected: false });
		}
		for (const [slot, bytes] of stored.owned) room.owned.set(slot, Uint8Array.from(bytes));
		return room;
	}
}
