// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/index.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * What a game imports. Everything else in this package is an implementation
 * detail — a game should not need to know the envelope layout.
 *
 * The contract, in short: pick a `gameId`, declare `realtime` or `turnbased`,
 * encode your own owned state and contested events into opaque bytes, and let
 * the SDK handle slots, ordering, catch-up and reconnects.
 */

export { createRoom, NetClient } from './client.js';
export { Clock } from './clock.js';
export { isValidCode, normalizeCode } from './codes.js';
export { ContestedLog } from './events.js';
export { lerpAngle, lerpNumber, OwnedBuffer } from './owned.js';
export { clamp, Reader, Writer } from './pack.js';
export { decode, decodeJson, encode, encodeJson, KIND, PROTO_VERSION } from './protocol.js';
export { intRange, makeRng, pick, shuffle, streamFor } from './rng.js';
