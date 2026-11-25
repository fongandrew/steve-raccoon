// GENERATED FILE — do not edit.
// Source: pomelo-penguin/server/dev/node-server.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * The Node adapter: the same `RoomCore` over plain `ws`.
 *
 * Three jobs. It's the local dev server (no wrangler startup, real stack
 * traces, a debugger that works). It's the integration-test harness, so the
 * protocol gets exercised over real sockets in vitest. And it's the platform
 * escape hatch — if Cloudflare ever stops fitting, this file is already the
 * whole server.
 *
 * Deliberately mirrors `server/src/room.js` in structure. When you change one,
 * change the other; the divergence is meant to stay boring.
 */

import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

import { WebSocketServer } from 'ws';

import { isValidCode, normalizeCode, randomCode } from './netplay/codes.js';
import {
	CLOSE_FLOODING,
	LIVENESS_MS,
	newConn,
	RoomCore,
	TO_OTHERS,
	TO_SENDER,
} from './netplay/core.js';
import { randomSeed } from './netplay/rng.js';

/** @typedef {import('./netplay/core.js').Conn} Conn */
/** @typedef {import('./netplay/core.js').Action} Action */
/** @typedef {import('ws').WebSocket} WebSocket */

/** Bytes buffered on a socket past which latest-only messages are dropped. */
const BACKPRESSURE_BYTES = 256 * 1024;

/** How often grace windows and socket liveness are swept, matching the DO. */
const SWEEP_MS = 5000;

/**
 * One room: the core plus its live sockets.
 */
class Room {
	/**
	 * @param {string} code
	 * @param {import('./netplay/core.js').RoomInit} init
	 */
	constructor(code, init) {
		this.code = code;
		this.core = new RoomCore();
		this.core.create(init);
		/** @type {Map<WebSocket, Conn>} */
		this.conns = new Map();
		/** @type {Map<WebSocket, number>} Last inbound frame per socket, for liveness. */
		this.lastSeen = new Map();
	}

	/**
	 * @param {WebSocket} ws
	 * @returns {Conn}
	 */
	attach(ws) {
		const conn = newConn(Date.now());
		this.conns.set(ws, conn);
		this.lastSeen.set(ws, Date.now());
		return conn;
	}

	/**
	 * Terminate sockets that have gone silent. Mirrors the Durable Object's use
	 * of getWebSocketAutoResponseTimestamp — see LIVENESS_MS.
	 */
	reapSilent() {
		const now = Date.now();
		for (const [ws, seen] of this.lastSeen) {
			if (now - seen <= LIVENESS_MS) continue;
			this.lastSeen.delete(ws);
			try {
				ws.terminate();
			} catch {
				// already gone; the close handler still runs
			}
		}
	}

	/**
	 * Hang up on a flooding socket. Mirrors `GameRoom.kick`.
	 *
	 * @param {WebSocket} ws
	 * @param {Conn} conn
	 */
	kick(ws, conn) {
		this.conns.delete(ws);
		this.lastSeen.delete(ws);
		this.dispatch(this.core.disconnect(conn), ws);
		ws.close(CLOSE_FLOODING, 'flooding');
	}

	/**
	 * Execute what the core decided. Backpressure policy lives here rather than
	 * in the core: it depends on the transport's notion of a saturated socket.
	 *
	 * @param {Action[]} actions
	 * @param {WebSocket} [sender]
	 */
	dispatch(actions, sender) {
		for (const action of actions) {
			for (const [ws, conn] of this.conns) {
				if (action.to === TO_OTHERS && ws === sender) continue;
				if (action.to >= 0 && conn.slot !== action.to) continue;
				if (action.to === TO_SENDER && ws !== sender) continue;
				if (ws.readyState !== ws.OPEN) continue;
				// Prefer jumpy over paused: a stale position is worth less than the
				// fresh one queued behind it, so drop rather than buffer.
				if (action.latest && ws.bufferedAmount > BACKPRESSURE_BYTES) continue;
				ws.send(action.bytes);
			}
		}
	}
}

/**
 * @param {{ port?: number, host?: string }} [opts]
 */
export function startServer(opts = {}) {
	const port = opts.port ?? 8788;
	const host = opts.host ?? '127.0.0.1';

	/** @type {Map<string, Room>} */
	const rooms = new Map();

	const http = createServer((req, res) => {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
		res.setHeader('access-control-allow-origin', '*');
		res.setHeader('access-control-allow-headers', 'content-type');
		if (req.method === 'OPTIONS') {
			res.writeHead(204).end();
			return;
		}
		if (url.pathname === '/health') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, adapter: 'node', rooms: rooms.size }));
			return;
		}
		if (url.pathname === '/rooms' && req.method === 'POST') {
			readJson(req)
				.then((body) => {
					const gameId = String(body?.gameId ?? '');
					const buildId = String(body?.buildId ?? '');
					/** @type {import('./netplay/core.js').Mode} */
					const mode = body?.mode === 'turnbased' ? 'turnbased' : 'realtime';
					if (!gameId || !buildId) {
						res.writeHead(400, { 'content-type': 'application/json' });
						res.end(JSON.stringify({ error: 'gameId and buildId are required' }));
						return;
					}
					let code = randomCode();
					while (rooms.has(roomKey(gameId, code))) code = randomCode();
					const init = { gameId, buildId, mode, seed: randomSeed(), epoch: Date.now() };
					rooms.set(roomKey(gameId, code), new Room(code, init));
					res.writeHead(200, { 'content-type': 'application/json' });
					res.end(JSON.stringify({ code, seed: init.seed, epoch: init.epoch, mode }));
				})
				.catch(() => {
					res.writeHead(400).end();
				});
			return;
		}
		res.writeHead(404).end();
	});

	const wss = new WebSocketServer({ noServer: true });

	http.on('upgrade', (req, socket, head) => {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
		const gameId = url.searchParams.get('game') ?? '';
		const code = normalizeCode(url.searchParams.get('room') ?? '');
		const room = isValidCode(code) ? rooms.get(roomKey(gameId, code)) : undefined;
		if (!room) {
			socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit('connection', ws, req, room);
		});
	});

	wss.on(
		'connection',
		(/** @type {WebSocket} */ ws, /** @type {any} */ _req, /** @type {Room} */ room) => {
			room.attach(ws);
			ws.on('message', (data, isBinary) => {
				const conn = room.conns.get(ws);
				if (!conn) return;
				room.lastSeen.set(ws, Date.now());
				// Text frames are the keepalive; the DO answers them via
				// setWebSocketAutoResponse without waking, and we mimic that here.
				if (!isBinary) {
					if (String(data) === 'p') ws.send('o');
					else room.core.charge(conn);
				} else {
					room.dispatch(room.core.handle(conn, toArrayBuffer(data)), ws);
				}
				if (conn.kick) room.kick(ws, conn);
			});
			ws.on('close', () => {
				const conn = room.conns.get(ws);
				room.lastSeen.delete(ws);
				if (!conn) return;
				room.conns.delete(ws);
				room.dispatch(room.core.disconnect(conn), ws);
			});
			ws.on('error', () => ws.close());
		},
	);

	const sweeper = setInterval(() => {
		for (const [key, room] of rooms) {
			room.reapSilent();
			room.dispatch(room.core.sweep());
			if (room.core.isEmpty() && room.conns.size === 0) rooms.delete(key);
		}
	}, SWEEP_MS);
	sweeper.unref?.();

	return new Promise((resolve) => {
		http.listen(port, host, () => {
			const address = http.address();
			const actual = typeof address === 'object' && address ? address.port : port;
			resolve({
				port: actual,
				url: `http://${host}:${actual}`,
				rooms,
				async close() {
					clearInterval(sweeper);
					for (const client of wss.clients) client.terminate();
					wss.close();
					await new Promise((done) => http.close(() => done(undefined)));
				},
			});
		});
	});
}

/**
 * @param {string} gameId
 * @param {string} code
 * @returns {string}
 */
function roomKey(gameId, code) {
	return `${gameId}:${code}`;
}

/**
 * `ws` hands us a Buffer (or an array of them); the core wants plain bytes.
 *
 * @param {any} data
 * @returns {Uint8Array}
 */
function toArrayBuffer(data) {
	if (Array.isArray(data)) return toArrayBuffer(Buffer.concat(data));
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
function readJson(req) {
	return new Promise((resolve, reject) => {
		/** @type {Buffer[]} */
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > 64 * 1024) {
				reject(new Error('body too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
			} catch (err) {
				reject(err);
			}
		});
		req.on('error', reject);
	});
}

// Only listen when run directly, so the tests can import `startServer`.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
	const { values } = parseArgs({ options: { port: { type: 'string' } } });
	const server = await startServer({ port: values.port ? Number(values.port) : 8788 });
	console.log(`netplay node adapter listening on ${server.url}`);
}
