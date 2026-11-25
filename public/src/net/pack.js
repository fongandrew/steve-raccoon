// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/pack.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Payload helpers for games.
 *
 * The server never looks at these bytes — this module exists purely so a game
 * doesn't hand-roll DataView arithmetic for the fifth time. Quantization is the
 * point: a car's position at 1/16th of a pixel in 16 bits costs a quarter of
 * what a float64 does, and cadence times payload size is the whole cost model.
 */

export class Writer {
	/**
	 * @param {number} [capacity]
	 */
	constructor(capacity = 128) {
		this.bytes = new Uint8Array(capacity);
		this.view = new DataView(this.bytes.buffer);
		this.at = 0;
	}

	/**
	 * @param {number} extra
	 */
	reserve(extra) {
		if (this.at + extra <= this.bytes.length) return;
		let size = this.bytes.length * 2;
		while (size < this.at + extra) size *= 2;
		const grown = new Uint8Array(size);
		grown.set(this.bytes);
		this.bytes = grown;
		this.view = new DataView(grown.buffer);
	}

	/** @param {number} value */
	u8(value) {
		this.reserve(1);
		this.view.setUint8(this.at, value & 0xff);
		this.at += 1;
		return this;
	}

	/** @param {number} value */
	i8(value) {
		this.reserve(1);
		this.view.setInt8(this.at, clamp(value, -128, 127));
		this.at += 1;
		return this;
	}

	/** @param {number} value */
	u16(value) {
		this.reserve(2);
		this.view.setUint16(this.at, value & 0xffff, true);
		this.at += 2;
		return this;
	}

	/** @param {number} value */
	i16(value) {
		this.reserve(2);
		this.view.setInt16(this.at, clamp(value, -32768, 32767), true);
		this.at += 2;
		return this;
	}

	/** @param {number} value */
	u32(value) {
		this.reserve(4);
		this.view.setUint32(this.at, value >>> 0, true);
		this.at += 4;
		return this;
	}

	/** @param {number} value */
	f32(value) {
		this.reserve(4);
		this.view.setFloat32(this.at, value, true);
		this.at += 4;
		return this;
	}

	/**
	 * A number in a known range, in 16 bits. The workhorse: positions, angles,
	 * speeds. Values outside the range clamp rather than wrap, because a wrapped
	 * car teleporting across the track is far worse than one pinned at the edge.
	 *
	 * @param {number} value
	 * @param {number} min
	 * @param {number} max
	 */
	q16(value, min, max) {
		const span = max - min || 1;
		const t = clamp((value - min) / span, 0, 1);
		return this.u16(Math.round(t * 65535));
	}

	/** @param {string} value */
	str(value) {
		const encoded = new TextEncoder().encode(value);
		this.u16(encoded.length);
		this.reserve(encoded.length);
		this.bytes.set(encoded, this.at);
		this.at += encoded.length;
		return this;
	}

	/** @returns {Uint8Array} */
	done() {
		return this.bytes.subarray(0, this.at);
	}
}

export class Reader {
	/**
	 * @param {Uint8Array} bytes
	 */
	constructor(bytes) {
		this.bytes = bytes;
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.at = 0;
	}

	/** True while there is anything left to read. */
	get more() {
		return this.at < this.bytes.length;
	}

	u8() {
		const v = this.view.getUint8(this.at);
		this.at += 1;
		return v;
	}

	i8() {
		const v = this.view.getInt8(this.at);
		this.at += 1;
		return v;
	}

	u16() {
		const v = this.view.getUint16(this.at, true);
		this.at += 2;
		return v;
	}

	i16() {
		const v = this.view.getInt16(this.at, true);
		this.at += 2;
		return v;
	}

	u32() {
		const v = this.view.getUint32(this.at, true);
		this.at += 4;
		return v;
	}

	f32() {
		const v = this.view.getFloat32(this.at, true);
		this.at += 4;
		return v;
	}

	/**
	 * @param {number} min
	 * @param {number} max
	 */
	q16(min, max) {
		return min + (this.u16() / 65535) * (max - min);
	}

	str() {
		const length = this.u16();
		const slice = this.bytes.subarray(this.at, this.at + length);
		this.at += length;
		return new TextDecoder().decode(slice);
	}
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
	return value < min ? min : value > max ? max : value;
}
