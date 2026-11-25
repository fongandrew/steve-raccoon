// Shift lifecycle and the screens around it: reset the town, start, pause and
// end a shift, and fill in the results card.
import { audio } from './audio.js';
import { resetBalls } from './balls.js';
import { resetCamera } from './camera.js';
import { spawnCan } from './cans.js';
import { ACTIVE_CANS, BEST_KEY } from './constants.js';
import { cats, placeCat } from './critters.js';
import { geese, placeGoose, spilled } from './geese.js';
import { $, hud, toast } from './hud.js';
import { link } from './link.js';
import { resetBins } from './loader.js';
import { pigeons, placePigeon } from './pigeons.js';
import { resetPile } from './pile.js';
import { brendaSays, rankFor, starsFor } from './review.js';
import { raccoonFor } from './roster.js';
import { scene, truck, world } from './scene.js';
import { resetProp } from './smash.js';
import { resetShiftState, state } from './state.js';
import { resetTreasures, treasures } from './treasures.js';
import { unstick } from './truck.js';

/** Put the whole town back the way it was and park the truck for a new shift. */
export function resetGame() {
	resetShiftState(state.online ? state.slot : 0);
	state.menuOpen = false;
	resetCamera();
	// Hit timers are in shift time, which just went back to zero
	for (const c of world.circles) c.shook = -9;
	for (const b of world.bushes) b.t = -9;
	for (const h of world.houses) {
		for (const c of [h.can, h.goldCan]) {
			if (c.group.parent !== scene) scene.attach(c.group);
			c.group.scale.set(1, 1, 1);
		}
		h.state = 'idle';
		h.cooldown = 0;
		h.golden = false;
		for (const o of [h.can.group, h.goldCan.group, h.marker.group, h.goldMarker.group])
			o.visible = false;
	}
	for (const p of world.props) resetProp(p);
	for (const c of cats) placeCat(c);
	resetTreasures();
	resetBalls();
	for (const pg of pigeons) placePigeon(pg);
	resetPile();
	resetBins();
	for (const g of geese) placeGoose(g);
	for (const b of spilled) scene.remove(b.mesh);
	spilled.length = 0;
	// Online, the host's room puts the first cans out, the same ones for everybody
	if (!state.online) for (let i = 0; i < ACTIVE_CANS; i++) spawnCan(true);
}

const getBest = () => +(localStorage.getItem(BEST_KEY) || 0);
function showBest() {
	const b = getBest();
	$('best').textContent = b ? `Personal best: ${b}` : 'Tip: full loads pay a big bonus.';
}
/**
 * Start a shift, or a practice run: the same town with no clock and no results.
 *
 * @param {boolean} [practice]
 */
export function startShift(practice = false) {
	audio.init();
	audio.resume();
	state.online = false;
	state.slot = 0;
	truck.setLivery(raccoonFor(0));
	resetGame();
	state.practice = practice;
	state.mode = 'playing';
	showGame();
	hud.toast.innerHTML = '';
	if (practice) toast('🚧 Practice run: no clock. Pause (P) to end it whenever you like.', 5);
	else toast('☀️ Good morning, Steve! Empty the glowing trash cans before the sun goes down.', 4);
}

/** Swap the menus for the HUD, with the pause-menu buttons that suit this kind of game. */
function showGame() {
	for (const id of ['title', 'results', 'pause', 'lobby']) $(id).classList.add('hidden');
	$('hud').classList.remove('hidden');
	$('endBtn').classList.toggle('hidden', !state.practice);
	$('leaveBtn').classList.toggle('hidden', !state.online);
	$('board').classList.toggle('hidden', !state.online);
}

/**
 * A shift in a room is starting (multi.js): park this raccoon on the grid in
 * their own colours and wait for the countdown.
 *
 * @param {number} slot
 */
export function beginOnlineShift(slot) {
	audio.init();
	audio.resume();
	state.online = true;
	state.slot = slot;
	state.practice = false;
	truck.setLivery(raccoonFor(slot));
	resetGame();
	state.mode = 'countdown';
	showGame();
	hud.toast.innerHTML = '';
	toast('🚦 Trucks at the ready! Most points when the sun goes down wins.', 4);
}

/**
 * Back to the title screen, as after loading: town reset, Steve in the truck.
 * Used when leaving a practice run or a room.
 */
export function backToTitle() {
	state.online = false;
	state.slot = 0;
	state.practice = false;
	truck.setLivery(raccoonFor(0));
	resetGame();
	state.mode = 'title';
	hud.toast.innerHTML = '';
	for (const id of ['pause', 'hud', 'results', 'lobby']) $(id).classList.add('hidden');
	$('title').classList.remove('hidden');
}

/** Leave a practice run: straight back to the title screen, nothing recorded. */
export function endPractice() {
	backToTitle();
}

export function endShift() {
	state.mode = 'results';
	audio.fanfare();
	const s = state.score;
	const stars = starsFor(s);
	$('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
	$('rank').textContent = rankFor(s);
	const st = state.stats;
	const rows = [
		['Final score', s],
		['Cans emptied', st.cans],
		['Dumpsters hoisted over the cab', st.dumpsters],
		['Bags delivered to The Dump', st.dumped],
		['Cargo eaten "for quality control"', st.snacks],
		['Longest airtime', `${st.air.toFixed(1)}s`],
		['Property "rearranged"', st.smashed],
		['Trees felled', st.trees],
		['Treasures hoarded', `${st.treasures}/${treasures.length}`],
		['Double grabs', st.doubles],
		['Boosts', st.boosts],
		['Geese disrespected', st.geese],
		['Citizens bounced', st.cats],
		...(state.online ? [['Trucks bumped', st.bumps]] : []),
	];
	$('review').textContent = brendaSays(stars, st);
	$('resultTable').innerHTML = rows
		.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
		.join('');
	const isBest = s > getBest();
	if (isBest) localStorage.setItem(BEST_KEY, String(s));
	$('newBest').classList.toggle('hidden', !isBest);
	// In a room: the table of everyone's scores, and only the host can go again
	const net = link.session;
	$('leaderboard').classList.toggle('hidden', !net);
	$('roomRow').classList.toggle('hidden', !net);
	$('againBtn').classList.toggle('hidden', !!net && !net.isHost());
	if (net) showStandings(net.table());
	$('results').classList.remove('hidden');
	showBest();
}

/**
 * Fill in the room's results table. Called again as late scores arrive.
 *
 * @param {import('./link.js').Standing[]} table
 */
export function showStandings(table) {
	const medals = ['🥇', '🥈', '🥉', ''];
	$('leaderboard').innerHTML = table
		.map(
			(p, i) =>
				`<tr class="${p.me ? 'me' : ''}"><td>${medals[Math.min(i, 3)]}</td>` +
				`<td><i style="background:${p.css}"></i>${p.name}${p.me ? ' (you)' : ''}</td>` +
				`<td>${p.score}</td></tr>`,
		)
		.join('');
	const net = link.session;
	$('againBtn').classList.toggle('hidden', !!net && !net.isHost());
	$('waitHost').classList.toggle('hidden', !net || net.isHost());
}

/** @param {boolean} p */
export function setPaused(p) {
	if (state.online) {
		// A shared shift can't stop for one truck: the menu is just an overlay
		if (state.mode !== 'playing' && state.mode !== 'countdown') return;
		state.menuOpen = p;
		$('pause').classList.toggle('hidden', !p);
		return;
	}
	if (p && state.mode === 'playing') {
		state.mode = 'paused';
		$('pause').classList.remove('hidden');
	} else if (!p && state.mode === 'paused') {
		state.mode = 'playing';
		$('pause').classList.add('hidden');
	}
}

export function syncMuteBtn() {
	$('muteBtn').textContent = audio.muted ? '🔇 Sound off' : '🔊 Sound on';
}

/** Wire the title / pause / results buttons. Call once, from `start()`. */
export function initScreens() {
	showBest();
	$('startBtn').addEventListener('click', () => startShift());
	$('practiceBtn').addEventListener('click', () => startShift(true));
	$('againBtn').addEventListener('click', () => {
		// In a room, "another shift" is the host starting one for everybody
		if (link.session) link.session.startNextShift();
		else startShift();
	});
	$('endBtn').addEventListener('click', endPractice);
	$('resumeBtn').addEventListener('click', () => setPaused(false));
	$('unstickBtn').addEventListener('click', () => {
		setPaused(false);
		unstick();
	});
	$('muteBtn').addEventListener('click', () => {
		audio.toggleMute();
		syncMuteBtn();
	});
	// (Not online: popping a menu over a shift that can't pause would only get in the way.)
	window.addEventListener('blur', () => !state.online && setPaused(true));
	document.addEventListener(
		'visibilitychange',
		() => document.hidden && !state.online && setPaused(true),
	);
}
