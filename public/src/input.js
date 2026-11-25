// Player input: held keys (`keys`), this frame's key presses (`pressed`) and the
// touch controls (`touch`), fed by the keyboard and the on-screen controls.
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
// --- Touch: the left thumb steers (a wheel appears where it lands; slide
// sideways to turn), the right thumb has GAS and BACK (brake, then reverse). There is no
// drift button: braking through a turn at speed is the drift (see truck.js).
// A quick tap anywhere that isn't a button honks, tapping Steve's portrait is
// a snack, and the pause button has everything else.
export const touch = {
	/** -1 (full left) .. 1 (full right) */
	steer: 0,
	gas: false,
	brake: false,
};

/** Full steering lock is this far from where the thumb landed (px). */
const STEER_R = 46;
/** A touch shorter and stiller than this is a tap: honk. */
const TAP_MS = 220;
const TAP_PX = 10;
/** The pedals count a thumb this far outside their edge (px), so they're easy to hit blind. */
const PEDAL_SLOP = 16;

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
	const el = (/** @type {string} */ id) =>
		/** @type {HTMLElement} */ (document.getElementById(id));
	const unlockAudio = () => {
		audio.init();
		audio.resume();
	};
	/** A synthetic pointer (a test) can't be captured, which is fine: the zone still gets its moves. */
	const capture = (/** @type {HTMLElement} */ zone, /** @type {PointerEvent} */ e) => {
		try {
			zone.setPointerCapture(e.pointerId);
		} catch {
			// not a real pointer
		}
	};
	/**
	 * Remember where and when a finger came down, to tell a tap from a hold.
	 *
	 * @param {PointerEvent} e
	 */
	const tapStart = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
	/** @typedef {ReturnType<typeof tapStart>} Tap */
	const tapMove = (/** @type {Tap} */ tap, /** @type {PointerEvent} */ e) => {
		if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_PX) tap.moved = true;
	};
	const tapEnd = (/** @type {Tap} */ tap) => {
		if (!tap.moved && performance.now() - tap.t < TAP_MS) pressed.add('honk');
	};

	// Left half: steering. A wheel appears under the thumb; only sideways movement counts.
	{
		const zone = el('steerZone');
		const wheel = el('wheel');
		const knob = el('wheelKnob');
		/** @type {number | null} */
		let id = null;
		let ox = 0;
		/** @type {Tap | null} */
		let tap = null;
		zone.addEventListener('pointerdown', (e) => {
			if (id !== null) return;
			e.preventDefault();
			unlockAudio();
			capture(zone, e);
			id = e.pointerId;
			ox = e.clientX;
			tap = tapStart(e);
			touch.steer = 0;
			wheel.style.left = `${e.clientX}px`;
			wheel.style.top = `${e.clientY}px`;
			knob.style.transform = '';
			wheel.classList.add('on');
		});
		zone.addEventListener('pointermove', (e) => {
			if (e.pointerId !== id) return;
			if (tap) tapMove(tap, e);
			let dx = e.clientX - ox;
			if (Math.abs(dx) > STEER_R) {
				// drag the wheel along so it never feels stuck at full lock
				ox += dx - Math.sign(dx) * STEER_R;
				dx = Math.sign(dx) * STEER_R;
				wheel.style.left = `${ox}px`;
			}
			touch.steer = dx / STEER_R;
			// the knob rides round the rim, like a mark on a steering wheel
			knob.style.transform = `rotate(${touch.steer * 62}deg)`;
		});
		/** @param {PointerEvent} e */
		const end = (e) => {
			if (e.pointerId !== id) return;
			id = null;
			touch.steer = 0;
			wheel.classList.remove('on');
			if (tap) tapEnd(tap);
			tap = null;
		};
		zone.addEventListener('pointerup', end);
		zone.addEventListener('pointercancel', end);
	}

	// Right half: GAS and BACK (the brake). Each finger presses whichever pedal it is over,
	// so a thumb can roll from one to the other without lifting.
	{
		const zone = el('pedalZone');
		const pedals = /** @type {const} */ ([
			['gas', el('btnGas')],
			['brake', el('btnBrake')],
		]);
		/** @type {Map<number, { on: 'gas' | 'brake' | null, tap: Tap }>} */
		const fingers = new Map();
		/** @param {PointerEvent} e */
		const over = (e) => {
			for (const [name, btn] of pedals) {
				const r = btn.getBoundingClientRect();
				if (
					e.clientX > r.left - PEDAL_SLOP &&
					e.clientX < r.right + PEDAL_SLOP &&
					e.clientY > r.top - PEDAL_SLOP &&
					e.clientY < r.bottom + PEDAL_SLOP
				)
					return name;
			}
			return null;
		};
		const sync = () => {
			for (const [name, btn] of pedals) {
				const held = [...fingers.values()].some((f) => f.on === name);
				touch[name] = held;
				btn.classList.toggle('on', held);
			}
		};
		zone.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			unlockAudio();
			capture(zone, e);
			fingers.set(e.pointerId, { on: over(e), tap: tapStart(e) });
			sync();
		});
		zone.addEventListener('pointermove', (e) => {
			const f = fingers.get(e.pointerId);
			if (!f) return;
			tapMove(f.tap, e);
			f.on = over(e);
			sync();
		});
		/** @param {PointerEvent} e */
		const end = (e) => {
			const f = fingers.get(e.pointerId);
			if (!f) return;
			fingers.delete(e.pointerId);
			// A tap on open road honks; a tap on a pedal was just a dab of gas or brake
			if (!f.on) tapEnd(f.tap);
			sync();
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
