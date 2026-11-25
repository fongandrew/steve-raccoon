// "Play with friends": making or joining a room on the netplay relay, the
// lobby screen where trucks gather, and leaving again. The room itself, once
// connected, is the `Session` in multi.js.
import { audio } from './audio.js';
import { buildId, GAME_ID, serverUrl } from './config.js';
import { $ } from './hud.js';
import { link } from './link.js';
import { Session } from './multi.js';
import { createRoom, NetClient } from './net/client.js';
import { isValidCode, normalizeCode } from './net/codes.js';
import { clearRivals } from './rivals.js';
import { MAX_PLAYERS } from './roster.js';
import { backToTitle } from './shift.js';
import { state } from './state.js';

/**
 * @typedef {object} Online
 * @property {NetClient} net
 * @property {Session} session
 * @property {string} code
 * @property {string} status connection state, for the lobby
 */

/** @type {Online | null} */
let online = null;

/** If a room never lets us in, stop retrying after this long and say so. */
const JOIN_GIVE_UP_MS = 7000;

/** The room we're in, for the test hook and the service worker. */
export const room = () => online;

/** @param {string} code */
function setRoomInUrl(code) {
	const url = new URL(location.href);
	if (code) url.searchParams.set('room', code);
	else url.searchParams.delete('room');
	history.replaceState(null, '', url);
}

/**
 * Show the lobby: the make-or-join panel, or the room we're in.
 *
 * @param {string} [error]
 */
function show(error = '') {
	for (const id of ['title', 'results', 'pause']) $(id).classList.add('hidden');
	$('lobby').classList.remove('hidden');
	$('lobbyError').textContent = error;
	render();
}

/** Redraw the lobby from the room's current state. */
function render() {
	const o = online;
	$('lobbyJoin').classList.toggle('hidden', !!o);
	$('lobbyRoom').classList.toggle('hidden', !o);
	if (!o) return;
	const players = o.session.lobby();
	const live = o.status === 'live';
	$('roomCode').textContent = o.code;
	$('roomPlayers').innerHTML = players
		.map(
			(p) =>
				`<li><i style="background:${p.css}"></i><b>${p.name}</b>` +
				`${p.me ? ' (you)' : ''}${p.host ? ' · host' : ''}</li>`,
		)
		.join('');
	const host = o.session.isHost();
	$('roomStart').classList.toggle('hidden', !host || !live);
	$('roomStatus').textContent = !live
		? 'Connecting…'
		: host
			? players.length < 2
				? 'Share the code, or just the link in the address bar. You can start on your own, too.'
				: `${players.length} trucks ready.`
			: `Waiting for ${o.session.hostName()} to start the shift.`;
	// On the results screen, the same facts decide who sees "Another Shift"
	$('againBtn').classList.toggle('hidden', state.mode === 'results' && !host);
	$('waitHost').classList.toggle('hidden', state.mode !== 'results' || host);
	$('waitHost').textContent = `Waiting for ${o.session.hostName()} to start another shift.`;
}

/**
 * Join room `code` (which may have just been created).
 *
 * @param {string} code
 */
export async function connect(code) {
	leave(false);
	/**
	 * The live room, but only while it's still the one this client was made
	 * for: callbacks from a socket we've since left must do nothing.
	 *
	 * @returns {Online | null}
	 */
	const mine = () => (online !== null && online.net === net ? online : null);
	// The relay answers an unknown code with a bare 404 on the socket upgrade,
	// which the client can't tell from a flaky network and just retries. If we
	// have never got in, give up after a few seconds and say so.
	let welcomed = false;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let giveUp = null;
	/** @param {string} msg */
	const fail = (msg) => {
		leave(false);
		show(msg);
	};
	/** @type {NetClient} */
	const net = new NetClient({
		serverUrl: serverUrl(),
		gameId: GAME_ID,
		buildId: await buildId(),
		room: code,
		name: 'Raccoon',
		onStatus: (status) => {
			const o = mine();
			if (!o) return;
			o.status = status;
			if (status === 'reconnecting' && !welcomed && giveUp === null) {
				giveUp = setTimeout(() => {
					if (!welcomed && mine()) {
						fail(`Couldn't find room ${code}. Check the code and try again.`);
					}
				}, JOIN_GIVE_UP_MS);
			}
			render();
		},
		onWelcome: (welcome) => {
			const o = mine();
			if (!o) return;
			welcomed = true;
			if (giveUp !== null) clearTimeout(giveUp);
			if (net.slot >= MAX_PLAYERS) {
				fail(`That room is full: ${MAX_PLAYERS} trucks is the limit.`);
				return;
			}
			o.session.onWelcome(welcome);
		},
		onPresence: (msg) => mine()?.session.onPresence(msg),
		onMessage: (env) => mine()?.session.onMessage(env),
		onNeedKeyframe: () => mine()?.session.keyframe(),
		onError: (err) => {
			if (!mine()) return;
			const kind = String(err?.code ?? '');
			if (kind === 'version' && err?.reloading) return;
			if (kind === 'no_room') fail("There's no room with that code.");
			else if (kind === 'full') fail('That room is full.');
			else if (kind === 'version_stuck') {
				fail('This game is out of date. Close the tab and open it again.');
			} else render();
		},
	});
	const session = new Session({
		code,
		onChange: render,
		net: {
			get slot() {
				return net.slot;
			},
			serverNow: () => net.serverNow(),
			tick: (dt) => net.clock.step(dt),
			sendEvent: (b) => void net.sendEvent(b),
			sendSnapshot: (b) => void net.sendSnapshot(b),
			sendKeyframe: (b) => void net.sendKeyframe(b),
			sendControl: (v) => void net.sendControl(v),
		},
	});
	online = { net, session, code, status: 'connecting' };
	link.session = session;
	setRoomInUrl(code);
	net.connect();
	show();
}

/**
 * Leave the room, if we're in one.
 *
 * @param {boolean} [toTitle] go back to the title screen (not when about to show the lobby again)
 */
export function leave(toTitle = true) {
	if (online) {
		online.net.close();
		online = null;
		link.session = null;
		clearRivals();
		setRoomInUrl('');
	}
	if (toTitle) backToTitle();
	else if (state.online) {
		backToTitle();
		$('title').classList.add('hidden');
	}
}

export async function hostRoom() {
	audio.init();
	try {
		const made = await createRoom({
			serverUrl: serverUrl(),
			gameId: GAME_ID,
			buildId: await buildId(),
			mode: 'realtime',
		});
		await connect(made.code);
	} catch {
		show("Couldn't reach the game server. Try again in a moment.");
	}
}

/** @param {string} raw */
export function joinRoom(raw) {
	audio.init();
	const code = normalizeCode(raw);
	if (!isValidCode(code)) {
		show("That code doesn't look right.");
		return;
	}
	void connect(code);
}

/** Wire the lobby's buttons, and join straight away from a `?room=` link. Call once, from `start()`. */
export function initLobby() {
	const input = /** @type {HTMLInputElement} */ ($('codeInput'));
	$('friendsBtn').addEventListener('click', () => show());
	$('lobbyHost').addEventListener('click', () => void hostRoom());
	$('lobbyGo').addEventListener('click', () => joinRoom(input.value));
	input.addEventListener('keydown', (e) => {
		e.stopPropagation(); // typing a code is not driving
		if (e.key === 'Enter') joinRoom(input.value);
	});
	input.addEventListener('keyup', (e) => e.stopPropagation());
	$('lobbyBack').addEventListener('click', () => leave());
	$('roomLeave').addEventListener('click', () => leave());
	$('leaveBtn').addEventListener('click', () => leave());
	$('resultsLeave').addEventListener('click', () => leave());
	$('roomStart').addEventListener('click', () => online?.session.startNextShift());

	const fromUrl = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
	if (isValidCode(fromUrl)) void connect(fromUrl);
}
