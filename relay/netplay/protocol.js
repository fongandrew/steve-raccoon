// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/protocol.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * The wire envelope: a fixed 16-byte little-endian header followed by an opaque
 * payload. The server parses only the header (and, for `hello` / `control`, the
 * JSON payload) — every game-specific byte passes through untouched, which is
 * what makes "a new game needs zero server changes" true.
 *
 * Binary frames carry this envelope. Text frames are reserved for the
 * hibernation keepalive (`'p'` -> `'o'`), which Cloudflare answers via
 * `setWebSocketAutoResponse` without waking the Durable Object.
 */

/** Bumped only when the envelope layout changes — never for game changes. */
export const PROTO_VERSION = 1;

export const HEADER_BYTES = 16;

/** Sender slot used for anything the server originates. */
export const SERVER_SLOT = 255;

/** Highest assignable player slot (8 players, 0-7). */
export const MAX_SLOT = 7;

/** `flags` bit 0: never latest-drop this message under backpressure. */
export const FLAG_RELIABLE = 1;

export const KIND = {
	HELLO: 1,
	WELCOME: 2,
	PRESENCE: 3,
	INPUT: 4,
	SNAPSHOT: 5,
	EVENT: 6,
	KEYFRAME: 7,
	RESUME: 8,
	PING: 9,
	PONG: 10,
	CONTROL: 11,
	ERROR: 12,
};

/** @typedef {(typeof KIND)[keyof typeof KIND]} Kind */

/** Kinds the server may drop for a saturated socket (latest-only state). */
export const LATEST_ONLY = new Set([KIND.INPUT, KIND.SNAPSHOT]);

/**
 * Per-kind payload size caps, in bytes. Oversized messages are rejected with an
 * `error` rather than dropping the connection — a game bug shouldn't kick a kid
 * out of the room.
 */
export const MAX_PAYLOAD = {
	[KIND.HELLO]: 1024,
	[KIND.INPUT]: 4096,
	[KIND.SNAPSHOT]: 16384,
	[KIND.EVENT]: 4096,
	[KIND.KEYFRAME]: 65536,
	[KIND.CONTROL]: 4096,
	[KIND.PING]: 64,
};

/** Fallback cap for any kind not listed above. */
export const DEFAULT_MAX_PAYLOAD = 4096;

/**
 * @param {number} kind
 * @returns {number}
 */
export function maxPayloadFor(kind) {
	const cap = /** @type {Record<number, number | undefined>} */ (MAX_PAYLOAD)[kind];
	return cap === undefined ? DEFAULT_MAX_PAYLOAD : cap;
}

/**
 * A decoded envelope. `payload` is a view into the original buffer — copy it if
 * you intend to retain it past the current message.
 *
 * @typedef {object} Envelope
 * @property {number} kind
 * @property {number} slot
 * @property {number} protoVersion
 * @property {number} flags
 * @property {number} seq Per-sender, monotonic.
 * @property {number} serverTick Milliseconds since the room epoch.
 * @property {number} order Global sequence; `event` kinds only, else 0.
 * @property {Uint8Array} payload
 */

/**
 * Fields a caller may set when encoding. Everything omitted defaults to 0
 * (or `PROTO_VERSION` for `protoVersion`).
 *
 * @typedef {object} HeaderInit
 * @property {number} kind
 * @property {number} [slot]
 * @property {number} [protoVersion]
 * @property {number} [flags]
 * @property {number} [seq]
 * @property {number} [serverTick]
 * @property {number} [order]
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Normalize the several shapes a runtime may hand us for binary data.
 *
 * @param {ArrayBuffer | ArrayBufferView | Uint8Array} data
 * @returns {Uint8Array}
 */
export function toBytes(data) {
	if (data instanceof Uint8Array) return data;
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	return new Uint8Array(data);
}

/**
 * Build a framed message.
 *
 * @param {HeaderInit} header
 * @param {Uint8Array} [payload]
 * @returns {Uint8Array}
 */
export function encode(header, payload) {
	const body = payload ?? new Uint8Array(0);
	const out = new Uint8Array(HEADER_BYTES + body.length);
	const view = new DataView(out.buffer);
	out[0] = header.kind & 0xff;
	out[1] = (header.slot ?? 0) & 0xff;
	out[2] = (header.protoVersion ?? PROTO_VERSION) & 0xff;
	out[3] = (header.flags ?? 0) & 0xff;
	view.setUint32(4, (header.seq ?? 0) >>> 0, true);
	view.setUint32(8, (header.serverTick ?? 0) >>> 0, true);
	view.setUint32(12, (header.order ?? 0) >>> 0, true);
	out.set(body, HEADER_BYTES);
	return out;
}

/**
 * Parse a framed message. Returns `null` for anything too short to be an
 * envelope — callers treat that as a protocol error, not a crash.
 *
 * @param {ArrayBuffer | ArrayBufferView | Uint8Array} data
 * @returns {Envelope | null}
 */
export function decode(data) {
	const bytes = toBytes(data);
	if (bytes.length < HEADER_BYTES) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		kind: bytes[0] ?? 0,
		slot: bytes[1] ?? 0,
		protoVersion: bytes[2] ?? 0,
		flags: bytes[3] ?? 0,
		seq: view.getUint32(4, true),
		serverTick: view.getUint32(8, true),
		order: view.getUint32(12, true),
		payload: bytes.subarray(HEADER_BYTES),
	};
}

/**
 * Rewrite header fields on an already-framed message, in place. This is the
 * server's hot path: it stamps `slot`, `serverTick` and `order` onto bytes it
 * received and forwards them without ever touching the payload.
 *
 * @param {Uint8Array} bytes
 * @param {{ slot?: number, serverTick?: number, order?: number, flags?: number }} patch
 * @returns {Uint8Array} The same array, for chaining.
 */
export function restamp(bytes, patch) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (patch.slot !== undefined) bytes[1] = patch.slot & 0xff;
	if (patch.flags !== undefined) bytes[3] = patch.flags & 0xff;
	if (patch.serverTick !== undefined) view.setUint32(8, patch.serverTick >>> 0, true);
	if (patch.order !== undefined) view.setUint32(12, patch.order >>> 0, true);
	return bytes;
}

/**
 * Frame a JSON payload. Used only for the control-plane kinds — game payloads
 * stay binary and opaque.
 *
 * @param {HeaderInit} header
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function encodeJson(header, value) {
	return encode(header, encoder.encode(JSON.stringify(value)));
}

/**
 * Parse a JSON payload. Returns `null` on malformed input rather than throwing,
 * so one bad frame can't take down a room.
 *
 * @param {Uint8Array} payload
 * @returns {any}
 */
export function decodeJson(payload) {
	if (payload.length === 0) return null;
	try {
		return JSON.parse(decoder.decode(payload));
	} catch {
		return null;
	}
}
