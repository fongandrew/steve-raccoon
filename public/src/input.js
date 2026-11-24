// Player input: held keys (`keys`), this frame's key presses (`pressed`) and the
// touch thumbstick (`stick`), fed by the keyboard and the on-screen controls.
import { audio } from './audio.js';

/** @type {Set<string>} */
export const keys = new Set();
/** @type {Set<string>} */
export const pressed = new Set(); // edge-triggered this frame
/** @type {Record<string, string>} */
const KEYMAP = {
	KeyW: 'gas',
	ArrowUp: 'gas',
	KeyS: 'brake',
	ArrowDown: 'brake',
	KeyA: 'left',
	ArrowLeft: 'left',
	KeyD: 'right',
	ArrowRight: 'right',
	Space: 'drift',
	ShiftLeft: 'drift',
	KeyE: 'snack',
	KeyH: 'honk',
	KeyR: 'reset',
	KeyP: 'pause',
	Escape: 'pause',
	KeyM: 'mute',
	Enter: 'enter',
};
// --- Touch: a floating thumbstick on the left, DRIFT + HONK on the right,
// tap Steve's portrait to snack, pause button for everything else.
export const stick = {
	active: false,
	id: /** @type {number | null} */ (null),
	ox: 0,
	oy: 0,
	x: 0,
	y: 0,
};
function enableTouch() {
	if (!document.body.classList.contains('touch')) document.body.classList.add('touch');
}

/** Wire the keyboard, the touch stick and the on-screen buttons. Call once, from `start()`. */
export function initInput() {
	window.addEventListener('keydown', (e) => {
		const k = KEYMAP[e.code];
		if (!k) return;
		e.preventDefault();
		if (!keys.has(k)) pressed.add(k);
		keys.add(k);
		audio.init();
		audio.resume();
	});
	window.addEventListener('keyup', (e) => {
		const k = KEYMAP[e.code];
		if (k) keys.delete(k);
	});
	if (window.matchMedia('(pointer: coarse)').matches) enableTouch();
	window.addEventListener('touchstart', enableTouch, { passive: true });

	const btns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#touch .tbtn'));
	for (const btn of btns) {
		const k = /** @type {string} */ (btn.dataset.key);
		/** @param {PointerEvent} e */
		const down = (e) => {
			e.preventDefault();
			audio.init();
			audio.resume();
			if (!keys.has(k)) pressed.add(k);
			keys.add(k);
			btn.classList.add('on');
		};
		/** @param {PointerEvent} e */
		const up = (e) => {
			e.preventDefault();
			keys.delete(k);
			btn.classList.remove('on');
		};
		btn.addEventListener('pointerdown', down);
		btn.addEventListener('pointerup', up);
		btn.addEventListener('pointercancel', up);
		btn.addEventListener('pointerleave', up);
	}
	{
		const zone = /** @type {HTMLElement} */ (document.getElementById('stickZone'));
		const ring = /** @type {HTMLElement} */ (document.getElementById('stick'));
		const knob = /** @type {HTMLElement} */ (document.getElementById('knob'));
		const R = 50;
		/** @param {PointerEvent} e */
		const move = (e) => {
			if (e.pointerId !== stick.id) return;
			let dx = e.clientX - stick.ox;
			let dy = e.clientY - stick.oy;
			const d = Math.hypot(dx, dy);
			if (d > R) {
				// drag the base along so the stick never feels stuck at the rim
				stick.ox += (dx / d) * (d - R);
				stick.oy += (dy / d) * (d - R);
				dx = (dx / d) * R;
				dy = (dy / d) * R;
				ring.style.left = `${stick.ox}px`;
				ring.style.top = `${stick.oy}px`;
			}
			stick.x = dx / R;
			stick.y = dy / R;
			knob.style.transform = `translate(${dx}px, ${dy}px)`;
		};
		zone.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			audio.init();
			audio.resume();
			zone.setPointerCapture(e.pointerId);
			Object.assign(stick, {
				active: true,
				id: e.pointerId,
				ox: e.clientX,
				oy: e.clientY,
				x: 0,
				y: 0,
			});
			ring.style.left = `${e.clientX}px`;
			ring.style.top = `${e.clientY}px`;
			knob.style.transform = '';
			ring.classList.add('on');
		});
		zone.addEventListener('pointermove', move);
		/** @param {PointerEvent} e */
		const end = (e) => {
			if (e.pointerId !== stick.id) return;
			Object.assign(stick, { active: false, id: null, x: 0, y: 0 });
			ring.classList.remove('on');
		};
		zone.addEventListener('pointerup', end);
		zone.addEventListener('pointercancel', end);
	}
	const portrait = /** @type {HTMLElement} */ (document.getElementById('portrait'));
	portrait.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		audio.init();
		pressed.add('snack');
	});
}
