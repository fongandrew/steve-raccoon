import * as THREE from '../vendor/three.module.js';
import { CAPACITY, SHIFT } from './constants.js';
import { pickLine } from './lines.js';
import { camera } from './scene.js';
import { state } from './state.js';
import { boostLevel, fmtCountdown } from './util.js';

const tmpV = new THREE.Vector3();

export const $ = (id) => document.getElementById(id);
export const hud = {
	score: $('score'),
	clock: $('clock'),
	loadText: $('loadText'),
	loadBar: $('loadBar'),
	hungerText: $('hungerText'),
	hungerBar: $('hungerBar'),
	status: $('status'),
	toast: $('toast'),
	popups: $('popups'),
};
const popups = [];

export function popup(text, anchor, cls = '', yOff = 0) {
	// Anchor is kept by reference, so popups on the truck ride along with it.
	const el = document.createElement('div');
	el.className = `popup ${cls}`;
	el.textContent = text;
	hud.popups.appendChild(el);
	popups.push({ el, anchor, yOff: 2 + yOff, t: 0, life: 1.4 });
}

export function updatePopups(dt) {
	for (let i = popups.length - 1; i >= 0; i--) {
		const p = popups[i];
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

export function toast(msg, dur = 3.2) {
	const el = document.createElement('div');
	el.className = 'toast-msg';
	el.textContent = msg;
	hud.toast.appendChild(el);
	while (hud.toast.children.length > 3) hud.toast.firstChild.remove();
	setTimeout(() => (el.style.opacity = '0'), dur * 1000);
	setTimeout(() => el.remove(), dur * 1000 + 500);
}

/** Narrate an event. Lines are rate-limited so the narrator doesn't babble. */
export function narrate(kind, chance = 1, force = false) {
	if (state.mode !== 'playing' || Math.random() > chance) return;
	if (!force && state.time - state.lastNarration < 7) return;
	state.lastNarration = state.time;
	state.quipT = Math.max(state.quipT, 15);
	toast(pickLine(kind), 3.6);
}

export function updateHud() {
	hud.score.textContent = state.score;
	hud.clock.textContent = fmtCountdown(SHIFT - state.time);
	hud.clock.style.color = SHIFT - state.time < 30 ? '#e17055' : '';
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
			['', '💙 boost ready', '🧡 SUPER boost', '💖 ULTRA boost'][
				boostLevel(state.driftCharge)
			],
		);
	if (state.zoomT > 0) st.push('☕ ZOOMIES');
	if (state.hicT > 0) st.push('🫧 hiccups');
	if (state.streak > 1 && state.time - state.lastCollect < 14)
		st.push(`🔥 streak x${state.streak}`);
	if (state.load >= CAPACITY) st.push('🚛 FULL → Dump!');
	hud.status.textContent = st.join(' · ');
}
