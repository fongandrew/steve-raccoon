// The DOM heads-up display: score/clock/load readouts, floating score popups
// that track a point in the world, and the narrator's toasts.
import * as THREE from '../vendor/three.module.js';
import { CAPACITY, SHIFT } from './constants.js';
import { pickLine } from './lines.js';
import { link } from './link.js';
import { raccoonFor } from './roster.js';
import { camera } from './scene.js';
import { state } from './state.js';
import { boostLevel, fmtCountdown } from './util.js';

const tmpV = new THREE.Vector3();

/**
 * Look up an element that index.html is known to contain.
 *
 * @param {string} id
 * @returns {HTMLElement}
 */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
export const hud = {
	score: $('score'),
	clock: $('clock'),
	clockLabel: $('clockLabel'),
	loadText: $('loadText'),
	loadBar: $('loadBar'),
	hungerText: $('hungerText'),
	hungerBar: $('hungerBar'),
	status: $('status'),
	toast: $('toast'),
	popups: $('popups'),
	board: $('board'),
	brake: $('btnBrake'),
};
/**
 * A floating label that rises from a point in the world.
 *
 * @typedef {object} Popup
 * @property {HTMLDivElement} el
 * @property {THREE.Vector3} anchor kept by reference
 * @property {number} yOff
 * @property {number} t seconds shown so far
 * @property {number} life
 */

/** @type {Popup[]} */
const popups = [];

/**
 * @param {string} text
 * @param {THREE.Vector3} anchor world position to float above
 * @param {string} [cls] extra CSS class
 * @param {number} [yOff] extra height above the anchor
 */
export function popup(text, anchor, cls = '', yOff = 0) {
	// Anchor is kept by reference, so popups on the truck ride along with it.
	const el = document.createElement('div');
	el.className = `popup ${cls}`;
	el.textContent = text;
	hud.popups.appendChild(el);
	popups.push({ el, anchor, yOff: 2 + yOff, t: 0, life: 1.4 });
}

/** @param {number} dt */
export function updatePopups(dt) {
	for (let i = popups.length - 1; i >= 0; i--) {
		const p = /** @type {Popup} */ (popups[i]);
		p.t += dt;
		tmpV.copy(p.anchor);
		tmpV.y += p.yOff + p.t * 2.5;
		tmpV.project(camera);
		if (p.t > p.life || tmpV.z > 1) {
			p.el.remove();
			popups.splice(i, 1);
			continue;
		}
		p.el.style.left = `${((tmpV.x + 1) / 2) * window.innerWidth}px`;
		p.el.style.top = `${((1 - tmpV.y) / 2) * window.innerHeight}px`;
		p.el.style.opacity = String(Math.min(1, (p.life - p.t) * 3));
	}
}

/**
 * @param {string} msg
 * @param {number} [dur] seconds on screen
 */
export function toast(msg, dur = 3.2) {
	// The narrator knows every raccoon as Steve; online, say who is actually driving
	if (state.online && state.slot) msg = msg.replaceAll('Steve', raccoonFor(state.slot).name);
	const el = document.createElement('div');
	el.className = 'toast-msg';
	el.textContent = msg;
	hud.toast.appendChild(el);
	while (hud.toast.children.length > 3) /** @type {ChildNode} */ (hud.toast.firstChild).remove();
	setTimeout(() => (el.style.opacity = '0'), dur * 1000);
	setTimeout(() => el.remove(), dur * 1000 + 500);
}

/**
 * Narrate an event. Lines are rate-limited so the narrator doesn't babble.
 *
 * @param {import('./lines.js').LineKind} kind
 * @param {number} [chance] probability of saying anything at all
 * @param {boolean} [force] skip the rate limit
 */
export function narrate(kind, chance = 1, force = false) {
	if (state.mode !== 'playing' || Math.random() > chance) return;
	if (!force && state.time - state.lastNarration < 7) return;
	state.lastNarration = state.time;
	state.quipT = Math.max(state.quipT, 15);
	toast(pickLine(kind), 3.6);
}

let boardKey = '';
/** Online: everyone's score, best first, redrawn only when it changes. */
function updateBoard() {
	const table = link.session?.table() ?? [];
	const key = table.map((p) => `${p.slot}:${p.score}`).join();
	if (key === boardKey) return;
	boardKey = key;
	hud.board.innerHTML = table
		.map(
			(p) =>
				`<div class="${p.me ? 'me' : ''}"><i style="background:${p.css}"></i>` +
				`<span>${p.name}</span><b>${p.score}</b></div>`,
		)
		.join('');
}

export function updateHud() {
	hud.score.textContent = String(state.score);
	const waiting = state.mode === 'countdown';
	hud.clockLabel.textContent = state.practice
		? 'Practice'
		: waiting
			? 'Starting in'
			: 'Time left';
	hud.clock.textContent = state.practice
		? '∞'
		: waiting
			? String(Math.max(1, Math.ceil(-state.time)))
			: fmtCountdown(SHIFT - state.time);
	updateBoard();
	hud.clock.style.color = !state.practice && SHIFT - state.time < 30 ? '#e17055' : '';
	hud.loadText.textContent = `${state.load}/${CAPACITY}`;
	hud.loadBar.style.width = `${(state.load / CAPACITY) * 100}%`;
	hud.loadBar.classList.toggle('full', state.load >= CAPACITY);
	hud.hungerBar.style.width = `${state.hunger}%`;
	hud.hungerBar.style.backgroundPosition = `${-(100 - state.hunger) * 0}px 0`;
	hud.hungerText.textContent =
		state.hunger > 60
			? 'happy'
			: state.hunger > 25
				? 'peckish'
				: state.hunger > 0
					? 'HUNGRY'
					: 'HANGRY';
	/** @type {string[]} */
	const st = [];
	if (state.hangry)
		st.push(
			document.body.classList.contains('touch')
				? '😾 HANGRY! Tap Steve'
				: '😾 HANGRY! Press E',
		);
	if (state.goldenHour) st.push('⭐ GOLDEN HOUR x2');
	if (state.boostT > 0) st.push('🔥 BOOST');
	else if (state.driftCharge > 0.6)
		st.push(
			/** @type {string} */ (
				['', '💙 boost ready', '🧡 SUPER boost', '💖 ULTRA boost'][
					boostLevel(state.driftCharge)
				]
			),
		);
	if (state.zoomT > 0) st.push('☕ ZOOMIES');
	if (state.hicT > 0) st.push('🫧 hiccups');
	if (state.streak > 1 && state.time - state.lastCollect < 14)
		st.push(`🔥 streak x${state.streak}`);
	if (state.load >= CAPACITY) st.push('🚛 FULL → Dump!');
	hud.status.textContent = st.join(' · ');
	// Touch: the brake lights up through a drift, in the colour of the boost it has earned
	hud.brake.dataset.drift = state.touchDrift ? String(boostLevel(state.driftCharge)) : '';
}
