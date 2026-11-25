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
// --- Touch: the left thumb steers, the right thumb works the pedal (hold to
// go, pull down to brake). There is no drift button: braking through a turn at
// speed is the drift (see truck.js). 📯 honks, tapping Steve's portrait is a
// snack, and the pause button has everything else.
export const touch = {
	/** -1 (full left) .. 1 (full right) */
	steer: 0,
	gas: false,
	brake: false,
};

/** Full steering lock is this far from where the thumb landed (px). */
const STEER_R = 50;
/** Pull the pedal thumb down this far (px) to brake... */
const BRAKE_PULL = 24;
/** ...and bring it back up this far to get back on the gas. */
const GAS_PUSH = 16;

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
	/**
	 * Follow one finger in a zone. A synthetic pointer (a test) can't be
	 * captured, which is fine: the zone still gets its moves.
	 *
	 * @param {HTMLElement} zone
	 * @param {{ down: (e: PointerEvent) => void, move: (e: PointerEvent) => void, up: () => void }} on
	 */
	const track = (zone, on) => {
		/** @type {number | null} */
		let id = null;
		zone.addEventListener('pointerdown', (e) => {
			if (id !== null) return;
			e.preventDefault();
			audio.init();
			audio.resume();
			try {
				zone.setPointerCapture(e.pointerId);
			} catch {
				// not a real pointer
			}
			id = e.pointerId;
			on.down(e);
		});
		zone.addEventListener('pointermove', (e) => {
			if (e.pointerId === id) on.move(e);
		});
		/** @param {PointerEvent} e */
		const end = (e) => {
			if (e.pointerId !== id) return;
			id = null;
			on.up();
		};
		zone.addEventListener('pointerup', end);
		zone.addEventListener('pointercancel', end);
	};
	const el = (/** @type {string} */ id) =>
		/** @type {HTMLElement} */ (document.getElementById(id));

	// Left thumb: steering. Only sideways movement counts.
	{
		const ring = el('stick');
		const knob = el('knob');
		let ox = 0;
		/** @param {PointerEvent} e */
		const move = (e) => {
			let dx = e.clientX - ox;
			if (Math.abs(dx) > STEER_R) {
				// drag the base along so the wheel never feels stuck at full lock
				ox += dx - Math.sign(dx) * STEER_R;
				dx = Math.sign(dx) * STEER_R;
				ring.style.left = `${ox}px`;
			}
			touch.steer = dx / STEER_R;
			knob.style.transform = `translateX(${dx}px)`;
		};
		track(el('steerZone'), {
			down: (e) => {
				ox = e.clientX;
				touch.steer = 0;
				ring.style.left = `${e.clientX}px`;
				ring.style.top = `${e.clientY}px`;
				knob.style.transform = '';
				ring.classList.add('on');
			},
			move,
			up: () => {
				touch.steer = 0;
				// back to its resting spot in the corner
				ring.style.left = '';
				ring.style.top = '';
				knob.style.transform = '';
				ring.classList.remove('on');
			},
		});
	}

	// Right thumb: the pedal. Down is gas; pull down to brake, push back up for gas.
	{
		const pedal = el('pedal');
		const knob = el('pedalKnob');
		/** The highest the thumb has been while on the gas, or the lowest while braking. */
		let ref = 0;
		const show = () => {
			pedal.classList.toggle('brake', touch.brake);
			knob.style.transform = touch.brake ? 'translateY(34px)' : '';
		};
		track(el('pedalZone'), {
			down: (e) => {
				ref = e.clientY;
				touch.gas = true;
				touch.brake = false;
				pedal.style.left = `${e.clientX}px`;
				pedal.style.top = `${e.clientY}px`;
				pedal.classList.add('on');
				show();
			},
			move: (e) => {
				const y = e.clientY;
				if (touch.gas) {
					ref = Math.min(ref, y);
					if (y - ref > BRAKE_PULL) {
						touch.gas = false;
						touch.brake = true;
						ref = y;
					}
				} else {
					ref = Math.max(ref, y);
					if (ref - y > GAS_PUSH) {
						touch.gas = true;
						touch.brake = false;
						ref = y;
					}
				}
				show();
			},
			up: () => {
				touch.gas = false;
				touch.brake = false;
				pedal.style.left = '';
				pedal.style.top = '';
				pedal.classList.remove('on');
				show();
			},
		});
	}
	const portrait = /** @type {HTMLElement} */ (document.getElementById('portrait'));
	portrait.addEventListener('pointerdown', (e) => {
		e.preventDefault();
		audio.init();
		pressed.add('snack');
	});
}
