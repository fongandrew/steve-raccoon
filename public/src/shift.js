import { audio } from './audio.js';
import { resetBalls } from './balls.js';
import { resetCamera } from './camera.js';
import { spawnCan } from './cans.js';
import { ACTIVE_CANS, BEST_KEY } from './constants.js';
import { cats, placeCat } from './critters.js';
import { geese, placeGoose, spilled } from './geese.js';
import { $, hud, toast } from './hud.js';
import { resetBins } from './loader.js';
import { pigeons, placePigeon } from './pigeons.js';
import { resetPile } from './pile.js';
import { brendaSays, rankFor, starsFor } from './review.js';
import { scene, world } from './scene.js';
import { resetProp } from './smash.js';
import { resetShiftState, state } from './state.js';
import { resetTreasures, treasures } from './treasures.js';
import { unstick } from './truck.js';

/** Put the whole town back the way it was and park the truck for a new shift. */
export function resetGame() {
	resetShiftState();
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
	for (let i = 0; i < ACTIVE_CANS; i++) spawnCan(true);
}

const getBest = () => +(localStorage.getItem(BEST_KEY) || 0);
function showBest() {
	const b = getBest();
	$('best').textContent = b ? `Personal best: ${b}` : 'Tip: full loads pay a big bonus.';
}
export function startShift() {
	audio.init();
	audio.resume();
	resetGame();
	state.mode = 'playing';
	$('title').classList.add('hidden');
	$('results').classList.add('hidden');
	$('hud').classList.remove('hidden');
	hud.toast.innerHTML = '';
	toast('☀️ Good morning, Steve! Empty the glowing trash cans before the sun goes down.', 4);
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
	];
	$('review').textContent = brendaSays(stars, st);
	$('resultTable').innerHTML = rows
		.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
		.join('');
	const isBest = s > getBest();
	if (isBest) localStorage.setItem(BEST_KEY, String(s));
	$('newBest').classList.toggle('hidden', !isBest);
	$('results').classList.remove('hidden');
	showBest();
}

export function setPaused(p) {
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
	$('startBtn').addEventListener('click', startShift);
	$('againBtn').addEventListener('click', startShift);
	$('resumeBtn').addEventListener('click', () => setPaused(false));
	$('unstickBtn').addEventListener('click', () => {
		setPaused(false);
		unstick();
	});
	$('muteBtn').addEventListener('click', () => {
		audio.toggleMute();
		syncMuteBtn();
	});
	window.addEventListener('blur', () => setPaused(true));
	document.addEventListener('visibilitychange', () => document.hidden && setPaused(true));
}
